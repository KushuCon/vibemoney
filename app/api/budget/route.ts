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
    .select("monthly_budget, sync_from_date, primary_bank")
    .eq("email", session.user.email)
    .single();

  const { data: bankBalances } = await supabaseAdmin
    .from("bank_balances")
    .select("bank_name, balance, updated_at")
    .eq("user_email", session.user.email)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ budget: null, bankBalances: [], syncFromDate: null, primaryBank: null });
  }

  return NextResponse.json({
    budget: data?.monthly_budget ?? null,
    bankBalances: bankBalances ?? [],
    syncFromDate: data?.sync_from_date ?? null,
    primaryBank: data?.primary_bank ?? null,
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

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { primaryBank } = await req.json();
  await supabaseAdmin
    .from("users")
    .update({ primary_bank: primaryBank })
    .eq("email", session.user.email);
  return NextResponse.json({ success: true });
}
