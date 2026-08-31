/**
 * CampaignDetail - how one calling batch performed, and what happened to each person.
 *
 * Deliberately tiles and a table rather than charts: every number here is a
 * single headline value, and a batch is tens of rows, not a time series. A chart
 * would add decoration without adding an answer.
 *
 * Outcome is always shown as a labelled word with its dot, never colour alone,
 * so it survives colourblindness, greyscale printing and a screenshot in a chat.
 */
'use client';

import { useState } from 'react';
import { api } from '@/trpc/react';
import { formatAuNumber } from '@/lib/phone';
import { OUTCOME_LABELS, type CallOutcome } from '@/lib/call-outcome';

/** Status colours, reserved for outcome and never reused as category colours. */
const OUTCOME_DOT: Record<CallOutcome, string> = {
  answered: 'bg-[#1a9e4e]',
  no_answer: 'bg-slate-400',
  voicemail: 'bg-amber-400',
  busy: 'bg-amber-500',
  failed: 'bg-red-400',
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function duration(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '-';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function hourLabel(h: number | null): string {
  if (h === null) return '-';
  const suffix = h < 12 ? 'am' : 'pm';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${suffix}`;
}

/** One headline number. Value in ink, never in a series colour. */
function Tile({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="px-3 py-2.5 rounded-lg bg-white border border-(--color-border-subtle)">
      <p className="text-lg font-semibold text-(--color-text-primary) leading-none">{value}</p>
      <p className="text-[11px] text-(--color-text-muted) mt-1.5">{label}</p>
      {hint && <p className="text-[10px] text-(--color-text-faint) mt-0.5">{hint}</p>}
    </div>
  );
}

export function CampaignDetail({ batchId }: { batchId: string }) {
  const [openRow, setOpenRow] = useState<string | null>(null);

  const { data: calls = [], isLoading: callsLoading } = api.outboundCalls.listBatchCalls.useQuery({ batchId });
  const { data: stats, isLoading: statsLoading } = api.outboundCalls.getBatchStats.useQuery({ batchId });

  if (callsLoading || statsLoading) {
    return <p className="text-xs text-(--color-text-muted)">Loading results...</p>;
  }

  return (
    <div className="space-y-4">
      {stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <Tile
              value={pct(stats.pickupRate)}
              label="Pick-up rate"
              hint={`${stats.answered} of ${stats.answered + stats.noAnswer + stats.voicemail + stats.busy} reached`}
            />
            <Tile
              value={pct(stats.engagementRate)}
              label="Engaged"
              hint="pickups over 30s"
            />
            <Tile value={duration(stats.avgDurationSeconds)} label="Avg call" hint={`longest ${duration(stats.longestDurationSeconds)}`} />
            <Tile value={duration(stats.totalTalkSeconds)} label="Total talk time" />
            <Tile
              value={stats.totalCost > 0 ? `$${stats.totalCost.toFixed(2)}` : '-'}
              label="Cost"
              hint={stats.answered > 0 ? `$${stats.costPerPickup.toFixed(2)} per pick-up` : undefined}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-(--color-text-muted)">
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${OUTCOME_DOT.answered}`} />
              {stats.answered} picked up
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${OUTCOME_DOT.no_answer}`} />
              {stats.noAnswer} no answer
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${OUTCOME_DOT.voicemail}`} />
              {stats.voicemail} voicemail
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${OUTCOME_DOT.busy}`} />
              {stats.busy} busy
            </span>
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${OUTCOME_DOT.failed}`} />
              {stats.failed} failed
            </span>
            {stats.awaitingResult > 0 && (
              <span className="text-(--color-text-faint)">{stats.awaitingResult} awaiting result</span>
            )}
            {stats.transferred > 0 && <span>{stats.transferred} transferred to Ali</span>}
            {stats.bestHour !== null && <span>most pick-ups around {hourLabel(stats.bestHour)}</span>}
            <span>
              SMS {stats.smsSent} sent
              {stats.smsFailed > 0 && <span className="text-red-500"> · {stats.smsFailed} failed</span>}
            </span>
          </div>
        </>
      )}

      {/* Per-person results */}
      <div className="rounded-lg border border-(--color-border-subtle) bg-white overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-(--color-border-subtle)">
              <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-(--color-text-faint)">Number</th>
              <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-(--color-text-faint)">Outcome</th>
              <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-(--color-text-faint)">Length</th>
              <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-(--color-text-faint)">SMS</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border-subtle)">
            {calls.map((c) => {
              const isOpen = openRow === c.id;
              const hasDetail = !!(c.summary ?? c.transcript ?? c.recording_url ?? c.error ?? c.sms_error);
              return (
                <tr key={c.id} className="align-top">
                  <td className="px-3 py-2" colSpan={isOpen ? 5 : 1}>
                    <span className="text-xs font-mono text-(--color-text-primary)">
                      {formatAuNumber(c.phone_number)}
                    </span>

                    {isOpen && (
                      <div className="mt-2 space-y-2 pb-1">
                        {c.summary && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-(--color-text-faint) mb-0.5">Summary</p>
                            <p className="text-xs text-(--color-text-secondary)">{c.summary}</p>
                          </div>
                        )}
                        {c.transcript && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-(--color-text-faint) mb-0.5">Transcript</p>
                            <pre className="text-[11px] text-(--color-text-secondary) whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                              {c.transcript}
                            </pre>
                          </div>
                        )}
                        {c.recording_url && (
                          <a
                            href={c.recording_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-600 hover:underline inline-block"
                          >
                            Listen to the recording
                          </a>
                        )}
                        {c.ended_reason && (
                          <p className="text-[11px] text-(--color-text-faint) font-mono">ended: {c.ended_reason}</p>
                        )}
                        {c.error && <p className="text-[11px] text-red-500">{c.error}</p>}
                        {c.sms_error && <p className="text-[11px] text-red-500">SMS failed: {c.sms_error}</p>}
                        <button
                          onClick={() => setOpenRow(null)}
                          className="text-[11px] text-(--color-text-muted) hover:underline"
                        >
                          Close
                        </button>
                      </div>
                    )}
                  </td>

                  {!isOpen && (
                    <>
                      <td className="px-3 py-2">
                        {c.outcome ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-(--color-text-secondary)">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${OUTCOME_DOT[c.outcome]}`} />
                            {OUTCOME_LABELS[c.outcome]}
                          </span>
                        ) : (
                          <span className="text-xs text-(--color-text-faint)">
                            {c.status === 'dialled' ? 'Ringing / awaiting result' : c.status === 'failed' ? 'Not called' : 'Waiting'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-(--color-text-muted)">{duration(c.duration_seconds)}</td>
                      <td className="px-3 py-2 text-xs">
                        {c.sms_sent_at ? (
                          <span className="text-(--color-text-muted)">Sent</span>
                        ) : c.sms_error ? (
                          <span className="text-red-500">Failed</span>
                        ) : (
                          <span className="text-(--color-text-faint)">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {hasDetail && (
                          <button
                            onClick={() => setOpenRow(c.id)}
                            className="text-[11px] text-(--color-text-muted) hover:text-(--color-text-primary) hover:underline"
                          >
                            Details
                          </button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
