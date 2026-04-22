import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { generateVibePersonality } from "@/lib/nvidia";
import { format } from "date-fns";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { month } = await req.json(); // format: "2026-04"
  const [year, monthNum] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNum, 0).getDate();

  // Fetch all transactions for the month
  const { data: transactions, error } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("user_email", session.user.email)
    .eq("type", "debit")
    .gte("date", `${month}-01`)
    .lte("date", `${month}-${String(lastDay).padStart(2, "0")}`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!transactions || transactions.length === 0) {
    return NextResponse.json({ error: "No transactions found for this month" }, { status: 404 });
  }

  // Calculate stats
  const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);
  const avgTransaction = totalSpent / transactions.length;

  // Group by category
  const categoryMap: Record<string, { name: string; emoji: string; amount: number; count: number }> = {};
  for (const t of transactions) {
    if (!categoryMap[t.category_id]) {
      categoryMap[t.category_id] = {
        name: t.category_name,
        emoji: t.category_emoji,
        amount: 0,
        count: 0,
      };
    }
    categoryMap[t.category_id].amount += t.amount;
    categoryMap[t.category_id].count += 1;
  }

  const topCategories = Object.entries(categoryMap)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Top merchants
  const merchantMap: Record<string, number> = {};
  for (const t of transactions) {
    merchantMap[t.merchant] = (merchantMap[t.merchant] || 0) + t.amount;
  }
  const topMerchants = Object.entries(merchantMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount }));

  // Generate AI personality
  const monthLabel = format(new Date(`${month}-01`), "MMMM yyyy");
  const personality = await generateVibePersonality({
    totalSpent,
    topCategories,
    transactionCount: transactions.length,
    avgTransaction,
    month: monthLabel,
  });

  const wrappedData = {
    month,
    monthLabel,
    totalSpent,
    transactionCount: transactions.length,
    avgTransaction,
    topCategories,
    topMerchants,
    personality,
    generatedAt: new Date().toISOString(),
  };

  // Save to DB
  await supabaseAdmin.from("monthly_reports").upsert(
    {
      user_email: session.user.email,
      month,
      total_spent: totalSpent,
      transaction_count: transactions.length,
      top_category: topCategories[0]?.id || "miscellaneous",
      personality_title: personality.title,
      personality_emoji: personality.emoji,
      wrapped_data: wrappedData,
    },
    { onConflict: "user_email,month" }
  );

  return NextResponse.json(wrappedData);
}
