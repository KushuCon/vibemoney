"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Pencil, Check } from "lucide-react";
import { format } from "date-fns";

interface Trade {
  id: string;
  merchant: string;
  amount: number;
  type: "debit" | "credit";
  date: string;
}

export default function TradesPage() {
  const { status } = useSession();
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  // Portfolio values — loaded from + saved to Supabase
  const [invested, setInvested] = useState<string>("");
  const [currentValue, setCurrentValue] = useState<string>("");
  const [editingInvested, setEditingInvested] = useState(false);
  const [editingCurrent, setEditingCurrent] = useState(false);
  const [investedInput, setInvestedInput] = useState("");
  const [currentInput, setCurrentInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [inHandCash, setInHandCash] = useState<string>("");
  const [editingCash, setEditingCash] = useState(false);
  const [cashInput, setCashInput] = useState("");

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

  // Load trades + portfolio values from Supabase
  useEffect(() => {
    if (status !== "authenticated") return;

    fetch("/api/trades")
      .then((r) => r.json())
      .then((d) => setTrades(d.trades || []))
      .finally(() => setLoading(false));

    // Load portfolio values via budget endpoint
    fetch("/api/budget")
      .then((r) => r.json())
      .then((d) => {
        if (d.portfolioInvested != null) setInvested(String(d.portfolioInvested));
        if (d.portfolioCurrentValue != null) setCurrentValue(String(d.portfolioCurrentValue));
        if (d.portfolioInHandCash != null) setInHandCash(String(d.portfolioInHandCash));
      });
  }, [status]);

  const saveInvested = async () => {
    const val = investedInput.trim();
    setSaving(true);
    await fetch("/api/budget", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolioInvested: val ? Number(val) : null }),
    });
    setInvested(val);
    setEditingInvested(false);
    setSaving(false);
  };

  const saveCurrent = async () => {
    const val = currentInput.trim();
    setSaving(true);
    await fetch("/api/budget", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolioCurrentValue: val ? Number(val) : null }),
    });
    setCurrentValue(val);
    setEditingCurrent(false);
    setSaving(false);
  };

  const saveCash = async () => {
    const val = cashInput.trim();
    setSaving(true);
    await fetch("/api/budget", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolioInHandCash: val ? Number(val) : null }),
    });
    setInHandCash(val);
    setEditingCash(false);
    setSaving(false);
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(n);

  const gain =
    invested && currentValue
      ? Number(currentValue) - Number(invested)
      : null;

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-40 h-6" />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
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

        {/* Portfolio cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Total Invested */}
          <Card className="rounded-xl border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Total Invested</span>
                <button
                  onClick={() => { setInvestedInput(invested); setEditingInvested(true); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
              {editingInvested ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={investedInput}
                    onChange={(e) => setInvestedInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveInvested()}
                    className="flex-1 bg-transparent text-sm font-bold outline-none border-b border-border w-full"
                    placeholder="0.00"
                    autoFocus
                  />
                  <button
                    onClick={saveInvested}
                    disabled={saving}
                    className="text-emerald-500 hover:text-emerald-400 disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div
                  className="text-xl font-bold tracking-tight cursor-pointer"
                  onClick={() => { setInvestedInput(invested); setEditingInvested(true); }}
                >
                  {invested
                    ? `$${Number(invested).toFixed(2)}`
                    : <span className="text-muted-foreground text-sm">tap to set</span>
                  }
                </div>
              )}
            </CardContent>
          </Card>

          {/* Current Value */}
          <Card className="rounded-xl border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Current Value</span>
                <button
                  onClick={() => { setCurrentInput(currentValue); setEditingCurrent(true); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
              {editingCurrent ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={currentInput}
                    onChange={(e) => setCurrentInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveCurrent()}
                    className="flex-1 bg-transparent text-sm font-bold outline-none border-b border-border w-full"
                    placeholder="0.00"
                    autoFocus
                  />
                  <button
                    onClick={saveCurrent}
                    disabled={saving}
                    className="text-emerald-500 hover:text-emerald-400 disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div
                  className="text-xl font-bold tracking-tight cursor-pointer"
                  onClick={() => { setCurrentInput(currentValue); setEditingCurrent(true); }}
                >
                  {currentValue
                    ? `$${Number(currentValue).toFixed(2)}`
                    : <span className="text-muted-foreground text-sm">tap to set</span>
                  }
                </div>
              )}
              {gain !== null && (
                <div className={`text-xs mt-1 font-medium ${gain >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                  {gain >= 0 ? "+" : ""}{fmt(gain)}{" "}
                  ({((gain / Number(invested)) * 100).toFixed(1)}%)
                </div>
              )}
            </CardContent>
          </Card>
          {/* In Hand Cash */}
          <Card className="rounded-xl border-border/60 col-span-2">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">💵 In Hand Cash (INDmoney wallet)</span>
                <button
                  onClick={() => { setCashInput(inHandCash); setEditingCash(true); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
              {editingCash ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveCash()}
                    className="flex-1 bg-transparent text-sm font-bold outline-none border-b border-border w-full"
                    placeholder="0.00"
                    autoFocus
                  />
                  <button
                    onClick={saveCash}
                    disabled={saving}
                    className="text-emerald-500 hover:text-emerald-400 disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div
                  className="text-xl font-bold tracking-tight cursor-pointer"
                  onClick={() => { setCashInput(inHandCash); setEditingCash(true); }}
                >
                  {inHandCash
                    ? `$${Number(inHandCash).toFixed(2)}`
                    : <span className="text-muted-foreground text-sm">tap to set</span>
                  }
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Trade list */}
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
                      <div className={`text-sm font-semibold ${
                        t.type === "debit" ? "text-red-400" : "text-emerald-400"
                      }`}>
                        {t.type === "debit" ? "-" : "+"}${Number(t.amount).toFixed(2)}
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
      </div>

      <footer className="pb-6 text-center text-xs text-muted-foreground">
        © 2026 VibeWallet · INDmoney US Stocks
      </footer>
    </div>
  );
}