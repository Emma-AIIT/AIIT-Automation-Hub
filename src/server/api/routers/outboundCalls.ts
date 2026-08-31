/**
 * outboundCalls router
 *
 * Backs the Outbound Calls module: reusable call scripts, plus the history of
 * every dialling batch fired from the page.
 *
 * Dialling itself does NOT live here. It runs in POST /api/calls/start, which
 * queues the batch and places the VAPI calls in the background so the request
 * returns immediately. These procedures only read and manage the records.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { createAdminClient } from "~/lib/supabase/admin";
import type { CallOutcome } from "~/lib/call-outcome";

export interface CallScript {
  id: string;
  name: string;
  category: string | null;
  script: string;
  first_message: string | null;
  sms_answered: string | null;
  sms_not_answered: string | null;
  assistant_id: string | null;
  phone_number_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallBatch {
  id: string;
  script_name: string;
  script_snapshot: string;
  first_message: string | null;
  assistant_id: string;
  assistant_name: string | null;
  phone_number_id: string;
  from_number: string | null;
  status: "scheduled" | "queued" | "dialling" | "completed" | "partial" | "failed" | "interrupted";
  scheduled_at: string | null;
  transfer_number: string | null;
  total_count: number;
  dialled_count: number;
  failed_count: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface CallTarget {
  id: string;
  batch_id: string;
  phone_number: string;
  vapi_call_id: string | null;
  status: "queued" | "dialled" | "failed";
  error: string | null;
  dialled_at: string | null;
  outcome: CallOutcome | null;
  ended_reason: string | null;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
  cost: number | null;
  summary: string | null;
  transcript: string | null;
  recording_url: string | null;
  transferred: boolean;
  sms_sent_at: string | null;
  sms_error: string | null;
  report_at: string | null;
}

/** Everything the campaign view reports about how a batch performed. */
export interface CampaignStats {
  total: number;
  dialled: number;
  awaitingResult: number;
  answered: number;
  noAnswer: number;
  voicemail: number;
  busy: number;
  failed: number;
  /** Of the calls that connected at all, how many a human took. */
  pickupRate: number;
  /** Of those picked up, how many ran long enough to be a real conversation. */
  engagementRate: number;
  avgDurationSeconds: number;
  longestDurationSeconds: number;
  totalTalkSeconds: number;
  transferred: number;
  smsSent: number;
  smsFailed: number;
  totalCost: number;
  costPerPickup: number;
  bestHour: number | null;
}

/** A call shorter than this was a hello and a hang-up, not a conversation. */
const ENGAGED_MIN_SECONDS = 30;

