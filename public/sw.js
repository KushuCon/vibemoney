// VibeWallet Service Worker
// Caches the shell so the app loads instantly + works offline

const CACHE_NAME = "vibewallet-v1";

// Pages/assets to pre-cache on install
const PRECACHE_URLS = [
  "/",
  "/dashboard",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Delete old caches
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept API calls — always go network-first for those
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // For everything else: try network first, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful GET responses
        if (event.request.method === "GET" && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "VibeWallet", {
      body: data.body ?? "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    })
  );
});

// 3-hour idle check — triggered by the app via a periodic message
self.addEventListener("message", (event) => {
  if (event.data?.type === "SCHEDULE_IDLE_CHECK") {
    scheduleIdleNotification();
  }
});

let idleTimer = null;

function scheduleIdleNotification() {
  if (idleTimer) clearTimeout(idleTimer);
  const THREE_HOURS = 3 * 60 * 60 * 1000;
  idleTimer = setTimeout(async () => {
    // Only fire if the app hasn't reset the timer
    const title = "VibeWallet 👀";
    const body = "No transactions yet today — staying on track?";
    await self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "idle-check",
    });
  }, THREE_HOURS);
}