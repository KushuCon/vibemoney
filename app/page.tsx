"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) router.push("/dashboard");
  }, [session, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="fixed inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
            <span className="text-background text-xs font-bold">V</span>
          </div>
          <span className="font-semibold text-base tracking-tight">VibeWallet</span>
        </div>
        <span className="text-xs text-muted-foreground">India&apos;s most aesthetic finance app</span>
      </nav>
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-sm text-emerald-600 dark:text-emerald-400 mb-8">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Free forever · Works with all Indian banks
          </div>
          <div className="relative">
            <div className="absolute inset-0 blur-3xl bg-gradient-to-r from-violet-500/10 to-emerald-500/10 -z-10" />
            <h1 className="text-6xl md:text-8xl font-bold tracking-tight leading-[1.05] mb-6">
              Your money,<br />
              <span className="text-muted-foreground">but make it</span><br />
              aesthetic.
            </h1>
          </div>
          <p className="text-lg md:text-xl text-muted-foreground max-w-md mx-auto mb-10 leading-relaxed">
            Connect Gmail, auto-sync bank transactions, and get your monthly vibe score. Finance finally hits different.
          </p>
          <Button size="lg" onClick={() => signIn("google", { callbackUrl: "/dashboard" })} className="gap-3 h-12 px-8 text-sm font-medium rounded-xl">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </Button>
          <p className="text-xs text-muted-foreground mt-4">We only read transaction emails. We never send or delete anything.</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-16 max-w-lg">
          {[{emoji:"🏦",text:"All Indian banks"},{emoji:"🔒",text:"Read-only Gmail"},{emoji:"🤖",text:"AI vibe scores"},{emoji:"📊",text:"Monthly wrapped"},{emoji:"💸",text:"₹0 cost"}].map(f => (
            <div key={f.text} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs border border-border">
              <span>{f.emoji}</span><span>{f.text}</span>
            </div>
          ))}
        </div>
      </main>
      <footer className="relative z-10 py-6 text-center text-xs text-muted-foreground border-t border-border/50">
        Built for Gen Z India · Powered by AI
      </footer>
    </div>
  );
}
