// app/api/trades/sync-history/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";
import { getToken } from "next-auth/jwt";
import { supabaseAdmin } from "@/lib/supabase";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getToken({ req });
  if (!token?.accessToken) return NextResponse.json({ error: "No access token" }, { status: 401 });

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: token.accessToken as string });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // ONLY indmoney — no other senders
  const query = `from:transactions@transactions.indmoney.com newer_than:365d`;

  const searchRes = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 500 });
  const messages = searchRes.data.messages || [];

  const { data: existing } = await supabaseAdmin
    .from("transactions")
    .select("email_id")
    .eq("user_email", session.user.email)
    .eq("source", "INDmoney");

  const existingIds = new Set((existing || []).map((r) => r.email_id));

  const newTrades = [];
  for (const msg of messages) {
    if (!msg.id || existingIds.has(msg.id)) continue;
    try {
      const emailRes = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "metadata", metadataHeaders: ["Subject", "Date"] });
      const headers = emailRes.data.payload?.headers || [];
      const subject = headers.find(h => h.name?.toLowerCase() === "subject")?.value || "";
      const dateHeader = headers.find(h => h.name?.toLowerCase() === "date")?.value || "";
      const emailDate = dateHeader ? new Date(dateHeader).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];

      const buyMatch = subject.match(/^BUY order of (.+?) for \$([0-9.]+) is successful/i);
      const sellMatch = subject.match(/^SELL order of (.+?) for \$([0-9.]+) is successful/i);
      if (!buyMatch && !sellMatch) continue;

      const match = buyMatch || sellMatch!;
      const amountUSD = parseFloat(match[2]);
      if (amountUSD <= 0) continue;

      newTrades.push({
        user_email: session.user.email,
        amount: amountUSD,
        type: buyMatch ? "debit" : "credit",
        merchant: match[1].trim(),
        description: subject.substring(0, 100),
        date: emailDate,
        raw_subject: subject,
        email_id: msg.id,
        source: "INDmoney",
        category_id: "invest_era",
        category_name: "Invest Era",
        category_emoji: "📈",
      });
    } catch { continue; }
  }

  if (newTrades.length > 0) {
    await supabaseAdmin.from("transactions").insert(newTrades);
  }

  return NextResponse.json({ inserted: newTrades.length, found: messages.length });
}