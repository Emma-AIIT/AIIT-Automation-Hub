import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { createClient } from "@/lib/supabase/server";

export const statsRouter = createTRPCRouter({
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
