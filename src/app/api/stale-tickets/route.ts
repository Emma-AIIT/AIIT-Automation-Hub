/**
 * GET /api/stale-tickets
 * Cron endpoint — called by Vercel Cron (secured with CRON_SECRET bearer token).
 * Queries all non-resolved tickets older than 3 days and POSTs each one to the
 * MAKE_STALE_TICKET_WEBHOOK_URL so Make.com can send follow-up notifications.
 * Auth check is skipped in development. Returns a summary of sent/error counts.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { env } from '@/env';
import { differenceInDays } from 'date-fns';

export async function GET(req: NextRequest) {
  // Security: Verify cron secret (Vercel sends this header for cron jobs)
  // Skip auth check in development for easier testing
  if (process.env.NODE_ENV === 'production') {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const webhookUrl = env.MAKE_STALE_TICKET_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: 'MAKE_STALE_TICKET_WEBHOOK_URL not configured' },
      { status: 500 }
    );
  }

  const supabase = await createClient();

  // Calculate 3 days ago
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  // Query stale tickets: not resolved AND older than 3 days
  const { data: staleTickets, error } = await supabase
    .from('support_tickets')
    .select('*')
    .neq('status', 'resolved')
    .lt('created_at', threeDaysAgo.toISOString());

  if (error) {
    console.error('Failed to fetch stale tickets:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!staleTickets || staleTickets.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No stale tickets found',
      total_stale: 0,
      sent: 0,
      errors: 0,
    });
  }

  const results = { sent: 0, errors: 0 };

  // Send each stale ticket to Make.com
  for (const ticket of staleTickets) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket,
          days_old: differenceInDays(new Date(), new Date(ticket.created_at)),
          notification_type: 'stale_ticket_followup',
          sent_at: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        results.sent++;
      } else {
        console.error(`Failed to send ticket ${ticket.id} to webhook:`, response.status);
        results.errors++;
      }
    } catch (err) {
      console.error(`Error sending ticket ${ticket.id} to webhook:`, err);
      results.errors++;
    }
  }

  return NextResponse.json({
    success: true,
    total_stale: staleTickets.length,
    ...results,
  });
}
