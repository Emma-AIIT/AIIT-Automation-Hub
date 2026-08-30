/**
 * POST /api/whatsapp/broadcast
 * Queued broadcast endpoint for the WhatsApp Broadcast page. Accepts one
 * multipart/form-data request describing the whole broadcast (accountId,
 * message?, groupIds JSON array, groupNames JSON array, optional image file),
 * writes a "queued" row to whatsapp_broadcast_log, responds immediately, then
 * fans out to the account's Make.com send webhook in the background via
 * next/server after(). The log row is updated to sending -> sent/partial/failed
 * so the dashboard can poll live progress, and a failure alert email is sent
 * when any group fails. The user can close the tab as soon as the request
 * returns: sending continues server-side.
 *
 * The fan-out runs in bounded parallel batches. Sending one group at a time made
 * the background task outlive the function's execution ceiling on any sizeable
 * broadcast, which left the row stranded on "sending" with no terminal status.
 * Each request also carries its own timeout so a Make.com scenario that never
 * responds cannot consume the whole budget on its own. Rows that still end up
 * orphaned (deploy mid-send, hard timeout) are swept to "not_sent" by
 * /api/cron/whatsapp.
 */
import type { NextRequest } from "next/server";
import { NextResponse, after } from "next/server";
import { createAdminClient } from "~/lib/supabase/admin";
import { getWebhookUrl, WHATSAPP_ACCOUNTS } from "~/lib/config/whatsapp-accounts";
import type { WhatsAppAccountId } from "~/lib/config/whatsapp-accounts";
import { sendAlertEmail } from "~/lib/server/alerts";

export const maxDuration = 300; // fan-out to many groups can take a while

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB - Make.com webhook limit

/** Groups sent concurrently. Keeps the whole broadcast well inside maxDuration
 *  without firing every image upload at Make.com simultaneously. */
const SEND_CONCURRENCY = 8;

/** Per-group ceiling. Well under maxDuration so one hung scenario fails that
 *  group instead of stranding the entire broadcast. */
const SEND_TIMEOUT_MS = 60_000;

type BroadcastFile = { buffer: ArrayBuffer; name: string; type: string };

