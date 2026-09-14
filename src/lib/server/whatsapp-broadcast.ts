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

/** Storage bucket holding broadcast attachments. Files are kept after the broadcast
 *  finishes (not just staged between the accepting request and the cron ticks
 *  that send it) so a past broadcast's message and attachments can be reused from
 *  Broadcast History - see whatsapp.getBroadcastImageUrls. */
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

/** A row left "sending" this long lost its cron invocation mid-flight. It is failed
 *  rather than retried: the dead invocation may already have reached Make.com. */
const CLAIM_STALE_MINUTES = 5;

/** Retries per group, for errors that prove nothing was sent. Timeouts are never
 *  retried - see the catch block in drainBroadcastQueue. */
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
  image_paths: string[] | null;
  file_names: string[] | null;
  group_names: string[];
  status: string;
};

export type BroadcastFile = { blob: Blob; name: string };

/**
 * Posts one group's message to Make.com. Throws on timeout or any non-2xx.
 *
 * WhatsApp has no multi-attachment message, so when there is more than one file
 * this sends one request per file, in order - the caption (if any) rides along
 * with the LAST one, so it reads as "all the images, then the text" under the
 * final image, the way a person sharing several photos with a caption expects.
 * Every request includes a `message` field even when there is nothing to caption
 * that attachment with (sent as an empty string) - the Make.com scenario has it
 * as a required parameter and rejects a request that omits it entirely with a
 * BundleValidationError, which is exactly what a plain `if (i === 0)` guard used
 * to trigger on attachment 2+.
 *
 * A failure partway through throws immediately, leaving the remaining files
 * unsent for this attempt. `onAttachmentSent` fires after each one actually goes
 * out, before the whole call is known to succeed or fail - see its doc comment
 * for why the caller needs that.
 *
 * NOTE on retries: the caller retries the whole group on a retryable error (see
 * drainBroadcastQueue), which resends every file from the top - including any
 * that already went out before the failing one. Per-file retry would need a
 * queue row per file, which is more machinery than a broadcast attachment list
 * currently warrants - this is an accepted tradeoff, not something this fixes.
 */
