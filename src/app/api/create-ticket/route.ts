import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const CreateTicketSchema = z.object({
  caller_name: z.string(),
  caller_phone: z.string().optional(),
  caller_email: z.string().email().optional(),
  caller_business: z.string().optional(),
  inquiry: z.string(),
  summary: z.string().optional(),
  vapi_call_id: z.string().optional(),
  recording_url: z.string().optional(),
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

    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    console.error('Create ticket error:', error);
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    );
  }
}
