import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ subscribed: false });
  
  const { data } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id")
    .eq("user_email", session.user.email)
    .limit(1);
  
  return NextResponse.json({ subscribed: (data?.length ?? 0) > 0 });
}