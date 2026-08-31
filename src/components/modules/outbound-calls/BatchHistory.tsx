/**
 * BatchHistory - live status of outbound calling batches.
 * Polls every 4s while a batch is queued or dialling so progress counts up, then
 * settles to a slow refresh. Expanding a batch lists every number with its own
 * outcome and VAPI call id.
 */
'use client';

import { useState, useEffect } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { api } from '@/trpc/react';
import { formatAuNumber } from '@/lib/phone';
import type { CallBatch } from '@/server/api/routers/outboundCalls';

const SYDNEY_TZ = 'Australia/Sydney';

const STATUS_STYLES: Record<CallBatch['status'], { dot: string; label: string; badge: string }> = {
  queued:      { dot: 'bg-sky-400 animate-pulse',  label: 'Queued',      badge: 'bg-sky-50 text-sky-600 border-sky-200' },
  dialling:    { dot: 'bg-sky-500 animate-pulse',  label: 'Dialling...', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  completed:   { dot: 'bg-[#25D366]',              label: 'Completed',   badge: 'bg-[#25D366]/8 text-[#1a9e4e] border-[#25D366]/20' },
  partial:     { dot: 'bg-amber-400',              label: 'Partial',     badge: 'bg-amber-50 text-amber-600 border-amber-200' },
  failed:      { dot: 'bg-red-400',                label: 'Failed',      badge: 'bg-red-50 text-red-600 border-red-200' },
  // Swept by /api/cron/outbound-calls. Grey, not red: the calls that did go out
  // were fine, the batch simply never finished.
  interrupted: { dot: 'bg-slate-400',              label: 'Interrupted', badge: 'bg-slate-100 text-slate-600 border-slate-300' },
};

const ACTIVE: CallBatch['status'][] = ['queued', 'dialling'];

function BatchDetail({ batchId }: { batchId: string }) {
  const { data: calls = [], isLoading } = api.outboundCalls.listBatchCalls.useQuery({ batchId });

  if (isLoading) return <p className="text-xs text-(--color-text-muted)">Loading numbers...</p>;

  return (
    <ul className="space-y-1">
      {calls.map((c) => (
        <li key={c.id} className="flex items-center gap-2 text-xs">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              c.status === 'dialled' ? 'bg-[#25D366]' : c.status === 'failed' ? 'bg-red-400' : 'bg-sky-400'
            }`}
          />
          <span className="font-mono text-(--color-text-primary)">{formatAuNumber(c.phone_number)}</span>
          <span className="text-(--color-text-faint)">
            {c.status === 'dialled' ? 'called' : c.status === 'failed' ? 'not called' : 'waiting'}
          </span>
          {c.error && <span className="text-red-500 truncate">{c.error}</span>}
        </li>
      ))}
    </ul>
  );
}

export function BatchHistory({ refreshBump }: { refreshBump?: number }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pollFast, setPollFast] = useState(false);

  const { data: batches = [], isLoading, refetch } = api.outboundCalls.listBatches.useQuery(
    { limit: 25 },
    { refetchInterval: pollFast ? 4_000 : 60_000 },
  );

  const hasActive = batches.some((b) => ACTIVE.includes(b.status));
  if (hasActive !== pollFast) setPollFast(hasActive);

  // Refetch when the page signals a batch was just started.
  useEffect(() => {
    if (refreshBump !== undefined && refreshBump > 0) void refetch();
  }, [refreshBump, refetch]);

  return (
    <div className="rounded-xl border border-(--color-border-subtle) bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-(--color-border-subtle)">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-(--color-text-primary)">Call History</h2>
          {batches.length > 0 && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-(--color-bg-secondary) text-(--color-text-muted) border border-(--color-border-subtle)">
              {batches.length}
            </span>
          )}
        </div>
        <p className="text-xs text-(--color-text-muted) mt-0.5">Live status of calls started from this page</p>
      </div>

      {isLoading ? (
        <div className="px-5 py-8 text-sm text-(--color-text-muted)">Loading...</div>
      ) : batches.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-(--color-text-muted)">No calls made yet</p>
          <p className="text-xs text-(--color-text-faint) mt-1">Batches you start will appear here</p>
        </div>
      ) : (
        <div className="divide-y divide-(--color-border-subtle)">
          {batches.map((b) => {
            const style = STATUS_STYLES[b.status];
            const isOpen = expanded === b.id;
            return (
              <div key={b.id} className="px-5 py-3.5">
                <div className="flex items-start gap-3">
                  <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${style.dot}`} />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-(--color-text-primary) font-medium truncate">{b.script_name}</p>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                      <span className="text-xs text-(--color-text-muted)">
                        {b.assistant_name ?? b.assistant_id}
                      </span>
                      {b.from_number && (
                        <>
                          <span className="text-xs text-(--color-text-faint)">·</span>
                          <span className="text-xs text-(--color-text-muted)">from {b.from_number}</span>
                        </>
                      )}
                      <span className="text-xs text-(--color-text-faint)">·</span>
                      <span className="text-xs text-(--color-text-muted)">
                        {formatInTimeZone(new Date(b.created_at), SYDNEY_TZ, 'EEE d MMM · h:mm a')}
                      </span>
                      <span className="text-xs text-(--color-text-faint)">·</span>
                      <button
                        onClick={() => setExpanded(isOpen ? null : b.id)}
                        className="text-xs text-(--color-text-faint) hover:text-(--color-text-muted) hover:underline transition"
                      >
                        {isOpen ? 'hide numbers' : `${b.total_count} numbers`}
                      </button>
                    </div>

                    {b.error && (
                      <p className="mt-2 text-xs text-(--color-text-muted) bg-(--color-bg-secondary) border border-(--color-border-subtle) rounded-lg p-2.5">
                        {b.error}
                      </p>
                    )}

                    {isOpen && (
                      <div className="mt-2 p-2.5 rounded-lg bg-(--color-bg-secondary) border border-(--color-border-subtle)">
                        <BatchDetail batchId={b.id} />
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-[11px] text-(--color-text-faint)">
                      {b.dialled_count}/{b.total_count} called
                    </span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${style.badge}`}>
                      {style.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
