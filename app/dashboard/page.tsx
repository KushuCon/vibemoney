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
  ArrowDownRight, ArrowUpLeft, Calendar, Search
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
  account_last4?: string;
  vpa?: string;
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

interface Goal {
  id: string;
  title: string;
  target_amount: number;
  category_id: string | null;
  month: string;
}

function SpendingHeatmap({ transactions }: { transactions: Transaction[] }) {
  const today = new Date();
  const days: { date: string; spent: number; received: number }[] = [];

  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const dayTxns = transactions.filter((t) => t.date === dateStr);
    days.push({
      date: dateStr,
      spent: dayTxns.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0),
      received: dayTxns.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0),
    });
  }

  const firstDayOfWeek = new Date(today);
  firstDayOfWeek.setDate(firstDayOfWeek.getDate() - 89);
  const startDayOfWeek = firstDayOfWeek.getDay();

  const padded = [...Array(startDayOfWeek).fill(null), ...days];
  const weeks: (typeof days[0] | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7));
  }

  const getColor = (day: typeof days[0] | null) => {
    if (!day || (day.spent === 0 && day.received === 0)) return "bg-secondary";
    const net = day.received - day.spent;
    if (net > 0) return "bg-emerald-500";
    if (net === 0) return "bg-yellow-400";
    const ratio = day.spent / (day.received || 1);
    if (ratio > 5) return "bg-red-600";
    if (ratio > 2) return "bg-red-500";
    return "bg-red-400";
  };

  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Spending Heatmap</span>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Net positive</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> Net negative</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-secondary inline-block" /> No activity</span>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        <div className="flex flex-col gap-1 mr-1">
          {dayLabels.map((d, i) => (
            <div key={i} className="w-3 h-3 text-[9px] text-muted-foreground flex items-center justify-center">
              {i % 2 === 1 ? d : ""}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day, di) => {
              if (!day) return <div key={di} className="w-3 h-3" />;
              const net = day.received - day.spent;
              const tooltip = `${day.date}\nSpent: ₹${day.spent.toLocaleString("en-IN")}\nReceived: ₹${day.received.toLocaleString("en-IN")}\nNet: ${net >= 0 ? "+" : ""}₹${net.toLocaleString("en-IN")}`;
              return (
                <div
                  key={di}
                  title={tooltip}
                  className={`w-3 h-3 rounded-sm cursor-default transition-opacity hover:opacity-80 ${getColor(day)}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Reset the idle notification timer in the service worker
function resetIdleNotificationTimer() {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "SCHEDULE_IDLE_CHECK" });
  }
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncCooldown, setSyncCooldown] = useState(0); // seconds remaining
  const [syncMessage, setSyncMessage] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterType, setFilterType] = useState<"all" | "debit" | "credit">("all");
  // Fix 3: Removed showSyncOptions state
  const [hasEverSynced, setHasEverSynced] = useState(false);
  const [showWrapped, setShowWrapped] = useState(false);
  const [wrappedData, setWrappedData] = useState(null);
  const [roastData, setRoastData] = useState<{ title: string; subtitle: string; roast: string; emoji: string } | null>(null);
  const [roastLoading, setRoastLoading] = useState(false);
  const [wrappedError, setWrappedError] = useState("");
  const [generatingWrapped, setGeneratingWrapped] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("theme") === "dark";
  });
  const [budget, setBudget] = useState<number | null>(null);
  const [bankBalances, setBankBalances] = useState<{bank_name: string, balance: number, updated_at: string}[]>([]);
  const [primaryBank, setPrimaryBank] = useState<string | null>(null);
  const [budgetLoaded, setBudgetLoaded] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [dismissedBudgetPrompt, setDismissedBudgetPrompt] = useState(false);

  // Fix 4: Date filter state
  const [dateFilterMode, setDateFilterMode] = useState<"none" | "single" | "range">("none");
  const [filterSingleDate, setFilterSingleDate] = useState("");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Feature states
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboardingDone, setOnboardingDone] = useState(true);
  const [splits, setSplits] = useState<{
    id: string;
    split_with_name: string;
    amount_owed: number;
    settled: boolean;
    transactions: { merchant: string; amount: number };
  }[]>([]);
  const [showSplits, setShowSplits] = useState(false);
  const [splitTxn, setSplitTxn] = useState<Transaction | null>(null);
  const [splitName, setSplitName] = useState("");
  const [splitAmount, setSplitAmount] = useState("");
  const [splitError, setSplitError] = useState("");
  const [showAddTxn, setShowAddTxn] = useState(false);
  const [addTxnForm, setAddTxnForm] = useState({
    merchant: "",
    amount: "",
    type: "debit" as "debit" | "credit",
    date: format(new Date(), "yyyy-MM-dd"),
    category_id: "",
    note: "",
  });
  const [addTxnError, setAddTxnError] = useState("");
  const [addTxnLoading, setAddTxnLoading] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalForm, setGoalForm] = useState({ title: "", target_amount: "", category_id: "", month: format(new Date(), "yyyy-MM") });

  const [deleteGoalError, setDeleteGoalError] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [editingCategoryTxn, setEditingCategoryTxn] = useState<Transaction | null>(null);
  const [filterBank, setFilterBank] = useState("all");
  const [compareStats, setCompareStats] = useState<{
    category_id: string;
    category_name: string;
    avg_spend: number;
  }[]>([]);
  const [showChallenge, setShowChallenge] = useState(false);
  const [challengeTarget, setChallengeTarget] = useState("");

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
    if (!session) return;
    fetchTransactions();

    // Auto-sync once per browser session (not every re-render)
    const alreadySynced = sessionStorage.getItem("vw_auto_synced");
    if (!alreadySynced) {
      sessionStorage.setItem("vw_auto_synced", "1");
      setTimeout(() => handleSync(), 2000); // slight delay so page loads first
    }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setBankBalances(d.bankBalances ?? []);
        setPrimaryBank(d.primaryBank ?? null);
        setHasEverSynced(!!d.syncFromDate);
        setOnboardingDone(!!d.onboardingDone);
        if (!d.onboardingDone && !d.syncFromDate) setShowOnboarding(true);
      })
      .catch(() => setBudget(null))
      .finally(() => setBudgetLoaded(true));
  }, [session]);

  useEffect(() => {
    if (session && !loading && budgetLoaded && transactions.length > 0 && budget === null && !dismissedBudgetPrompt) {
      setShowBudgetModal(true);
    }
  }, [session, loading, budgetLoaded, transactions.length, budget, dismissedBudgetPrompt]);

useEffect(() => {
  if (!session?.user?.email) return;

  // Load splits
  fetch("/api/splits").then((r) => r.json()).then(setSplits).catch(() => {});

  // Load goals
  fetch("/api/goals").then((r) => r.json()).then(setGoals).catch(() => {});

  // Load compare stats
  fetch(`/api/stats/compare?month=${selectedMonth}`)
    .then((r) => r.json()).then(setCompareStats).catch(() => {});

  // Check push permission + auto-subscribe this device if not registered
  const syncPushSubscription = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushEnabled(false);
      return;
    }

    if (Notification.permission !== "granted") {
      setPushEnabled(false);
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();

      if (existing) {
        // This device is already subscribed — just mark UI as enabled
        setPushEnabled(true);
      } else {
        // Permission is granted but this device was never subscribed
        // (e.g. Android, new install, cleared browser data)
        // Re-subscribe silently — no browser prompt shown
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        });
        const json = sub.toJSON();
        await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: json.endpoint,
            p256dh: (json.keys as Record<string, string>)?.p256dh,
            auth: (json.keys as Record<string, string>)?.auth,
          }),
        });
        setPushEnabled(true);
      }
    } catch (e) {
      console.error("Push sync failed:", e);
      setPushEnabled(false);
    }
  };

  syncPushSubscription();
}, [session, selectedMonth]);

useEffect(() => {
  if (pushEnabled) {
    try {
      resetIdleNotificationTimer();
    } catch (e) {
      // ignore
    }
  }
}, [pushEnabled]);

// Countdown for sync cooldown
useEffect(() => {
  if (syncCooldown <= 0) return;
  const timer = setTimeout(() => setSyncCooldown((s) => s - 1), 1000);
  return () => clearTimeout(timer);
}, [syncCooldown]);

  // Fix 3: handleSync — always syncs current month only, no dropdown
  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage("");
    try {
      // Always sync current month only (days since start of month + 1)
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const daysBack = Math.ceil((now.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const res = await fetch("/api/gmail/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack }),
      });
      const data = await res.json();
      if (data.error) {
        setSyncMessage(`Error: ${data.error}`);
      } else {
        setSyncMessage(`✓ ${data.synced} synced · ${data.skipped} skipped`);
        await fetchTransactions();
        try {
          resetIdleNotificationTimer();
        } catch (e) {
          // no-op
        }
        // start client-side cooldown (5 minutes)
        try { setSyncCooldown(300); } catch (e) { /* noop */ }
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

  const fetchRoast = async () => {
    if (debits.length === 0) return;
    setRoastLoading(true);
    try {
      const res = await fetch("/api/wrapped", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: selectedMonth }),
      });
      const data = await res.json();
      if (data.personality) setRoastData(data.personality);
    } catch {
      // fail silently
    } finally {
      setRoastLoading(false);
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

  const enablePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("Push notifications aren't supported on this browser. Try Chrome on Android or desktop.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "denied") {
      alert(
        "Notifications are blocked.\n\n" +
        "To fix this:\n" +
        "1. Tap the 🔒 lock icon in your browser address bar\n" +
        "2. Find 'Notifications' → set to 'Allow'\n" +
        "3. Refresh this page"
      );
      return;
    }
    if (permission !== "granted") return;

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      const json = sub.toJSON();
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: (json.keys as Record<string, string>)?.p256dh,
          auth: (json.keys as Record<string, string>)?.auth,
        }),
      });
      setPushEnabled(true);
      try { resetIdleNotificationTimer(); } catch (e) { /* noop */ }
    } catch (e) {
      alert("Something went wrong enabling notifications. Please refresh and try again.");
      console.error(e);
    }
  };

  const addSplit = async () => {
    if (!splitTxn || !splitName || !splitAmount) return;
    setSplitError("");
    try {
      const res = await fetch("/api/splits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: splitTxn.id,
          split_with_name: splitName,
          amount_owed: Number(splitAmount),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setSplitError(err?.error ?? "Failed to add split. Try again.");
        return;
      }
      const newSplit = await res.json();
      if (!newSplit?.id) {
        setSplitError("Split created but something looks off. Refresh to check.");
        return;
      }
      setSplits((prev) => [newSplit, ...prev]);
      setSplitTxn(null);
      setSplitName("");
      setSplitAmount("");
    } catch (e) {
      setSplitError("Network error — split not saved.");
    }
  };

  const settleSplit = async (id: string) => {
    await fetch("/api/splits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setSplits((prev) => prev.filter((s) => s.id !== id));
  };

  const submitManualTxn = async () => {
    if (!addTxnForm.merchant || !addTxnForm.amount || !addTxnForm.date) {
      setAddTxnError("Merchant, amount and date are required.");
      return;
    }
    setAddTxnLoading(true);
    setAddTxnError("");
    try {
      const res = await fetch("/api/transactions/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addTxnForm),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        setAddTxnError(e?.error ?? "Failed to add transaction.");
        return;
      }
      const newTxn = await res.json();
      setTransactions((prev) => [newTxn, ...prev]);
      setShowAddTxn(false);
      setAddTxnForm({ merchant: "", amount: "", type: "debit", date: format(new Date(), "yyyy-MM-dd"), category_id: "", note: "" });
    } catch {
      setAddTxnError("Network error. Try again.");
    } finally {
      setAddTxnLoading(false);
    }
  };

  const deleteManualTxn = async (id: string) => {
    await fetch("/api/transactions/manual", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  const addGoal = async () => {
    if (!goalForm.title || !goalForm.target_amount) return;
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(goalForm),
    });
    const newGoal = await res.json();
    setGoals((prev) => [newGoal, ...prev]);
    setShowGoalModal(false);
    setGoalForm({ title: "", target_amount: "", category_id: "", month: format(new Date(), "yyyy-MM") });
  };

  const deleteGoal = async (id: string) => {
    await fetch("/api/goals", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setGoals((prev) => prev.filter((g) => g.id !== id));
  };

  const overrideCategory = async (txn: Transaction, catId: string) => {
    const cat = VIBE_CATEGORIES.find((c) => c.id === catId);
    if (!cat) return;
    await fetch(`/api/transactions/${txn.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category_id: cat.id,
        category_name: cat.name,
        category_emoji: cat.emoji,
      }),
    });
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === txn.id
          ? { ...t, category_id: cat.id, category_name: cat.name, category_emoji: cat.emoji }
          : t
      )
    );
    setEditingCategoryTxn(null);
  };

  const completeOnboarding = async () => {
    setShowOnboarding(false);
    setOnboardingDone(true);
    await fetch("/api/budget", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingDone: true }),
    });
  };

  // ── Computed stats ──────────────────────────────────────────────────────────
  const accounts = Array.from(
    new Set(transactions.map((t) => t.account_last4).filter(Boolean))
  ) as string[];

  const filteredTransactions = transactions.filter((t) => {
    const matchesAccount = selectedAccount === "all" || t.account_last4 === selectedAccount;
    const matchesBank = filterBank === "all" || t.source === filterBank;
    return matchesAccount && matchesBank;
  });

  const searchedTransactions = filteredTransactions.filter((t) => {
    const matchesSearch =
      searchQuery === "" ||
      t.merchant.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.vpa?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || t.category_id === filterCategory;
    const matchesType = filterType === "all" || t.type === filterType;
    return matchesSearch && matchesCategory && matchesType;
  });

  // Fix 4: Date-filtered transactions derived from searchedTransactions
  const dateFilteredTransactions = searchedTransactions.filter((t) => {
    if (dateFilterMode === "single" && filterSingleDate) {
      return t.date === filterSingleDate;
    }
    if (dateFilterMode === "range" && filterFromDate && filterToDate) {
      return t.date >= filterFromDate && t.date <= filterToDate;
    }
    return true;
  });

  const filteredDebits = filteredTransactions.filter((t) => t.type === "debit");
  const filteredCredits = filteredTransactions.filter((t) => t.type === "credit");
  const debits = filteredDebits;
  const credits = filteredCredits;
  const totalSpent = debits.reduce((s, t) => s + t.amount, 0);
  const totalReceived = credits.reduce((s, t) => s + t.amount, 0);

  const vibeScore = (() => {
    if (debits.length === 0) return null;

    const savingsRate = totalReceived > 0 ? Math.max(0, (totalReceived - totalSpent) / totalReceived) : 0;
    const savingsPoints = Math.round(savingsRate * 40);

    const uniqueCategories = new Set(debits.map((t) => t.category_id)).size;
    const diversityPoints = Math.min(uniqueCategories * 5, 30);

    const uniqueDays = new Set(debits.map((t) => t.date)).size;
    const daysInSelectedMonth = new Date(Number(selectedMonth.split("-")[0]), Number(selectedMonth.split("-")[1]), 0).getDate();
    const consistencyPoints = Math.round((uniqueDays / daysInSelectedMonth) * 30);

    return Math.min(savingsPoints + diversityPoints + consistencyPoints, 100);
  })();

  const vibeScoreLabel = vibeScore === null ? null
    : vibeScore >= 80 ? { label: "Financially Sane", color: "text-emerald-600", emoji: "🏆" }
    : vibeScore >= 60 ? { label: "On the Right Track", color: "text-blue-500", emoji: "📈" }
    : vibeScore >= 40 ? { label: "Could Be Worse", color: "text-yellow-500", emoji: "😬" }
    : { label: "Chaotic Era", color: "text-red-500", emoji: "💀" };

  // Category breakdown
  const categoryStats: CategoryStat[] = VIBE_CATEGORIES.slice(0, -1)
    .map((cat) => {
      const catTxns = filteredDebits.filter((t) => t.category_id === cat.id);
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
  for (const t of filteredDebits) {
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

  // Feature 1: Spend forecast
  const today = new Date();
  const dayOfMonth = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const isCurrentMonth = selectedMonth === format(today, "yyyy-MM");
  const projectedSpend = isCurrentMonth && dayOfMonth > 0
    ? Math.round((totalSpent / dayOfMonth) * daysInMonth)
    : null;
  const forecastPercent = projectedSpend && budget ? Math.min((projectedSpend / budget) * 100, 100) : null;

  // Feature 3: Recurring spend detector
  const recurringMerchants = (() => {
    const merchantMonths: Record<string, Set<string>> = {};
    for (const t of transactions) {
      if (t.type !== "debit") continue;
      const m = t.merchant.toLowerCase();
      const mo = t.date.substring(0, 7);
      if (!merchantMonths[m]) merchantMonths[m] = new Set();
      merchantMonths[m].add(mo);
    }
    return Object.entries(merchantMonths)
      .filter(([, months]) => months.size >= 2)
      .map(([merchant]) => {
        const txns = transactions.filter((t) => t.merchant.toLowerCase() === merchant && t.type === "debit");
        const latest = [...txns].sort((a, b) => b.date.localeCompare(a.date))[0];
        return {
          merchant: latest.merchant,
          avg: Math.round(txns.reduce((s, t) => s + t.amount, 0) / txns.length),
          emoji: latest.category_emoji,
          months: merchantMonths[merchant].size,
        };
      })
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);
  })();

  // Feature 5: No-spend streak
  const noSpendStreak = (() => {
    let streak = 0;
    const d = new Date();
    while (streak < 30) {
      const dateStr = format(d, "yyyy-MM-dd");
      const hadSpend = filteredDebits.some((t) => t.date === dateStr);
      if (hadSpend) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  })();

  // Feature 8: Broke mode
  const primaryBalance = bankBalances?.length > 0
    ? bankBalances.find((b) => b.bank_name === primaryBank)?.balance ?? bankBalances[0]?.balance
    : null;
  const isBrokeMode = primaryBalance !== null && primaryBalance !== undefined && primaryBalance < 500;

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

            {/* Fix 3: Simple sync button — no dropdown, always syncs current month */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSync()}
              disabled={syncing || syncCooldown > 0}
              className="gap-1.5 text-xs h-8 rounded-lg"
            >
              <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : syncCooldown > 0 ? `Wait ${syncCooldown}s` : "Sync Gmail"}
            </Button>

            {/* Export PDF — icon only on mobile, text on sm+ */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              disabled={transactions.length === 0}
              className="gap-1.5 text-xs h-8 rounded-lg"
              title="Export PDF"
            >
              <span className="sm:hidden">⬇️</span>
              <span className="hidden sm:inline">⬇️ Export PDF</span>
            </Button>
            {/* Dark/light toggle — icon only on mobile */}
            <button
              onClick={() => setIsDark(!isDark)}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-secondary transition-colors"
              title={isDark ? "Switch to light" : "Switch to dark"}
            >
              <span>{isDark ? "☀️" : "🌙"}</span>
              <span className="hidden sm:inline">{isDark ? " Light" : " Dark"}</span>
            </button>
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

        {/* Feature 8: Broke Mode */}
        {isBrokeMode && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm flex items-center gap-3">
            <span className="text-xl">💀</span>
            <div>
              <div className="font-semibold text-red-500">Broke Week activated</div>
              <div className="text-xs text-muted-foreground">Balance is below ₹500. Maybe skip the Swiggy order today?</div>
            </div>
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
            <button onClick={() => router.push("/insights")} className="text-xs text-muted-foreground hover:text-foreground underline mt-2 sm:mt-0 sm:ml-3">
              📊 Insights
            </button>
            {wrappedError && <p className="text-xs text-red-500 mt-1">{wrappedError}</p>}
          </div>
        </div>

        {accounts.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Account:</span>
            <button
              onClick={() => setSelectedAccount("all")}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                selectedAccount === "all"
                  ? "bg-foreground text-background border-foreground"
                  : "border-border hover:bg-secondary"
              }`}
            >
              All
            </button>
            {accounts.map((acc) => (
              <button
                key={acc}
                onClick={() => setSelectedAccount(acc === selectedAccount ? "all" : acc)}
                className={`text-xs px-3 py-1 rounded-full border font-mono transition-colors ${
                  selectedAccount === acc
                    ? "bg-foreground text-background border-foreground"
                    : "border-border hover:bg-secondary"
                }`}
              >
                ••{acc}
              </button>
            ))}
          </div>
        )}

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
                  <div className="text-xs text-muted-foreground mt-1">
                    {totalReceived > 0
                      ? `${Math.round(((totalReceived - totalSpent) / totalReceived) * 100)}% savings rate`
                      : totalSpent > 0
                      ? `₹${totalSpent.toLocaleString("en-IN")} spent, no income tracked`
                      : null}
                  </div>
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
              {vibeScore !== null && vibeScoreLabel && (
                <Card className="rounded-xl border-border/60">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">Vibe Score</span>
                      <span className="text-base">{vibeScoreLabel.emoji}</span>
                    </div>
                    <div className={`text-3xl font-bold tracking-tight ${vibeScoreLabel.color}`}>{vibeScore}</div>
                    <div className="text-xs text-muted-foreground mt-1">{vibeScoreLabel.label}</div>
                    <div className="w-full bg-secondary rounded-full h-1.5 mt-2">
                      <div
                        className={`h-1.5 rounded-full transition-all ${vibeScore >= 80 ? "bg-emerald-500" : vibeScore >= 60 ? "bg-blue-500" : vibeScore >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                        style={{ width: `${vibeScore}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
              {/* Per-bank balance cards */}
              {bankBalances.length === 0 ? (
                <Card className="rounded-xl border-border/60">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">Bank Balance</span>
                      <span className="text-base">🏦</span>
                    </div>
                    <div className="text-xl font-bold tracking-tight text-muted-foreground">—</div>
                    <div className="text-xs text-muted-foreground mt-1">sync to detect</div>
                  </CardContent>
                </Card>
              ) : bankBalances.length === 1 ? (
                <Card className="rounded-xl border-border/60">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">{bankBalances[0].bank_name}</span>
                      <span className="text-base">🏦</span>
                    </div>
                    <div className="text-xl font-bold tracking-tight">{formatINR(bankBalances[0].balance)}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      updated {format(new Date(bankBalances[0].updated_at), "dd MMM, h:mm a")}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="rounded-xl border-border/60 col-span-2">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-muted-foreground">Bank Balances 🏦</span>
                      <select
                        value={primaryBank ?? bankBalances[0].bank_name}
                        onChange={async (e) => {
                          setPrimaryBank(e.target.value);
                          await fetch("/api/budget", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ primaryBank: e.target.value }),
                          });
                        }}
                        className="text-xs bg-secondary border border-border rounded-lg px-2 py-1 text-foreground cursor-pointer"
                      >
                        {bankBalances.map((b) => (
                          <option key={b.bank_name} value={b.bank_name}>★ {b.bank_name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {bankBalances.map((b) => (
                        <div key={b.bank_name} className={`p-2 rounded-lg ${(primaryBank ?? bankBalances[0].bank_name) === b.bank_name ? "bg-primary/5 border border-primary/20" : "bg-muted/30"}`}>
                          <div className="text-xs text-muted-foreground mb-1">{b.bank_name}</div>
                          <div className="text-base font-bold">{formatINR(b.balance)}</div>
                          <div className="text-xs text-muted-foreground">{format(new Date(b.updated_at), "dd MMM")}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        {/* Feature 1: Spend Forecast */}
        {isCurrentMonth && projectedSpend !== null && totalSpent > 0 && (
          <Card className="rounded-xl border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">📈 Spend Forecast</span>
                <span className="text-xs text-muted-foreground">Day {dayOfMonth} of {daysInMonth}</span>
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                Spent {formatINR(totalSpent)} so far → on track for{" "}
                <span className={`font-semibold ${budget && projectedSpend > budget ? "text-red-500" : "text-foreground"}`}>
                  {formatINR(projectedSpend)}
                </span>{" "}
                this month
              </div>
              <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all ${budget && projectedSpend > budget ? "bg-red-500" : "bg-emerald-500"}`}
                  style={{ width: `${forecastPercent ?? Math.min((dayOfMonth / daysInMonth) * 100, 100)}%` }}
                />
              </div>
              {budget && projectedSpend > budget && (
                <p className="text-xs text-red-500 mt-1.5">⚠️ Projected to overshoot budget by {formatINR(projectedSpend - budget)}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Feature 3: Recurring spend detector */}
        {recurringMerchants.length > 0 && (
          <Card className="rounded-xl border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">🔄 Recurring Spends</span>
                <span className="text-xs text-muted-foreground">
                  {formatINR(recurringMerchants.reduce((s, m) => s + m.avg, 0))}/mo total
                </span>
              </div>
              <div className="space-y-2">
                {recurringMerchants.map((m) => (
                  <div key={m.merchant} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span>{m.emoji}</span>
                      <span className="font-medium truncate max-w-[140px]">{m.merchant}</span>
                      <span className="text-muted-foreground">({m.months}mo)</span>
                    </span>
                    <span className="font-semibold">~{formatINR(m.avg)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Feature 5: No-spend streak + challenge */}
        <Card className="rounded-xl border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">🔥 No-Spend Streak</span>
              <span className="text-2xl font-bold">{noSpendStreak}d</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {noSpendStreak === 0 ? "You spent today — streak resets tomorrow" :
               noSpendStreak >= 7 ? "🏆 Week-long streak! Impressive." :
               `${7 - noSpendStreak} days to hit a week-long streak`}
            </p>
            {budget && (
              <div className="text-xs">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">Savings challenge</span>
                  <span className="font-medium">{formatINR(Math.max(0, (budget ?? 0) - totalSpent))} saved</span>
                </div>
                <Progress value={budget ? Math.min(((budget - totalSpent) / budget) * 100, 100) : 0} className="h-1.5" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Savings Goals */}
        {goals.length > 0 && (
          <Card className="rounded-xl border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium">🎯 Savings Goals</span>
                <button onClick={() => setShowGoalModal(true)} className="text-xs text-muted-foreground hover:text-foreground">+ Add</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {goals.map((g) => {
                  const catSpent = g.category_id
                    ? filteredDebits.filter((t) => t.category_id === g.category_id && t.date.startsWith(g.month)).reduce((s, t) => s + t.amount, 0)
                    : totalSpent;
                  const saved = Math.max(0, g.target_amount - catSpent);
                  const pct = Math.min((saved / g.target_amount) * 100, 100);
                  const radius = 30;
                  const circ = 2 * Math.PI * radius;
                  const dash = (pct / 100) * circ;
                  return (
                    <div key={g.id} className="flex flex-col items-center gap-2 relative group">
                      <button onClick={() => deleteGoal(g.id)} className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 text-red-400 text-xs transition-opacity">✕</button>
                      <svg width="80" height="80" className="-rotate-90">
                        <circle cx="40" cy="40" r={radius} fill="none" stroke="hsl(var(--secondary))" strokeWidth="8" />
                        <circle
                          cx="40" cy="40" r={radius} fill="none"
                          stroke={pct >= 100 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#6366f1"}
                          strokeWidth="8" strokeLinecap="round"
                          strokeDasharray={`${dash} ${circ}`}
                          style={{ transition: "stroke-dasharray 0.5s ease" }}
                        />
                      </svg>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                        <div className="text-xs font-bold">{Math.round(pct)}%</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-medium">{g.title}</div>
                        <div className="text-[10px] text-muted-foreground">{formatINR(Math.max(0, g.target_amount - (g.category_id ? filteredDebits.filter((t) => t.category_id === g.category_id && t.date.startsWith(g.month)).reduce((s, t) => s + t.amount, 0) : totalSpent)))} saved</div>
                        <div className="text-[10px] text-muted-foreground">goal: {formatINR(g.target_amount)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {goals.length === 0 && (
          <button onClick={() => setShowGoalModal(true)} className="w-full rounded-xl border border-dashed border-border py-3 text-xs text-muted-foreground hover:bg-secondary transition-colors">
            🎯 Set a savings goal
          </button>
        )}

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

        {/* Roast Mode */}
        <Card className="rounded-xl border-border/60 bg-gradient-to-br from-orange-500/5 to-red-500/5">
          <CardContent className="p-4">
            {roastData ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">🔥 Your Vibe This Month</span>
                  <button onClick={() => setRoastData(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">{roastData.emoji}</span>
                  <div>
                    <div className="font-bold text-base">{roastData.title}</div>
                    <div className="text-xs text-muted-foreground italic">{roastData.subtitle}</div>
                  </div>
                </div>
                <div className="rounded-xl bg-background/60 border border-border/50 px-3 py-2 text-xs text-muted-foreground italic">
                  💬 &ldquo;{roastData.roast}&rdquo;
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">🔥 Roast Mode</p>
                  <p className="text-xs text-muted-foreground">Let AI judge your spending this month</p>
                </div>
                <Button size="sm" variant="outline" className="rounded-xl text-xs" onClick={fetchRoast} disabled={roastLoading || debits.length === 0}>
                  {roastLoading ? "Judging…" : "Roast me 🫣"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

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

          {/* Feature 9: Anonymous comparison */}
          {compareStats.length > 0 && categoryStats.length > 0 && (
            <Card className="md:col-span-2 rounded-xl border-border/60">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">vs. Other Students 👥</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {categoryStats.slice(0, 4).map((cat) => {
                  const avg = compareStats.find((c) => c.category_id === cat.id)?.avg_spend ?? 0;
                  if (!avg) return null;
                  const better = cat.amount <= avg;
                  return (
                    <div key={cat.id} className="text-xs">
                      <div className="flex justify-between mb-0.5">
                        <span>{cat.emoji} {cat.name}</span>
                        <span className={better ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                          {better ? "👑" : "📈"} You: {formatINR(cat.amount)} · Avg: {formatINR(avg)}
                        </span>
                      </div>
                    </div>
                  );
                }).filter(Boolean)}
                <p className="text-[10px] text-muted-foreground pt-1">Anonymous · 3+ users required to show</p>
              </CardContent>
            </Card>
          )}
        </div>

        {!loading && filteredTransactions.length > 0 && (
          <Card className="rounded-xl border-border/60">
            <CardContent className="p-4">
              <SpendingHeatmap transactions={filteredTransactions} />
            </CardContent>
          </Card>
        )}

        {/* Transactions list */}
        <Card className="rounded-xl border-border/60">
          <CardHeader className="pb-3 pt-4 px-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Recent Transactions</CardTitle>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAddTxn(true)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-secondary border border-border hover:bg-muted transition-colors"
                  >
                    + Add
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {dateFilteredTransactions.length} of {transactions.length}
                  </span>
                </div>
              </div>

              {/* Notification permission banner */}
              {!pushEnabled && (
                <div className="rounded-2xl bg-gradient-to-r from-violet-500/10 to-blue-500/10 border border-violet-500/20 p-4 mb-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">🔔</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">Enable Alerts</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Get notified when you spend, hit 80% of your budget, or go 3 hours without activity.
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={enablePush}
                          className="text-xs bg-violet-500 hover:bg-violet-600 text-white rounded-lg px-3 py-1.5 font-medium transition-colors"
                        >
                          Turn on notifications
                        </button>
                        <a
                          href="https://support.google.com/chrome/answer/3220216"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground underline self-center"
                        >
                          Need help?
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Consolidated filter bar */}
              <div className="flex flex-wrap gap-2 items-center mb-3">
                <div className="relative flex-1 min-w-[140px]">
                  <Search className="absolute left-2 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg bg-secondary border-0 outline-none"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <select
                  className="text-xs rounded-lg bg-secondary px-2 py-1.5 border-0 outline-none"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as "all" | "debit" | "credit")}
                >
                  <option value="all">All types</option>
                  <option value="debit">Spent</option>
                  <option value="credit">Received</option>
                </select>

                <select
                  className="text-xs rounded-lg bg-secondary px-2 py-1.5 border-0 outline-none"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="all">All categories</option>
                  {VIBE_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                  ))}
                </select>

                <input
                  type="month"
                  className="text-xs rounded-lg bg-secondary px-2 py-1.5 border-0 outline-none"
                  value={selectedMonth}
                  max={format(new Date(), "yyyy-MM")}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                />

                {(searchQuery || filterCategory !== "all" || filterType !== "all") && (
                  <button
                    onClick={() => { setSearchQuery(""); setFilterCategory("all"); setFilterType("all"); }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ✕ Clear
                  </button>
                )}
              </div>
            </div>
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
                {/* Fix 4: Render dateFilteredTransactions instead of searchedTransactions */}
                {dateFilteredTransactions.slice(0, 50).map((t) => {
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
                          <span className="font-medium text-sm">
                            {t.merchant}
                            {recurringMerchants.some(
                              (r) => r.merchant.toLowerCase() === t.merchant.toLowerCase()
                            ) && (
                              <span className="ml-1 text-[10px] text-blue-400" title="Recurring">🔁</span>
                            )}
                          </span>
                          <button
                            onClick={() => setEditingCategoryTxn(t)}
                            className="text-[10px] text-muted-foreground hover:text-foreground ml-1 opacity-50 hover:opacity-100"
                          >
                            ✏️
                          </button>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 rounded-md">
                            {t.category_name}
                          </Badge>
                        </div>
                        {editingCategoryTxn?.id === t.id && (
                          <select
                            className="text-xs mt-1 bg-background border rounded px-1"
                            defaultValue={t.category_id}
                            onChange={(e) => overrideCategory(t, e.target.value)}
                          >
                            {VIBE_CATEGORIES.map((c) => (
                              <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                            ))}
                          </select>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3 inline mr-1" />
                            {format(new Date(t.date + "T00:00:00"), "dd MMM")}
                          </span>
                          {t.vpa && (
                            <span className="text-xs text-muted-foreground font-mono opacity-60 truncate max-w-[120px]">
                              {t.vpa}
                            </span>
                          )}
                          {t.account_last4 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono">
                              ••{t.account_last4}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">{t.source}</span>
                        </div>
                      </div>
                      {/* Amount */}
                      <div className={`flex items-center gap-1 text-sm font-semibold flex-shrink-0 ${t.type === "credit" ? "text-emerald-600" : "text-red-500"}`}>
                        {t.type === "credit" ? (
                          <ArrowDownRight className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowUpLeft className="w-3.5 h-3.5" />
                        )}
                        {formatINR(t.amount)}
                      </div>
                      {/* Split button */}
                      {t.type === "debit" && (
                        <button
                          onClick={() => { setSplitTxn(t); setSplitAmount(String(Math.round(t.amount / 2))); }}
                          className="text-[10px] px-2 py-1 rounded-lg border border-border hover:bg-secondary transition-colors text-muted-foreground flex-shrink-0"
                          title="Split this"
                        >
                          👥
                        </button>
                      )}
                      {t.source === "manual" && (
                        <button
                          onClick={() => deleteManualTxn(t.id)}
                          className="text-[10px] px-2 py-1 rounded-lg border border-red-500/30 hover:bg-red-500/10 text-red-400 flex-shrink-0"
                          title="Delete manual transaction"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  );
                })}
                {dateFilteredTransactions.length > 50 && (
                  <div className="px-4 py-3 text-xs text-muted-foreground text-center">
                    Showing 50 of {dateFilteredTransactions.length} — refine your search
                  </div>
                )}
                {dateFilteredTransactions.length === 0 && transactions.length > 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No transactions match your search
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground mb-4">No transactions yet for this month</p>
                <Button onClick={() => handleSync()} disabled={syncing} variant="outline" size="sm" className="gap-2 rounded-lg">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sync Current Month
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

        {/* Feature 4: Splits panel */}
        {splits.length > 0 && (
          <Card className="rounded-xl border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">👥 Dues Tracker</span>
                <span className="text-xs text-muted-foreground">{splits.length} pending</span>
              </div>
              <div className="space-y-2">
                {splits.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-xs py-2 border-b border-border/50 last:border-0">
                    <div>
                      <span className="font-medium">{s.split_with_name}</span>
                      <span className="text-muted-foreground ml-2">owes you for {s.transactions?.merchant}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-emerald-600">{formatINR(s.amount_owed)}</span>
                      <button
                        onClick={() => settleSplit(s.id)}
                        className="px-2 py-0.5 rounded-lg bg-secondary border border-border hover:bg-muted transition-colors"
                      >
                        Settled ✓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Feature 7: Onboarding */}
      {showOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl">
            {onboardingStep === 1 && (
              <>
                <div className="text-3xl mb-3">👋</div>
                <h2 className="text-lg font-bold mb-2">Welcome to VibeWallet</h2>
                <p className="text-sm text-muted-foreground mb-6">Track every rupee, discover your spending personality, and actually understand where your money goes.</p>
                <div className="space-y-2 mb-6">
                  {["Your bank emails → auto-parsed transactions", "AI-powered vibe categories", "Monthly Wrapped report"].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-xs"><span className="text-emerald-500">✓</span>{f}</div>
                  ))}
                </div>
                <Button className="w-full rounded-xl" onClick={() => setOnboardingStep(2)}>Let&apos;s go →</Button>
              </>
            )}
            {onboardingStep === 2 && (
              <>
                <div className="text-3xl mb-3">💰</div>
                <h2 className="text-lg font-bold mb-2">Set a monthly budget</h2>
                <p className="text-sm text-muted-foreground mb-4">We&apos;ll warn you before you go over. Skip if you&apos;re not ready.</p>
                <div className="relative mb-4">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                  <input
                    type="number" placeholder="e.g. 10000" value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    className="w-full pl-7 pr-4 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setOnboardingStep(3)}>Skip</Button>
                  <Button className="flex-1 rounded-xl" onClick={async () => { if (budgetInput) { await saveBudget(); } setOnboardingStep(3); }}>Save</Button>
                </div>
              </>
            )}
            {onboardingStep === 3 && (
              <>
                <div className="text-3xl mb-3">📧</div>
                <h2 className="text-lg font-bold mb-2">Connect your bank</h2>
                <p className="text-sm text-muted-foreground mb-4">Make sure your bank sends transaction alerts to this Gmail. Then hit Sync.</p>
                <div className="flex flex-wrap gap-2 mb-6">
                  {["HDFC", "SBI", "ICICI", "Axis", "Kotak", "Equitas"].map((b) => (
                    <span key={b} className="text-xs px-2 py-1 bg-secondary border border-border rounded-lg">{b}</span>
                  ))}
                </div>
                <Button className="w-full rounded-xl" onClick={completeOnboarding}>Got it — let&apos;s sync 🚀</Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Split modal */}
      {splitTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl">
            <h2 className="text-lg font-bold mb-1">👥 Split this bill</h2>
            <p className="text-sm text-muted-foreground mb-4">{splitTxn.merchant} · {formatINR(splitTxn.amount)}</p>
            <input
              type="text"
              placeholder="Who do they owe? (e.g. Rohit)"
              value={splitName}
              onChange={(e) => setSplitName(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-xl mb-3 focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
              <input
                type="number"
                placeholder="Amount they owe"
                value={splitAmount}
                onChange={(e) => setSplitAmount(e.target.value)}
                className="w-full pl-7 pr-4 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setSplitTxn(null)}>Cancel</Button>
              <Button className="flex-1 rounded-xl" onClick={addSplit} disabled={!splitName || !splitAmount}>Add Split</Button>
            </div>
            {splitError && (
              <p className="text-xs text-red-500 mt-1 text-center">{splitError}</p>
            )}
          </div>
        </div>
      )}

      {showAddTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl">
            <h2 className="text-lg font-bold mb-4">➕ Add Transaction</h2>

            <div className="space-y-3">
              <input
                type="text" placeholder="Merchant / Description *"
                value={addTxnForm.merchant}
                onChange={(e) => setAddTxnForm((f) => ({ ...f, merchant: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none"
              />
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                  <input
                    type="number" placeholder="Amount *"
                    value={addTxnForm.amount}
                    onChange={(e) => setAddTxnForm((f) => ({ ...f, amount: e.target.value }))}
                    className="w-full pl-7 pr-3 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none"
                  />
                </div>
                <select
                  value={addTxnForm.type}
                  onChange={(e) => setAddTxnForm((f) => ({ ...f, type: e.target.value as "debit" | "credit" }))}
                  className="text-sm bg-background border border-border rounded-xl px-2 focus:outline-none"
                >
                  <option value="debit">Spent</option>
                  <option value="credit">Received</option>
                </select>
              </div>
              <input
                type="date"
                value={addTxnForm.date}
                onChange={(e) => setAddTxnForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none"
              />
              <select
                value={addTxnForm.category_id}
                onChange={(e) => setAddTxnForm((f) => ({ ...f, category_id: e.target.value }))}
                className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2.5 focus:outline-none"
              >
                <option value="">Auto-detect category</option>
                {VIBE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                ))}
              </select>
              <input
                type="text" placeholder="Note (optional)"
                value={addTxnForm.note}
                onChange={(e) => setAddTxnForm((f) => ({ ...f, note: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none"
              />
            </div>

            {addTxnError && <p className="text-xs text-red-500 mt-2">{addTxnError}</p>}

            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setShowAddTxn(false); setAddTxnError(""); }}>
                Cancel
              </Button>
              <Button className="flex-1 rounded-xl" onClick={submitManualTxn} disabled={addTxnLoading}>
                {addTxnLoading ? "Saving…" : "Add Transaction"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showGoalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm mx-4 shadow-xl">
            <h2 className="text-lg font-bold mb-4">🎯 New Savings Goal</h2>
            <div className="space-y-3">
              <input type="text" placeholder="Goal name (e.g. No food delivery month)"
                value={goalForm.title} onChange={(e) => setGoalForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none" />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                <input type="number" placeholder="Target amount to save"
                  value={goalForm.target_amount} onChange={(e) => setGoalForm((f) => ({ ...f, target_amount: e.target.value }))}
                  className="w-full pl-7 pr-3 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none" />
              </div>
              <select value={goalForm.category_id} onChange={(e) => setGoalForm((f) => ({ ...f, category_id: e.target.value }))}
                className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2.5 focus:outline-none">
                <option value="">Track overall spending</option>
                {VIBE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
              <input type="month" value={goalForm.month} onChange={(e) => setGoalForm((f) => ({ ...f, month: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-xl focus:outline-none" />
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowGoalModal(false)}>Cancel</Button>
              <Button className="flex-1 rounded-xl" onClick={addGoal} disabled={!goalForm.title || !goalForm.target_amount}>Create Goal</Button>
            </div>
          </div>
        </div>
      )}

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
      
      <footer className="mt-12 pb-6 text-center text-xs text-muted-foreground space-y-1">
        <div>© 2026 VibeWallet. All rights reserved.</div>
        <div className="flex items-center justify-center gap-3">
          <a href="/privacy" target="_blank" className="hover:underline">Privacy Policy</a>
          <span>·</span>
          <a href="/terms" target="_blank" className="hover:underline">Terms of Service</a>
        </div>
      </footer>
    </div>
  );
}