/**
 * GET /api/cron/whatsapp
 * Cron endpoint — called by Vercel Cron (secured with CRON_SECRET bearer token).
 * Fetches all pending scheduled_messages whose scheduled_at time has passed,
 * then fans out each message to its target group IDs via the account-specific
 * Make.com send-message webhook (resolved from the row's account_id). Updates
 * each row to "sent" or "failed" depending on whether all group sends succeeded.
 */
import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "~/lib/supabase/admin";
import { getWebhookUrl } from "~/lib/config/whatsapp-accounts";
import type { WhatsAppAccountId } from "~/lib/config/whatsapp-accounts";
import { sendAlertEmail } from "~/lib/server/alerts";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: due, error: fetchError } = await supabase
    .from("scheduled_messages")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString());

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  for (const msg of due) {
    const groupIds = msg.group_ids as string[];

    // Resolve the send webhook for this row's account — each account has its own
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

  return NextResponse.json({ processed: due.length });
}
