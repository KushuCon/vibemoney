import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/cron/sync?secret=YOUR_CRON_SECRET
 *
 * Called by cron-job.org every 3 hours.
 * Loops through active users and triggers per-user sync + vibe notifications.
 *
 * Setup on cron-job.org:
 *   URL: https://your-app.vercel.app/api/cron/sync?secret=YOUR_CRON_SECRET
 *   Method: GET
 *   Schedule: Every 3 hours
 */
export async function GET(req: NextRequest) {
  // Auth check — secret in query param (cron-job.org sends GET)
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only sync users who have been active in the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: activeUsers, error } = await supabaseAdmin
    .from("users")
    .select("email")
    .gte("last_synced_at", sevenDaysAgo.toISOString())
    .not("refresh_token", "is", null);

  if (error) {
    console.error("Failed to fetch active users:", error);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  if (!activeUsers || activeUsers.length === 0) {
    return NextResponse.json({ message: "No active users to sync", synced: 0 });
  }

  let synced = 0;
  let failed = 0;

  for (const user of activeUsers) {
    try {
      const res = await fetch(`${process.env.NEXTAUTH_URL}/api/cron/sync-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({ userEmail: user.email }),
      });

      if (res.ok) synced++;
      else {
        const body = await res.text();
        console.error(`Sync failed for ${user.email}:`, body);
        failed++;
      }
    } catch (err) {
      console.error(`Sync error for ${user.email}:`, err);
      failed++;
    }

    // 500ms gap between users — avoid hammering Gmail API
    await new Promise((r) => setTimeout(r, 500));
  }

  return NextResponse.json({
    synced,
    failed,
    total: activeUsers.length,
    timestamp: new Date().toISOString(),
  });
}