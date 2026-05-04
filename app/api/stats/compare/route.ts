import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") ?? new Date().toISOString().substring(0, 7);

  const { data } = await supabaseAdmin
    .from("anonymous_category_stats")
    .select("category_id, category_name, avg_spend, user_count")
    .eq("month", month);

  return NextResponse.json(data ?? []);
}