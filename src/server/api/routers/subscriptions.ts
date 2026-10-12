/**
 * subscriptions router
 *
 * Live billing status for the Subscriptions page and the renewal reminder.
 * Calls each provider's billing API directly (read-only) every time it is
 * queried; the client only queries once per hub open. Subscription details
 * themselves live in src/config/subscriptions.ts.
 */
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { runSubscriptionChecks } from "@/lib/server/subscription-checks";

export const subscriptionsRouter = createTRPCRouter({
  getLive: publicProcedure.query(() => runSubscriptionChecks()),
});
