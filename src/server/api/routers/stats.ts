/**
 * stats router
 *
 * Aggregates top-level metrics for the main /automations dashboard page.
 * Combines debt recovery stats (from Supabase) with voice agent stats (currently hardcoded).
 *
 * Note: `agents.active` and `agents.callsToday` are hardcoded placeholders.
 * Wire these up to the VAPI router once live call counting is needed.
 */
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { createClient } from "@/lib/supabase/server";

export const statsRouter = createTRPCRouter({
  // Returns combined debt + agent overview stats for the main dashboard.
  getOverview: publicProcedure.query(async () => {
    const supabase = await createClient();

    const { data: clients } = await supabase.from('clients').select('*');
    const totalOutstanding = clients?.reduce((sum, c) => sum + Number(c.current_balance), 0) ?? 0;
    const atRisk = clients?.filter(c => c.streak_days >= 1 && c.streak_days <= 21).length ?? 0;
    const totalClients = clients?.length ?? 0;

    return {
      debt: { totalOutstanding, atRisk, totalClients },
      agents: { active: 4, callsToday: 0 },
    };
  }),
});
