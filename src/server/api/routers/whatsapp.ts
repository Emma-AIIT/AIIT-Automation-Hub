import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { env } from "~/env";

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
});
