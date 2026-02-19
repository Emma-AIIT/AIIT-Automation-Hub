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

    // Make.com returns the array directly: [{"0": groupName, "1": chatId}, ...]
    // Guard: if somehow wrapped in {body: [...]} format, unwrap it too
    let rows: unknown[];
    if (Array.isArray(data)) {
      const first = data[0] as Record<string, unknown> | undefined;
      if (first && Array.isArray(first.body)) {
        // Wrapped format: [{ "body": [...], "status": 200 }]
        rows = first.body as unknown[];
      } else {
        // Direct format: [{"0": name, "1": chatId}, ...]
        rows = data;
      }
    } else {
      rows = [];
    }

    return rows
      .filter((row): row is Record<string, string | null> => typeof row === "object" && row !== null)
      .map((row) => ({
        id: row["1"] != null ? String(row["1"]) : "",
        name: row["0"] != null ? String(row["0"]) : "",
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
