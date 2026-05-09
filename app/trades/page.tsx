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
}

interface StockResult {
  displayName: string;
  status: "open" | "partial" | "closed";
  totalBought: number;
  totalSold: number;
  holding: number;
  realisedPnL: number;
  buyCount: number;
  sellCount: number;
  lastActivity: string;
}

interface Totals {
  totalTrades: number;
  totalHolding: number;
  totalRealisedPnL: number;
  openCount: number;
  closedCount: number;
}

export default function TradesPage() {
  const { status } = useSession();
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stockResults, setStockResults] = useState<StockResult[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"portfolio" | "history">("portfolio");
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
      .then((d) => {
        setTrades(d.trades || []);
        setStockResults(d.stockResults || []);
        setTotals(d.totals || null);
      })
      .finally(() => setLoading(false));
  }, [status]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(n);

  const pnlColor = (n: number) =>
    n > 0.01 ? "text-emerald-500" : n < -0.01 ? "text-red-400" : "text-muted-foreground";

  const pnlPrefix = (n: number) => (n > 0.01 ? "+" : "");

  const statusConfig = {
    open: { label: "HOLDING", color: "border-blue-500/30 text-blue-400", dot: "bg-blue-400" },
    partial: { label: "PARTIAL", color: "border-yellow-500/30 text-yellow-400", dot: "bg-yellow-400" },
    closed: { label: "CLOSED", color: "border-border text-muted-foreground", dot: "bg-muted-foreground" },
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-40 h-6" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
          >
            <span>{isDark ? "☀️" : "🌙"}</span>
            <span className="hidden sm:inline">{isDark ? " Light" : " Dark"}</span>
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-4 pb-16 space-y-4">
        <p className="text-xs text-muted-foreground">INDmoney US stocks · all time</p>

        {/* No trades */}
        {trades.length === 0 && (
          <Card className="rounded-xl border-border/60">
            <CardContent className="p-8 text-center">
              <div className="text-4xl mb-3">📈</div>
              <div className="font-semibold mb-1">No trades found</div>
              <div className="text-sm text-muted-foreground mb-4">
                Run the one-time history sync from browser console:
              </div>
              <code className="text-xs bg-secondary px-3 py-2 rounded-lg block text-left">
                fetch(&quot;/api/trades/sync-history&quot;,{"{"}method:&quot;POST&quot;{"}"}).then(r=&gt;r.json()).then(console.log)
              </code>
              <Button variant="outline" className="mt-4 rounded-xl" onClick={() => router.push("/dashboard")}>
                ← Back to dashboard
              </Button>
            </CardContent>
          </Card>
        )}

        {trades.length > 0 && totals && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="rounded-xl border-border/60">
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Realised P&amp;L</div>
                  <div className={`text-xl font-bold tracking-tight ${pnlColor(totals.totalRealisedPnL)}`}>
                    {pnlPrefix(totals.totalRealisedPnL)}{fmt(totals.totalRealisedPnL)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{totals.closedCount} closed positions</div>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-border/60">
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Still Holding</div>
                  <div className="text-xl font-bold tracking-tight text-blue-400">
                    {fmt(totals.totalHolding)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{totals.openCount} open positions</div>
                </CardContent>
              </Card>
            </div>

            {/* View toggle */}
            <div className="flex gap-2">
              {(["portfolio", "history"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`text-xs px-4 py-1.5 rounded-full border transition-colors capitalize ${
                    view === v
                      ? "bg-foreground text-background border-foreground"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  {v === "portfolio" ? "By Stock" : "All Trades"}
                </button>
              ))}
            </div>

            {/* Portfolio view */}
            {view === "portfolio" && (
              <div className="space-y-2">
                {stockResults.map((s) => {
                  const cfg = statusConfig[s.status];
                  return (
                    <Card key={s.displayName} className="rounded-xl border-border/60">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                              <span className="text-sm font-medium truncate">{s.displayName}</span>
                              <Badge variant="outline" className={`text-[10px] shrink-0 ${cfg.color}`}>
                                {cfg.label}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {s.buyCount} buy{s.buyCount !== 1 ? "s" : ""} · {s.sellCount} sell{s.sellCount !== 1 ? "s" : ""}
                              {s.lastActivity && (
                                <span className="ml-2">
                                  · last {format(new Date(s.lastActivity + "T00:00:00"), "dd MMM yy")}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            {s.status !== "open" && (
                              <div className={`text-sm font-semibold ${pnlColor(s.realisedPnL)}`}>
                                {pnlPrefix(s.realisedPnL)}{fmt(s.realisedPnL)}
                                <span className="text-xs font-normal text-muted-foreground ml-1">P&L</span>
                              </div>
                            )}
                            {s.holding > 0.01 && (
                              <div className="text-sm font-semibold text-blue-400">
                                {fmt(s.holding)}
                                <span className="text-xs font-normal text-muted-foreground ml-1">held</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Mini progress bar: bought vs sold */}
                        {s.totalBought > 0 && (
                          <div className="mt-3 space-y-1">
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>in {fmt(s.totalBought)}</span>
                              {s.totalSold > 0 && <span>out {fmt(s.totalSold)}</span>}
                            </div>
                            <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
                              <div
                                className={`h-1 rounded-full transition-all ${
                                  s.status === "closed" ? "bg-emerald-500" :
                                  s.status === "partial" ? "bg-yellow-400" : "bg-blue-400"
                                }`}
                                style={{
                                  width: `${Math.min(100, (s.totalSold / s.totalBought) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* History view */}
            {view === "history" && (
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
                          <div className={`text-sm font-semibold ${
                            t.type === "debit" ? "text-red-400" : "text-emerald-400"
                          }`}>
                            {t.type === "debit" ? "-" : "+"}{fmt(Number(t.amount))}
                          </div>
                          <Badge variant="outline" className={`text-[10px] mt-0.5 ${
                            t.type === "debit"
                              ? "border-red-500/30 text-red-400"
                              : "border-emerald-500/30 text-emerald-400"
                          }`}>
                            {t.type === "debit" ? "BUY" : "SELL"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <footer className="pb-6 text-center text-xs text-muted-foreground">
        © 2026 VibeWallet · INDmoney US Stocks
      </footer>
    </div>
  );
}