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

export interface DashboardGroup {
  group_id: string;
  group_name: string;
  size?: number;
  /** Number of participants in whatsapp_group_participants (0 = not pulled yet) */
  participant_count: number;
}

export interface ParticipantEntry {
  participant_id: string;
  participant_phone: string;
  participant_name: string | null;
  group_chat_name: string;
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

  // Dashboard groups: list of groups selected for participants view (whatsapp_dashboard_groups)
  getDashboardGroups: publicProcedure.query(async (): Promise<DashboardGroup[]> => {
    const supabase = createAdminClient();
    const { data: dashboardRows, error: dashboardError } = await supabase
      .from("whatsapp_dashboard_groups")
      .select("group_id, group_name")
      .order("group_name", { ascending: true });
    if (dashboardError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: dashboardError.message });
    if (!dashboardRows?.length) return [];

    const groupIds = dashboardRows.map((r) => r.group_id);
    const { data: sizeRows } = await supabase
      .from("whatsapp_groups")
      .select("id, size")
      .in("id", groupIds);
    const sizeMap = new Map<string, number>();
    for (const row of sizeRows ?? []) {
      if (typeof (row as { id: string; size: number | null }).size === "number") {
        sizeMap.set((row as { id: string; size: number }).id, (row as { id: string; size: number }).size);
      }
    }

    const participantCountMap = new Map<string, number>();
    await Promise.all(
      groupIds.map(async (groupId) => {
        const { count, error } = await supabase
          .from("whatsapp_group_participants")
          .select("*", { count: "exact", head: true })
          .eq("group_chat_id", groupId);
        participantCountMap.set(groupId, error ? 0 : (count ?? 0));
      })
    );

    return dashboardRows.map((r) => ({
      group_id: r.group_id,
      group_name: r.group_name,
      size: sizeMap.get(r.group_id),
      participant_count: participantCountMap.get(r.group_id) ?? 0,
    })) as DashboardGroup[];
  }),

  getParticipantsByGroupId: publicProcedure
    .input(z.object({ groupId: z.string().min(1) }))
    .query(async ({ input }): Promise<ParticipantEntry[]> => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("whatsapp_group_participants")
        .select("participant_id, participant_phone, participant_name, group_chat_name")
        .eq("group_chat_id", input.groupId)
        .order("participant_phone", { ascending: true });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return (data ?? []) as ParticipantEntry[];
    }),

  syncParticipants: publicProcedure
    .input(z.object({ groupId: z.string().min(1), groupName: z.string() }))
    .mutation(async ({ input }) => {
    const webhookUrl = env.MAKE_WHATSAPP_PULL_PARTICIPANTS_WEBHOOK_URL;
    if (!webhookUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "MAKE_WHATSAPP_PULL_PARTICIPANTS_WEBHOOK_URL is not configured" });

    const body = JSON.stringify({
      trigger: "pull_participants",
      group_id: input.groupId,
      group_name: input.groupName,
    });

    // Fire-and-forget: trigger Make.com and respond to the client immediately so the
    // success toast always shows. Long-running syncs (e.g. 600+ participants) would
    // otherwise time out the client before Make.com responds.
    void fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => { /* fire-and-forget */ });

    return {
      success: true,
      groupId: input.groupId,
      groupName: input.groupName,
      started: true,
    };
  }),
});
