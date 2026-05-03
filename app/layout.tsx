// import type { Metadata } from "next";
// import { Inter, JetBrains_Mono } from "next/font/google";
// import "./globals.css";
// import { SessionProvider } from "./providers";

// const geistSans = Inter({ variable: "--font-geist-sans", subsets: ["latin"] });
// const geistMono = JetBrains_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// export const metadata: Metadata = {
//   title: "VibeWallet — Aesthetic Finance",
//   description: "Track your spending, discover your vibe.",
// };

// export default function RootLayout({ children }: { children: React.ReactNode }) {
//   return (
//     <html lang="en" suppressHydrationWarning>
//       <body className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
//         <SessionProvider>{children}</SessionProvider>
//       </body>
//     </html>
//   );
// }

import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "./providers";

const geistSans = Inter({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = JetBrains_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "VibeWallet — Aesthetic Finance",
  description: "Track your spending, discover your vibe.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VibeWallet",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0a0a0f" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="VibeWallet" />
        {/* Viewport — prevents zoom issues on mobile */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        {/* Apple touch icons (used when added to home screen on iOS) */}
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* Register service worker */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}