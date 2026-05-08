import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { categorizeTransaction } from "@/lib/vibe-categories";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { amount, type, merchant, date, category_id, note } = await req.json();
  if (!amount || !type || !merchant || !date) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Auto-categorize if not provided
  let catId = category_id;
  let catName = "";
  let catEmoji = "";

  if (catId) {
    const { VIBE_CATEGORIES } = await import("@/lib/vibe-categories");
    const cat = VIBE_CATEGORIES.find((c) => c.id === catId);
    catName = cat?.name ?? "";
    catEmoji = cat?.emoji ?? "";
  } else {
    const cat = categorizeTransaction(merchant, note ?? "");
    catId = cat.id;
    catName = cat.name;
    catEmoji = cat.emoji;
  }

  const { data, error } = await supabaseAdmin
    .from("transactions")
    .insert({
      user_email: session.user.email,
      amount: Number(amount),
      type,
      merchant,
      description: note ?? merchant,
      category_id: catId,
      category_name: catName,
      category_emoji: catEmoji,
      date,
      source: "manual",
      email_id: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  const { error } = await supabaseAdmin
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("user_email", session.user.email)
    .eq("source", "manual"); // only allow deleting manual ones

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}