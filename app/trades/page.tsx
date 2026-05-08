"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";

interface Trade {
  id: string;
  merchant: string;
  amount: number;
  type: "debit" | "credit";
  date: string;
  raw_subject: string;
}

export default function TradesPage() {
  const { status } = useSession();
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("theme") === "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/trades")
      .then((r) => r.json())
      .then((d) => setTrades(d.trades || []))
      .finally(() => setLoading(false));
  }, [status]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-40 h-6" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl h-8 w-8"
              onClick={() => router.push("/dashboard")}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
                <span className="text-background text-xs font-bold">V</span>
              </div>
              <span className="font-semibold text-sm tracking-tight">Equity Trades</span>
            </div>
          </div>
          <button
            onClick={() => setIsDark(!isDark)}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-secondary transition-colors"
            title={isDark ? "Switch to light" : "Switch to dark"}
          >
            <span>{isDark ? "☀️" : "🌙"}</span>
            <span className="hidden sm:inline">{isDark ? " Light" : " Dark"}</span>
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 pb-16 space-y-5">
        <p className="text-xs text-muted-foreground">INDmoney US stocks · all time history</p>

        {trades.length === 0 && (
          <Card className="rounded-xl border-border/60">
            <CardContent className="p-8 text-center">
              <div className="text-4xl mb-3">📈</div>
              <div className="font-semibold mb-1">No trades found</div>
              <div className="text-sm text-muted-foreground mb-4">
                Run the one-time history sync from your browser console while logged in:
              </div>
              <code className="text-xs bg-secondary px-3 py-2 rounded-lg block text-left">
                fetch(&quot;/api/trades/sync-history&quot;, {"{"}method:&quot;POST&quot;{"}"}).then(r=&gt;r.json()).then(console.log)
              </code>
              <Button variant="outline" className="mt-4 rounded-xl" onClick={() => router.push("/dashboard")}>
                ← Back to dashboard
              </Button>
            </CardContent>
          </Card>
        )}

        {trades.length > 0 && (
          <Card className="rounded-xl border-border/60">
            <CardContent className="px-0 py-2">
              <div className="px-4 py-3 border-b border-border/50">
                <span className="text-sm font-medium">All Trades</span>
                <span className="text-xs text-muted-foreground ml-2">{trades.length} orders</span>
              </div>
              <div className="divide-y divide-border/50">
                {trades.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${
                      t.type === "debit" ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"
                    }`}>
                      {t.type === "debit" ? "B" : "S"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.merchant}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(t.date + "T00:00:00"), "dd MMM yyyy")}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-semibold ${t.type === "debit" ? "text-red-400" : "text-emerald-400"}`}>
                        {t.type === "debit" ? "-" : "+"}{fmt(Number(t.amount))}
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] mt-0.5 ${
                          t.type === "debit" ? "border-red-500/30 text-red-400" : "border-emerald-500/30 text-emerald-400"
                        }`}
                      >
                        {t.type === "debit" ? "BUY" : "SELL"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <footer className="pb-6 text-center text-xs text-muted-foreground">
        © 2026 VibeWallet · INDmoney US Stocks
      </footer>
    </div>
  );
}