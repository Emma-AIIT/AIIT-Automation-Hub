/**
 * GET /api/cron/scheduled-calls
 * Cron endpoint, called by Vercel Cron (secured with CRON_SECRET bearer token).
 *
 * Fires campaign batches that were parked with a future scheduled_at, so Ali can
 * queue a list at midnight and have it dial at 9am. Batches are claimed by
 * flipping them to "queued" before dialling starts, so an overlapping tick
 * cannot dial the same list twice.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "~/lib/supabase/admin";
import { env } from "~/env";
import { runBatch, type Target } from "~/lib/server/dialer";

export const maxDuration = 300;

type DueBatch = {
  id: string;
  script_snapshot: string;
  first_message: string | null;
  assistant_id: string;
  assistant_name: string | null;
  phone_number_id: string;
  transfer_number: string | null;
};

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
    .select("id, script_snapshot, first_message, assistant_id, assistant_name, phone_number_id, transfer_number")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());

  if (error) {
    console.error("[cron/scheduled-calls] query failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ started: 0 });
  }

  let started = 0;
  for (const batch of due as DueBatch[]) {
    // Claim it first. The filter on status makes this a no-op if another tick
    // already took it, which is what stops a list being dialled twice.
    const { data: claimed, error: claimError } = await supabase
      .from("outbound_call_batches")
      .update({ status: "queued" })
      .eq("id", batch.id)
      .eq("status", "scheduled")
      .select("id");

    if (claimError || !claimed || claimed.length === 0) continue;

    const { data: targets, error: targetsError } = await supabase
      .from("outbound_calls")
      .select("id, phone_number")
      .eq("batch_id", batch.id)
      .eq("status", "queued");

    if (targetsError || !targets || targets.length === 0) {
      await supabase
        .from("outbound_call_batches")
        .update({ status: "failed", error: "No numbers left to dial", completed_at: new Date().toISOString() })
        .eq("id", batch.id);
      continue;
    }

    started++;

    await runBatch({
      batchId: batch.id,
      apiKey,
      assistantId: batch.assistant_id,
      assistantName: batch.assistant_name,
      phoneNumberId: batch.phone_number_id,
      script: batch.script_snapshot,
      firstMessage: batch.first_message,
      transferNumber: batch.transfer_number,
      targets: targets as Target[],
    }).catch((err) => {
      console.error("[cron/scheduled-calls] batch", batch.id, "crashed:", err);
    });
  }

  return NextResponse.json({ started });
}
