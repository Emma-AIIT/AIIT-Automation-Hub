/**
 * POST /api/whatsapp/broadcast
 *
 * Accepts one multipart/form-data request describing a whole broadcast (accountId,
 * message?, groupIds JSON array, groupNames JSON array, optional image file) and
 * *enqueues* it. Nothing is sent here.
 *
 * This route used to fan out to Make.com itself, in parallel batches of 8. That
 * made every group land within a minute of every other, because the 15 minute gap
 * the feature depends on was never in this code - it was a side effect of the old
 * client loop awaiting a Make.com scenario that slept before replying. A serverless
 * function cannot hold a multi-hour paced send open, so pacing moved to a queue:
 * one whatsapp_broadcast_queue row per group, released one at a time by
 * /api/cron/whatsapp. See src/lib/server/whatsapp-broadcast.ts.
 *
 * The image goes to Supabase Storage rather than staying in memory: the last group
 * of a 20 group broadcast is sent five hours later by a different invocation, and
 * nothing survives in RAM that long.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "~/lib/supabase/admin";
import { getWebhookUrl, WHATSAPP_ACCOUNTS } from "~/lib/config/whatsapp-accounts";
import type { WhatsAppAccountId } from "~/lib/config/whatsapp-accounts";
import {
  BROADCAST_BUCKET,
  BROADCAST_INTERVAL_MINUTES,
  enqueueBroadcast,
} from "~/lib/server/whatsapp-broadcast";

/** Only the upload happens in this request now, so the old 300s ceiling is moot. */
export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB - Make.com webhook limit

/** Guard against a mis-click queueing a send that would run for weeks. At the
 *  default interval this is a little over two days of sending. */
const MAX_GROUPS_PER_BROADCAST = 200;

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
      return NextResponse.json(
        { error: "groupIds/groupNames must be JSON arrays" },
        { status: 400 },
      );
    }
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      return NextResponse.json({ error: "At least one group is required" }, { status: 400 });
    }
    if (groupIds.length > MAX_GROUPS_PER_BROADCAST) {
      const hours = Math.round((groupIds.length * BROADCAST_INTERVAL_MINUTES) / 60);
      return NextResponse.json(
        {
          error:
            `${groupIds.length} groups at ${BROADCAST_INTERVAL_MINUTES} minutes apart would take about ${hours} hours. ` +
            `Select ${MAX_GROUPS_PER_BROADCAST} groups or fewer and send the rest as a second broadcast.`,
        },
        { status: 400 },
      );
    }

    const messageRaw = formData.get("message");
    const message =
      typeof messageRaw === "string" && messageRaw.trim() ? messageRaw.trim() : null;

    const fileRaw = formData.get("file");
    let file: File | null = null;
    if (fileRaw instanceof File) {
      if (fileRaw.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 413 });
      }
      file = fileRaw;
    }

    if (!message && !file) {
      return NextResponse.json({ error: "A message or image is required" }, { status: 400 });
    }

    // Fail fast if this account's send webhook isn't configured - better here than
    // on a cron tick hours from now.
    try {
      getWebhookUrl(accountId, "sendMessage");
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Webhook not configured" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    // Stage the image before the log row exists, so a storage failure cannot leave
    // a broadcast queued with an image it can never read.
    let imagePath: string | null = null;
    if (file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      imagePath = `${accountId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(BROADCAST_BUCKET)
        .upload(imagePath, file, { contentType: file.type || "application/octet-stream" });
      if (uploadError) {
        console.error("[whatsapp/broadcast] image upload failed:", uploadError.message);
        return NextResponse.json(
          {
            error:
              `Could not stage the image: ${uploadError.message}. ` +
              `If this says the bucket is missing, run the broadcast pacing migration.`,
          },
          { status: 500 },
        );
      }
    }

    let broadcastId: string;
    let finishesAt: Date;
    try {
      ({ broadcastId, finishesAt } = await enqueueBroadcast(supabase, {
        accountId,
        message,
        groupIds,
        groupNames,
        fileName: file?.name ?? null,
        imagePath,
      }));
    } catch (err) {
      if (imagePath) await supabase.storage.from(BROADCAST_BUCKET).remove([imagePath]);
      const detail = err instanceof Error ? err.message : "unknown error";
      console.error("[whatsapp/broadcast] enqueue failed:", detail);
      return NextResponse.json(
        {
          error:
            `Could not queue the broadcast: ${detail}. ` +
            `If this mentions a missing column, constraint, or whatsapp_broadcast_queue, ` +
            `run the broadcast pacing migration.`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      queued: true,
      id: broadcastId,
      groups: groupIds.length,
      intervalMinutes: BROADCAST_INTERVAL_MINUTES,
      estimatedMinutes: (groupIds.length - 1) * BROADCAST_INTERVAL_MINUTES,
      finishesAt: finishesAt.toISOString(),
    });
  } catch (error) {
    console.error("[whatsapp/broadcast] error:", error);
    return NextResponse.json({ error: "Failed to queue broadcast" }, { status: 500 });
  }
}
