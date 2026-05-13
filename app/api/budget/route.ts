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
    .select("monthly_budget, sync_from_date, primary_bank, onboarding_done, portfolio_invested, portfolio_current_value, portfolio_in_hand_cash")
    .eq("email", session.user.email)
    .single();

  const { data: bankBalances } = await supabaseAdmin
    .from("bank_balances")
    .select("bank_name, balance, updated_at")
    .eq("user_email", session.user.email)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ budget: null, bankBalances: [], syncFromDate: null, primaryBank: null, portfolioInvested: null, portfolioCurrentValue: null, portfolioInHandCash: null });
  }

  return NextResponse.json({
    budget: data?.monthly_budget ?? null,
    bankBalances: bankBalances ?? [],
    syncFromDate: data?.sync_from_date ?? null,
    primaryBank: data?.primary_bank ?? null,
    onboardingDone: data?.onboarding_done ?? false,
    portfolioInvested: data?.portfolio_invested ?? null,
    portfolioCurrentValue: data?.portfolio_current_value ?? null,
    portfolioInHandCash: data?.portfolio_in_hand_cash ?? null,
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

  const { primaryBank, onboardingDone, portfolioInvested, portfolioCurrentValue, portfolioInHandCash } = await req.json();

  const update: Record<string, unknown> = {};
  if (primaryBank !== undefined) update.primary_bank = primaryBank;
  if (onboardingDone !== undefined) update.onboarding_done = onboardingDone;
  if (portfolioInvested !== undefined) update.portfolio_invested = portfolioInvested;
  if (portfolioCurrentValue !== undefined) update.portfolio_current_value = portfolioCurrentValue;
  if (portfolioInHandCash !== undefined) update.portfolio_in_hand_cash = portfolioInHandCash;

  await supabaseAdmin
    .from("users")
    .update(update)
    .eq("email", session.user.email);

  return NextResponse.json({ success: true });
}