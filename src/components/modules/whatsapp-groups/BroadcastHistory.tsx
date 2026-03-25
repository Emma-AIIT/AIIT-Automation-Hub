/**
 * BroadcastHistory - Paginated history of sent WhatsApp broadcast messages.
 * Fetches broadcast log entries for a given WhatsApp account via tRPC and displays
 * each entry's timestamp (Sydney timezone), target groups, message preview, and delivery status.
 */
'use client';

import { useState } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { api } from '@/trpc/react';
import type { BroadcastLogEntry } from '@/server/api/routers/whatsapp';
import type { WhatsAppAccountId } from '@/lib/config/whatsapp-accounts';

const SYDNEY_TZ = 'Australia/Sydney';

function formatSydneyTime(isoString: string): string {
  return formatInTimeZone(new Date(isoString), SYDNEY_TZ, "EEE d MMM · h:mm a zzz");
}

const STATUS_STYLES: Record<BroadcastLogEntry['status'], { dot: string; label: string; badge: string }> = {
  sent:    { dot: 'bg-[#25D366]', label: 'Sent',    badge: 'bg-[#25D366]/8 text-[#1a9e4e] border-[#25D366]/20' },
  failed:  { dot: 'bg-red-400',   label: 'Failed',  badge: 'bg-red-50 text-red-600 border-red-200' },
  partial: { dot: 'bg-amber-400', label: 'Partial', badge: 'bg-amber-50 text-amber-600 border-amber-200' },
};

interface BroadcastHistoryProps {
  accountId: WhatsAppAccountId;
  refreshBump?: number; // bump to trigger a refetch after a new send
}

export function BroadcastHistory({ accountId, refreshBump }: BroadcastHistoryProps) {
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const { data: history = [], isLoading, refetch } = api.whatsapp.listBroadcastHistory.useQuery(
    { accountId },
    { refetchInterval: 60_000 },
  );

  // Refetch when parent signals a new broadcast just completed
  const prevBump = { current: refreshBump };
  if (prevBump.current !== refreshBump) {
    void refetch();
    prevBump.current = refreshBump;
  }

  const toggleError = (id: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroups = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-(--color-border-subtle) bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-(--color-border-subtle) flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-(--color-text-primary)">Broadcast History</h2>
            {history.length > 0 && (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-(--color-bg-secondary) text-(--color-text-muted) border border-(--color-border-subtle)">
                {history.length}
              </span>
            )}
          </div>
          <p className="text-xs text-(--color-text-muted) mt-0.5">Log of messages sent immediately from this page</p>
        </div>
        <button
          onClick={() => void refetch()}
          disabled={isLoading}
          className="p-1.5 rounded-lg text-(--color-text-muted) hover:text-(--color-text-primary) hover:bg-(--color-bg-hover) transition disabled:opacity-40"
          title="Refresh"
        >
          <svg
            className={isLoading ? 'animate-spin' : ''}
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="px-5 py-8 flex items-center justify-center">
          <svg className="animate-spin text-(--color-text-muted)" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
      ) : history.length === 0 ? (
        <div className="px-5 py-10 flex flex-col items-center gap-2 text-center">
          <div className="w-10 h-10 rounded-full bg-(--color-bg-secondary) flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-(--color-text-faint)">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </div>
          <p className="text-sm text-(--color-text-muted)">No broadcasts sent yet</p>
          <p className="text-xs text-(--color-text-faint)">Sent messages will appear here</p>
        </div>
      ) : (
        <div className="divide-y divide-(--color-border-subtle)">
          {history.map((entry) => {
            const style = STATUS_STYLES[entry.status];
            const hasError = !!entry.make_error;
            const isErrorExpanded = expandedErrors.has(entry.id);
            const isGroupsExpanded = expandedGroups.has(entry.id);
            const hasMoreGroups = entry.group_names.length > 2;

            // Message preview
            let preview = '';
            if (entry.message) {
              preview = entry.message.length > 70
                ? entry.message.slice(0, 70) + '…'
                : entry.message;
            }

            // Group label (first 2 groups + overflow count as clickable button)
            const groupSummary = entry.group_names.slice(0, 2).join(', ');

            return (
              <div key={entry.id} className="px-5 py-3.5 hover:bg-(--color-bg-secondary) transition-colors">
                <div className="flex items-start gap-3">
                  {/* Status dot */}
                  <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${style.dot}`} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Message or file indicator */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {entry.has_file && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-(--color-text-muted) bg-(--color-bg-secondary) border border-(--color-border-subtle) rounded px-1.5 py-0.5 shrink-0">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                          {entry.file_name ?? 'Image'}
                        </span>
                      )}
                      {preview ? (
                        <p className="text-sm text-(--color-text-primary) leading-snug">{preview}</p>
                      ) : !entry.has_file ? (
                        <p className="text-sm text-(--color-text-faint) italic">No message text</p>
                      ) : null}
                    </div>

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                      <span className="text-xs text-(--color-text-muted)">
                        {groupSummary}
                        {hasMoreGroups && (
                          <>
                            {', '}
                            <button
                              onClick={() => toggleGroups(entry.id)}
                              className="text-xs text-(--color-text-faint) hover:text-(--color-text-muted) hover:underline transition"
                            >
                              {isGroupsExpanded
                                ? 'show less'
                                : `+${entry.group_names.length - 2} more`}
                            </button>
                          </>
                        )}
                      </span>
                      <span className="text-xs text-(--color-text-faint)">·</span>
                      <span className="text-xs text-(--color-text-muted)">
                        {formatSydneyTime(entry.sent_at)}
                      </span>

                      {/* Sent/failed counts (for partial) */}
                      {entry.status === 'partial' && (
                        <>
                          <span className="text-xs text-(--color-text-faint)">·</span>
                          <span className="text-xs text-[#1a9e4e]">{entry.sent_count} sent</span>
                          <span className="text-xs text-red-500">{entry.failed_count} failed</span>
                        </>
                      )}

                      {/* Error toggle */}
                      {hasError && (
                        <>
                          <span className="text-xs text-(--color-text-faint)">·</span>
                          <button
                            onClick={() => toggleError(entry.id)}
                            className="text-xs text-red-500 hover:text-red-600 hover:underline transition"
                          >
                            {isErrorExpanded ? 'Hide error' : 'Show error'}
                          </button>
                        </>
                      )}
                    </div>

                    {/* Expanded group list */}
                    {hasMoreGroups && isGroupsExpanded && (
                      <div className="mt-2 p-2.5 rounded-lg bg-(--color-bg-secondary) border border-(--color-border-subtle)">
                        <p className="text-[11px] font-medium text-(--color-text-muted) mb-1.5">
                          All {entry.group_names.length} groups
                        </p>
                        <ul className="space-y-0.5">
                          {entry.group_names.map((name, i) => (
                            <li key={i} className="text-xs text-(--color-text-primary) flex items-center gap-1.5">
                              <span className="w-1 h-1 rounded-full bg-(--color-text-faint) shrink-0" />
                              {name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Expanded error detail */}
                    {hasError && isErrorExpanded && (
                      <div className="mt-2 p-2.5 rounded-lg bg-red-50 border border-red-100">
                        <p className="text-xs font-medium text-red-600 mb-0.5">Make.com error</p>
                        <p className="text-xs text-red-500 font-mono break-words leading-relaxed">
                          {entry.make_error}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right: badge + counts */}
                  <div className="shrink-0 flex items-center gap-2">
                    {/* Group count chip */}
                    <span className="text-[11px] text-(--color-text-faint)">
                      {entry.group_ids.length} {entry.group_ids.length === 1 ? 'group' : 'groups'}
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
