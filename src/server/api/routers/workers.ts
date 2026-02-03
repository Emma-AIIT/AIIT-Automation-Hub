import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { createClient } from "@/lib/supabase/server";

export interface Worker {
  id: string;
  name: string;
  created_at: string;
}

export const workersRouter = createTRPCRouter({
  getAll: publicProcedure.query(async () => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return (data ?? []) as Worker[];
  }),

  create: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('workers')
        .insert({ name: input.name })
        .select()
        .single();

      if (error) throw error;
      return data as Worker;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const supabase = await createClient();
      const { error } = await supabase
        .from('workers')
        .delete()
        .eq('id', input.id);

      if (error) throw error;
      return { success: true };
    }),
});
