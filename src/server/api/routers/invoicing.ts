import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { createClient } from "@/lib/supabase/server";

export type InvoicingMessage = {
  id: string;
  sender_phone: string;
  sender_name: string | null;
  message_type: "text" | "image" | "textMessage" | "imageMessage";
  message_text: string | null;
  image_url: string | null;
  image_caption: string | null;
  received_at: string;
  created_at: string;
};

export const invoicingRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(
      z.object({
        limit: z.number().default(100),
        search: z.string().optional(),
        type: z.enum(["all", "text", "image"]).default("all"),
      }),
    )
    .query(async ({ input }) => {
      const supabase = await createClient();

      let query = supabase
        .from("invoicing_messages")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(input.limit);

      if (input.type !== "all") {
        query = query.eq("message_type", input.type);
      }

      if (input.search) {
        query = query.or(
          `sender_name.ilike.%${input.search}%,sender_phone.ilike.%${input.search}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []) as InvoicingMessage[];
    }),

  getStats: publicProcedure.query(async () => {
    const supabase = await createClient();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      { count: total },
      { count: todayCount },
      { count: imageCount },
      { count: textCount },
    ] = await Promise.all([
      supabase
        .from("invoicing_messages")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("invoicing_messages")
        .select("id", { count: "exact", head: true })
        .gte("received_at", todayStart.toISOString()),
      supabase
        .from("invoicing_messages")
        .select("id", { count: "exact", head: true })
        .eq("message_type", "image"),
      supabase
        .from("invoicing_messages")
        .select("id", { count: "exact", head: true })
        .eq("message_type", "text"),
    ]);

    return {
      total: total ?? 0,
      todayCount: todayCount ?? 0,
      imageCount: imageCount ?? 0,
      textCount: textCount ?? 0,
    };
  }),
});
