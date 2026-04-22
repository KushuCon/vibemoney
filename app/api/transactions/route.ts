import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // format: "2026-04"
  const limit = parseInt(searchParams.get("limit") || "50");

  let query = supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("user_email", session.user.email)
    .order("date", { ascending: false })
    .limit(limit);

  if (month) {
    const [year, monthNum] = month.split("-").map(Number);
    const lastDay = new Date(year, monthNum, 0).getDate();
    query = query
      .gte("date", `${month}-01`)
      .lte("date", `${month}-${lastDay}`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Supabase error details:", JSON.stringify(error));
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ transactions: data || [] });
}
