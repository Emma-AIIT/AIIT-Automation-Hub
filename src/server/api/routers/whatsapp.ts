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

export const whatsappRouter = createTRPCRouter({
  getGroups: publicProcedure.query(async (): Promise<WhatsAppGroup[]> => {
    const webhookUrl = env.MAKE_WHATSAPP_PULL_GROUPS_WEBHOOK_URL;
    if (!webhookUrl) throw new Error("MAKE_WHATSAPP_PULL_GROUPS_WEBHOOK_URL is not configured");

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "pull_groups" }),
    });

    if (!res.ok) throw new Error(`Webhook returned ${res.status}`);

    const data: unknown = await res.json();

    // Make.com returns: [{ "body": [{ "groupId": "...", "subject": "..." }, ...], "status": 200 }]
    let rows: unknown[];
    if (Array.isArray(data)) {
      const first = data[0] as Record<string, unknown> | undefined;
      rows = first && Array.isArray(first.body) ? (first.body as unknown[]) : data;
    } else {
      rows = [];
    }

    return rows
      .filter((row): row is Record<string, string | null> => typeof row === "object" && row !== null)
      .map((row) => ({
        id: row.groupId != null ? String(row.groupId) : "",
        name: row.subject != null ? String(row.subject) : "",
      }))
      .filter((g) => g.id.length > 0 && g.name.length > 0);
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
      if (!webhookUrl) throw new Error("MAKE_WHATSAPP_SEND_MESSAGE_WEBHOOK_URL is not configured");

      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: input.chatId, message: input.message }),
      });

      if (!res.ok) throw new Error(`Webhook returned ${res.status}`);

      return { success: true };
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
