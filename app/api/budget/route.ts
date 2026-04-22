import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("monthly_budget, bank_balance, balance_updated_at")
    .eq("email", session.user.email)
    .single();

  if (error) {
    return NextResponse.json({ budget: null, balance: null, balanceUpdatedAt: null });
  }

  return NextResponse.json({
    budget: data?.monthly_budget ?? null,
    balance: data?.bank_balance ?? null,
    balanceUpdatedAt: data?.balance_updated_at ?? null,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { budget } = await req.json();

  const { error } = await supabaseAdmin
    .from("users")
    .update({ monthly_budget: budget })
    .eq("email", session.user.email);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
