/**
 * sync router
 *
 * Exposes a single `trigger` mutation used by the "Sync Now" button on the Debt Recovery dashboard.
 * Fires an HTTP POST to the Make.com Xero sync webhook, which triggers the same flow as the
 * daily 6am scheduled sync: fetch all Xero contacts + balances → UPSERT into Supabase.
 *
 * After the webhook fires, Make.com runs asynchronously. The dashboard polls/refetches
 * client data after ~30–60 seconds to reflect updated balances.
 */
import { createTRPCRouter, publicProcedure } from "../trpc";
import { env } from "~/env";

export const syncRouter = createTRPCRouter({
  // Triggers the Make.com Xero sync webhook. Returns immediately — sync runs async in Make.com.
  trigger: publicProcedure.mutation(async () => {
    const webhookUrl = env.MAKE_SYNC_WEBHOOK_URL;

    if (!webhookUrl) {
      throw new Error("MAKE_SYNC_WEBHOOK_URL is not configured");
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Make.com webhook returned status ${response.status}`);
      }

      return {
        success: true,
        message: "Sync started",
      };
    } catch (error) {
      console.error("Error triggering Make.com webhook:", error);
      throw new Error(
        error instanceof Error
          ? `Failed to trigger sync: ${error.message}`
          : "Failed to trigger sync",
      );
    }
  }),
});
