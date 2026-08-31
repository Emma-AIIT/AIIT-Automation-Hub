/**
 * GET /api/cron/outbound-calls
 * Cron endpoint, called by Vercel Cron (secured with CRON_SECRET bearer token).
 *
 * Sweeps abandoned calling batches. /api/calls/start dials in the background, so
 * if that function is cut short (execution ceiling, a deploy mid-dial) nothing
 * else writes the batch a terminal status and the page would show "Dialling"
 * forever. Any batch still queued/dialling past the cutoff is marked
 * "interrupted" and alerted on.
 *
 * The sweep never re-dials. Numbers earlier in the batch have already been
 * called, and calling a person twice is worse than an incomplete batch.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "~/lib/supabase/admin";
import { sendAlertEmail } from "~/lib/server/alerts";

/**
 * A batch is only stuck if nothing has been dialled on it for this long.
 *
 * It cannot be measured from when the batch started any more: dialling is a drip
 * capped at MAX_CONCURRENT_CALLS, so a long list legitimately stays in
 * "dialling" for hours. What is NOT legitimate is no number being rung for an
 * hour, which means the drip has stalled rather than merely being patient.
 */
const NO_PROGRESS_MINUTES = 60;

const INTERRUPTED_NOTE =
  "Dialling was interrupted before the batch finished. Numbers already dialled were not called again.";

type StuckBatch = {
  id: string;
  created_at: string;
  script_name: string;
  assistant_name: string | null;
  assistant_id: string;
  total_count: number;
  dialled_count: number;
  failed_count: number;
};

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - NO_PROGRESS_MINUTES * 60_000).toISOString();

  const { data: candidates, error } = await supabase
    .from("outbound_call_batches")
    .select("id, script_name, assistant_name, assistant_id, total_count, dialled_count, failed_count, created_at")
    .in("status", ["queued", "dialling"])
    .lt("created_at", cutoff);

  if (error) {
    console.error("[cron/outbound-calls] could not query stuck batches:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ swept: 0 });
  }

  // Being old is not being stuck. A long list drips out over hours by design, so
  // only a batch that has rung nobody recently counts as stalled.
  const stuck: StuckBatch[] = [];
  for (const batch of candidates as StuckBatch[]) {
    const { data: lastDial } = await supabase
      .from("outbound_calls")
      .select("dialled_at")
      .eq("batch_id", batch.id)
      .not("dialled_at", "is", null)
      .order("dialled_at", { ascending: false })
      .limit(1);

    const rows = (lastDial ?? []) as Array<{ dialled_at: string }>;
    const lastActivity = rows[0]?.dialled_at ?? batch.created_at;
    if (lastActivity < cutoff) stuck.push(batch);
  }

  if (stuck.length === 0) {
    return NextResponse.json({ swept: 0 });
  }

  let swept = 0;
  for (const batch of stuck) {
    const { error: updateError } = await supabase
      .from("outbound_call_batches")
      .update({
        status: "interrupted",
        error: INTERRUPTED_NOTE,
        completed_at: new Date().toISOString(),
      })
      .eq("id", batch.id);

    if (updateError) {
      console.error("[cron/outbound-calls] could not clear batch", batch.id, updateError.message);
      continue;
    }

    // Numbers still sitting on "queued" were never reached at all.
    await supabase
      .from("outbound_calls")
      .update({ status: "failed", error: "Not dialled, the batch was interrupted" })
      .eq("batch_id", batch.id)
      .eq("status", "queued");

    swept++;

    const notDialled = batch.total_count - batch.dialled_count - batch.failed_count;
    await sendAlertEmail(
      `[AIIT Hub] Outbound call batch DID NOT COMPLETE`,
      [
        `A calling batch has rung nobody for ${NO_PROGRESS_MINUTES} minutes with numbers still waiting, so it was marked interrupted.`,
        ``,
        `Script: ${batch.script_name}`,
        `Agent: ${batch.assistant_name ?? batch.assistant_id}`,
        `Dialled: ${batch.dialled_count} / ${batch.total_count}`,
        `Never dialled: ${notDialled}`,
        ``,
        `Nothing was re-dialled. Check the batch in the dashboard before starting it again, so nobody is called twice.`,
      ].join("\n"),
    );
  }

  return NextResponse.json({ swept });
}
