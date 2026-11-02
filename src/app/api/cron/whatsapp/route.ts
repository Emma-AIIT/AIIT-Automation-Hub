/**
 * GET /api/cron/whatsapp
 * Cron endpoint - called by Vercel Cron every minute (secured with CRON_SECRET).
 *
 * Three jobs run on every tick:
 *  1. Broadcast pacing. drainBroadcastQueue() releases at most one group per
 *     WhatsApp account, and only if that account's last send was a full interval
 *     ago. This is what puts 15 minutes between groups; see
 *     src/lib/server/whatsapp-broadcast.ts for why it cannot live in the request.
 *  2. Scheduled sends. Pending scheduled_messages whose time has passed are turned
 *     into paced broadcasts and handed to the same queue. They used to be blasted
 *     at every group at once via an uncapped Promise.allSettled - the same burst
 *     the dashboard path was fixed for. A repeating series (daily / weekly /
 *     monthly, N times) is one row that is re-armed for its next Sydney-time
 *     occurrence after each send; rows are claimed before queuing so overlapping
 *     ticks never send twice.
 *  3. Orphan sweep. Legacy rows from the old in-request fan-out could be abandoned
 *     mid-send with no terminal status, leaving "Sending..." forever. Those are
 *     marked "not_sent". Queue-backed broadcasts are deliberately excluded: they
 *     are *meant* to stay in flight for hours, and the queue finalises them.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "~/lib/supabase/admin";
import { getPlatformName, isSendConfigured, WHATSAPP_ACCOUNTS } from "~/lib/config/whatsapp-accounts";
import type { WhatsAppAccountId } from "~/lib/config/whatsapp-accounts";
import { sendAlertEmail } from "~/lib/server/alerts";
import { drainBroadcastQueue, enqueueBroadcast } from "~/lib/server/whatsapp-broadcast";
import {
  hasMoreToCome,
  nextFutureOccurrence,
  occurrenceIndex,
  totalPosts,
  type RepeatInterval,
} from "~/lib/schedule-repeat";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/** A legacy broadcast in flight longer than this was abandoned by its function.
 *  Comfortably above the old 300s maxDuration of the broadcast route. */
const STUCK_AFTER_MINUTES = 10;

const INTERRUPTED_NOTE =
  "Send was interrupted before it finished. Some groups may still have received it. The broadcast was not re-sent.";

type StuckBroadcast = {
  id: string;
  account_id: string;
  message: string | null;
  group_names: string[];
  sent_count: number;
  failed_count: number;
};

/**
 * Marks abandoned pre-pacing broadcast rows as "not_sent" so the history stops
 * claiming they are still in flight. Best-effort: a failure here must not stop the
 * queue or scheduled sends. Returns the number of rows cleared.
 *
 * Only touches rows with no queue rows behind them. A paced broadcast legitimately
 * sits in "sending" for as long as its groups take - sweeping those would kill
 * every broadcast of more than ~10 minutes, which is all of them.
 */
