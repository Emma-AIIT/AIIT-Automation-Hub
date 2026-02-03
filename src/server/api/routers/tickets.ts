import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { createClient } from "@/lib/supabase/server";
import type { SupportTicket } from "@/types/tickets";

export const ticketsRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(z.object({
      status: z.enum(['all', 'open', 'in-progress', 'resolved']).default('all'),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const supabase = await createClient();

      let query = supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(input.limit);

      if (input.status !== 'all') {
        query = query.eq('status', input.status);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []) as SupportTicket[];
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('id', input.id)
        .single();

      if (error) throw error;
      return data as SupportTicket;
    }),

  updateStatus: publicProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['open', 'in-progress', 'resolved']),
    }))
    .mutation(async ({ input }) => {
      const supabase = await createClient();

      const updates: Record<string, unknown> = {
        status: input.status,
        updated_at: new Date().toISOString(),
      };

      if (input.status === 'resolved') {
        updates.resolved_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('support_tickets')
        .update(updates)
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw error;
      return data as SupportTicket;
    }),

  addNote: publicProcedure
    .input(z.object({
      id: z.string().uuid(),
      note: z.string(),
    }))
    .mutation(async ({ input }) => {
      const supabase = await createClient();

      const { data: ticket } = await supabase
        .from('support_tickets')
        .select('notes')
        .eq('id', input.id)
        .single();

      const now = new Date();
      const timestamp = now.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' + now.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
      const isoTimestamp = now.toISOString();
      const newNote = `[${timestamp}] ${input.note}`;
      const updatedNotes = ticket?.notes
        ? `${ticket.notes}\n\n${newNote}`
        : newNote;

      const { data, error } = await supabase
        .from('support_tickets')
        .update({ notes: updatedNotes, updated_at: isoTimestamp })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw error;
      return data as SupportTicket;
    }),

  assignWorker: publicProcedure
    .input(z.object({
      id: z.string().uuid(),
      assigned_to: z.string().nullable(),
    }))
    .mutation(async ({ input }) => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('support_tickets')
        .update({ assigned_to: input.assigned_to, updated_at: new Date().toISOString() })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw error;
      return data as SupportTicket;
    }),

  getStats: publicProcedure.query(async () => {
    const supabase = await createClient();

    const { data: tickets } = await supabase
      .from('support_tickets')
      .select('*');

    if (!tickets) return { open: 0, inProgress: 0, resolved: 0, total: 0, avgResolutionHours: 0 };

    const open = tickets.filter(t => t.status === 'open').length;
    const inProgress = tickets.filter(t => t.status === 'in-progress').length;
    const resolved = tickets.filter(t => t.status === 'resolved').length;

    const resolvedTickets = tickets.filter(t => t.resolved_at);
    const avgResolutionTime = resolvedTickets.length > 0
      ? resolvedTickets.reduce((sum, t) => {
          const created = new Date(t.created_at as string).getTime();
          const resolvedAt = new Date(t.resolved_at as string).getTime();
          return sum + (resolvedAt - created);
        }, 0) / resolvedTickets.length
      : 0;

    return {
      open,
      inProgress,
      resolved,
      total: tickets.length,
      avgResolutionHours: Math.floor(avgResolutionTime / (1000 * 60 * 60)),
    };
  }),
});
