import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { createClient } from "@/lib/supabase/server";

export type SearchResultItem = {
  id: string;
  label: string;
  sublabel: string;
  status?: string;
  module: "client" | "ticket" | "quote";
  href: string;
};

export type SearchResults = {
  clients: SearchResultItem[];
  tickets: SearchResultItem[];
  quotes: SearchResultItem[];
};

export const searchRouter = createTRPCRouter({
  global: publicProcedure
    .input(z.object({ query: z.string().min(2).max(100) }))
    .query(async ({ input }): Promise<SearchResults> => {
      const supabase = await createClient();
      const q = `%${input.query}%`;

      const [clientsRes, ticketsRes, quotesRes] = await Promise.all([
        supabase
          .from("clients")
          .select("id, name, company, email, status")
          .or(`name.ilike.${q},company.ilike.${q},email.ilike.${q}`)
          .limit(5),

        supabase
          .from("support_tickets")
          .select("id, caller_name, caller_business, caller_email, status")
          .or(`caller_name.ilike.${q},caller_business.ilike.${q},caller_email.ilike.${q}`)
          .limit(5),

        supabase
          .from("quotes")
          .select("id, contact_name, business_name, email, status")
          .or(`contact_name.ilike.${q},business_name.ilike.${q},email.ilike.${q}`)
          .limit(5),
      ]);

      const clients: SearchResultItem[] = (clientsRes.data ?? []).map((c) => ({
        id: c.id,
        label: c.name ?? "Unknown",
        sublabel: c.company ?? c.email ?? "",
        status: c.status,
        module: "client",
        href: `/automations/debt-recovery?search=${encodeURIComponent(c.name ?? "")}`,
      }));

      const tickets: SearchResultItem[] = (ticketsRes.data ?? []).map((t) => ({
        id: t.id,
        label: t.caller_name ?? "Unknown",
        sublabel: t.caller_business ?? t.caller_email ?? "",
        status: t.status,
        module: "ticket",
        href: `/automations/tickets?id=${t.id}`,
      }));

      const quotes: SearchResultItem[] = (quotesRes.error ? [] : (quotesRes.data ?? [])).map((q) => ({
        id: String(q.id),
        label: q.contact_name ?? q.business_name ?? "Unknown",
        sublabel: q.business_name ?? q.email ?? "",
        status: q.status,
        module: "quote",
        href: `/automations/quote-pipeline?search=${encodeURIComponent(q.contact_name ?? q.business_name ?? "")}`,
      }));

      return { clients, tickets, quotes };
    }),
});