async function sweepOrphanedBroadcasts(supabase: SupabaseAdmin): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MINUTES * 60_000).toISOString();

  const { data: stuck, error } = await supabase
    .from("whatsapp_broadcast_log")
    .select("id, account_id, message, group_names, sent_count, failed_count")
    .in("status", ["queued", "sending"])
    .lt("sent_at", cutoff);

  if (error) {
    console.error("[cron/whatsapp] could not query stuck broadcasts:", error.message);
    return 0;
  }
  if (!stuck || stuck.length === 0) return 0;

  // Exclude anything the queue owns.
  const ids = (stuck as StuckBroadcast[]).map((r) => r.id);
  const { data: queued, error: queueError } = await supabase
    .from("whatsapp_broadcast_queue")
    .select("broadcast_id")
    .in("broadcast_id", ids);

  if (queueError) {
    // Cannot tell paced from legacy - sweeping now risks killing a live broadcast,
    // so do nothing and try again next tick.
    console.warn("[cron/whatsapp] queue lookup failed, skipping sweep:", queueError.message);
    return 0;
  }

  const paced = new Set((queued ?? []).map((r) => (r as { broadcast_id: string }).broadcast_id));
  const legacy = (stuck as StuckBroadcast[]).filter((r) => !paced.has(r.id));
  if (legacy.length === 0) return 0;

  let cleared = 0;
  for (const row of legacy) {
    const marked = await supabase
      .from("whatsapp_broadcast_log")
      .update({ status: "not_sent", make_error: INTERRUPTED_NOTE })
      .eq("id", row.id);

    if (marked.error) {
      // "not_sent" needs the 20260831 migration. Until that is applied, fall back
      // to "failed" so the row at least leaves the misleading "sending" state.
      console.warn(
        "[cron/whatsapp] not_sent update rejected (run the not_sent status migration?):",
        marked.error.message,
      );
      const fallback = await supabase
        .from("whatsapp_broadcast_log")
        .update({ status: "failed", make_error: INTERRUPTED_NOTE })
        .eq("id", row.id);
      if (fallback.error) {
        console.error(
          "[cron/whatsapp] could not clear stuck broadcast",
          row.id,
          fallback.error.message,
        );
        continue;
      }
    }

    cleared++;

    const accountName =
      WHATSAPP_ACCOUNTS.find((a) => a.id === row.account_id)?.name ?? row.account_id;
    await sendAlertEmail(
      `[AIIT Hub] ${getPlatformName(row.account_id)} broadcast DID NOT COMPLETE (${accountName})`,
      [
        `A dashboard broadcast was still in flight after ${STUCK_AFTER_MINUTES} minutes, so the send was interrupted before it finished.`,
        ``,
        `Account: ${accountName}`,
        `Confirmed sent: ${row.sent_count} / ${row.group_names.length} groups`,
        row.message ? `Message: ${row.message.slice(0, 300)}` : `Message: (image only)`,
        `Groups: ${row.group_names.join(", ")}`,
        ``,
        `It has been marked "Not sent" in Broadcast History. Nothing was re-sent: check the groups before sending again, as some may already have received it.`,
      ].join("\n"),
    );
  }

  return cleared;
}

/**
 * Turns every due scheduled_message into a paced broadcast. The row is marked
 * "sent" once its groups are queued, not once they are delivered - delivery now
 * spans hours and is tracked on the broadcast itself, which the row points at.
 *
 * Repeating series (repeat_interval != 'none') keep one row: each send moves
 * scheduled_at on to the next future occurrence (missed slots are skipped, see
 * nextFutureOccurrence) and bumps repeat_sent; the last send marks it "sent".
 * Each time slot (repeat_times) is its own broadcast, so per-account pacing still
 * applies; a forever series (repeat_forever) is never marked "sent".
 *
 * Every row is *claimed* before it is queued, with an update conditional on the
 * status and scheduled_at this tick read. If two ticks overlap only one wins the
 * claim, so a post is never queued twice. A failed queue marks the row "failed",
 * which also stops the rest of a series.
 */
