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

export interface CallScript {
  id: string;
  name: string;
  script: string;
  first_message: string | null;
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
  status: "queued" | "dialling" | "completed" | "partial" | "failed" | "interrupted";
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
}

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
        script: z.string().min(1, "The script cannot be empty").max(20000),
        firstMessage: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ input }): Promise<CallScript> => {
      const supabase = createAdminClient();
      const row = {
        name: input.name.trim(),
        script: input.script.trim(),
        first_message: input.firstMessage?.trim() ?? null,
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
});
