import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { endpoint, p256dh, auth } = await req.json();
  await supabaseAdmin.from("push_subscriptions").upsert(
    { user_email: session.user.email, endpoint, p256dh, auth },
    { onConflict: "user_email,endpoint" }
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { endpoint } = await req.json();
  await supabaseAdmin.from("push_subscriptions")
    .delete().eq("user_email", session.user.email).eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}