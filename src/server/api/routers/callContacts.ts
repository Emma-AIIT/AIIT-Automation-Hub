/**
 * callContacts router
 *
 * CRUD access to the `call_contacts` table — a manually-managed phonebook used for
 * outbound calling. Phone numbers are inserted by a Make.com automation, which dedupes
 * against the unique `phone` constraint so existing numbers are never added twice. The
 * team then fills in and edits names / business names from the Contacts page.
 *
 * Reads use the cookie-aware server client; writes use the admin (service role) client so
 * update/delete bypass RLS — matching the pattern used by the tickets and whatsapp routers.
 */
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type CallContact = {
  id: string;
  name: string;
  phone: string;
  business: string | null;
  // Number of times the outbound calling automation has called this contact.
  // Written by Make.com (incremented alongside last_called_at); the dashboard
  // only displays and sorts by it.
  call_count: number;
  last_called_at: string | null;
  created_at: string;
};

// Postgres unique-violation error code — thrown when a phone number already exists.
const UNIQUE_VIOLATION = "23505";

export const callContactsRouter = createTRPCRouter({
  // Returns all contacts, optionally filtered by a search term matching name, phone,
  // or business. Newest contacts first.
  getAll: publicProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const supabase = await createClient();

      let query = supabase
        .from("call_contacts")
        .select("*")
        .order("created_at", { ascending: false });

      const search = input?.search?.trim();
      if (search) {
        query = query.or(
          `name.ilike.%${search}%,phone.ilike.%${search}%,business.ilike.%${search}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CallContact[];
    }),

  // Adds a single contact. Phone is required and must be unique.
  create: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "Name is required"),
        phone: z.string().trim().min(1, "Phone is required"),
        business: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("call_contacts")
        .insert({
          name: input.name,
          phone: input.phone,
          business: input.business?.trim() ? input.business.trim() : null,
        })
        .select()
        .single();

      if (error) {
        if (error.code === UNIQUE_VIOLATION) {
          throw new Error("A contact with that phone number already exists");
        }
        throw error;
      }
      return data as CallContact;
    }),

  // Updates one or more editable fields (name, phone, business) on a contact.
  // Phone stays unique — a clashing edit surfaces a friendly error.
  update: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).optional(),
        phone: z.string().trim().min(1).optional(),
        business: z.string().trim().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;

      const updates: Record<string, string | null> = {};
      if (rest.name !== undefined) updates.name = rest.name;
      if (rest.phone !== undefined) updates.phone = rest.phone;
      if (rest.business !== undefined) {
        updates.business = rest.business?.trim() ? rest.business.trim() : null;
      }

      if (Object.keys(updates).length === 0) {
        throw new Error("No fields to update");
      }

      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("call_contacts")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        if (error.code === UNIQUE_VIOLATION) {
          throw new Error("A contact with that phone number already exists");
        }
        throw error;
      }
      return data as CallContact;
    }),

  // Permanently deletes a contact.
  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("call_contacts")
        .delete()
        .eq("id", input.id)
        .select("id");

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Contact not found or could not be deleted");
      }
      return { success: true };
    }),
});
