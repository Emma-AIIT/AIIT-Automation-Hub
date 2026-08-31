/**
 * GET /api/cron/dial-queue
 * Cron endpoint, called by Vercel Cron (secured with CRON_SECRET bearer token).
 *
 * Drains queued campaign numbers a slice at a time. Every minute it asks VAPI
 * how many calls are live across the account and rings only enough numbers to
 * reach the concurrency ceiling, so a 200-number list trickles out steadily
 * instead of trying to ring everyone at once and hitting VAPI's cap.
 *
 * Doing this on a cron rather than inside one long-running request is the point:
 * 200 calls at 8 at a time takes far longer than any serverless function is
 * allowed to live, so the work has to survive across invocations.
 */
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env";
import { dialPending, MAX_CONCURRENT_CALLS } from "~/lib/server/dialer";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = env.VAPI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "VAPI_API_KEY is not configured" }, { status: 400 });
  }

  const { dialled, live } = await dialPending(apiKey);
  return NextResponse.json({ dialled, liveBefore: live, ceiling: MAX_CONCURRENT_CALLS });
}
