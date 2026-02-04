import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "~/env";
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

  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('support_tickets')
        .delete()
        .eq('id', input.id)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Ticket not found or could not be deleted');
      }
      return { success: true };
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

  updatePriority: publicProcedure
    .input(z.object({
      id: z.string().uuid(),
      priority: z.enum(['high', 'low']).nullable(),
      priority_reason: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('support_tickets')
        .update({
          priority: input.priority,
          priority_reason: input.priority_reason ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw error;
      return data as SupportTicket;
    }),

  create: publicProcedure
    .input(z.object({
      caller_name: z.string().min(1),
      caller_business: z.string().optional(),
      inquiry: z.string().min(1),
      summary: z.string().optional(),
      assigned_to: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const supabase = await createClient();
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('support_tickets')
        .insert({
          caller_name: input.caller_name.trim(),
          caller_phone: null,
          caller_email: null,
          caller_business: input.caller_business?.trim() ?? null,
          inquiry: input.inquiry.trim(),
          summary: input.summary?.trim() ?? null,
          status: 'open',
          assigned_to: input.assigned_to?.trim() ?? null,
          vapi_call_id: null,
          recording_url: null,
          notes: null,
          created_at: now,
          updated_at: now,
          resolved_at: null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as SupportTicket;
    }),

  pullNew: publicProcedure.mutation(async () => {
    const webhookUrl = env.MAKE_PULL_TICKETS_WEBHOOK_URL;

    if (!webhookUrl) {
      throw new Error("MAKE_PULL_TICKETS_WEBHOOK_URL is not configured");
    }

    let response: Response;
    try {
      response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timestamp: new Date().toISOString() }),
      });
    } catch (error) {
      console.error("Error triggering Make.com pull tickets webhook:", error);
      throw new Error(
        error instanceof Error
          ? `Failed to pull tickets: ${error.message}`
          : "Failed to pull tickets"
      );
    }

    const raw = await response.text();
    let body: unknown = null;
    if (raw.trim()) {
      try {
        body = JSON.parse(raw) as unknown;
      } catch {
        body = raw;
      }
    }

    if (!response.ok) {
      const errMessage =
        typeof body === "object" &&
        body !== null &&
        "message" in body &&
        typeof (body as { message: unknown }).message === "string"
          ? (body as { message: string }).message
          : typeof body === "object" &&
              body !== null &&
              "error" in body &&
              typeof (body as { error: unknown }).error === "string"
            ? (body as { error: string }).error
            : typeof body === "string"
              ? body
              : `Make.com webhook returned ${response.status}`;
      throw new Error(errMessage);
    }

    const parsed = body as Record<string, unknown> | null;
    const success = parsed?.success === true;
    const message = typeof parsed?.message === "string" ? parsed.message : undefined;
    const ticketsProcessed =
      typeof parsed?.tickets_processed === "number" ? parsed.tickets_processed : undefined;

    return {
      success: success ?? true,
      message: message ?? "Pull complete",
      tickets_processed: ticketsProcessed,
    };
  }),

  getStats: publicProcedure.query(async () => {
    const supabase = await createClient();

    const [
      { count: open },
      { count: inProgress },
      { count: resolved },
      { count: unassignedNull },
      { count: unassignedEmpty },
      { count: total },
      { data: resolutionData },
    ] = await Promise.all([
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'in-progress'),
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'resolved'),
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open').is('assigned_to', null),
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open').eq('assigned_to', ''),
      supabase.from('support_tickets').select('id', { count: 'exact', head: true }),
      supabase.from('support_tickets').select('created_at, resolved_at').not('resolved_at', 'is', null),
    ]);

    const unassigned = (unassignedNull ?? 0) + (unassignedEmpty ?? 0);

    const resolvedTickets = (resolutionData ?? []) as { created_at: string; resolved_at: string }[];
    const avgResolutionTime = resolvedTickets.length > 0
      ? resolvedTickets.reduce((sum, t) => {
          const created = new Date(t.created_at).getTime();
          const resolvedAt = new Date(t.resolved_at).getTime();
          return sum + (resolvedAt - created);
        }, 0) / resolvedTickets.length
      : 0;

    return {
      open: open ?? 0,
      inProgress: inProgress ?? 0,
      resolved: resolved ?? 0,
      total: total ?? 0,
      unassigned,
      avgResolutionHours: Math.floor(avgResolutionTime / (1000 * 60 * 60)),
    };
  }),
});
