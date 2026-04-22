"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { format, startOfMonth, subMonths } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw, LogOut, Sparkles, TrendingDown, TrendingUp,
  ArrowDownRight, ArrowUpRight, Calendar
} from "lucide-react";
import { VIBE_CATEGORIES } from "@/lib/vibe-categories";
import { WrappedModal } from "@/components/wrapped-modal";
import jsPDF from "jspdf";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts";

interface Transaction {
  id: string;
  amount: number;
  type: "debit" | "credit";
  merchant: string;
  category_id: string;
  category_name: string;
  category_emoji: string;
  date: string;
  source: string;
}

interface CategoryStat {
  id: string;
  name: string;
  emoji: string;
  amount: number;
  count: number;
  color: string;
  bgColor: string;
  percentage: number;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [showWrapped, setShowWrapped] = useState(false);
  const [wrappedData, setWrappedData] = useState(null);
  const [wrappedError, setWrappedError] = useState("");
  const [generatingWrapped, setGeneratingWrapped] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("theme") === "dark";
  });
  const [budget, setBudget] = useState<number | null>(null);
  const [bankBalance, setBankBalance] = useState<number | null>(null);
  const [balanceUpdatedAt, setBalanceUpdatedAt] = useState<string | null>(null);
  const [budgetLoaded, setBudgetLoaded] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [dismissedBudgetPrompt, setDismissedBudgetPrompt] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/transactions?month=${selectedMonth}&limit=100`);
      const data = await res.json();
      setTransactions(data.transactions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (session) fetchTransactions();
  }, [session, fetchTransactions]);

  useEffect(() => {
    if (!session?.user?.email) return;
    fetch("/api/budget")
      .then((r) => r.json())
      .then((d) => {
        if (d.budget !== null && d.budget !== undefined) {
          setBudget(Number(d.budget));
        } else {
          setBudget(null);
        }
        if (d.balance !== null && d.balance !== undefined) {
          setBankBalance(Number(d.balance));
        } else {
          setBankBalance(null);
        }
        if (d.balanceUpdatedAt) {
          setBalanceUpdatedAt(d.balanceUpdatedAt);
        } else {
          setBalanceUpdatedAt(null);
        }
      })
      .catch(() => setBudget(null))
      .finally(() => setBudgetLoaded(true));
  }, [session]);

  useEffect(() => {
    if (session && !loading && budgetLoaded && transactions.length > 0 && budget === null && !dismissedBudgetPrompt) {
      setShowBudgetModal(true);
    }
  }, [session, loading, budgetLoaded, transactions.length, budget, dismissedBudgetPrompt]);

  const handleSync = async (days = 3) => {
    setSyncing(true);
    setSyncMessage("");
    try {
      const res = await fetch("/api/gmail/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack: days }),
      });
      const data = await res.json();
      if (data.error) {
        setSyncMessage(`Error: ${data.error}`);
      } else {
        const skipped = data.skipped ?? 0;
        const failed = data.failed ?? 0;
        setSyncMessage(`✓ ${data.synced} synced · ${skipped} skipped${failed > 0 ? ` · ${failed} failed` : ""}`);
        fetchTransactions();
      }
    } catch {
      setSyncMessage("Sync failed. Try again.");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(""), 4000);
    }
  };

  const handleGenerateWrapped = async () => {
    setGeneratingWrapped(true);
    setWrappedError("");
    try {
      const res = await fetch("/api/wrapped", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: selectedMonth }),
      });
      const data = await res.json();
      if (!data.error) {
        setWrappedData(data);
        setShowWrapped(true);
      }
    } catch {
      setWrappedError("Failed to generate report. Check your AI API key.");
    } finally {
      setGeneratingWrapped(false);
    }
  };

  const handleExportPDF = () => {
    if (transactions.length === 0) return;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const left = 40;
    const pageBottom = 800;
    const colX = [40, 110, 280, 360, 420, 500];
    let y = 48;

    const drawHeader = () => {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Date", colX[0], y);
      doc.text("Merchant", colX[1], y);
      doc.text("Amount", colX[2], y);
      doc.text("Type", colX[3], y);
      doc.text("Category", colX[4], y);
      doc.text("Source", colX[5], y);
      y += 12;
      doc.setLineWidth(0.5);
      doc.line(left, y, 555, y);
      y += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("VibeWallet Transactions", left, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Month: ${selectedMonth}`, left, y);
    y += 20;

    drawHeader();

    transactions.forEach((t) => {
      if (y > pageBottom) {
        doc.addPage();
        y = 48;
        drawHeader();
      }

      const row = [
        t.date,
        t.merchant.slice(0, 26),
        formatINR(t.amount),
        t.type,
        t.category_name.replace(/\p{Emoji}/gu, "").trim().slice(0, 14),
        t.source.slice(0, 16),
      ];

      row.forEach((val, idx) => {
        doc.text(String(val), colX[idx], y);
      });
      y += 14;
    });

    doc.save(`vibewallet-${selectedMonth}.pdf`);
  };

  const saveBudget = async () => {
    const val = Number(budgetInput);
    if (!val || val <= 0) return;

    try {
      const res = await fetch("/api/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget: val }),
      });
      if (!res.ok) return;
      setBudget(val);
      setDismissedBudgetPrompt(false);
      setShowBudgetModal(false);
      setBudgetInput("");
    } catch {
      // no-op: keep modal open so user can retry
    }
  };

  const deleteBudget = async () => {
    try {
      const res = await fetch("/api/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget: null }),
      });
      if (!res.ok) return;
      setBudget(null);
    } catch {
      // no-op
    }
  };

  // ── Computed stats ──────────────────────────────────────────────────────────
  const debits = transactions.filter((t) => t.type === "debit");
  const credits = transactions.filter((t) => t.type === "credit");
  const totalSpent = debits.reduce((s, t) => s + t.amount, 0);
  const totalReceived = credits.reduce((s, t) => s + t.amount, 0);

  // Category breakdown
  const categoryStats: CategoryStat[] = VIBE_CATEGORIES.slice(0, -1)
    .map((cat) => {
      const catTxns = debits.filter((t) => t.category_id === cat.id);
      const amount = catTxns.reduce((s, t) => s + t.amount, 0);
      return {
        id: cat.id,
        name: cat.name,
        emoji: cat.emoji,
        amount,
        count: catTxns.length,
        color: cat.color,
        bgColor: cat.bgColor,
        percentage: totalSpent > 0 ? (amount / totalSpent) * 100 : 0,
      };
    })
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  // Daily spend chart data
  const dailyMap: Record<string, number> = {};
  for (const t of debits) {
    const day = t.date.substring(8, 10);
    dailyMap[day] = (dailyMap[day] || 0) + t.amount;
  }
  const chartData = Object.entries(dailyMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, amount]) => ({ day, amount: Math.round(amount) }));

  // Month options (last 6 months)
  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(startOfMonth(new Date()), i);
    return { value: format(d, "yyyy-MM"), label: format(d, "MMM yyyy") };
  });

  const formatINR = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  if (status === "loading") return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
              <span className="text-background text-xs font-bold">V</span>
            </div>
            <span className="font-semibold text-sm tracking-tight">VibeWallet</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Month picker */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-xs bg-secondary border border-border rounded-lg px-2 py-1.5 text-foreground cursor-pointer"
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSync()}
              disabled={syncing}
              className="gap-1.5 text-xs h-8 rounded-lg"
            >
              <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync Gmail"}
            </Button>
            <div className="hidden sm:flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                disabled={transactions.length === 0}
                className="gap-1.5 text-xs h-8 rounded-lg"
              >
                ⬇️ Export PDF
              </Button>
              <button
                onClick={() => setIsDark(!isDark)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-secondary transition-colors"
              >
                {isDark ? "☀️ Light" : "🌙 Dark"}
              </button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="h-8 w-8 rounded-lg"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Sync message */}
        {syncMessage && (
          <div className="text-xs text-center py-2 px-4 rounded-lg bg-secondary text-muted-foreground border border-border">
            {syncMessage}
          </div>
        )}

        {/* Welcome + Wrapped CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {format(new Date(`${selectedMonth}-01`), "MMMM yyyy")}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Hey {session?.user?.name?.split(" ")[0]} 👋 here&apos;s your spending vibe
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end">
            <Button
              onClick={handleGenerateWrapped}
              disabled={generatingWrapped || debits.length === 0}
              className="gap-2 text-sm rounded-xl"
            >
              <Sparkles className="w-4 h-4" />
              {generatingWrapped ? "Generating…" : "Get Vibe Report"}
            </Button>
            {wrappedError && <p className="text-xs text-red-500 mt-1">{wrappedError}</p>}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))
          ) : (
            <>
              <Card className="rounded-xl border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Total Spent</span>
                    <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                  </div>
                  <div className="text-xl font-bold tracking-tight">{formatINR(totalSpent)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{debits.length} transactions</div>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Received</span>
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <div className="text-xl font-bold tracking-tight">{formatINR(totalReceived)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{credits.length} credits</div>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Net Flow</span>
                    <span className="text-base">
                      {totalReceived - totalSpent >= 0 ? "📈" : "📉"}
                    </span>
                  </div>
                  <div className={`text-xl font-bold tracking-tight ${
                    totalReceived - totalSpent >= 0 ? "text-emerald-600" : "text-red-500"
                  }`}>
                    {totalReceived - totalSpent >= 0 ? "+" : ""}
                    {formatINR(totalReceived - totalSpent)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">this month</div>
                  {totalReceived > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {Math.round(((totalReceived - totalSpent) / totalReceived) * 100)}% savings rate
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className="rounded-xl border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Top Vibe</span>
                    <span className="text-base">{categoryStats[0]?.emoji || "🌀"}</span>
                  </div>
                  <div className="text-sm font-semibold leading-tight">
                    {categoryStats[0]?.name || "No data yet"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {categoryStats[0] ? formatINR(categoryStats[0].amount) : "Sync Gmail to start"}
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Bank Balance</span>
                    <span className="text-base">🏦</span>
                  </div>
                  {bankBalance !== null ? (
                    <>
                      <div className="text-xl font-bold tracking-tight">{formatINR(bankBalance)}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        updated {balanceUpdatedAt
                          ? format(new Date(balanceUpdatedAt), "dd MMM, h:mm a")
                          : "recently"}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-xl font-bold tracking-tight text-muted-foreground">—</div>
                      <div className="text-xs text-muted-foreground mt-1">sync to detect</div>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {budget && !loading && (
          <Card className={`rounded-xl border ${
            totalSpent >= budget ? "border-red-500/50 bg-red-500/5" :
            totalSpent >= budget * 0.8 ? "border-yellow-500/50 bg-yellow-500/5" :
            "border-emerald-500/50 bg-emerald-500/5"
          }`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {totalSpent >= budget ? "🚨" : totalSpent >= budget * 0.8 ? "⚠️" : "✅"}
                    {" "}Monthly Budget
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatINR(totalSpent)} of {formatINR(budget)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setBudgetInput(String(budget));
                      setShowBudgetModal(true);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={deleteBudget}
                    className="text-xs text-red-500 hover:text-red-600 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <Progress
                value={Math.min((totalSpent / budget) * 100, 100)}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground mt-2">
                {totalSpent >= budget
                  ? `Over budget by ${formatINR(totalSpent - budget)}!`
                  : `${formatINR(budget - totalSpent)} remaining this month`
                }
              </p>
            </CardContent>
          </Card>
        )}

        {/* Chart + Categories */}
        <div className="grid md:grid-cols-5 gap-4">
          {/* Spend chart */}
          <Card className="md:col-span-3 rounded-xl border-border/60">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Daily Spending</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {loading ? (
                <Skeleton className="h-40 w-full rounded-lg" />
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--foreground))" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(v) => [formatINR(Number(v)), "Spent"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="hsl(var(--foreground))"
                      strokeWidth={1.5}
                      fill="url(#spendGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                  No data yet — sync Gmail to see your spending chart
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category breakdown */}
          <Card className="md:col-span-2 rounded-xl border-border/60">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Vibe Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full rounded-lg" />
                ))
              ) : categoryStats.length > 0 ? (
                categoryStats.slice(0, 5).map((cat) => (
                  <div key={cat.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span>{cat.emoji}</span>
                        <span className="font-medium truncate max-w-[100px]">{cat.name}</span>
                      </span>
                      <span className="text-muted-foreground">{formatINR(cat.amount)}</span>
                    </div>
                    <Progress value={cat.percentage} className="h-1.5" />
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  Sync Gmail to see breakdown
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Transactions list */}
        <Card className="rounded-xl border-border/60">
          <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Recent Transactions</CardTitle>
            <span className="text-xs text-muted-foreground">{transactions.length} total</span>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {loading ? (
              <div className="px-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : transactions.length > 0 ? (
              <div className="divide-y divide-border/50">
                {transactions.slice(0, 20).map((t) => {
                  const cat = VIBE_CATEGORIES.find((c) => c.id === t.category_id);
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                      {/* Category icon */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${cat?.bgColor || "bg-secondary"}`}>
                        {t.category_emoji}
                      </div>
                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{t.merchant}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 rounded-md">
                            {t.category_name}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3 inline mr-1" />
                            {format(new Date(t.date + "T00:00:00"), "dd MMM")}
                          </span>
                          <span className="text-xs text-muted-foreground">{t.source}</span>
                        </div>
                      </div>
                      {/* Amount */}
                      <div className={`flex items-center gap-1 text-sm font-semibold flex-shrink-0 ${t.type === "credit" ? "text-emerald-600" : "text-foreground"}`}>
                        {t.type === "credit" ? (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        {formatINR(t.amount)}
                      </div>
                    </div>
                  );
                })}
                {transactions.length > 20 && (
                  <div className="px-4 py-3 text-xs text-muted-foreground text-center">
                    Showing 20 of {transactions.length} transactions
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground mb-4">No transactions yet for this month</p>
                <Button onClick={() => handleSync(90)} disabled={syncing} variant="outline" size="sm" className="gap-2 rounded-lg">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sync Last 90 Days
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gmail setup guide */}
        {!loading && transactions.length === 0 && (
          <Card className="rounded-xl border-dashed border-2 border-border bg-secondary/30">
            <CardContent className="py-8 px-6 text-center">
              <p className="text-2xl mb-3">📬</p>
              <h3 className="font-semibold mb-2">Connect your bank emails</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                Make sure your bank sends transaction alerts to this Gmail account. Then click Sync Gmail above.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                {["HDFC", "SBI", "ICICI", "Axis", "Kotak", "GPay", "PhonePe", "Paytm"].map((b) => (
                  <span key={b} className="px-2 py-1 bg-background border border-border rounded-lg">{b}</span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {showBudgetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl">
            <h2 className="text-lg font-bold mb-1">
              {budget ? "Edit Budget" : "Set Monthly Budget 💰"}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {budget
                ? "Update your monthly spending limit."
                : "Set a limit and we'll warn you when you're getting close."
              }
            </p>
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
              <input
                type="number"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveBudget()}
                placeholder="e.g. 10000"
                className="w-full pl-7 pr-4 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-foreground/20"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => {
                  setShowBudgetModal(false);
                  setBudgetInput("");
                  setDismissedBudgetPrompt(true);
                }}
              >
                {budget ? "Cancel" : "Skip for now"}
              </Button>
              <Button
                className="flex-1 rounded-xl"
                onClick={saveBudget}
                disabled={!budgetInput || Number(budgetInput) <= 0}
              >
                {budget ? "Update" : "Set Budget"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Wrapped Modal */}
      {showWrapped && wrappedData && (
        <WrappedModal data={wrappedData} onClose={() => setShowWrapped(false)} />
      )}
    </div>
  );
}
