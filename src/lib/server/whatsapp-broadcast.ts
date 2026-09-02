/**
 * Paced WhatsApp broadcast queue.
 *
 * One broadcast = one whatsapp_broadcast_log row + one whatsapp_broadcast_queue
 * row per group. /api/whatsapp/broadcast only enqueues; /api/cron/whatsapp calls
 * drainBroadcastQueue() every minute to release groups one at a time.
 *
 * Why a queue at all: sending straight from the request meant a broadcast could
 * only last as long as one function invocation, so the fan-out had to be parallel
 * (SEND_CONCURRENCY = 8) and every group landed at once. A 15 minute gap between
 * groups is the whole point of the feature - it is what keeps the number off
 * WhatsApp's ban radar - and it cannot exist inside a single 300s function.
 *
 * The gap is enforced twice over:
 *   - send_after on each row (position * interval from when it was queued), and
 *   - a check against the account's last actual send, so two broadcasts queued on
 *     the same number interleave instead of both firing on the same tick.
 *
 * IMPORTANT: the Make.com scenario must NOT sleep. Pacing lives here now; a sleep
 * in the scenario adds itself on top of every single group and holds the webhook
 * connection open past SEND_TIMEOUT_MS, which reports delivered sends as failures.
 */
import type { createAdminClient } from "~/lib/supabase/admin";
import { getWebhookUrl, WHATSAPP_ACCOUNTS } from "~/lib/config/whatsapp-accounts";
import type { WhatsAppAccountId } from "~/lib/config/whatsapp-accounts";
import { sendAlertEmail } from "~/lib/server/alerts";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/** Storage bucket holding broadcast images between the request that accepted the
 *  broadcast and the cron ticks that send it, hours later. */
export const BROADCAST_BUCKET = "whatsapp-broadcasts";

/** Minutes between groups. The ban-avoidance interval - override per environment
 *  rather than editing this, and keep it in one place: if Make.com also sleeps,
 *  the two delays stack. */
