import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { google } from "googleapis";
import { parseTransactionEmail, buildGmailQuery, parseBalanceAlert } from "@/lib/gmail-parser";
import { categorizeTransaction } from "@/lib/vibe-categories";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * HOW GMAIL PARSING WORKS — STEP BY STEP
 *
 * 1. User clicks "Sync Gmail" button
 * 2. This API route is called with their session access token
 * 3. We create a Gmail API client authenticated with their OAuth token
 * 4. We search Gmail with our bank sender query (see gmail-parser.ts)
 * 5. For each matching email:
 *    a. Fetch the full email body (base64 decoded)
 *    b. Run regex patterns to extract amount, merchant, date
 *    c. Categorize into fun vibe categories
 *    d. Store in Supabase (skip duplicates by email_id)
 * 6. Return summary of how many transactions were synced
 *
 * GMAIL API SCOPES USED:
 * - gmail.readonly: read-only, we NEVER send or delete emails
 *
 * PRIVACY:
 * - We only read emails matching our bank sender filter
 * - Raw email content is NOT stored, only parsed transaction data
 * - User can revoke access anytime from Google Account settings
 */

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Check for token refresh errors
  if (session.error === "RefreshAccessTokenError") {
    return NextResponse.json(
      { error: "Gmail access expired. Please sign in again." },
      { status: 401 }
    );
  }

  const { daysBack = 3 } = await req.json().catch(() => ({}));

  try {
    // ── Setup Gmail client ──────────────────────────────────────────────────
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // ── Search for transaction emails ───────────────────────────────────────
    const query = buildGmailQuery(daysBack);
    console.log("Gmail search query:", query);

    const searchRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 200, // Max 200 emails per sync
    });

    const messages = searchRes.data.messages || [];
    console.log(`Found ${messages.length} potential transaction emails`);

    if (messages.length === 0) {
      return NextResponse.json({
        synced: 0,
        skipped: 0,
        message: "No transaction emails found. Make sure your bank sends email alerts.",
      });
    }

    // ── Fetch existing email IDs to avoid duplicates ────────────────────────
    const { data: existing } = await supabaseAdmin
      .from("transactions")
      .select("email_id")
      .eq("user_email", session.user?.email);

    const existingIds = new Set((existing || []).map((r) => r.email_id));

    // ── Process each email ──────────────────────────────────────────────────
    let synced = 0;
    let skipped = 0;
    let failed = 0;
    const newTransactions = [];

    for (const msg of messages) {
      if (!msg.id) continue;

      // Skip already synced emails
      if (existingIds.has(msg.id)) {
        skipped++;
        continue;
      }

      try {
        // Fetch full email
        const emailRes = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        });

        const emailData = emailRes.data;
        const headers = emailData.payload?.headers || [];

        // Extract headers
        const subject =
          headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
        const from =
          headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
        const dateHeader =
          headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";

        // Parse sender email
        const senderMatch = from.match(/<([^>]+)>/) || [null, from];
        const senderEmail = senderMatch[1]?.toLowerCase() || from.toLowerCase();

        // Decode email body
        const body = extractEmailBody(emailData.payload);

        if (!body && !subject) {
          failed++;
          continue;
        }

        // Parse email date
        const emailDate = dateHeader
          ? new Date(dateHeader).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];

        // ── CORE PARSING ────────────────────────────────────────────────────
        const parsed = parseTransactionEmail(
          body,
          subject,
          msg.id,
          emailDate,
          senderEmail
        );

        const balanceParsed = parseBalanceAlert(body, subject, msg.id, emailDate);
        if (balanceParsed) {
          const balanceIso = new Date(emailDate).toISOString();
          const { data: userData } = await supabaseAdmin
            .from("users")
            .select("balance_updated_at")
            .eq("email", session.user?.email)
            .single();

          const prevUpdatedAt = userData?.balance_updated_at
            ? new Date(userData.balance_updated_at).toISOString()
            : null;

          if (!prevUpdatedAt || balanceIso > prevUpdatedAt) {
            await supabaseAdmin
              .from("users")
              .update({
                bank_balance: balanceParsed.balance,
                balance_updated_at: balanceIso,
              })
              .eq("email", session.user?.email);
          }
        }

        if (!parsed) {
          skipped++;
          continue;
        }

        // ── CATEGORIZE ──────────────────────────────────────────────────────
        const category = categorizeTransaction(parsed.merchant, parsed.description);

        newTransactions.push({
          user_email: session.user?.email,
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
        });

        synced++;
      } catch (err) {
        console.error(`Failed to process email ${msg.id}:`, err);
        failed++;
      }

      // Small delay to avoid rate limits
      if (synced % 10 === 0) await sleep(100);
    }

    // ── Batch insert into Supabase ──────────────────────────────────────────
    if (newTransactions.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("transactions")
        .insert(newTransactions);

      if (insertError) {
        console.error("Supabase insert error:", insertError);
        return NextResponse.json(
          { error: "Failed to save transactions" },
          { status: 500 }
        );
      }
    }

    // ── Update last sync time ───────────────────────────────────────────────
    await supabaseAdmin
      .from("users")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("email", session.user?.email);

    return NextResponse.json({
      synced,
      skipped,
      failed,
      total: messages.length,
      message: `Synced ${synced} new transactions`,
    });
  } catch (error: unknown) {
    console.error("Gmail sync error:", error);
    const errMsg = error instanceof Error ? error.message : "Gmail sync failed";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractEmailBody(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;

  // Direct body
  if (p.body && typeof p.body === "object") {
    const body = p.body as Record<string, unknown>;
    if (body.data && typeof body.data === "string") {
      return decodeBase64(body.data);
    }
  }

  // Multipart: check parts
  if (Array.isArray(p.parts)) {
    for (const part of p.parts) {
      const partObj = part as Record<string, unknown>;
      const mimeType = partObj.mimeType as string;

      // Prefer plain text
      if (mimeType === "text/plain") {
        const body = partObj.body as Record<string, unknown>;
        if (body?.data) return decodeBase64(body.data as string);
      }

      // Recurse into nested parts
      if (Array.isArray(partObj.parts)) {
        const nested = extractEmailBody(partObj);
        if (nested) return nested;
      }
    }

    // Fallback to HTML part
    for (const part of p.parts) {
      const partObj = part as Record<string, unknown>;
      if (partObj.mimeType === "text/html") {
        const body = partObj.body as Record<string, unknown>;
        if (body?.data) {
          const html = decodeBase64(body.data as string);
          // Strip HTML tags for parsing
          return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        }
      }
    }
  }

  return "";
}

function decodeBase64(data: string): string {
  try {
    // Gmail uses URL-safe base64
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
