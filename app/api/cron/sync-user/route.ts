import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { google } from "googleapis";
import { parseTransactionEmail, buildGmailQuery } from "@/lib/gmail-parser";
import { categorizeTransaction } from "@/lib/vibe-categories";
import webpush from "web-push";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

/**
 * POST /api/cron/sync-user
 * Body: { userEmail: string }
 * Authorization: Bearer CRON_SECRET
 *
 * Does the actual per-user Gmail sync using their stored refresh token.
 * Then sends a vibe notification based on what was found.
 *
 * Notification logic (3hr window):
 *   - No transactions at all  → idle / "no spend" positive vibe
 *   - Credit found            → "you just got loaded" hype
 *   - Debit found             → "u gonna go broke sweetie" roast
 *   - Budget >= 80%           → budget warning
 *   - No incoming > 3hrs      → "aww, why no incoming money"
 */
export async function POST(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userEmail } = await req.json();
  if (!userEmail) {
    return NextResponse.json({ error: "Missing userEmail" }, { status: 400 });
  }

  // Fetch user with refresh token + budget
  const { data: user, error: userErr } = await supabaseAdmin
    .from("users")
    .select("refresh_token, last_synced_at, monthly_budget")
    .eq("email", userEmail)
    .single();

  if (userErr || !user?.refresh_token) {
    return NextResponse.json({ error: "No refresh token stored for user" }, { status: 400 });
  }

  // ── Refresh access token via stored refresh token ─────────────────────────
  let accessToken: string;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: user.refresh_token,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || "Token refresh failed");
    }
    accessToken = tokenData.access_token;
  } catch (err) {
    console.error(`Token refresh failed for ${userEmail}:`, err);
    return NextResponse.json({ error: "Token refresh failed" }, { status: 401 });
  }

  // ── Setup Gmail client ─────────────────────────────────────────────────────
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Look back ~4 hours (cron is every 3hrs, buffer overlap)
  const query = buildGmailQuery(1); // 1 day back — we deduplicate by email_id anyway
  let messages: { id?: string | null }[] = [];

  try {
    const searchRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 50,
    });
    messages = searchRes.data.messages || [];
  } catch (err) {
    console.error(`Gmail search failed for ${userEmail}:`, err);
    return NextResponse.json({ error: "Gmail search failed" }, { status: 500 });
  }

  // ── Get existing email IDs to skip duplicates ──────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from("transactions")
    .select("email_id")
    .eq("user_email", userEmail);

  const existingIds = new Set((existing || []).map((r) => r.email_id));

  // ── Process each email ────────────────────────────────────────────────────
  const newTransactions: Record<string, unknown>[] = [];

  for (const msg of messages) {
    if (!msg.id || existingIds.has(msg.id)) continue;

    try {
      const emailRes = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const emailData = emailRes.data;
      const headers = emailData.payload?.headers || [];

      const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
      const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
      const dateHeader = headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";

      const senderMatch = from.match(/<([^>]+)>/) || [null, from];
      const senderEmail = senderMatch[1]?.toLowerCase() || from.toLowerCase();
      const body = extractBody(emailData.payload);
      const emailDate = dateHeader
        ? new Date(dateHeader).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      const parsed = parseTransactionEmail(body, subject, msg.id, emailDate, senderEmail);
      if (!parsed) continue;

      const category = categorizeTransaction(parsed.merchant, parsed.description);

      newTransactions.push({
        user_email: userEmail,
        amount: parsed.amount,
        type: parsed.type,
        merchant: parsed.merchant,
        description: parsed.description,
        category_id: category.id,
        category_name: category.name,
        category_emoji: category.emoji,
        date: parsed.date,
        account_last4: parsed.account_last4,
        source: parsed.source,
        email_id: parsed.email_id,
        raw_subject: parsed.raw_subject,
        vpa: parsed.vpa ?? null,
      });
    } catch {
      // Skip bad emails silently
      continue;
    }
  }

  // ── Insert new transactions ───────────────────────────────────────────────
  if (newTransactions.length > 0) {
    await supabaseAdmin.from("transactions").insert(newTransactions);
  }

  // ── Decide which vibe notification to send ────────────────────────────────
  await sendVibeNotification(userEmail, newTransactions, user.monthly_budget);

  // ── Update last synced ────────────────────────────────────────────────────
  await supabaseAdmin
    .from("users")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("email", userEmail);

  return NextResponse.json({
    synced: newTransactions.length,
    userEmail,
    timestamp: new Date().toISOString(),
  });
}

