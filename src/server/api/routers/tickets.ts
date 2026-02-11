import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "~/env";
import type { SupportTicket, TicketAttachment, TicketReply } from "@/types/tickets";

export const ticketsRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(z.object({
      status: z.enum(['all', 'open', 'in-progress', 'resolved', 'unassigned']).default('all'),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const supabase = await createClient();

      let query = supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(input.limit);

      if (input.status === 'unassigned') {
        query = query.or('assigned_to.is.null,assigned_to.eq.');
      } else if (input.status !== 'all') {
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

      const [ticketResult, attachmentsResult] = await Promise.all([
        supabase
          .from('support_tickets')
          .select('*')
          .eq('id', input.id)
          .single(),
        supabase
          .from('ticket_attachments')
          .select('*')
          .eq('ticket_id', input.id)
          .order('created_at', { ascending: true }),
      ]);

      if (ticketResult.error) throw ticketResult.error;

      return {
        ...(ticketResult.data as SupportTicket),
        attachments: (attachmentsResult.data ?? []) as TicketAttachment[],
      };
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

      const { data: attachments } = await supabase
        .from('ticket_attachments')
        .select('storage_path')
        .eq('ticket_id', input.id);
      const paths = (attachments ?? []).map((a) => (a as { storage_path: string }).storage_path);
      if (paths.length > 0) {
        await supabase.storage.from('ticket-attachments').remove(paths);
      }

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

  deleteMany: publicProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }))
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      let deleted = 0;
      const errors: string[] = [];

      for (const id of input.ids) {
        try {
          const { data: attachments } = await supabase
            .from('ticket_attachments')
            .select('storage_path')
            .eq('ticket_id', id);
          const paths = (attachments ?? []).map((a) => (a as { storage_path: string }).storage_path);
          if (paths.length > 0) {
            await supabase.storage.from('ticket-attachments').remove(paths);
          }

          const { data, error } = await supabase
            .from('support_tickets')
            .delete()
            .eq('id', id)
            .select('id');

          if (error) {
            errors.push(`${id}: ${error.message}`);
            continue;
          }
          if (data && data.length > 0) deleted += 1;
        } catch (e) {
          errors.push(`${id}: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
      }

      return { deleted, errors: errors.length > 0 ? errors : undefined };
    }),

  bulkUpdateStatus: publicProcedure
    .input(z.object({
      ids: z.array(z.string().uuid()).min(1).max(100),
      status: z.enum(['open', 'in-progress', 'resolved']),
    }))
    .mutation(async ({ input }) => {
      const supabase = await createClient();
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {
        status: input.status,
        updated_at: now,
      };
      if (input.status === 'resolved') {
        updates.resolved_at = now;
      }
      const { data, error } = await supabase
        .from('support_tickets')
        .update(updates)
        .in('id', input.ids)
        .select('id');
      if (error) throw error;
      return { updated: data?.length ?? 0 };
    }),

  bulkAssignWorker: publicProcedure
    .input(z.object({
      ids: z.array(z.string().uuid()).min(1).max(100),
      assigned_to: z.string().nullable(),
    }))
    .mutation(async ({ input }) => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('support_tickets')
        .update({ assigned_to: input.assigned_to, updated_at: new Date().toISOString() })
        .in('id', input.ids)
        .select('id');
      if (error) throw error;
      return { updated: data?.length ?? 0 };
    }),

  bulkUpdatePriority: publicProcedure
    .input(z.object({
      ids: z.array(z.string().uuid()).min(1).max(100),
      priority: z.enum(['high', 'low']).nullable(),
    }))
    .mutation(async ({ input }) => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('support_tickets')
        .update({ priority: input.priority, updated_at: new Date().toISOString() })
        .in('id', input.ids)
        .select('id');
      if (error) throw error;
      return { updated: data?.length ?? 0 };
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

  getAttachmentUrl: publicProcedure
    .input(z.object({ storage_path: z.string().min(1) }))
    .query(async ({ input }) => {
      const supabase = createAdminClient();
      const { data, error } = await supabase.storage
        .from('ticket-attachments')
        .createSignedUrl(input.storage_path, 3600); // 1hr expiry
      if (error) throw error;
      if (!data?.signedUrl) throw new Error('Failed to create signed URL');
      return { url: data.signedUrl };
    }),

  getAttachmentUrls: publicProcedure
    .input(z.object({ storage_paths: z.array(z.string().min(1)).max(50) }))
    .query(async ({ input }) => {
      if (input.storage_paths.length === 0) return { urls: [] as { storage_path: string; url: string }[] };
      const supabase = createAdminClient();
      const results = await Promise.all(
        input.storage_paths.map(async (storage_path) => {
          const { data, error } = await supabase.storage
            .from('ticket-attachments')
            .createSignedUrl(storage_path, 3600);
          if (error || !data?.signedUrl) return { storage_path, url: '' };
          return { storage_path, url: data.signedUrl };
        })
      );
      return { urls: results };
    }),

  create: publicProcedure
    .input(z.object({
      caller_name: z.string().min(1),
      caller_business: z.string().optional(),
      inquiry: z.string().min(1),
      summary: z.string().optional(),
      assigned_to: z.string().optional(),
      source: z.enum(['phone', 'email', 'manual', 'walk-in']).default('manual'),
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
          source: input.source,
          priority: null,
          priority_reason: null,
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

  getReplies: publicProcedure
    .input(z.object({ ticketId: z.string().uuid() }))
    .query(async ({ input }) => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("ticket_replies")
        .select("*")
        .eq("ticket_id", input.ticketId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TicketReply[];
    }),

  sendReply: publicProcedure
    .input(z.object({
      ticketId: z.string().uuid(),
      body: z.string().min(1),
      bodyPlain: z.string().optional(),
      cc: z.string().optional(),
      sentBy: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const supabase = await createClient();

      const { data: ticket, error: ticketError } = await supabase
        .from("support_tickets")
        .select("id, caller_email, email_subject, email_message_id, source")
        .eq("id", input.ticketId)
        .single();

      if (ticketError || !ticket) throw new Error("Ticket not found");
      if ((ticket as { source: string }).source !== "email") {
        throw new Error("Replies are only supported for email tickets");
      }
      const t = ticket as { caller_email: string | null; email_subject: string | null; email_message_id: string | null };
      if (!t.caller_email?.trim()) {
        throw new Error("Ticket has no customer email to reply to");
      }

      const { data: existingReplies } = await supabase
        .from("ticket_replies")
        .select("message_id")
        .eq("ticket_id", input.ticketId)
        .order("created_at", { ascending: false });

      const refs = (existingReplies ?? []) as { message_id: string | null }[];
      const referencesList: string[] = [];
      if (t.email_message_id) referencesList.push(t.email_message_id);
      for (const r of refs) {
        if (r.message_id && !referencesList.includes(r.message_id)) referencesList.push(r.message_id);
      }
      const inReplyTo = refs[0]?.message_id ?? t.email_message_id ?? undefined;
      const referencesHeader = referencesList.length > 0 ? referencesList.join(" ") : undefined;

      const messageId = `<ticket-${input.ticketId}-${Date.now()}@reply.aiit>`;

      const { data: reply, error: insertError } = await supabase
        .from("ticket_replies")
        .insert({
          ticket_id: input.ticketId,
          direction: "outbound",
          body: input.body,
          body_plain: input.bodyPlain ?? null,
          from_email: null,
          to_email: t.caller_email.trim(),
          cc: input.cc?.trim() || null,
          subject: t.email_subject ? `Re: ${t.email_subject.replace(/^Re:\s*/i, "")}` : null,
          message_id: messageId,
          in_reply_to: inReplyTo ?? null,
          references_header: referencesHeader ?? null,
          sent_by: input.sentBy?.trim() || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const webhookUrl = env.MAKE_SEND_EMAIL_WEBHOOK_URL;
      if (webhookUrl) {
        try {
          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ticket_id: input.ticketId,
              reply_id: (reply as TicketReply).id,
              to: t.caller_email.trim(),
              subject: t.email_subject ? `Re: ${t.email_subject.replace(/^Re:\s*/i, "")}` : "Re: Your support request",
              body: input.body,
              body_plain: input.bodyPlain ?? undefined,
              cc: input.cc?.trim() || undefined,
              message_id: messageId,
              in_reply_to: inReplyTo,
              references: referencesHeader,
            }),
          });
          if (!res.ok) {
            const text = await res.text();
            console.error("Make.com send-email webhook error:", res.status, text);
            throw new Error(`Failed to send email: ${res.status}`);
          }
        } catch (err) {
          console.error("Make.com send-email webhook:", err);
          throw err instanceof Error ? err : new Error("Failed to send email");
        }
      }

      const { error: updateError } = await supabase
        .from("support_tickets")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", input.ticketId);

      if (updateError) {
        // non-fatal
      }

      return reply as TicketReply;
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
