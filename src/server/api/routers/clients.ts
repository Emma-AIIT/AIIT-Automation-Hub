import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { createClient } from "@/lib/supabase/server";

export const clientsRouter = createTRPCRouter({
  setChase: publicProcedure
    .input(
      z.object({
        clientId: z.string().uuid(),
        chase: z.enum(['to_chase', 'do_not_chase']),
      })
    )
    .mutation(async ({ input }) => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('clients')
        .update({ chase: input.chase, updated_at: new Date().toISOString() })
        .eq('id', input.clientId)
        .select('id, chase')
        .single();
      if (error) throw error;
      return data;
    }),

  getAll: publicProcedure
    .input(
      z.object({
        status: z.enum(['all', 'current', 'warning', 'critical', 'suspended']).optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const supabase = await createClient();
      
      let query = supabase
        .from('clients')
        .select('*')
        .order('streak_days', { ascending: false });

      if (input.status && input.status !== 'all') {
        query = query.eq('status', input.status);
      }

      if (input.search) {
        query = query.or(`name.ilike.%${input.search}%,company.ilike.%${input.search}%,email.ilike.%${input.search}%`);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data;
    }),

  getStats: publicProcedure.query(async () => {
    const supabase = await createClient();
    
    const { data: clients } = await supabase.from('clients').select('*');
    
    if (!clients) return null;

    const totalOutstanding = clients.reduce((sum, c) => sum + Number(c.current_balance), 0);
    const totalClients = clients.length;
    const atRisk = clients.filter(c => c.streak_days >= 1 && c.streak_days <= 21).length;
    const suspended = clients.filter(c => c.status === 'suspended').length;
    
    // Calculate collection rate (simplified)
    const paidClients = clients.filter(c => c.current_balance < c.previous_balance).length;
    const collectionRate = totalClients > 0 ? (paidClients / totalClients) * 100 : 0;

    return {
      totalOutstanding,
      totalClients,
      atRisk,
      suspended,
      collectionRate,
    };
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          activity_log (
            id,
            client_id,
            activity_type,
            outcome,
            recording_url,
            notes,
            created_at
          ),
          weekly_snapshots (
            id,
            client_id,
            week_start,
            balance,
            payment_made,
            created_at
          )
        `)
        .eq('id', input.id)
        .single();

      if (error) throw error;
      return data;
    }),
});
