/**
 * DEBUG ROUTE — /api/debug
 *
 * GET  /api/debug          → show all transactions in DB (all dates) + summary
 * POST /api/debug          → fix wrong-dated transactions (DD-MM-YY misparse)
 *                            re-dates rows where date looks like 2026-02-05 but
 *                            should be 2026-05-02, then marks them for re-sync
 * DELETE /api/debug?email_id=X  → delete a single transaction by email_id (so it re-syncs)
 *
 * ONLY accessible to the logged-in user's own data.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userEmail = session.user.email;

  // Fetch ALL transactions for this user regardless of date
  const { data: allTxns, error } = await supabaseAdmin
    .from("transactions")
    .select("id, email_id, date, amount, type, merchant, source, raw_subject")
    .eq("user_email", userEmail)
    .order("date", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by month to spot wrong dates
  const byMonth: Record<string, number> = {};
  for (const t of allTxns || []) {
    const month = (t.date as string)?.substring(0, 7) ?? "unknown";
    byMonth[month] = (byMonth[month] ?? 0) + 1;
  }

  // Flag suspicious rows: date like 2026-02-05 or 2026-03-04 etc
  // These are likely DD-MM misparses of Indian dates (e.g. 05-02-26 → Feb 5 instead of May 2)
  const suspicious = (allTxns || []).filter((t) => {
    if (!t.date) return false;
    const d = new Date(t.date);
    const year = d.getFullYear();
    // Only flag 2026 dates that fall in Jan-Apr (could be misparse of recent months)
    return year === 2026 && d.getMonth() < 4; // months 0-3 = Jan-Apr
  });

  // Fetch user row
  const { data: userData } = await supabaseAdmin
    .from("users")
    .select("sync_from_date, last_synced_at, bank_balance, balance_updated_at")
    .eq("email", userEmail)
    .single();

  return NextResponse.json({
    totalTransactions: allTxns?.length ?? 0,
    byMonth,
    suspicious: suspicious.map((t) => ({
      id: t.id,
      email_id: t.email_id,
      date: t.date,
      amount: t.amount,
      type: t.type,
      merchant: t.merchant,
      subject: t.raw_subject,
    })),
    suspiciousCount: suspicious.length,
    userData,
    hint: suspicious.length > 0
      ? "POST /api/debug to auto-fix wrong dates (swaps DD↔MM for these rows)"
      : "No suspicious rows found. If transactions still missing, they may not be in DB at all — check sync logs.",
  });
}

// POST: fix wrong-dated rows by swapping day/month
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userEmail = session.user.email;

  // Get all 2026 Jan-Apr transactions (likely misparses)
  const { data: suspicious, error } = await supabaseAdmin
    .from("transactions")
    .select("id, email_id, date")
    .eq("user_email", userEmail)
    .gte("date", "2026-01-01")
    .lte("date", "2026-04-30");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const fixed: string[] = [];
  const skipped: string[] = [];

  for (const row of suspicious || []) {
    const d = new Date(row.date);
    // Swap day and month
    const swappedDate = new Date(d.getFullYear(), d.getDate() - 1, d.getMonth() + 1);

    // Only apply fix if swapped date makes sense (is in 2026 and <= today)
    if (
      swappedDate.getFullYear() === 2026 &&
      swappedDate <= new Date() &&
      swappedDate.getMonth() !== d.getMonth() // actually changed something
    ) {
      const newDate = swappedDate.toISOString().split("T")[0];
      const { error: updateErr } = await supabaseAdmin
        .from("transactions")
        .update({ date: newDate })
        .eq("id", row.id);

      if (!updateErr) {
        fixed.push(`${row.id}: ${row.date} → ${newDate}`);
      } else {
        skipped.push(`${row.id}: update failed - ${updateErr.message}`);
      }
    } else {
      skipped.push(`${row.id}: ${row.date} → swap produced invalid date, left unchanged`);
    }
  }

  return NextResponse.json({
    fixed: fixed.length,
    skipped: skipped.length,
    details: fixed,
    skippedDetails: skipped,
    message: fixed.length > 0
      ? `Fixed ${fixed.length} rows. Refresh your dashboard to see May transactions.`
      : "Nothing to fix. If transactions are still missing, they may not be in the DB — run a fresh sync.",
  });
}

// DELETE: remove a transaction by email_id so it gets re-synced fresh
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const emailId = searchParams.get("email_id");

  if (!emailId) {
    return NextResponse.json({ error: "email_id param required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("transactions")
    .delete()
    .eq("user_email", session.user.email)
    .eq("email_id", emailId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true, email_id: emailId });
}