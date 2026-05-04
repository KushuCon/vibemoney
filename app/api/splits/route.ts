import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabaseAdmin
    .from("splits")
    .select("*, transactions(merchant, amount, date)")
    .eq("user_email", session.user.email)
    .eq("settled", false)
    .order("created_at", { ascending: false });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { transaction_id, split_with_name, amount_owed } = await req.json();
  const { data, error } = await supabaseAdmin.from("splits").insert({
    transaction_id, split_with_name, amount_owed,
    user_email: session.user.email,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  await supabaseAdmin.from("splits")
    .update({ settled: true, settled_at: new Date().toISOString() })
    .eq("id", id).eq("user_email", session.user.email);
  return NextResponse.json({ ok: true });
}