export const outboundCallsRouter = createTRPCRouter({
  listScripts: publicProcedure.query(async (): Promise<CallScript[]> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("call_scripts")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return (data ?? []) as CallScript[];
  }),

  // Insert when id is absent, update in place when it is present, so the page can
  // use one "Save script" button for both new and existing scripts.
  saveScript: publicProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(1, "Give the script a name").max(120),
        category: z.string().max(60).optional(),
        script: z.string().min(1, "The script cannot be empty").max(20000),
        firstMessage: z.string().max(1000).optional(),
        smsAnswered: z.string().max(1000).optional(),
        smsNotAnswered: z.string().max(1000).optional(),
        assistantId: z.string().max(200).optional(),
        phoneNumberId: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ input }): Promise<CallScript> => {
      const supabase = createAdminClient();
      const row = {
        name: input.name.trim(),
        category: input.category?.trim() || null,
        script: input.script.trim(),
        first_message: input.firstMessage?.trim() ?? null,
        sms_answered: input.smsAnswered?.trim() || null,
        sms_not_answered: input.smsNotAnswered?.trim() || null,
        assistant_id: input.assistantId?.trim() || null,
        phone_number_id: input.phoneNumberId?.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const query = input.id
        ? supabase.from("call_scripts").update(row).eq("id", input.id).select("*").single()
        : supabase.from("call_scripts").insert(row).select("*").single();

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data as CallScript;
    }),

  deleteScript: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      const { error } = await supabase.from("call_scripts").delete().eq("id", input.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  listBatches: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(25) }).optional())
    .query(async ({ input }): Promise<CallBatch[]> => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("outbound_call_batches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(input?.limit ?? 25);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return (data ?? []) as CallBatch[];
    }),

  listBatchCalls: publicProcedure
    .input(z.object({ batchId: z.string().uuid() }))
    .query(async ({ input }): Promise<CallTarget[]> => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("outbound_calls")
        .select("*")
        .eq("batch_id", input.batchId)
        .order("created_at", { ascending: true });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return (data ?? []) as CallTarget[];
    }),

  /**
   * How a campaign performed. Computed from the call rows rather than stored, so
   * the numbers cannot drift out of sync with the outcomes behind them.
   *
   * Pickup rate deliberately excludes calls that never connected (carrier
   * failures) and calls still awaiting a result, so it answers "of the people we
   * actually reached, how many talked to us" rather than being diluted by
   * infrastructure noise.
   */
  getBatchStats: publicProcedure
    .input(z.object({ batchId: z.string().uuid() }))
    .query(async ({ input }): Promise<CampaignStats> => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("outbound_calls")
        .select("status, outcome, duration_seconds, cost, transferred, sms_sent_at, sms_error, started_at")
        .eq("batch_id", input.batchId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const rows = (data ?? []) as Array<{
        status: string;
        outcome: CallOutcome | null;
        duration_seconds: number | null;
        cost: number | null;
        transferred: boolean;
        sms_sent_at: string | null;
        sms_error: string | null;
        started_at: string | null;
      }>;

      const count = (o: CallOutcome) => rows.filter((r) => r.outcome === o).length;

      const answered = count("answered");
      const noAnswer = count("no_answer");
      const voicemail = count("voicemail");
      const busy = count("busy");
      const failed = count("failed");

      const dialled = rows.filter((r) => r.status === "dialled").length;
      const awaitingResult = rows.filter((r) => r.status === "dialled" && r.outcome === null).length;

      // Calls that reached the handset, one way or another.
      const reached = answered + noAnswer + voicemail + busy;

      const durations = rows
        .filter((r) => r.outcome === "answered" && typeof r.duration_seconds === "number")
        .map((r) => r.duration_seconds!);
      const totalTalkSeconds = durations.reduce((a, b) => a + b, 0);
      const engaged = durations.filter((d) => d >= ENGAGED_MIN_SECONDS).length;

      const totalCost = rows.reduce((a, r) => a + (r.cost ?? 0), 0);

      // Which hour of the day produced the most pickups, to aim the next batch.
      const byHour = new Map<number, number>();
      for (const r of rows) {
        if (r.outcome !== "answered" || !r.started_at) continue;
        const h = new Date(r.started_at).getHours();
        byHour.set(h, (byHour.get(h) ?? 0) + 1);
      }
      let bestHour: number | null = null;
      let bestCount = 0;
      for (const [h, c] of byHour) {
        if (c > bestCount) { bestHour = h; bestCount = c; }
      }

      return {
        total: rows.length,
        dialled,
        awaitingResult,
        answered,
        noAnswer,
        voicemail,
        busy,
        failed,
        pickupRate: reached > 0 ? answered / reached : 0,
        engagementRate: answered > 0 ? engaged / answered : 0,
        avgDurationSeconds: durations.length > 0 ? Math.round(totalTalkSeconds / durations.length) : 0,
        longestDurationSeconds: durations.length > 0 ? Math.max(...durations) : 0,
        totalTalkSeconds,
        transferred: rows.filter((r) => r.transferred).length,
        smsSent: rows.filter((r) => r.sms_sent_at !== null).length,
        smsFailed: rows.filter((r) => r.sms_error !== null).length,
        totalCost,
        costPerPickup: answered > 0 ? totalCost / answered : 0,
        bestHour,
      };
    }),
});
