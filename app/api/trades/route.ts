import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch ALL INDmoney trades — no date filter, full history
  const { data: trades, error } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("user_email", session.user.email)
    .eq("source", "INDmoney")
    .order("date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by stock and calculate P&L
  const stockMap: Record<string, { bought: number; sold: number; buyCount: number; sellCount: number }> = {};

  for (const t of trades || []) {
    const stock = t.merchant;
    if (!stockMap[stock]) {
      stockMap[stock] = { bought: 0, sold: 0, buyCount: 0, sellCount: 0 };
    }
    if (t.type === "debit") {
      stockMap[stock].bought += Number(t.amount);
      stockMap[stock].buyCount += 1;
    } else {
      stockMap[stock].sold += Number(t.amount);
      stockMap[stock].sellCount += 1;
    }
  }

  const summary = Object.entries(stockMap).map(([stock, data]) => ({
    stock,
    bought: data.bought,
    sold: data.sold,
    buyCount: data.buyCount,
    sellCount: data.sellCount,
    // Realised P&L = what you sold minus what you bought (negative = still holding)
    realisedPnL: data.sold - data.bought,
    // Net invested = bought - sold (still in market)
    netInvested: data.bought - data.sold,
  })).sort((a, b) => b.bought - a.bought);

  const totalBought = summary.reduce((s, t) => s + t.bought, 0);
  const totalSold = summary.reduce((s, t) => s + t.sold, 0);

  return NextResponse.json({
    trades: trades || [],
    summary,
    totals: {
      totalBought,
      totalSold,
      totalTrades: (trades || []).length,
      netInvested: totalBought - totalSold,
      realisedPnL: totalSold - totalBought,
    },
  });
}