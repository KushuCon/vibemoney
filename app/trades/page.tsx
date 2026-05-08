"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, BarChart2 } from "lucide-react";
import { format } from "date-fns";

interface Trade {
  id: string;
  merchant: string;
  amount: number;
  type: "debit" | "credit";
  date: string;
  raw_subject: string;
  description: string;
}

interface StockSummary {
  stock: string;
  bought: number;
  sold: number;
  buyCount: number;
  sellCount: number;
  realisedPnL: number;
  netInvested: number;
}

interface Totals {
  totalBought: number;
  totalSold: number;
  totalTrades: number;
  netInvested: number;
  realisedPnL: number;
}

export default function TradesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<StockSummary[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"summary" | "history">("summary");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/trades")
      .then((r) => r.json())
      .then((d) => {
        setTrades(d.trades || []);
        setSummary(d.summary || []);
        setTotals(d.totals || null);
      })
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
        <div className="grid grid-cols-2 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const pnlColor = (n: number) => n > 0 ? "text-emerald-500" : n < 0 ? "text-red-500" : "text-muted-foreground";
  const pnlPrefix = (n: number) => n > 0 ? "+" : "";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 pb-16 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl h-9 w-9"
            onClick={() => router.push("/dashboard")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Equity Trades</h1>
            <p className="text-xs text-muted-foreground">INDmoney US stocks — all time</p>
          </div>
        </div>

        {/* No trades state */}
        {!loading && trades.length === 0 && (
          <Card className="rounded-xl border-border/60">
            <CardContent className="p-8 text-center">
              <div className="text-4xl mb-3">📈</div>
              <div className="font-semibold mb-1">No trades found</div>
              <div className="text-sm text-muted-foreground">
                Sync your Gmail to fetch INDmoney trade emails.
                Make sure you&apos;ve signed in and synced at least once.
              </div>
              <Button
                variant="outline"
                className="mt-4 rounded-xl"
                onClick={() => router.push("/dashboard")}
              >
                Go sync Gmail
              </Button>
            </CardContent>
          </Card>
        )}

        {totals && trades.length > 0 && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="rounded-xl border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Total Bought</span>
                    <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                  </div>
                  <div className="text-xl font-bold tracking-tight">{fmt(totals.totalBought)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{totals.totalTrades} trades total</div>
                </CardContent>
              </Card>

              <Card className="rounded-xl border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Total Sold</span>
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-xl font-bold tracking-tight">{fmt(totals.totalSold)}</div>
                  <div className="text-xs text-muted-foreground mt-1">realised proceeds</div>
                </CardContent>
              </Card>

              <Card className="rounded-xl border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Net Invested</span>
                    <DollarSign className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div className="text-xl font-bold tracking-tight">{fmt(totals.netInvested)}</div>
                  <div className="text-xs text-muted-foreground mt-1">still in market</div>
                </CardContent>
              </Card>

              <Card className={`rounded-xl border-border/60 ${totals.realisedPnL > 0 ? "border-emerald-500/30" : totals.realisedPnL < 0 ? "border-red-500/30" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Realised P&amp;L</span>
                    <BarChart2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className={`text-xl font-bold tracking-tight ${pnlColor(totals.realisedPnL)}`}>
                    {pnlPrefix(totals.realisedPnL)}{fmt(totals.realisedPnL)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">sold − bought</div>
                </CardContent>
              </Card>
            </div>

            {/* View toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setView("summary")}
                className={`text-xs px-4 py-1.5 rounded-full border transition-colors ${view === "summary" ? "bg-foreground text-background border-foreground" : "border-border hover:bg-secondary"}`}
              >
                By Stock
              </button>
              <button
                onClick={() => setView("history")}
                className={`text-xs px-4 py-1.5 rounded-full border transition-colors ${view === "history" ? "bg-foreground text-background border-foreground" : "border-border hover:bg-secondary"}`}
              >
                All Trades
              </button>
            </div>

            {/* Summary view — grouped by stock */}
            {view === "summary" && (
              <div className="space-y-2">
                {summary.map((s) => (
                  <Card key={s.stock} className="rounded-xl border-border/60">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{s.stock}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {s.buyCount} buy{s.buyCount !== 1 ? "s" : ""} · {s.sellCount} sell{s.sellCount !== 1 ? "s" : ""}
                          </div>
                        </div>
                        <div className="text-right ml-3 shrink-0">
                          <div className={`text-sm font-semibold ${pnlColor(s.realisedPnL)}`}>
                            {pnlPrefix(s.realisedPnL)}{fmt(s.realisedPnL)}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {fmt(s.bought)} in
                          </div>
                        </div>
                      </div>
                      {/* Mini bar showing bought vs sold */}
                      {s.bought > 0 && (
                        <div className="mt-3 flex gap-1 items-center">
                          <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-1.5 bg-red-400 rounded-full"
                              style={{ width: `${Math.min(100, (s.bought / Math.max(s.bought, s.sold)) * 100)}%` }}
                            />
                          </div>
                          <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-1.5 bg-emerald-400 rounded-full"
                              style={{ width: `${Math.min(100, (s.sold / Math.max(s.bought, s.sold)) * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground ml-1">B/S</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* History view — all individual trades */}
            {view === "history" && (
              <div className="space-y-2">
                {trades.map((t) => (
                  <Card key={t.id} className="rounded-xl border-border/60">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${t.type === "debit" ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                            {t.type === "debit" ? "B" : "S"}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{t.merchant}</div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(t.date), "dd MMM yyyy")}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <div className={`text-sm font-semibold ${t.type === "debit" ? "text-red-400" : "text-emerald-400"}`}>
                            {t.type === "debit" ? "-" : "+"}{fmt(Number(t.amount))}
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-xs mt-0.5 ${t.type === "debit" ? "border-red-500/30 text-red-400" : "border-emerald-500/30 text-emerald-400"}`}
                          >
                            {t.type === "debit" ? "BUY" : "SELL"}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}