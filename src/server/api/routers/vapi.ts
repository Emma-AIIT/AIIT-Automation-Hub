import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { env } from "~/env";
import type { VapiCall, VapiAssistant } from "@/types/vapi";
import { getEffectiveCallStatus } from "@/lib/vapi-call-status";

const VAPI_BASE_URL = "https://api.vapi.ai";

async function vapiRequest<T>(endpoint: string): Promise<T> {
  const apiKey = env.VAPI_API_KEY;
  if (!apiKey) {
    throw new Error("VAPI_API_KEY is not configured");
  }

  const response = await fetch(`${VAPI_BASE_URL}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`VAPI API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export const vapiRouter = createTRPCRouter({
  getAssistants: publicProcedure.query(async () => {
    const assistants = await vapiRequest<VapiAssistant[]>('/assistant');
    return assistants;
  }),

  getCalls: publicProcedure
    .input(z.object({
      assistantId: z.string().optional(),
      limit: z.number().default(50),
      createdAtGt: z.string().optional(),
      createdAtLt: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const params = new URLSearchParams();
      if (input.assistantId) params.set('assistantId', input.assistantId);
      params.set('limit', String(input.limit));
      if (input.createdAtGt) params.set('createdAtGt', input.createdAtGt);
      if (input.createdAtLt) params.set('createdAtLt', input.createdAtLt);

      const calls = await vapiRequest<VapiCall[]>(`/call?${params.toString()}`);
      return calls;
    }),

  getCallById: publicProcedure
    .input(z.object({ callId: z.string() }))
    .query(async ({ input }) => {
      const call = await vapiRequest<VapiCall>(`/call/${input.callId}`);
      return call;
    }),

  getCallStats: publicProcedure
    .input(z.object({
      assistantId: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const params = new URLSearchParams();
      if (input.assistantId) params.set('assistantId', input.assistantId);
      if (input.dateFrom) params.set('createdAtGt', input.dateFrom);
      if (input.dateTo) params.set('createdAtLt', input.dateTo);
      params.set('limit', '1000');

      const calls = await vapiRequest<VapiCall[]>(`/call?${params.toString()}`);

      const effectiveStatuses = calls.map(c => getEffectiveCallStatus(c));
      const completedCalls = effectiveStatuses.filter(s => s === 'completed').length;
      const failedCalls = effectiveStatuses.filter(s => s === 'failed').length;

      return {
        totalCalls: calls.length,
        completedCalls,
        failedCalls,
        totalCost: calls.reduce((sum, c) => sum + (c.cost ?? 0), 0),
        avgDuration: calls.filter(c => c.endedAt).length > 0
          ? calls.filter(c => c.endedAt).reduce((sum, c) => {
              const duration = new Date(c.endedAt!).getTime() - new Date(c.startedAt).getTime();
              return sum + duration;
            }, 0) / calls.filter(c => c.endedAt).length
          : 0,
      };
    }),
});