export const BROADCAST_INTERVAL_MINUTES = (() => {
  const raw = Number(process.env.WHATSAPP_BROADCAST_INTERVAL_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 15;
})();

/** How long to wait for Make.com to acknowledge one group. Generous for a scenario
 *  that only forwards to Green API; anything slower means the scenario is still
 *  sleeping and needs its Sleep modules removed. */
const SEND_TIMEOUT_MS = 60_000;

/** A row left "sending" this long lost its cron invocation mid-flight. Returned to
 *  the queue rather than failed, because the tick that owned it may never have
 *  reached Make.com at all. */
const CLAIM_STALE_MINUTES = 5;

/** Retries per group before it is given up on. */
const MAX_ATTEMPTS = 3;

export type BroadcastQueueRow = {
  id: string;
  broadcast_id: string;
  account_id: string;
  chat_id: string;
  group_name: string | null;
  position: number;
  attempts: number;
};

type BroadcastLogRow = {
  id: string;
  account_id: string;
  message: string | null;
  image_path: string | null;
  file_name: string | null;
  group_names: string[];
  status: string;
};

export type BroadcastFile = { blob: Blob; name: string };

/** Posts one group's message to Make.com. Throws on timeout or any non-2xx. */
export async function sendToGroup(opts: {
  webhookUrl: string;
  chatId: string;
  message: string | null;
  file: BroadcastFile | null;
}): Promise<void> {
  const { webhookUrl, chatId, message, file } = opts;
  const signal = AbortSignal.timeout(SEND_TIMEOUT_MS);

  let res: Response;
  if (file) {
    const form = new FormData();
    form.append("chatId", chatId);
    if (message) form.append("message", message);
    form.append("file", file.blob, file.name);
    res = await fetch(webhookUrl, { method: "POST", body: form, signal });
  } else {
    res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
      signal,
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Make.com webhook returned ${res.status}`);
  }
}

export function describeSendError(reason: unknown): string {
  if (reason instanceof Error) {
    if (reason.name === "TimeoutError" || reason.name === "AbortError") {
      return (
        `Make.com did not respond within ${SEND_TIMEOUT_MS / 1000}s. ` +
        `The message may still have been delivered - if this happens on every group, ` +
        `the scenario still has its Sleep modules and they need to be removed.`
      );
    }
    return reason.message;
  }
  return String(reason);
}

/** Milliseconds between groups. */
export function intervalMs(minutes?: number | null): number {
  return (minutes ?? BROADCAST_INTERVAL_MINUTES) * 60_000;
}

/** Fetches the staged image for a broadcast, or null when it is text-only. */
async function loadImage(
  supabase: SupabaseAdmin,
  log: BroadcastLogRow,
): Promise<BroadcastFile | null> {
  if (!log.image_path) return null;
  const { data, error } = await supabase.storage.from(BROADCAST_BUCKET).download(log.image_path);
  if (error || !data) {
    throw new Error(`Broadcast image missing from storage: ${error?.message ?? "not found"}`);
  }
  return { blob: data, name: log.file_name ?? "image" };
}

/** Removes a finished broadcast's staged image. Best-effort: an orphaned object is
 *  cosmetic, a thrown error here would strand the broadcast. */
async function discardImage(supabase: SupabaseAdmin, imagePath: string | null): Promise<void> {
  if (!imagePath) return;
  const { error } = await supabase.storage.from(BROADCAST_BUCKET).remove([imagePath]);
  if (error) console.warn("[whatsapp-broadcast] could not delete staged image:", error.message);
}

/**
 * Recomputes a broadcast's counts from its queue rows and, once nothing is left in
 * flight, writes the terminal status and clears the staged image. Counting the rows
 * rather than incrementing a tally keeps the log correct even if a tick dies
 * half-way through, or two ticks overlap.
 */
async function refreshBroadcast(supabase: SupabaseAdmin, broadcastId: string): Promise<void> {
  const { data: rows, error } = await supabase
    .from("whatsapp_broadcast_queue")
    .select("status, error")
    .eq("broadcast_id", broadcastId);

  if (error || !rows) {
    console.error("[whatsapp-broadcast] could not count queue rows:", error?.message);
    return;
  }

  const counts = { pending: 0, sending: 0, sent: 0, failed: 0, cancelled: 0 };
  const errors: string[] = [];
  for (const row of rows as { status: keyof typeof counts; error: string | null }[]) {
    if (row.status in counts) counts[row.status]++;
    if (row.status === "failed" && row.error && !errors.includes(row.error)) errors.push(row.error);
  }

  const inFlight = counts.pending + counts.sending;
  const base = {
    sent_count: counts.sent,
    failed_count: counts.failed,
    make_error: errors.length > 0 ? errors.join("; ") : null,
  };

  if (inFlight > 0) {
    await supabase
      .from("whatsapp_broadcast_log")
      .update({ ...base, status: "sending" })
      .eq("id", broadcastId);
    return;
  }

  // Nothing left to send - settle the broadcast.
  const status =
    counts.sent === 0 && counts.cancelled > 0
      ? "cancelled"
      : counts.failed === 0
        ? "sent"
        : counts.sent === 0
          ? "failed"
          : "partial";

  const { data: log } = await supabase
    .from("whatsapp_broadcast_log")
    .select("id, account_id, message, image_path, file_name, group_names, status")
    .eq("id", broadcastId)
    .single();

  await supabase
    .from("whatsapp_broadcast_log")
    .update({ ...base, status, sent_at: new Date().toISOString() })
    .eq("id", broadcastId);

  const logRow = log as BroadcastLogRow | null;
  await discardImage(supabase, logRow?.image_path ?? null);

  if (counts.failed > 0 && logRow) {
    const accountName =
      WHATSAPP_ACCOUNTS.find((a) => a.id === logRow.account_id)?.name ?? logRow.account_id;
    await sendAlertEmail(
      `[AIIT Hub] WhatsApp broadcast ${status === "failed" ? "FAILED" : "PARTIALLY FAILED"} (${accountName})`,
      [
        `A paced WhatsApp broadcast finished with failures.`,
        ``,
        `Account: ${accountName}`,
        `Sent: ${counts.sent} / ${rows.length} groups (${counts.failed} failed${counts.cancelled ? `, ${counts.cancelled} cancelled` : ""})`,
        logRow.message ? `Message: ${logRow.message.slice(0, 300)}` : `Message: (image only)`,
        ``,
        `Errors: ${errors.join("; ") || "unknown"}`,
      ].join("\n"),
    );
  }
}

/** Returns rows stuck in "sending" to the queue so a lost tick does not drop a group. */
async function releaseStaleClaims(supabase: SupabaseAdmin): Promise<void> {
  const cutoff = new Date(Date.now() - CLAIM_STALE_MINUTES * 60_000).toISOString();
  const { error } = await supabase
    .from("whatsapp_broadcast_queue")
    .update({ status: "pending" })
    .eq("status", "sending")
    .lt("send_after", cutoff);
  if (error) console.warn("[whatsapp-broadcast] stale claim release failed:", error.message);
}

/**
 * Releases at most one group per account per call - the pacing itself.
 *
 * Called on every cron tick (once a minute). An account whose last send was less
 * than its interval ago is skipped entirely, so the effective rate is one message
 * per account per interval no matter how many broadcasts are queued against it.
 *
 * Returns how many groups actually went out this tick.
 */
export async function drainBroadcastQueue(supabase: SupabaseAdmin): Promise<number> {
  await releaseStaleClaims(supabase);

  const nowIso = new Date().toISOString();

  const { data: dueRows, error: dueError } = await supabase
    .from("whatsapp_broadcast_queue")
    .select("id, broadcast_id, account_id, chat_id, group_name, position, attempts")
    .eq("status", "pending")
    .lte("send_after", nowIso)
    .order("send_after", { ascending: true })
    .order("position", { ascending: true });

  if (dueError) {
    console.error("[whatsapp-broadcast] could not read queue:", dueError.message);
    return 0;
  }
  if (!dueRows || dueRows.length === 0) return 0;

  // One group per account per tick, oldest first. dueRows is already ordered, so the
  // first row seen for an account is the one to send.
  const nextPerAccount = new Map<string, BroadcastQueueRow>();
  for (const row of dueRows as BroadcastQueueRow[]) {
    if (!nextPerAccount.has(row.account_id)) nextPerAccount.set(row.account_id, row);
  }

  let sentThisTick = 0;

  for (const [accountId, row] of nextPerAccount) {
    // Hold the line against the account's last real send. send_after alone is not
    // enough: a second broadcast queued later has its own timeline and would
    // otherwise double the rate on this number.
    const { data: lastSent } = await supabase
      .from("whatsapp_broadcast_queue")
      .select("sent_at")
      .eq("account_id", accountId)
      .eq("status", "sent")
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastSentAt = (lastSent as { sent_at: string } | null)?.sent_at;
    if (lastSentAt && Date.now() - new Date(lastSentAt).getTime() < intervalMs()) continue;

    // Claim it. The status guard makes this atomic against an overlapping tick.
    const { data: claimed } = await supabase
      .from("whatsapp_broadcast_queue")
      .update({ status: "sending", attempts: row.attempts + 1 })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const { data: logData, error: logError } = await supabase
      .from("whatsapp_broadcast_log")
      .select("id, account_id, message, image_path, file_name, group_names, status")
      .eq("id", row.broadcast_id)
      .single();

    if (logError || !logData) {
      await supabase
        .from("whatsapp_broadcast_queue")
        .update({
          status: "failed",
          error: "Broadcast record missing",
          sent_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      continue;
    }
    const log = logData as BroadcastLogRow;

    // A broadcast cancelled while this row sat in the queue must not go out.
    if (log.status === "cancelled") {
      await supabase
        .from("whatsapp_broadcast_queue")
        .update({ status: "cancelled" })
        .eq("id", row.id);
      continue;
    }

    try {
      const webhookUrl = getWebhookUrl(accountId as WhatsAppAccountId, "sendMessage");
      const file = await loadImage(supabase, log);
      await sendToGroup({ webhookUrl, chatId: row.chat_id, message: log.message, file });

      await supabase
        .from("whatsapp_broadcast_queue")
        .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
        .eq("id", row.id);
      sentThisTick++;
    } catch (err) {
      const message = describeSendError(err);
      const attempts = row.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;

      await supabase
        .from("whatsapp_broadcast_queue")
        .update(
          giveUp
            ? { status: "failed", error: message, sent_at: new Date().toISOString() }
            : {
                status: "pending",
                error: message,
                // Retry on the next interval rather than the next tick: a burst of
                // retries is exactly the traffic pattern being avoided.
                send_after: new Date(Date.now() + intervalMs()).toISOString(),
              },
        )
        .eq("id", row.id);

      console.error(
        `[whatsapp-broadcast] group ${row.chat_id} attempt ${attempts}${giveUp ? " (final)" : ""}: ${message}`,
      );
    }

    await refreshBroadcast(supabase, row.broadcast_id);
  }

  return sentThisTick;
}

/**
 * Creates a broadcast and its per-group queue rows. Shared by the dashboard route
 * and by the scheduler, so a scheduled send is paced exactly like a manual one -
 * it was previously fanned out with an uncapped Promise.allSettled over every
 * group, which is the same burst this queue exists to prevent.
 *
 * Rolls back the log row if the queue rows cannot be written, so a broadcast is
 * never left recorded but unsendable. The caller owns any staged image.
 */
export async function enqueueBroadcast(
  supabase: SupabaseAdmin,
  opts: {
    accountId: WhatsAppAccountId;
    message: string | null;
    groupIds: string[];
    groupNames: string[];
    fileName?: string | null;
    imagePath?: string | null;
    queuedAt?: Date;
  },
): Promise<{ broadcastId: string; finishesAt: Date }> {
  const { accountId, message, groupIds, groupNames, fileName, imagePath } = opts;
  const queuedAt = opts.queuedAt ?? new Date();

  const { data: inserted, error: insertError } = await supabase
    .from("whatsapp_broadcast_log")
    .insert({
      account_id: accountId,
      message,
      group_ids: groupIds,
      group_names: groupNames,
      has_file: !!imagePath,
      file_name: fileName ?? null,
      image_path: imagePath ?? null,
      interval_minutes: BROADCAST_INTERVAL_MINUTES,
      status: "queued",
      sent_count: 0,
      failed_count: 0,
      queued_at: queuedAt.toISOString(),
      // Ordered on in the history list; overwritten with the real finish time when
      // the last group goes out.
      sent_at: queuedAt.toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Could not create the broadcast record");
  }

  const broadcastId = (inserted as { id: string }).id;

  // One row per group. The first goes immediately; each subsequent one is stamped a
  // further interval out. The cron re-checks the account's last real send too, so
  // these timestamps are a floor rather than a promise.
  const { error: queueError } = await supabase.from("whatsapp_broadcast_queue").insert(
    groupIds.map((chatId, i) => ({
      broadcast_id: broadcastId,
      account_id: accountId,
      chat_id: chatId,
      group_name: groupNames[i] ?? null,
      position: i,
      send_after: new Date(queuedAt.getTime() + i * intervalMs()).toISOString(),
      status: "pending",
    })),
  );

  if (queueError) {
    await supabase.from("whatsapp_broadcast_log").delete().eq("id", broadcastId);
    throw new Error(queueError.message);
  }

  return {
    broadcastId,
    finishesAt: new Date(queuedAt.getTime() + (groupIds.length - 1) * intervalMs()),
  };
}

/** Stops the groups that have not gone out yet. Already-sent groups stay sent. */
export async function cancelBroadcast(
  supabase: SupabaseAdmin,
  broadcastId: string,
): Promise<{ cancelled: number }> {
  // Flag the parent first so a tick running right now skips its claimed row.
  await supabase
    .from("whatsapp_broadcast_log")
    .update({ status: "cancelled" })
    .eq("id", broadcastId);

  const { data, error } = await supabase
    .from("whatsapp_broadcast_queue")
    .update({ status: "cancelled" })
    .eq("broadcast_id", broadcastId)
    .in("status", ["pending", "sending"])
    .select("id");

  if (error) throw new Error(error.message);

  await refreshBroadcast(supabase, broadcastId);
  return { cancelled: data?.length ?? 0 };
}
