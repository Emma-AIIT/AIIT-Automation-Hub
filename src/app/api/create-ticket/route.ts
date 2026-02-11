import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const AttachmentSchema = z.object({
  file_name: z.string(),
  file_type: z.string(),
  file_size: z.number(),
  storage_path: z.string(),
  content_id: z.string().optional(),
});

const CreateTicketSchema = z.object({
  caller_name: z.string(),
  caller_phone: z.string().optional(),
  caller_email: z.string().email().optional(),
  caller_business: z.string().optional(),
  inquiry: z.string(),
  summary: z.string().optional(),
  vapi_call_id: z.string().optional(),
  recording_url: z.string().optional(),
  source: z.enum(['phone', 'email', 'manual', 'walk-in']).default('phone'),
  email_subject: z.string().optional(),
  email_cc: z.string().optional(),
  email_bcc: z.string().optional(),
  email_message_id: z.string().optional(),
  conversation_id: z.string().optional(),
  attachments: z.array(AttachmentSchema).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const data = CreateTicketSchema.parse(body);

    const supabase = await createClient();

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .insert({
        caller_name: data.caller_name,
        caller_phone: data.caller_phone ?? null,
        caller_email: data.caller_email ?? null,
        caller_business: data.caller_business ?? null,
        inquiry: data.inquiry,
        summary: data.summary ?? null,
        vapi_call_id: data.vapi_call_id ?? null,
        recording_url: data.recording_url ?? null,
        status: 'open',
        source: data.source,
        email_subject: data.email_subject ?? null,
        email_cc: data.email_cc ?? null,
        email_bcc: data.email_bcc ?? null,
        email_message_id: data.email_message_id ?? null,
        conversation_id: data.conversation_id ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create ticket:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to create ticket' },
        { status: 500 }
      );
    }

    // Insert attachment metadata if provided
    if (data.attachments && data.attachments.length > 0) {
      const attachmentRows = data.attachments.map((a) => ({
        ticket_id: ticket.id,
        file_name: a.file_name,
        file_type: a.file_type,
        file_size: a.file_size,
        storage_path: a.storage_path,
        content_id: a.content_id ?? null,
      }));

      const { error: attachError } = await supabase
        .from('ticket_attachments')
        .insert(attachmentRows);

      if (attachError) {
        console.error('Failed to insert attachments:', attachError);
        // Ticket was created successfully, just log the attachment error
      }
    }

    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    console.error('Create ticket error:', error);
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
