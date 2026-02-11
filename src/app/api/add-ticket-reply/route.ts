import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const AddTicketReplySchema = z.object({
  ticket_id: z.string().uuid(),
  body: z.string().min(1),
  body_plain: z.string().optional(),
  from_email: z.string().optional(),
  to_email: z.string().optional(),
  cc: z.string().optional(),
  subject: z.string().optional(),
  message_id: z.string().optional(),
  in_reply_to: z.string().optional(),
  references_header: z.string().optional(),
});

/**
 * Make.com calls this when a customer replies to a ticket email.
 * Adds an inbound reply to the ticket thread so the app shows the full conversation.
 */
export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const data = AddTicketReplySchema.parse(body);

    const supabase = await createClient();

    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('id')
      .eq('id', data.ticket_id)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json(
        { success: false, error: 'Ticket not found' },
        { status: 404 }
      );
    }

    const { error: insertError } = await supabase.from('ticket_replies').insert({
      ticket_id: data.ticket_id,
      direction: 'inbound',
      body: data.body,
      body_plain: data.body_plain ?? null,
      from_email: data.from_email ?? null,
      to_email: data.to_email ?? null,
      cc: data.cc ?? null,
      subject: data.subject ?? null,
      message_id: data.message_id ?? null,
      in_reply_to: data.in_reply_to ?? null,
      references_header: data.references_header ?? null,
      sent_by: null,
    });

    if (insertError) {
      console.error('Failed to add ticket reply:', insertError);
      return NextResponse.json(
        { success: false, error: 'Failed to add reply' },
        { status: 500 }
      );
    }

    await supabase
      .from('support_tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', data.ticket_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: error.flatten() },
        { status: 400 }
      );
    }
    console.error('Add ticket reply error:', error);
    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 }
    );
  }
}
