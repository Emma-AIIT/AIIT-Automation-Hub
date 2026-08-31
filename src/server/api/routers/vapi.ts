/**
 * vapi router
 *
 * Fetches call data and metrics directly from the VAPI REST API.
 * All data is live — nothing is cached in Supabase. Results reflect the
 * current state of the VAPI account at query time.
 *
 * VAPI API key is required (VAPI_API_KEY env var). All procedures will throw
 * if the key is missing.
 *
 * Note: VAPI call recording URLs expire after 30 days. Download to Supabase
 * Storage if long-term retention is needed.
 */
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { env } from "~/env";
import type { VapiCall, VapiAssistant, VapiPhoneNumber } from "@/types/vapi";
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

interface DailyMetric {
  date: string;
  calls: number;
  cost: number;
}

export const vapiRouter = createTRPCRouter({
  // Fetches up to 1000 calls from VAPI and aggregates them into per-day call counts and cost.
  // Used to power the VapiMetricsChart on the Voice Agents page.
  getDailyMetrics: publicProcedure
    .input(z.object({
      days: z.number().default(30),
    }))
    .query(async ({ input }) => {
      const now = new Date();
      const dateFrom = new Date(now.getTime() - input.days * 24 * 60 * 60 * 1000);
      const params = new URLSearchParams();
      params.set('createdAtGt', dateFrom.toISOString());
      params.set('createdAtLt', now.toISOString());
      params.set('limit', '1000');

      const calls = await vapiRequest<VapiCall[]>(`/call?${params.toString()}`);

      const dailyMap = new Map<string, { calls: number; cost: number }>();

      // Initialize all days
      for (let i = 0; i < input.days; i++) {
        const d = new Date(dateFrom.getTime() + i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().split('T')[0]!;
        dailyMap.set(key, { calls: 0, cost: 0 });
      }

      // Aggregate calls by day
      for (const call of calls) {
        if (!call.startedAt) continue;
        const d = new Date(call.startedAt);
        if (Number.isNaN(d.getTime())) continue;
        const key = d.toISOString().split('T')[0]!;
        const entry = dailyMap.get(key);
        if (entry) {
          entry.calls += 1;
          entry.cost += call.cost ?? 0;
        }
      }

      const metrics: DailyMetric[] = Array.from(dailyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({ date, calls: data.calls, cost: data.cost }));

      const totalCalls = calls.length;
      const totalCost = calls.reduce((sum, c) => sum + (c.cost ?? 0), 0);

      return { metrics, totalCalls, totalCost };
    }),

  // The VAPI numbers calls can be placed FROM. The Outbound Calls page needs the
  // phoneNumberId (not the digits) because that is what POST /call expects.
  getPhoneNumbers: publicProcedure.query(async () => {
    const numbers = await vapiRequest<VapiPhoneNumber[]>('/phone-number');
    return numbers.map((n) => ({
      id: n.id,
      number: n.number ?? '',
      name: n.name ?? n.number ?? n.id,
    }));
  }),

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