export async function sendToGroup(opts: {
  webhookUrl: string;
  chatId: string;
  message: string | null;
  files: BroadcastFile[];
  /** Invoked immediately after each attachment is confirmed delivered to
   *  Make.com, so the caller can record the real contact moment even if a later
   *  attachment in the same call fails. See its use in drainBroadcastQueue. */
  onAttachmentSent?: () => void | Promise<void>;
}): Promise<void> {
  const { webhookUrl, chatId, message, files, onAttachmentSent } = opts;

  if (files.length === 0) {
    const signal = AbortSignal.timeout(SEND_TIMEOUT_MS);
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Make.com webhook returned ${res.status}`);
    }
    return;
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const isLast = i === files.length - 1;
    const signal = AbortSignal.timeout(SEND_TIMEOUT_MS);
    const form = new FormData();
    form.append("chatId", chatId);
    form.append("message", isLast && message ? message : "");
    form.append("file", file.blob, file.name);
    const res = await fetch(webhookUrl, { method: "POST", body: form, signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        (text || `Make.com webhook returned ${res.status}`) +
          (files.length > 1 ? ` (attachment ${i + 1} of ${files.length})` : ""),
      );
    }
    await onAttachmentSent?.();
  }
}

/** True when the send timed out, i.e. we never learned whether it went through. */
export function isTimeout(reason: unknown): boolean {
  return (
    reason instanceof Error && (reason.name === "TimeoutError" || reason.name === "AbortError")
  );
}

export function describeSendError(reason: unknown): string {
  if (reason instanceof Error) {
    if (isTimeout(reason)) {
      return (
        `Make.com did not respond within ${SEND_TIMEOUT_MS / 1000}s, so it is unknown ` +
        `whether this group received the message. It was NOT re-sent, to avoid ` +
        `sending twice - check the group before sending again. ` +
        `If every group does this, the scenario still has its Sleep modules.`
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

/**
 * When this account last actually made contact with a WhatsApp group - the
 * anchor drainBroadcastQueue's pacing gate measures from. Null if it never has.
 *
 * Deliberately NOT filtered to status='sent'. A multi-attachment group can
 * deliver its first image to Make.com and then fail on the second, leaving the
 * row "pending" (queued for retry) or "failed" - but that first image genuinely
 * reached WhatsApp, and the ban-avoidance gate this whole queue exists for has
 * to respect that real contact regardless of the row's own terminal status.
 * sent_at is set the moment any attachment (or the sole text send) succeeds -
 * see the onAttachmentSent wiring below - so any row with a non-null sent_at
 * represents a real send, whatever status it ends up in.
 */
export async function getLastSentAt(supabase: SupabaseAdmin, accountId: string): Promise<string | null> {
  const { data } = await supabase
    .from("whatsapp_broadcast_queue")
    .select("sent_at")
    .eq("account_id", accountId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { sent_at: string } | null)?.sent_at ?? null;
}

/**
 * Predicts when each pending row will actually be released, mirroring
 * drainBroadcastQueue's real gate: at most one send per account per interval,
 * oldest due row first. `rows` must already be in that release order (send_after
 * ascending, then position - the same ordering drainBroadcastQueue queries with)
 * with any paused broadcasts' rows already excluded.
 *
 * The naive per-row send_after (set once at enqueue time) drifts from reality the
 * moment one actual send lands later than its own nominal slot - which happens on
 * every broadcast, since the cron polls once a minute and Make.com/Green API take
 * a few seconds to answer. This chains forward from the account's last real send
 * instead, so the on-screen countdown matches what will actually happen rather
 * than the original static schedule.
 */
export function predictSendTimes(rows: { send_after: string }[], lastSentAt: string | null): Date[] {
  let floor = lastSentAt ? new Date(lastSentAt).getTime() + intervalMs() : 0;
  return rows.map((row) => {
    const predicted = Math.max(new Date(row.send_after).getTime(), floor);
    floor = predicted + intervalMs();
    return new Date(predicted);
  });
}

/** Fetches every staged attachment for a broadcast, or [] when it is text-only. */
async function loadImages(
  supabase: SupabaseAdmin,
  log: BroadcastLogRow,
): Promise<BroadcastFile[]> {
  const paths = log.image_paths ?? [];
  if (paths.length === 0) return [];

  const files: BroadcastFile[] = [];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]!;
    const { data, error } = await supabase.storage.from(BROADCAST_BUCKET).download(path);
    if (error || !data) {
      throw new Error(`Broadcast attachment missing from storage: ${error?.message ?? "not found"}`);
    }
    files.push({ blob: data, name: log.file_names?.[i] ?? "image" });
  }
  return files;
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
    .select("id, account_id, message, image_paths, file_names, group_names, status")
    .eq("id", broadcastId)
    .single();

  await supabase
    .from("whatsapp_broadcast_log")
    .update({ ...base, status, sent_at: new Date().toISOString() })
    .eq("id", broadcastId);

  const logRow = log as BroadcastLogRow | null;

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

/**
 * Settles rows abandoned mid-send by a dead cron invocation.
 *
 * These are marked failed, NOT returned to the queue. The invocation may have
 * reached Make.com before it died, and nothing here can tell the difference - so
 * re-queueing would sometimes send the group twice. A group that silently goes out
 * twice is worse than one that visibly does not go out: the second is on the
 * dashboard for someone to re-send, the first is only visible to the recipient.
 */
async function settleStaleClaims(supabase: SupabaseAdmin): Promise<void> {
  const cutoff = new Date(Date.now() - CLAIM_STALE_MINUTES * 60_000).toISOString();
  const { error } = await supabase
    .from("whatsapp_broadcast_queue")
    .update({
      status: "failed",
      error:
        "The send was interrupted, so it is unknown whether this group received the " +
        "message. It was not re-sent - check the group before sending again.",
      sent_at: new Date().toISOString(),
    })
    .eq("status", "sending")
    .lt("send_after", cutoff);
  if (error) console.warn("[whatsapp-broadcast] stale claim settle failed:", error.message);
}

/**
 * What one drain actually did. The manual "Run now" button reports this back, so
 * a tick that sends nothing can say why instead of looking broken.
 */
export type DrainResult = {
  /** Groups actually sent this tick. */
  sent: number;
  /** Groups still queued across all accounts. */
  pending: number;
  /** Accounts holding the interval open, and how long is left on each. */
  waiting: { accountId: string; minutesLeft: number }[];
};

/**
 * Releases at most one group per account per call - the pacing itself.
 *
 * Called on every cron tick (once a minute). An account whose last send was less
 * than its interval ago is skipped entirely, so the effective rate is one message
 * per account per interval no matter how many broadcasts are queued against it.
 *
 * Returns how many groups actually went out this tick.
 */
export async function drainBroadcastQueue(supabase: SupabaseAdmin): Promise<DrainResult> {
  await settleStaleClaims(supabase);

  const nowIso = new Date().toISOString();

  const { data: dueRowsRaw, error: dueError } = await supabase
    .from("whatsapp_broadcast_queue")
    .select("id, broadcast_id, account_id, chat_id, group_name, position, attempts")
    .eq("status", "pending")
    .lte("send_after", nowIso)
    .order("send_after", { ascending: true })
    .order("position", { ascending: true });

  if (dueError) {
    console.error("[whatsapp-broadcast] could not read queue:", dueError.message);
    return { sent: 0, pending: 0, waiting: [] };
  }
  if (!dueRowsRaw || dueRowsRaw.length === 0) return { sent: 0, pending: 0, waiting: [] };

  // Broadcasts paused from the dashboard are skipped entirely here - not claimed,
  // no attempt consumed - so resuming later continues from exactly this point
  // instead of restarting or losing a group.
  const dueBroadcastIds = [...new Set((dueRowsRaw as BroadcastQueueRow[]).map((r) => r.broadcast_id))];
  const { data: pausedLogs } = await supabase
    .from("whatsapp_broadcast_log")
    .select("id")
    .in("id", dueBroadcastIds)
    .eq("paused", true);
  const pausedIds = new Set((pausedLogs ?? []).map((r) => (r as { id: string }).id));

  const dueRows = (dueRowsRaw as BroadcastQueueRow[]).filter((r) => !pausedIds.has(r.broadcast_id));
  if (dueRows.length === 0) return { sent: 0, pending: 0, waiting: [] };

  // One group per account per tick, oldest first. dueRows is already ordered, so the
  // first row seen for an account is the one to send.
  const nextPerAccount = new Map<string, BroadcastQueueRow>();
  for (const row of dueRows) {
    if (!nextPerAccount.has(row.account_id)) nextPerAccount.set(row.account_id, row);
  }

  let sentThisTick = 0;
  const waiting: { accountId: string; minutesLeft: number }[] = [];

  for (const [accountId, row] of nextPerAccount) {
    // Hold the line against the account's last real send. send_after alone is not
    // enough: a second broadcast queued later has its own timeline and would
    // otherwise double the rate on this number.
    const lastSentAt = await getLastSentAt(supabase, accountId);
    if (lastSentAt) {
      const elapsed = Date.now() - new Date(lastSentAt).getTime();
      if (elapsed < intervalMs()) {
        waiting.push({
          accountId,
          minutesLeft: Math.max(1, Math.ceil((intervalMs() - elapsed) / 60_000)),
        });
        continue;
      }
    }

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
      .select("id, account_id, message, image_paths, file_names, group_names, status")
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
      const files = await loadImages(supabase, log);
      await sendToGroup({
        webhookUrl,
        chatId: row.chat_id,
        message: log.message,
        files,
        // Stamp sent_at the moment each attachment actually lands, not only once
        // the whole group succeeds. If a later attachment then fails, the catch
        // block below leaves this stamp in place (it only ever writes
        // status/error/send_after) - so getLastSentAt still sees the real contact
        // that happened here, and the next group waits the full interval from it.
        onAttachmentSent: async () => {
          await supabase
            .from("whatsapp_broadcast_queue")
            .update({ sent_at: new Date().toISOString() })
            .eq("id", row.id);
        },
      });

      await supabase
        .from("whatsapp_broadcast_queue")
        .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
        .eq("id", row.id);
      sentThisTick++;
    } catch (err) {
      const message = describeSendError(err);
      const attempts = row.attempts + 1;

      // A timeout is NOT a failed send - it is an unknown one. Make.com may have
      // taken the message and be forwarding it to Green API right now. Retrying
      // that duplicates it: on 2026-09-02 a two group test produced four sends
      // this way, because the scenario still slept 15 minutes and every send
      // "timed out" at 60s while being delivered. Only errors that mean nothing
      // was processed - a refused connection, an HTTP error from Make - are
      // retried. Silence is left alone for a human to check.
      const retryable = !isTimeout(err) && attempts < MAX_ATTEMPTS;

      await supabase
        .from("whatsapp_broadcast_queue")
        .update(
          retryable
            ? {
                status: "pending",
                error: message,
                // Retry on the next interval rather than the next tick: a burst of
                // retries is exactly the traffic pattern being avoided.
                send_after: new Date(Date.now() + intervalMs()).toISOString(),
              }
            : { status: "failed", error: message, sent_at: new Date().toISOString() },
        )
        .eq("id", row.id);

      console.error(
        `[whatsapp-broadcast] group ${row.chat_id} attempt ${attempts}${retryable ? "" : " (final)"}: ${message}`,
      );
    }

    await refreshBroadcast(supabase, row.broadcast_id);
  }

  return { sent: sentThisTick, pending: dueRows.length, waiting };
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
    fileNames?: string[] | null;
    imagePaths?: string[] | null;
    queuedAt?: Date;
  },
): Promise<{ broadcastId: string; finishesAt: Date }> {
  const { accountId, message, groupIds, groupNames, fileNames, imagePaths } = opts;
  const queuedAt = opts.queuedAt ?? new Date();

  const { data: inserted, error: insertError } = await supabase
    .from("whatsapp_broadcast_log")
    .insert({
      account_id: accountId,
      message,
      group_ids: groupIds,
      group_names: groupNames,
      has_file: (imagePaths?.length ?? 0) > 0,
      file_names: fileNames ?? null,
      image_paths: imagePaths ?? null,
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

/**
 * Freezes a broadcast's remaining groups in place. drainBroadcastQueue skips its
 * pending rows entirely while paused (see there) - nothing is claimed, no attempt
 * is consumed, send_after is untouched - so resumeBroadcast picks up from exactly
 * the next group waiting rather than restarting or skipping any. Groups already
 * sent, and any mid-flight "sending" row, are unaffected.
 */
export async function pauseBroadcast(supabase: SupabaseAdmin, broadcastId: string): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_broadcast_log")
    .update({ paused: true })
    .eq("id", broadcastId);
  if (error) throw new Error(error.message);
}

/** Lets a paused broadcast's remaining groups resume normal pacing. */
export async function resumeBroadcast(supabase: SupabaseAdmin, broadcastId: string): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_broadcast_log")
    .update({ paused: false })
    .eq("id", broadcastId);
  if (error) throw new Error(error.message);
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