async function releaseScheduledMessages(supabase: SupabaseAdmin): Promise<number> {
  const { data: due, error } = await supabase
    .from("scheduled_messages")
    .select("*")
    .eq("status", "pending")
    // Switched off from the Scheduled Messages panel: skipped until switched back
    // on, when setScheduledEnabled moves a passed slot forward.
    .eq("enabled", true)
    .lte("scheduled_at", new Date().toISOString());

  if (error) {
    console.error("[cron/whatsapp] could not read scheduled messages:", error.message);
    return 0;
  }
  if (!due || due.length === 0) return 0;

  let released = 0;

  for (const msg of due) {
    const accountId = msg.account_id as WhatsAppAccountId;
    const groupIds = msg.group_ids as string[];
    const groupNames = (msg.group_names as string[]) ?? [];

    const fail = async (reason: string) => {
      await supabase
        .from("scheduled_messages")
        .update({ status: "failed", sent_at: new Date().toISOString(), error: reason })
        .eq("id", msg.id);
      await sendAlertEmail(
        `[AIIT Hub] Scheduled ${getPlatformName(accountId)} message FAILED (${accountId})`,
        `A scheduled message could not be queued: ${reason}\n\nMessage: ${(msg.message as string).slice(0, 300)}`,
      );
    };

    // Resolve the send webhook up front - each account has its own Make.com
    // scenario / Green API instance, and a missing one should fail loudly here
    // rather than on every group for the next several hours. Telegram direct
    // mode has no URL and passes on its env vars instead (isSendConfigured).
    if (!isSendConfigured(accountId)) {
      await fail(`No send webhook is configured for account ${accountId}.`);
      continue;
    }

    // Rows written before the repeat migration have no repeat_* values.
    const interval = ((msg.repeat_interval as RepeatInterval | null) ?? "none");
    const sent = ((msg.repeat_sent as number | null) ?? 0) + 1;
    const anchor = (msg.repeat_anchor_at as string | null) ?? (msg.scheduled_at as string);
    // Several times per period (repeat_times) and "∞ Forever" (repeat_forever):
    // a finite series makes repeat_total x times posts; forever never finishes.
    const times = (msg.repeat_times as string[] | null) ?? null;
    const moreToCome = hasMoreToCome(
      {
        repeat_interval: interval,
        repeat_total: msg.repeat_total as number | null,
        repeat_forever: msg.repeat_forever as boolean | null,
        repeat_times: times,
      },
      sent,
    );
    // An edited series is re-anchored at its new first send; sends made before the
    // edit (repeat_base_sent) don't count towards the occurrence index.
    const nextIndex = occurrenceIndex(sent, msg.repeat_base_sent as number | null);

    // Claim: either re-arm the series for its next slot or mark it done. Both are
    // conditional on what this tick read, so an overlapping tick claims nothing.
    const claimUpdate = moreToCome
      ? {
          scheduled_at: nextFutureOccurrence(anchor, interval, nextIndex, new Date(), times).at.toISOString(),
          repeat_sent: sent,
          error: null,
        }
      : { status: "sent", sent_at: new Date().toISOString(), repeat_sent: sent, error: null };

    const claim = await supabase
      .from("scheduled_messages")
      .update(claimUpdate)
      .eq("id", msg.id)
      .eq("status", "pending")
      .eq("enabled", true)
      .eq("scheduled_at", msg.scheduled_at as string)
      .select("id");

    if (claim.error) {
      console.error("[cron/whatsapp] could not claim scheduled message", msg.id, claim.error.message);
      continue;
    }
    if (!claim.data || claim.data.length === 0) {
      console.log(`[cron/whatsapp] scheduled message ${msg.id} already claimed by another tick`);
      continue;
    }

    try {
      const { broadcastId } = await enqueueBroadcast(supabase, {
        accountId,
        message: (msg.message as string) ?? null,
        groupIds,
        groupNames,
        // Links the broadcast back to its schedule for Broadcast History.
        scheduledMessageId: msg.id as string,
      });

      released++;
      console.log(
        `[cron/whatsapp] scheduled message ${msg.id} queued as broadcast ${broadcastId} (${groupIds.length} groups)` +
          (interval !== "none"
            ? msg.repeat_forever
              ? `, send ${sent} (forever)`
              : `, send ${sent} of ${totalPosts((msg.repeat_total as number | null) ?? 1, times)}`
            : ""),
      );
    } catch (err) {
      await fail(err instanceof Error ? err.message : "Could not queue the broadcast");
    }
  }

  return released;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Order matters: release due schedules into the queue before draining it, so a
  // schedule that just came due can send its first group on this same tick.
  const sweptBroadcasts = await sweepOrphanedBroadcasts(supabase);
  const scheduledReleased = await releaseScheduledMessages(supabase);
  const drain = await drainBroadcastQueue(supabase);

  return NextResponse.json({
    groupsSent: drain.sent,
    stillQueued: drain.pending,
    waiting: drain.waiting,
    scheduledReleased,
    sweptBroadcasts,
  });
}
