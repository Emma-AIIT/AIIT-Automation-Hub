/**
 * whatsapp router
 *
 * Manages WhatsApp groups, broadcasts, participant lists, and scheduled messages
 * across multiple accounts (currently: AIIT Automation; Susu Closets and GIM Foundation
 * are configured but tabs are hidden until fully set up).
 *
 * Architecture:
 *   - Group and participant data is cached in Supabase (whatsapp_groups, whatsapp_group_participants).
 *   - Reads come from Supabase cache (fast, no Make.com call).
 *   - Syncs (groups, participants) trigger Make.com → Green API → Supabase upsert.
 *   - Broadcasts are sent via Make.com → Green API → WhatsApp.
 *
 * All procedures accept `accountId` to scope operations to a specific WhatsApp account.
 * getWebhookUrl() resolves the correct Make.com webhook URL for each account + action.
 *
 * syncParticipants is fire-and-forget — large groups (600+ participants) would time out
 * the client if we waited for Make.com to respond.
 */
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { createAdminClient } from "~/lib/supabase/admin";
import { WHATSAPP_ACCOUNTS, getWebhookUrl } from "~/lib/config/whatsapp-accounts";
import type { WhatsAppAccountId } from "~/lib/config/whatsapp-accounts";

const accountIdSchema = z.enum(
  WHATSAPP_ACCOUNTS.map((a) => a.id) as [WhatsAppAccountId, ...WhatsAppAccountId[]]
);

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
  getGroups: publicProcedure
    .input(z.object({ accountId: accountIdSchema }))
    .query(async ({ input }): Promise<WhatsAppGroup[]> => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("whatsapp_groups")
        .select("id, name")
        .eq("account_id", input.accountId)
        .order("name", { ascending: true });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return (data ?? []) as WhatsAppGroup[];
    }),

  // Triggers Make.com webhook → Make.com pulls from Green API and upserts directly to Supabase.
  // We just fire the trigger and wait for a success/error response.
  // After this resolves, the page refetches getGroups from Supabase to get the fresh list.
  syncGroups: publicProcedure
    .input(z.object({ accountId: accountIdSchema }))
    .mutation(async ({ input }) => {
      const webhookUrl = getWebhookUrl(input.accountId, "syncGroups");

      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "pull_groups" }),
      });

      if (!res.ok) {
        let makeError = `Webhook returned ${res.status}`;
        try {
          const body = await res.text();
          if (body) makeError = body;
        } catch { /* ignore */ }
        throw new TRPCError({ code: "BAD_GATEWAY", message: makeError });
      }

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
        accountId: accountIdSchema,
        chatId: z.string().min(1),
        message: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const webhookUrl = getWebhookUrl(input.accountId, "sendMessage");

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
        accountId: accountIdSchema,
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
        account_id: input.accountId,
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

  // Returns last 50 broadcasts, newest first — scoped to account
  listBroadcastHistory: publicProcedure
    .input(z.object({ accountId: accountIdSchema }))
    .query(async ({ input }): Promise<BroadcastLogEntry[]> => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("whatsapp_broadcast_log")
        .select("*")
        .eq("account_id", input.accountId)
        .order("sent_at", { ascending: false })
        .limit(50);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return (data ?? []) as BroadcastLogEntry[];
    }),

  scheduleMessage: publicProcedure
    .input(
      z.object({
        accountId: accountIdSchema,
        groupIds: z.array(z.string()).min(1),
        groupNames: z.array(z.string()),
        message: z.string().min(1),
        scheduledAt: z.string(), // ISO UTC string
      })
    )
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      const { error } = await supabase.from("scheduled_messages").insert({
        account_id: input.accountId,
        group_ids: input.groupIds,
        group_names: input.groupNames,
        message: input.message,
        scheduled_at: input.scheduledAt,
        status: "pending",
      });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // Returns pending messages + sent/failed messages from the last 24 hours.
  // Older completed messages are excluded to keep the list manageable.
  listScheduled: publicProcedure
    .input(z.object({ accountId: accountIdSchema }))
    .query(async ({ input }): Promise<ScheduledMessage[]> => {
      const supabase = createAdminClient();
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("scheduled_messages")
        .select("*")
        .eq("account_id", input.accountId)
        .or(`status.eq.pending,and(status.in.(sent,failed),sent_at.gte.${cutoff})`)
        .order("scheduled_at", { ascending: true });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return (data ?? []) as ScheduledMessage[];
    }),

  // cancelScheduled: no account_id filter needed — UUID is globally unique
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
  getDashboardGroups: publicProcedure
    .input(z.object({ accountId: accountIdSchema }))
    .query(async ({ input }): Promise<DashboardGroup[]> => {
      const supabase = createAdminClient();
      const { data: dashboardRows, error: dashboardError } = await supabase
        .from("whatsapp_dashboard_groups")
        .select("group_id, group_name")
        .eq("account_id", input.accountId)
        .order("group_name", { ascending: true });
      if (dashboardError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: dashboardError.message });
      if (!dashboardRows?.length) return [];

      const groupIds = dashboardRows.map((r) => r.group_id);
      const { data: sizeRows } = await supabase
        .from("whatsapp_groups")
        .select("id, size")
        .eq("account_id", input.accountId)
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
            .eq("group_chat_id", groupId)
            .eq("account_id", input.accountId);
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

  // Reads all participants for a group from Supabase cache, paginating in batches of 1000
  // to handle large groups. Sorted by phone number ascending.
  getParticipantsByGroupId: publicProcedure
    .input(z.object({ accountId: accountIdSchema, groupId: z.string().min(1) }))
    .query(async ({ input }): Promise<ParticipantEntry[]> => {
      const supabase = createAdminClient();
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      const allData: ParticipantEntry[] = [];

      while (hasMore) {
        const { data, error } = await supabase
          .from("whatsapp_group_participants")
          .select("participant_id, participant_phone, participant_name, group_chat_name")
          .eq("group_chat_id", input.groupId)
          .eq("account_id", input.accountId)
          .order("participant_id", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        const page = (data ?? []) as ParticipantEntry[];
        allData.push(...page);
        hasMore = page.length === PAGE_SIZE;
        offset += PAGE_SIZE;
      }

      return allData.sort((a, b) => {
        if (!a.participant_phone?.trim()) return 1;
        if (!b.participant_phone?.trim()) return -1;
        return a.participant_phone.localeCompare(b.participant_phone);
      });
    }),

  getAllParticipantsPhones: publicProcedure
    .input(z.object({ accountId: accountIdSchema }))
    .query(async ({ input }): Promise<{
      phones: string[];
      totalParticipantRows: number;
    }> => {
      const supabase = createAdminClient();
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      const seen = new Set<string>();
      const phones: string[] = [];
      let totalRows = 0;

      while (hasMore) {
        const { data: rows, error } = await supabase
          .from("whatsapp_group_participants")
          .select("participant_phone")
          .eq("account_id", input.accountId)
          .like("participant_id", "%@c.us")
          .not("participant_phone", "is", null)
          .order("participant_id", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        const list = (rows ?? []) as { participant_phone: string | null }[];
        totalRows += list.length;
        for (const r of list) {
          const phone = r.participant_phone?.trim();
          if (phone && !seen.has(phone)) {
            seen.add(phone);
            phones.push(phone);
          }
        }
        hasMore = list.length === PAGE_SIZE;
        offset += PAGE_SIZE;
      }

      return {
        phones: phones.sort((a, b) => a.localeCompare(b)),
        totalParticipantRows: totalRows,
      };
    }),

  syncParticipants: publicProcedure
    .input(z.object({
      accountId: accountIdSchema,
      groupId: z.string().min(1),
      groupName: z.string(),
    }))
    .mutation(async ({ input }) => {
      const webhookUrl = getWebhookUrl(input.accountId, "syncParticipants");

      const body = JSON.stringify({
        trigger: "pull_participants",
        group_id: input.groupId,
        group_name: input.groupName,
        account_id: input.accountId, // pass to Make.com so it knows which Green API to use
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
