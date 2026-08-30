/**
 * GET /api/cron/whatsapp
 * Cron endpoint - called by Vercel Cron (secured with CRON_SECRET bearer token).
 *
 * Two jobs run on every tick:
 *  1. Scheduled sends. Fetches all pending scheduled_messages whose scheduled_at
 *     time has passed, then fans out each message to its target group IDs via the
 *     account-specific Make.com send-message webhook (resolved from the row's
 *     account_id). Updates each row to "sent" or "failed".
 *  2. Orphan sweep. A dashboard broadcast is fanned out in the background by
 *     /api/whatsapp/broadcast. If that function is cut short (execution ceiling,
 *     a deploy mid-send) nothing else ever writes the row a terminal status, so it
 *     showed "Sending..." forever. Any row still queued/sending past the cutoff is
 *     marked "not_sent" and alerted on. The sweep only relabels: it never re-sends,
 *     because some groups may already have received the message.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "~/lib/supabase/admin";
import { getWebhookUrl, WHATSAPP_ACCOUNTS } from "~/lib/config/whatsapp-accounts";
import type { WhatsAppAccountId } from "~/lib/config/whatsapp-accounts";
import { sendAlertEmail } from "~/lib/server/alerts";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

/** A broadcast in flight longer than this was abandoned by its function.
 *  Comfortably above the 300s maxDuration of the broadcast route. */
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
 * Marks abandoned broadcast rows as "not_sent" so the history stops claiming they
 * are still in flight. Best-effort: a failure here must not stop scheduled sends.
 * Returns the number of rows cleared.
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

  let cleared = 0;
  for (const row of stuck as StuckBroadcast[]) {
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
        console.error("[cron/whatsapp] could not clear stuck broadcast", row.id, fallback.error.message);
        continue;
      }
    }

    cleared++;

    const accountName =
      WHATSAPP_ACCOUNTS.find((a) => a.id === row.account_id)?.name ?? row.account_id;
    await sendAlertEmail(
      `[AIIT Hub] WhatsApp broadcast DID NOT COMPLETE (${accountName})`,
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

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Runs before the early returns below so it never gets skipped on a quiet tick.
  const sweptBroadcasts = await sweepOrphanedBroadcasts(supabase);

  const { data: due, error: fetchError } = await supabase
    .from("scheduled_messages")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString());

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message, sweptBroadcasts }, { status: 500 });
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ processed: 0, sweptBroadcasts });
  }

  for (const msg of due) {
    const groupIds = msg.group_ids as string[];

    // Resolve the send webhook for this row's account - each account has its own
    // Make.com scenario / Green API instance
    let webhookUrl: string;
    try {
      webhookUrl = getWebhookUrl(msg.account_id as WhatsAppAccountId, "sendMessage");
    } catch {
      await supabase
        .from("scheduled_messages")
        .update({
          status: "failed",
          sent_at: new Date().toISOString(),
          error: `Send webhook not configured for account ${msg.account_id}`,
        })
        .eq("id", msg.id);
      await sendAlertEmail(
        `[AIIT Hub] Scheduled WhatsApp message FAILED (${msg.account_id})`,
        `A scheduled message could not be sent: no send webhook is configured for account ${msg.account_id}.\n\nMessage: ${(msg.message as string).slice(0, 300)}`,
      );
      continue;
    }

    const results = await Promise.allSettled(
      groupIds.map((chatId: string) =>
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message: msg.message }),
        })
      )
    );

    const allOk = results.every((r) => r.status === "fulfilled");

    await supabase
      .from("scheduled_messages")
      .update({
        status: allOk ? "sent" : "failed",
        sent_at: new Date().toISOString(),
        error: allOk ? null : "One or more groups failed to receive the message",
      })
      .eq("id", msg.id);

    if (!allOk) {
      const failedCount = results.filter((r) => r.status === "rejected").length;
      await sendAlertEmail(
        `[AIIT Hub] Scheduled WhatsApp message FAILED (${msg.account_id})`,
        `A scheduled message failed for ${failedCount} of ${groupIds.length} groups.\n\nAccount: ${msg.account_id}\nMessage: ${(msg.message as string).slice(0, 300)}\nGroups: ${(msg.group_names as string[]).join(", ")}`,
      );
    }
  }

  return NextResponse.json({ processed: due.length, sweptBroadcasts });
}