// ── Vibe Notification Engine ──────────────────────────────────────────────────

type Transaction = {
  type: string;
  merchant: string;
  amount: number;
  category_emoji: string;
};

async function sendVibeNotification(
  userEmail: string,
  newTxns: Record<string, unknown>[],
  monthlyBudget: number | null
) {
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_email", userEmail);

  if (!subs || subs.length === 0) return;

  const credits = newTxns.filter((t) => t.type === "credit") as Transaction[];
  const debits = newTxns.filter((t) => t.type === "debit") as Transaction[];

  let title = "";
  let body = "";

  if (credits.length > 0) {
    // 💰 Money came in — HYPE them up
    const txn = credits[0];
    const isINDmoney = (txn as unknown as Record<string,unknown>).source === "INDmoney";
    const symbol = isINDmoney ? "$" : "₹";
    const msgs = [
      {
        t: "VibeWallet 💰",
        b: `Congrats, you just got loaded! ${symbol}${txn.amount} incoming from ${txn.merchant} ${txn.category_emoji}`,
      },
      {
        t: "VibeWallet 🤑",
        b: `MONEY IN THE BANK! ${symbol}${txn.amount} from ${txn.merchant}. Don't spend it all at once 👀`,
      },
      {
        t: "VibeWallet 📈",
        b: `${symbol}${txn.amount} just landed from ${txn.merchant}. Main character energy unlocked.`,
      },
      {
        t: "VibeWallet 🎉",
        b: `Cha-ching! ${symbol}${txn.amount} received from ${txn.merchant}. You ate today.`,
      },
    ];
    const pick = msgs[Math.floor(Math.random() * msgs.length)];
    title = pick.t;
    body = pick.b;
  } else if (debits.length > 0) {
    // 💸 Money went out — roast them
    const txn = debits[0];
    const isINDmoney = (txn as unknown as Record<string,unknown>).source === "INDmoney";
    const symbol = isINDmoney ? "$" : "₹";
    const msgs = [
      {
        t: "VibeWallet 💸",
        b: `U gonna go broke sweetie 😭 ${symbol}${txn.amount} at ${txn.merchant} ${txn.category_emoji}`,
      },
      {
        t: "VibeWallet 🫠",
        b: `${symbol}${txn.amount} gone at ${txn.merchant}. Your bank account felt that.`,
      },
      {
        t: "VibeWallet 😬",
        b: `Spending detected: ${symbol}${txn.amount} at ${txn.merchant}. Hope it was worth it bestie.`,
      },
      {
        t: "VibeWallet 🚨",
        b: `${symbol}${txn.amount} left the chat (to ${txn.merchant}). Pouring one out for your wallet.`,
      },
    ];
    const pick = msgs[Math.floor(Math.random() * msgs.length)];
    title = pick.t;
    body = pick.b;
  } else {
    // 🏜️ No transactions found — check how long since last incoming
    const noIncomingNotif = await shouldSendNoIncomingNotif(userEmail);

    if (noIncomingNotif) {
      // No credit in > 3hrs — gentle sadge notification
      const msgs = [
        {
          t: "VibeWallet 🥺",
          b: "Aww, why no incoming money bestie? Your wallet is waiting...",
        },
        {
          t: "VibeWallet 😢",
          b: "No money came in today. Your bank account is giving ghost energy.",
        },
        {
          t: "VibeWallet 💔",
          b: "Still no incoming transactions. The money is not coming home.",
        },
      ];
      const pick = msgs[Math.floor(Math.random() * msgs.length)];
      title = pick.t;
      body = pick.b;
    } else {
      // Truly idle — congratulate them for not spending
      const msgs = [
        {
          t: "VibeWallet 👀",
          b: "No transactions today — are you actually saving money or just offline?",
        },
        {
          t: "VibeWallet 🏆",
          b: "Congrats! No spending detected. Your wallet is having its best day.",
        },
        {
          t: "VibeWallet 🧘",
          b: "Zero transactions. Either you're broke or enlightened. Either way, respect.",
        },
        {
          t: "VibeWallet ✨",
          b: "No spend detected! Your future self is throwing a party rn.",
        },
      ];
      const pick = msgs[Math.floor(Math.random() * msgs.length)];
      title = pick.t;
      body = pick.b;
    }
  }

  // Budget check — override notification if over 80%
  if (monthlyBudget) {
    const currentMonth = new Date().toISOString().substring(0, 7);
    const { data: txns } = await supabaseAdmin
      .from("transactions")
      .select("amount")
      .eq("user_email", userEmail)
      .eq("type", "debit")
      .gte("date", `${currentMonth}-01`);

    const spent = txns?.reduce((s, t) => s + Number(t.amount), 0) ?? 0;
    const pct = (spent / monthlyBudget) * 100;

    if (pct >= 100) {
      title = "VibeWallet 💀";
      body = `Budget is DEAD. Spent ₹${spent.toLocaleString("en-IN")} of ₹${monthlyBudget.toLocaleString("en-IN")}. RIP your wallet.`;
    } else if (pct >= 80) {
      title = "VibeWallet ⚠️";
      body = `Aww, ${Math.round(pct)}% of budget gone. ₹${(monthlyBudget - spent).toLocaleString("en-IN")} left. Tread carefully bestie.`;
    }
  }

  // Push to all subscriptions
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({ title, body })
      );
    } catch {
      // Subscription may have expired — ignore
    }
  }
}

