import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// ── Name normalizer ───────────────────────────────────────────────────────────
// Handles same stock with slightly different names:
// "Bloom Energy Corp" vs "Bloom Energy, Corp." → "bloom energy"
function normalizeStockName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,.]/g, "")
    .replace(/\binc\b/g, "")
    .replace(/\bcorp\b/g, "")
    .replace(/\bincorporated\b/g, "")
    .replace(/\blimited\b/g, "")
    .replace(/\bltd\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDisplayNameMap(trades: { merchant: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const t of trades) {
    const key = normalizeStockName(t.merchant);
    if (!map[key]) map[key] = t.merchant;
  }
  return map;
}

// ── FIFO P&L per stock ────────────────────────────────────────────────────────
interface Lot { cost: number; remaining: number; }

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

function calculateFIFO(
  displayName: string,
  trades: { amount: number; type: string; date: string }[]
): StockResult {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));

  const lots: Lot[] = [];
  let totalBought = 0;
  let totalSold = 0;
  let costBasisConsumed = 0;
  let buyCount = 0;
  let sellCount = 0;
  const lastActivity = sorted[sorted.length - 1]?.date ?? "";

  for (const t of sorted) {
    const amount = Number(t.amount);

    if (t.type === "debit") {
      lots.push({ cost: amount, remaining: amount });
      totalBought += amount;
      buyCount++;
    } else {
      totalSold += amount;
      sellCount++;
      let sellRemaining = amount;

      for (const lot of lots) {
        if (sellRemaining <= 0.001) break;
        if (lot.remaining <= 0.001) continue;
        const consumed = Math.min(lot.remaining, sellRemaining);
        costBasisConsumed += consumed;
        lot.remaining -= consumed;
        sellRemaining -= consumed;
      }
    }
  }

  const holding = lots.reduce((s, l) => s + l.remaining, 0);
  // Realised P&L = proceeds from sales - cost basis of what was sold
  const realisedPnL = totalSold - costBasisConsumed;

  let status: "open" | "partial" | "closed";
  if (holding <= 0.01) status = "closed";
  else if (totalSold > 0) status = "partial";
  else status = "open";

  return {
    displayName,
    status,
    totalBought: Math.round(totalBought * 100) / 100,
    totalSold: Math.round(totalSold * 100) / 100,
    holding: Math.round(Math.max(0, holding) * 100) / 100,
    realisedPnL: Math.round(realisedPnL * 100) / 100,
    buyCount,
    sellCount,
    lastActivity,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: trades, error } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("user_email", session.user.email)
    .eq("source", "INDmoney")
    .order("date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const allTrades = trades || [];
  const displayNames = buildDisplayNameMap(allTrades);

  // Group by normalized name
  const stockGroups: Record<string, typeof allTrades> = {};
  for (const t of allTrades) {
    const key = normalizeStockName(t.merchant);
    if (!stockGroups[key]) stockGroups[key] = [];
    stockGroups[key].push(t);
  }

  // FIFO per stock
  const stockResults: StockResult[] = Object.entries(stockGroups).map(([key, group]) =>
    calculateFIFO(displayNames[key] ?? group[0].merchant, group)
  );

  // Sort: open → partial → closed, then by last activity desc within each group
  const statusOrder = { open: 0, partial: 1, closed: 2 };
  stockResults.sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status])
      return statusOrder[a.status] - statusOrder[b.status];
    return b.lastActivity.localeCompare(a.lastActivity);
  });

  const totalHolding = stockResults.reduce((s, r) => s + r.holding, 0);
  const totalRealisedPnL = stockResults.reduce((s, r) => s + r.realisedPnL, 0);

  return NextResponse.json({
    trades: [...allTrades].reverse(), // newest first for history tab
    stockResults,
    totals: {
      totalTrades: allTrades.length,
      totalHolding: Math.round(totalHolding * 100) / 100,
      totalRealisedPnL: Math.round(totalRealisedPnL * 100) / 100,
      openCount: stockResults.filter((r) => r.status !== "closed").length,
      closedCount: stockResults.filter((r) => r.status === "closed").length,
    },
  });
}