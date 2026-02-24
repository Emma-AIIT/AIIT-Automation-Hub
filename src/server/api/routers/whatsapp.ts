import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { env } from "~/env";
import { createAdminClient } from "~/lib/supabase/admin";

export interface ScheduledMessage {
  id: string;
  message: string;
  group_ids: string[];
  group_names: string[];
  scheduled_at: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  sent_at: string | null;
  error: string | null;
  created_at: string;
}

export interface WhatsAppGroup {
  id: string;
  name: string;
}

export interface BroadcastLogEntry {
  id: string;
  message: string | null;
  group_ids: string[];
  group_names: string[];
  has_file: boolean;
  file_name: string | null;
  status: "sent" | "failed" | "partial";
  make_error: string | null;
  sent_count: number;
  failed_count: number;
  sent_at: string;
  created_at: string;
}

export const whatsappRouter = createTRPCRouter({
  // Reads from Supabase DB cache — fast, no Make.com call
  getGroups: publicProcedure.query(async (): Promise<WhatsAppGroup[]> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("whatsapp_groups")
      .select("id, name")
      .order("name", { ascending: true });
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return (data ?? []) as WhatsAppGroup[];
  }),

  // Triggers Make.com webhook → Make.com pulls from Green API and upserts directly to Supabase.
  // We just fire the trigger and wait for a success/error response.
  // After this resolves, the page refetches getGroups from Supabase to get the fresh list.
  syncGroups: publicProcedure.mutation(async () => {
    const webhookUrl = env.MAKE_WHATSAPP_PULL_GROUPS_WEBHOOK_URL;
    if (!webhookUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "MAKE_WHATSAPP_PULL_GROUPS_WEBHOOK_URL is not configured" });

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "pull_groups" }),
    });

    if (!res.ok) {
      // Capture Make.com's error body (set by onerror WebhookRespond handlers in the scenario)
      let makeError = `Webhook returned ${res.status}`;
      try {
        const body = await res.text();
        if (body) makeError = body;
      } catch { /* ignore */ }
      throw new TRPCError({ code: "BAD_GATEWAY", message: makeError });
    }

    // Parse synced count from Make.com response body: { "success": true, "synced": N }
    let synced: number | null = null;
    try {
      const json = await res.json() as { synced?: number };
      if (typeof json.synced === "number") synced = json.synced;
    } catch { /* ignore — body format not guaranteed */ }

    return { success: true, synced };
  }),

  sendMessage: publicProcedure
    .input(
      z.object({
        chatId: z.string().min(1),
        message: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const webhookUrl = env.MAKE_WHATSAPP_SEND_MESSAGE_WEBHOOK_URL;
      if (!webhookUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "MAKE_WHATSAPP_SEND_MESSAGE_WEBHOOK_URL is not configured" });

      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: input.chatId, message: input.message }),
      });

      if (!res.ok) {
        let makeError = `Webhook returned ${res.status}`;
        try {
          const body = await res.text();
          if (body) makeError = body;
        } catch { /* ignore */ }
        throw new TRPCError({ code: "BAD_GATEWAY", message: makeError });
      }

      return { success: true };
    }),

  // Log a broadcast after it completes (immediate sends only; scheduled stays in scheduled_messages)
  logBroadcast: publicProcedure
    .input(
      z.object({
        message: z.string().optional(),
        groupIds: z.array(z.string()),
        groupNames: z.array(z.string()),
        hasFile: z.boolean().default(false),
        fileName: z.string().optional(),
        status: z.enum(["sent", "failed", "partial"]),
        makeError: z.string().optional(),
        sentCount: z.number().int().min(0),
        failedCount: z.number().int().min(0),
      })
    )
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      const { error } = await supabase.from("whatsapp_broadcast_log").insert({
        message: input.message ?? null,
        group_ids: input.groupIds,
        group_names: input.groupNames,
        has_file: input.hasFile,
        file_name: input.fileName ?? null,
        status: input.status,
        make_error: input.makeError ?? null,
        sent_count: input.sentCount,
        failed_count: input.failedCount,
      });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // Returns last 50 broadcasts, newest first
  listBroadcastHistory: publicProcedure.query(async (): Promise<BroadcastLogEntry[]> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("whatsapp_broadcast_log")
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(50);
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return (data ?? []) as BroadcastLogEntry[];
  }),

  scheduleMessage: publicProcedure
    .input(
      z.object({
        groupIds: z.array(z.string()).min(1),
        groupNames: z.array(z.string()),
        message: z.string().min(1),
        scheduledAt: z.string(), // ISO UTC string
      })
    )
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      const { error } = await supabase.from("scheduled_messages").insert({
        group_ids: input.groupIds,
        group_names: input.groupNames,
        message: input.message,
        scheduled_at: input.scheduledAt,
        status: "pending",
      });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  listScheduled: publicProcedure.query(async (): Promise<ScheduledMessage[]> => {
    const supabase = createAdminClient();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("scheduled_messages")
      .select("*")
      .or(`status.eq.pending,and(status.in.(sent,failed),sent_at.gte.${cutoff})`)
      .order("scheduled_at", { ascending: true });
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return (data ?? []) as ScheduledMessage[];
  }),

  cancelScheduled: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      const { error } = await supabase
        .from("scheduled_messages")
        .update({ status: "cancelled" })
        .eq("id", input.id)
        .eq("status", "pending");
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),
});
