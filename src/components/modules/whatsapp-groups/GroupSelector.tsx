/**
 * GroupSelector - Multi-select list of WhatsApp groups with a compose area for sending broadcasts.
 * Supports search filtering, select-all toggling, and message composition; triggers an
 * immediate send mutation via the parent-supplied onSend callback with selected group IDs and message text.
 */
'use client';

import { useState, useMemo } from 'react';
import type { WhatsAppGroup } from '@/server/api/routers/whatsapp';

type SendStatus = 'idle' | 'pending' | 'success' | 'error';

interface GroupSelectorProps {
  groups: WhatsAppGroup[];
  loading: boolean;
  isError: boolean;
  errorMessage?: string;
  notFetchedYet: boolean;
  selectedIds: Set<string>;
  sendResults: Map<string, SendStatus>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onRefresh: () => void;
}

export function GroupSelector({
  groups,
  loading,
  isError,
  errorMessage,
  notFetchedYet,
  selectedIds,
  sendResults,
  onToggle,
  onSelectAll,
  onClearAll,
  onRefresh,
}: GroupSelectorProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q));
  }, [groups, search]);

  const selectedCount = selectedIds.size;
  const totalCount = groups.length;

  return (
    <div className="flex flex-col h-full">
      {/* Search + bulk actions */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text-faint)"
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-(--color-border-default) bg-white text-(--color-text-primary) placeholder:text-(--color-text-faint) focus:outline-none focus:border-(--color-accent-primary) focus:ring-2 focus:ring-(--color-accent-primary)/10 transition"
          />
        </div>
        <button
          onClick={onSelectAll}
          disabled={loading || totalCount === 0}
          className="shrink-0 text-xs font-medium text-(--color-accent-primary) hover:text-(--color-accent-hover) disabled:opacity-40 disabled:cursor-not-allowed transition px-1"
        >
          All
        </button>
        <span className="text-(--color-text-faint) text-xs">·</span>
        <button
          onClick={onClearAll}
          disabled={loading || selectedCount === 0}
          className="shrink-0 text-xs font-medium text-(--color-text-muted) hover:text-(--color-text-secondary) disabled:opacity-40 disabled:cursor-not-allowed transition px-1"
        >
          Clear
        </button>
      </div>

      {/* Group list */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 min-h-0">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg animate-skeleton-shimmer" />
          ))
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg className="text-red-400 mb-3" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm font-medium text-(--color-text-primary)">Failed to load groups</p>
            <p className="text-xs text-(--color-text-muted) mt-1 max-w-[220px]">
              {errorMessage ?? 'Check that the webhook URL is configured in your .env file'}
            </p>
            <button
              onClick={onRefresh}
              className="mt-3 text-xs font-medium text-(--color-accent-primary) hover:underline"
            >
              Try again
            </button>
          </div>
        ) : notFetchedYet ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-10 h-10 rounded-full bg-[#25D366]/10 flex items-center justify-center mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-(--color-text-primary)">No groups loaded</p>
            <p className="text-xs text-(--color-text-muted) mt-1">Click Refresh groups to fetch your WhatsApp groups</p>
            <button
              onClick={onRefresh}
              className="mt-3 text-xs font-medium text-(--color-accent-primary) hover:underline"
            >
              Load groups
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg className="text-(--color-text-faint) mb-3" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <p className="text-sm text-(--color-text-muted)">No groups match your search</p>
            <button
              onClick={() => setSearch('')}
              className="mt-2 text-xs text-(--color-accent-primary) hover:underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          filtered.map((group) => {
            const isSelected = selectedIds.has(group.id);
            const status = sendResults.get(group.id) ?? 'idle';

            return (
              <button
                key={group.id}
                onClick={() => onToggle(group.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all duration-150
                  ${isSelected
                    ? 'border-[#25D366]/40 bg-[#25D366]/5 shadow-sm'
                    : 'border-(--color-border-subtle) bg-white hover:border-(--color-border-default) hover:bg-(--color-bg-hover)'
                  }
                `}
              >
                {/* Checkbox */}
                <div
                  className={`
                    shrink-0 w-4 h-4 rounded flex items-center justify-center border transition-all
                    ${isSelected
                      ? 'bg-[#25D366] border-[#25D366]'
                      : 'border-(--color-border-default) bg-white'
                    }
                  `}
                >
                  {isSelected && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>

                {/* Group avatar */}
                <div className="shrink-0 w-7 h-7 rounded-full bg-[#25D366]/10 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>

                {/* Name + ID */}
                <div className="flex-1 min-w-0">
                  <span className={`block text-sm truncate text-(--color-text-primary) ${isSelected ? 'font-medium' : ''}`}>
                    {group.name}
                  </span>
                  <span className="block text-[11px] text-(--color-text-faint) truncate">
                    {group.id}
                  </span>
                </div>

                {/* Send status indicator */}
                {status === 'success' && (
                  <svg className="shrink-0 text-[#25D366]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                {status === 'error' && (
                  <svg className="shrink-0 text-red-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}
                {status === 'pending' && (
                  <svg className="shrink-0 text-(--color-text-faint) animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Footer count */}
      {!loading && totalCount > 0 && (
        <div className="pt-3 mt-3 border-t border-(--color-border-subtle) flex items-center justify-between">
          <span className="text-xs text-(--color-text-muted)">
            {selectedCount > 0
              ? `${selectedCount} of ${totalCount} selected`
              : `${totalCount} groups available`}
          </span>
          {selectedCount > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#25D366]" />
              <span className="text-xs font-medium text-[#25D366]">{selectedCount} ready</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
