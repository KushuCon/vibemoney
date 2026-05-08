import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import webpush from "web-push";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

/**
 * POST /api/cron/test
 * Body: { type: "idle" | "incoming" | "spending" | "budget" | "no_incoming" | "sync" }
 *
 * Dev/testing only — trigger a specific notification type instantly.
 * Or trigger a full sync by passing type: "sync".
 *
 * Usage from browser console (while logged in):
 *   fetch("/api/cron/test", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ type: "spending" })
 *   }).then(r => r.json()).then(console.log)
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type } = await req.json();

  // ── type: "sync" → trigger the full cron sync for your account ────────────
  if (type === "sync") {
    const res = await fetch(`${process.env.NEXTAUTH_URL}/api/cron/sync-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify({ userEmail: session.user.email }),
    });

    return NextResponse.json(await res.json());
  }

  // ── For all other types, send a mock vibe notification directly ───────────
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_email", session.user.email);

  if (!subs || subs.length === 0) {
    return NextResponse.json({
      error: "No push subscriptions found. Enable notifications in the app first.",
    });
  }

  const mockNotifs: Record<string, { title: string; body: string }[]> = {
    idle: [
      { title: "VibeWallet 👀", body: "No transactions today — are you actually saving money or just offline?" },
      { title: "VibeWallet 🏆", body: "Congrats! No spending detected. Your wallet is having its best day." },
      { title: "VibeWallet 🧘", body: "Zero transactions. Either you're broke or enlightened. Either way, respect." },
      { title: "VibeWallet ✨", body: "No spend detected! Your future self is throwing a party rn." },
    ],
    incoming: [
      { title: "VibeWallet 💰", body: "Congrats, you just got loaded! ₹5000 incoming from Salary 💸" },
      { title: "VibeWallet 🤑", body: "MONEY IN THE BANK! ₹2500 from Freelance. Don't spend it all at once 👀" },
      { title: "VibeWallet 📈", body: "₹10,000 just landed from Client Payment. Main character energy unlocked." },
      { title: "VibeWallet 🎉", body: "Cha-ching! ₹1500 received from Dad. You ate today." },
    ],
    spending: [
      { title: "VibeWallet 💸", body: "U gonna go broke sweetie 😭 ₹450 at Swiggy 🍜" },
      { title: "VibeWallet 🫠", body: "₹1200 gone at Amazon. Your bank account felt that." },
      { title: "VibeWallet 😬", body: "Spending detected: ₹599 at Netflix. Hope it was worth it bestie." },
      { title: "VibeWallet 🚨", body: "₹800 left the chat (to Zomato). Pouring one out for your wallet." },
    ],
    budget: [
      { title: "VibeWallet ⚠️", body: "Aww, 85% of budget gone. ₹3,000 left. Tread carefully bestie." },
      { title: "VibeWallet 💀", body: "Budget is DEAD. Spent ₹20,000 of ₹20,000. RIP your wallet." },
    ],
    no_incoming: [
      { title: "VibeWallet 🥺", body: "Aww, why no incoming money bestie? Your wallet is waiting..." },
      { title: "VibeWallet 😢", body: "No money came in today. Your bank account is giving ghost energy." },
      { title: "VibeWallet 💔", body: "Still no incoming transactions. The money is not coming home." },
    ],
  };

  const options = mockNotifs[type as string];
  if (!options) {
    return NextResponse.json({
      error: `Unknown type. Use one of: ${Object.keys(mockNotifs).join(", ")}, sync`,
    });
  }

  const pick = options[Math.floor(Math.random() * options.length)];
  let sent = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: pick.title, body: pick.body })
      );
      sent++;
    } catch (err) {
      console.error("Push failed:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    notification: pick,
    type,
  });
}