/**
 * Returns true if the user hasn't received any credit transaction in 3+ hours
 * and it's been at least 3 hours since the last sync notification.
 */
async function shouldSendNoIncomingNotif(userEmail: string): Promise<boolean> {
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  const { data: recentCredit } = await supabaseAdmin
    .from("transactions")
    .select("created_at")
    .eq("user_email", userEmail)
    .eq("type", "credit")
    .gte("created_at", threeHoursAgo)
    .limit(1);

  // If there's been a credit in the last 3hrs, don't send the sad notification
  if (recentCredit && recentCredit.length > 0) return false;

  // Check if there's ever been a credit (don't send this to brand new users)
  const { data: anyCredit } = await supabaseAdmin
    .from("transactions")
    .select("id")
    .eq("user_email", userEmail)
    .eq("type", "credit")
    .limit(1);

  return !!(anyCredit && anyCredit.length > 0);
}

// ── Email body extractor ──────────────────────────────────────────────────────

function extractBody(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;

  if (p.body && typeof p.body === "object") {
    const b = p.body as Record<string, unknown>;
    if (b.data)
      return Buffer.from(
        (b.data as string).replace(/-/g, "+").replace(/_/g, "/"),
        "base64"
      ).toString("utf-8");
  }

  if (Array.isArray(p.parts)) {
    for (const part of p.parts) {
      const pt = part as Record<string, unknown>;
      if (pt.mimeType === "text/plain") {
        const b = pt.body as Record<string, unknown>;
        if (b?.data)
          return Buffer.from(
            (b.data as string).replace(/-/g, "+").replace(/_/g, "/"),
            "base64"
          ).toString("utf-8");
      }
    }
    for (const part of p.parts) {
      const pt = part as Record<string, unknown>;
      if (pt.mimeType === "text/html") {
        const b = pt.body as Record<string, unknown>;
        if (b?.data) {
          const html = Buffer.from(
            (b.data as string).replace(/-/g, "+").replace(/_/g, "/"),
            "base64"
          ).toString("utf-8");
          return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        }
      }
    }
  }

  return "";
}