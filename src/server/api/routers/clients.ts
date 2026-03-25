/**
 * clients router
 *
 * Handles reading and updating client records for the Debt Recovery module.
 * Client data is primarily written by Make.com automations (Xero sync, streak tracker).
 * The frontend only reads data and can update the `chase` flag.
 *
 * IMPORTANT: Never update streak_weeks, previous_balance, status, or last_contact_date
 * from this router — those fields are owned by Make.com workflows.
 */
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { createClient } from "@/lib/supabase/server";

export const clientsRouter = createTRPCRouter({
  // Toggles whether a client should be actively chased for payment.
  // 'to_chase' = include in outreach, 'do_not_chase' = skip automated contact.
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

  // Returns all clients, optionally filtered by payment status and/or search term.
  // Results are sorted by streak_days descending (most overdue first).
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

  // Aggregates key stats for the dashboard stats cards:
  // total outstanding balance, client count, at-risk count, suspended count, collection rate.
  // Collection rate is a simplified calculation — paid = balance < previous_balance.
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

  // Returns a single client with their full activity log and weekly balance snapshots.
  // Used to populate the client detail drawer.
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
