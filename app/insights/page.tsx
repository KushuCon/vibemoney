"use client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { format, subMonths, startOfMonth } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VIBE_CATEGORIES } from "@/lib/vibe-categories";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";

interface TxnSummary { month: string; spent: number; received: number; count: number; }
interface CatSummary { id: string; name: string; emoji: string; months: Record<string, number>; }

export default function InsightsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [summaries, setSummaries] = useState<TxnSummary[]>([]);
  const [catTrends, setCatTrends] = useState<CatSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  useEffect(() => {
    if (!session?.user?.email) return;
    const months = Array.from({ length: 6 }, (_, i) =>
      format(subMonths(startOfMonth(new Date()), i), "yyyy-MM")
    ).reverse();

    Promise.all(
      months.map((m) =>
        fetch(`/api/transactions?month=${m}&limit=500`).then((r) => r.json())
      )
    ).then((results) => {
      const sums: TxnSummary[] = results.map((r, i) => {
        const txns = r.transactions ?? [];
        return {
          month: months[i],
          spent: txns.filter((t: any) => t.type === "debit").reduce((s: number, t: any) => s + t.amount, 0),
          received: txns.filter((t: any) => t.type === "credit").reduce((s: number, t: any) => s + t.amount, 0),
          count: txns.length,
        };
      });
      setSummaries(sums);

      // Category trends across months
      const catMap: Record<string, CatSummary> = {};
      results.forEach((r, i) => {
        const month = months[i];
        for (const t of (r.transactions ?? [])) {
          if (t.type !== "debit") continue;
          if (!catMap[t.category_id]) {
            catMap[t.category_id] = { id: t.category_id, name: t.category_name, emoji: t.category_emoji, months: {} };
          }
          catMap[t.category_id].months[month] = (catMap[t.category_id].months[month] || 0) + t.amount;
        }
      });
      setCatTrends(Object.values(catMap).sort((a, b) => {
        const aTotal = Object.values(a.months).reduce((s, v) => s + v, 0);
        const bTotal = Object.values(b.months).reduce((s, v) => s + v, 0);
        return bTotal - aTotal;
      }).slice(0, 5));

      setLoading(false);
    });
  }, [session]);

  const formatINR = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  const months = Array.from({ length: 6 }, (_, i) =>
    format(subMonths(startOfMonth(new Date()), i), "yyyy-MM")
  ).reverse();

  const chartData = summaries.map((s) => ({
    month: format(new Date(s.month + "-01"), "MMM"),
    Spent: Math.round(s.spent),
    Received: Math.round(s.received),
  }));

  const catChartData = months.map((m) => {
    const row: Record<string, number | string> = { month: format(new Date(m + "-01"), "MMM") };
    for (const cat of catTrends) {
      row[cat.emoji + " " + cat.name] = Math.round(cat.months[m] ?? 0);
    }
    return row;
  });

  const currentMonth = summaries[summaries.length - 1];
  const prevMonth = summaries[summaries.length - 2];
  const spendDelta = currentMonth && prevMonth ? currentMonth.spent - prevMonth.spent : null;

  if (status === "loading" || loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading insights…</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => router.push("/dashboard")} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
          <span className="font-semibold text-sm">Monthly Insights</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* MoM delta */}
        {spendDelta !== null && (
          <div className={`rounded-xl px-4 py-3 border text-sm flex items-center gap-3 ${spendDelta > 0 ? "border-red-500/30 bg-red-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
            <span className="text-xl">{spendDelta > 0 ? "📈" : "📉"}</span>
            <div>
              <span className="font-semibold">vs last month: </span>
              <span className={spendDelta > 0 ? "text-red-500" : "text-emerald-600"}>
                {spendDelta > 0 ? "+" : ""}{formatINR(spendDelta)}
              </span>
              {" "}spending this month
            </div>
          </div>
        )}

        {/* Spend vs Received area chart */}
        <Card className="rounded-xl border-border/60">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">6-Month Trend</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gSpent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gReceived" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Area type="monotone" dataKey="Spent" stroke="#ef4444" strokeWidth={2} fill="url(#gSpent)" />
                <Area type="monotone" dataKey="Received" stroke="#10b981" strokeWidth={2} fill="url(#gReceived)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category stacked bar */}
        <Card className="rounded-xl border-border/60">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Category Breakdown by Month</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={catChartData}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: "11px" }} />
                {catTrends.map((cat, i) => {
                  const colors = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];
                  return <Bar key={cat.id} dataKey={cat.emoji + " " + cat.name} stackId="a" fill={colors[i % colors.length]} radius={i === catTrends.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />;
                })}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Month-by-month table */}
        <Card className="rounded-xl border-border/60">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Month Summary</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {[...summaries].reverse().map((s) => (
                <div key={s.month} className="flex items-center justify-between text-xs py-2 border-b border-border/40 last:border-0">
                  <span className="font-medium w-20">{format(new Date(s.month + "-01"), "MMM yyyy")}</span>
                  <span className="text-red-500">↑ {formatINR(s.spent)}</span>
                  <span className="text-emerald-600">↓ {formatINR(s.received)}</span>
                  <span className={`font-semibold ${s.received - s.spent >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {s.received - s.spent >= 0 ? "+" : ""}{formatINR(s.received - s.spent)}
                  </span>
                  <span className="text-muted-foreground">{s.count} txns</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}