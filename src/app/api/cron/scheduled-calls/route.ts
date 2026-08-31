/**
 * GET /api/cron/scheduled-calls
 * Cron endpoint, called by Vercel Cron (secured with CRON_SECRET bearer token).
 *
 * Releases campaign batches parked with a future scheduled_at, so Ali can queue
 * a list at midnight and have it start dialling at 9am.
 *
 * Releasing only flips the batch to "queued". The actual ringing is left to the
 * shared drip in ~/lib/server/dialer, which respects the concurrency ceiling, so
 * a scheduled list cannot burst past it either. The status-filtered update is
 * what stops two overlapping ticks releasing the same batch twice.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "~/lib/supabase/admin";
import { env } from "~/env";
import { dialPending } from "~/lib/server/dialer";

export const maxDuration = 300;

type DueBatch = { id: string };

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = env.VAPI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "VAPI_API_KEY is not configured" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: due, error } = await supabase
    .from("outbound_call_batches")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());

  if (error) {
    console.error("[cron/scheduled-calls] query failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ released: 0 });
  }

  let released = 0;
  for (const batch of due as DueBatch[]) {
    // The status filter makes this a no-op if another tick already took it.
    const { data: claimed, error: claimError } = await supabase
      .from("outbound_call_batches")
      .update({ status: "queued" })
      .eq("id", batch.id)
      .eq("status", "scheduled")
      .select("id");

    if (claimError || !claimed || claimed.length === 0) continue;
    released++;
  }

  // One pass now so a released batch does not wait on the next dial-queue tick.
  if (released > 0) {
    await dialPending(apiKey).catch((err) => {
      console.error("[cron/scheduled-calls] dialling pass failed:", err);
    });
  }

  return NextResponse.json({ released });
}