/** Posts one group's message to Make.com. Throws on any non-2xx or timeout. */
async function sendToGroup(opts: {
  webhookUrl: string;
  chatId: string;
  message: string | null;
  file: BroadcastFile | null;
}): Promise<void> {
  const { webhookUrl, chatId, message, file } = opts;
  const signal = AbortSignal.timeout(SEND_TIMEOUT_MS);

  let res: Response;
  if (file) {
    const outForm = new FormData();
    outForm.append("chatId", chatId);
    if (message) outForm.append("message", message);
    outForm.append("file", new Blob([file.buffer], { type: file.type }), file.name);
    res = await fetch(webhookUrl, { method: "POST", body: outForm, signal });
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

function describeSendError(reason: unknown): string {
  if (reason instanceof Error) {
    if (reason.name === "TimeoutError" || reason.name === "AbortError") {
      return `Make.com did not respond within ${SEND_TIMEOUT_MS / 1000}s`;
    }
    return reason.message;
  }
  return String(reason);
}

async function runBroadcast(opts: {
  logId: string | null;
  accountId: WhatsAppAccountId;
  webhookUrl: string;
  message: string | null;
  groupIds: string[];
  groupNames: string[];
  file: BroadcastFile | null;
}) {
  const { logId, accountId, webhookUrl, message, groupIds, groupNames, file } = opts;
  const supabase = createAdminClient();

  if (logId) {
    await supabase.from("whatsapp_broadcast_log").update({ status: "sending" }).eq("id", logId);
  }

  let successCount = 0;
  let errorCount = 0;
  const makeErrors: string[] = [];

  for (let i = 0; i < groupIds.length; i += SEND_CONCURRENCY) {
    const batch = groupIds.slice(i, i + SEND_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((chatId) => sendToGroup({ webhookUrl, chatId, message, file })),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        successCount++;
      } else {
        errorCount++;
        const msg = describeSendError(result.reason);
        if (!makeErrors.includes(msg)) makeErrors.push(msg);
      }
    }

    // Publish progress between batches so the history panel counts up live.
    const isLastBatch = i + SEND_CONCURRENCY >= groupIds.length;
    if (logId && !isLastBatch) {
      await supabase
        .from("whatsapp_broadcast_log")
        .update({ sent_count: successCount, failed_count: errorCount })
        .eq("id", logId);
    }
  }

  const status = errorCount === 0 ? "sent" : successCount === 0 ? "failed" : "partial";
  const finalRow = {
    status,
    sent_count: successCount,
    failed_count: errorCount,
    make_error: makeErrors.length > 0 ? makeErrors.join("; ") : null,
    sent_at: new Date().toISOString(),
  };

  if (logId) {
    await supabase.from("whatsapp_broadcast_log").update(finalRow).eq("id", logId);
  } else {
    // Fallback for when the queued insert failed (e.g. status CHECK constraint
    // not yet migrated) - log the completed broadcast with its final status.
    await supabase.from("whatsapp_broadcast_log").insert({
      account_id: accountId,
      message,
      group_ids: groupIds,
      group_names: groupNames,
      has_file: file !== null,
      file_name: file?.name ?? null,
      ...finalRow,
    });
  }

  if (errorCount > 0) {
    const accountName = WHATSAPP_ACCOUNTS.find((a) => a.id === accountId)?.name ?? accountId;
    const failedLabel = status === "failed" ? "FAILED" : "PARTIALLY FAILED";
    await sendAlertEmail(
      `[AIIT Hub] WhatsApp broadcast ${failedLabel} (${accountName})`,
      [
        `A WhatsApp broadcast from the dashboard did not fully send.`,
        ``,
        `Account: ${accountName}`,
        `Sent: ${successCount} / ${groupIds.length} groups (${errorCount} failed)`,
        message ? `Message: ${message.slice(0, 300)}` : `Message: (image only${file ? `: ${file.name}` : ""})`,
        `Groups: ${groupNames.join(", ")}`,
        ``,
        `Error from Make.com: ${makeErrors.join("; ") || "unknown"}`,
      ].join("\n"),
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const accountIdRaw = formData.get("accountId");
    if (
      typeof accountIdRaw !== "string" ||
      !WHATSAPP_ACCOUNTS.some((a) => a.id === accountIdRaw)
    ) {
      return NextResponse.json({ error: "Valid accountId is required" }, { status: 400 });
    }
    const accountId = accountIdRaw as WhatsAppAccountId;

    const groupIdsRaw = formData.get("groupIds");
    const groupNamesRaw = formData.get("groupNames");
    let groupIds: string[] = [];
    let groupNames: string[] = [];
    try {
      groupIds = JSON.parse(typeof groupIdsRaw === "string" ? groupIdsRaw : "[]") as string[];
      groupNames = JSON.parse(typeof groupNamesRaw === "string" ? groupNamesRaw : "[]") as string[];
    } catch {
      return NextResponse.json({ error: "groupIds/groupNames must be JSON arrays" }, { status: 400 });
    }
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      return NextResponse.json({ error: "At least one group is required" }, { status: 400 });
    }

    const messageRaw = formData.get("message");
    const message = typeof messageRaw === "string" && messageRaw.trim() ? messageRaw.trim() : null;

    const fileRaw = formData.get("file");
    let file: BroadcastFile | null = null;
    if (fileRaw instanceof File) {
      if (fileRaw.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 413 });
      }
      file = { buffer: await fileRaw.arrayBuffer(), name: fileRaw.name, type: fileRaw.type };
    }

    if (!message && !file) {
      return NextResponse.json({ error: "A message or image is required" }, { status: 400 });
    }

    // Fail fast if this account's send webhook isn't configured
    let webhookUrl: string;
    try {
      webhookUrl = getWebhookUrl(accountId, "sendMessage");
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Webhook not configured" },
        { status: 400 },
      );
    }

    // Queue row so the dashboard shows the broadcast immediately. Best-effort:
    // if the insert fails (e.g. DB migration for the new statuses not run yet)
    // the broadcast still proceeds and is logged on completion instead.
    const supabase = createAdminClient();
    let logId: string | null = null;
    const { data: inserted, error: insertError } = await supabase
      .from("whatsapp_broadcast_log")
      .insert({
        account_id: accountId,
        message,
        group_ids: groupIds,
        group_names: groupNames,
        has_file: file !== null,
        file_name: file?.name ?? null,
        status: "queued",
        sent_count: 0,
        failed_count: 0,
      })
      .select("id")
      .single();
    if (insertError) {
      console.warn("[whatsapp/broadcast] queued insert failed (run status migration?):", insertError.message);
    } else {
      logId = (inserted as { id: string }).id;
    }

    after(() =>
      runBroadcast({ logId, accountId, webhookUrl, message, groupIds, groupNames, file }).catch((err) => {
        console.error("[whatsapp/broadcast] background send crashed:", err);
      }),
    );

    return NextResponse.json({ success: true, queued: true, id: logId, groups: groupIds.length });
  } catch (error) {
    console.error("[whatsapp/broadcast] error:", error);
    return NextResponse.json({ error: "Failed to queue broadcast" }, { status: 500 });
  }
}
