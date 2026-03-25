/**
 * webhooks router
 *
 * Inbound endpoints called by Make.com automation workflows. These are the primary
 * write paths for the Debt Recovery module's automated data — the frontend never
 * calls these directly.
 *
 * Callers:
 *   - syncXero     → Make.com Daily Xero Sync (6am) + Manual "Sync Now" button
 *   - updatePayment → Make.com Payment Watcher (detects new Xero payments)
 *   - logActivity  → Make.com Monday Outreach (VAPI calls, SMS, emails)
 *
 * UPSERT safety: syncXero only updates contact info and current_balance.
 * It deliberately does NOT overwrite streak_days, previous_balance, status,
 * or last_contact_date — those are managed by other Make.com workflows.
 */
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { createClient } from "@/lib/supabase/server";

export const webhooksRouter = createTRPCRouter({
  // Bulk UPSERT of Xero contacts into the clients table.
  // Called by Make.com after fetching all contacts from the Xero API.
  // Conflict resolution is on xero_contact_id — existing records are updated,
  // new contacts are inserted. Automation-managed fields are NOT touched here.
  syncXero: publicProcedure
    .input(
      z.object({
        clients: z.array(
          z.object({
            xeroContactId: z.string(),
            name: z.string(),
            email: z.string(),
            phone: z.string().optional(),
            company: z.string().optional(),
            currentBalance: z.number(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const supabase = await createClient();
      
      for (const client of input.clients) {
        // Upsert client
        await supabase
          .from('clients')
          .upsert({
            xero_contact_id: client.xeroContactId,
            name: client.name,
            email: client.email,
            phone: client.phone,
            company: client.company,
            current_balance: client.currentBalance,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'xero_contact_id'
          });
      }
      
      return { success: true, count: input.clients.length };
    }),

  // Called by Make.com Payment Watcher when Xero reports a paid invoice.
  // Core payment detection logic: if newBalance < current_balance, a payment was made
  // and the streak resets to 0. If balance is unchanged or increased, streak continues.
  // Status thresholds (in days): 0 = current, ≤14 = warning, ≤21 = critical, >21 = suspended.
  updatePayment: publicProcedure
    .input(
      z.object({
        xeroContactId: z.string(),
        newBalance: z.number(),
        paymentAmount: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const supabase = await createClient();
      
      // Get current client
      const { data: client } = await supabase
        .from('clients')
        .select('*')
        .eq('xero_contact_id', input.xeroContactId)
        .single();
      
      if (!client) throw new Error("Client not found");
      
      // Reset streak if payment reduces balance
      const newStreak = input.newBalance < client.current_balance ? 0 : client.streak_days;
      // Calculate status based on day-based thresholds
      const newStatus = newStreak === 0 ? 'current'
        : newStreak <= 14 ? 'warning'
        : newStreak <= 21 ? 'critical'
        : 'suspended';
      
      // Calculate week change (balance difference)
      const weekChange = input.newBalance - client.current_balance;

      // Update client
      await supabase
        .from('clients')
        .update({
          previous_balance: client.current_balance,
          current_balance: input.newBalance,
          streak_days: newStreak,
          week_change: weekChange,
          last_balance_check_date: new Date().toISOString(),
          status: newStatus,
          last_payment_date: new Date().toISOString(),
        })
        .eq('xero_contact_id', input.xeroContactId);
      
      // Log activity
      await supabase
        .from('activity_log')
        .insert({
          client_id: client.id,
          activity_type: 'payment',
          outcome: `Payment of $${input.paymentAmount.toFixed(2)} received`,
        });
      
      return { success: true };
    }),

  // Appends an activity entry (call, SMS, email, suspension notice) to the activity_log table
  // and updates the client's last_contact_date. Called by Make.com Monday Outreach workflow
  // after each outreach action completes.
  logActivity: publicProcedure
    .input(
      z.object({
        xeroContactId: z.string(),
        activityType: z.enum(['call', 'sms', 'email', 'suspension']),
        outcome: z.string().optional(),
        recordingUrl: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const supabase = await createClient();
      
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('xero_contact_id', input.xeroContactId)
        .single();
      
      if (!client) throw new Error("Client not found");
      
      await supabase
        .from('activity_log')
        .insert({
          client_id: client.id,
          activity_type: input.activityType,
          outcome: input.outcome,
          recording_url: input.recordingUrl,
          notes: input.notes,
        });
      
      // Update last contact date
      await supabase
        .from('clients')
        .update({
          last_contact_date: new Date().toISOString(),
          last_call_outcome: input.outcome,
        })
        .eq('id', client.id);
      
      return { success: true };
    }),
});
