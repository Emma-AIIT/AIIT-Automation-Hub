'use client';

import { useState, useCallback } from 'react';
import { api } from '@/trpc/react';
import toast from 'react-hot-toast';
import { GroupSelector } from '@/components/modules/whatsapp-groups/GroupSelector';

type SendStatus = 'idle' | 'pending' | 'success' | 'error';

const MAX_CHARS = 1000;

export default function WhatsAppBroadcastPage() {
  const [message, setMessage] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sendResults, setSendResults] = useState<Map<string, SendStatus>>(new Map());
  const [isSending, setIsSending] = useState(false);

  const {
    data: groups = [],
    isLoading: groupsLoading,
    isError: groupsError,
    error: groupsErrorMsg,
    refetch: refetchGroups,
    isRefetching,
    isFetched,
  } = api.whatsapp.getGroups.useQuery(undefined, {
    enabled: false, // only fires when user clicks Refresh
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const sendMutation = api.whatsapp.sendMessage.useMutation();

  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(groups.map((g) => g.id)));
  }, [groups]);

  const handleClearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleRefresh = useCallback(async () => {
    setSelectedIds(new Set());
    setSendResults(new Map());
    await refetchGroups();
  }, [refetchGroups]);

  const handleSend = useCallback(async () => {
    if (!message.trim() || selectedIds.size === 0 || isSending) return;

    setIsSending(true);
    const ids = Array.from(selectedIds);
    const results = new Map<string, SendStatus>();
    ids.forEach((id) => results.set(id, 'pending'));
    setSendResults(new Map(results));

    let successCount = 0;
    let errorCount = 0;

    for (const chatId of ids) {
      try {
        await sendMutation.mutateAsync({ chatId, message: message.trim() });
        results.set(chatId, 'success');
        successCount++;
      } catch {
        results.set(chatId, 'error');
        errorCount++;
      }
      setSendResults(new Map(results));
    }

    setIsSending(false);

    if (errorCount === 0) {
      toast.success(`Message sent to ${successCount} group${successCount !== 1 ? 's' : ''}`);
    } else if (successCount === 0) {
      toast.error(`Failed to send to all ${errorCount} groups`);
    } else {
      toast(`Sent to ${successCount}, failed for ${errorCount}`, { icon: '⚠️' });
    }
  }, [message, selectedIds, isSending, sendMutation]);

  const charCount = message.length;
  const charCountColor =
    charCount > 950 ? 'text-red-500' : charCount > 800 ? 'text-amber-500' : 'text-[var(--color-text-faint)]';

  const canSend = message.trim().length > 0 && selectedIds.size > 0 && !isSending;
  const isLoading = groupsLoading || isRefetching;

  const hasSendResults = sendResults.size > 0;

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#25D366]/10 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">WhatsApp Broadcast</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Send messages to your WhatsApp groups</p>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-[var(--color-border-default)] bg-white text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-border-strong)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <svg
            className={`${isLoading ? 'animate-spin' : ''}`}
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {isLoading ? 'Loading...' : 'Refresh groups'}
        </button>
      </div>

      {/* Main content - two columns on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-6 items-start">

        {/* Left: Compose */}
        <div className="rounded-xl border border-[var(--color-border-subtle)] bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-subtle)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Compose Message</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">This message will be sent to all selected groups</p>
          </div>

          <div className="p-5 space-y-4">
            <div className="relative">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_CHARS))}
                placeholder="Type your message here..."
                rows={10}
                className="w-full resize-none rounded-lg border border-[var(--color-border-default)] bg-white px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-2 focus:ring-[var(--color-accent-primary)]/10 transition leading-relaxed"
              />
              <div className={`absolute bottom-3 right-3 text-xs tabular-nums ${charCountColor}`}>
                {charCount}/{MAX_CHARS}
              </div>
            </div>

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={`
                w-full flex items-center justify-center gap-2.5 py-3 rounded-lg text-sm font-semibold transition-all
                ${canSend
                  ? 'bg-[#25D366] hover:bg-[#20b858] text-white shadow-sm hover:shadow-md active:scale-[0.98]'
                  : 'bg-[var(--color-bg-hover)] text-[var(--color-text-faint)] cursor-not-allowed border border-[var(--color-border-subtle)]'
                }
              `}
            >
              {isSending ? (
                <>
                  <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Sending...
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  {selectedIds.size > 0
                    ? `Send to ${selectedIds.size} group${selectedIds.size !== 1 ? 's' : ''}`
                    : 'Select groups to send'}
                </>
              )}
            </button>

            {/* Send summary */}
            {hasSendResults && !isSending && (
              <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-4 py-3">
                <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">Last send results</p>
                <div className="flex items-center gap-4">
                  {(() => {
                    const successCount = Array.from(sendResults.values()).filter((s) => s === 'success').length;
                    const errorCount = Array.from(sendResults.values()).filter((s) => s === 'error').length;
                    return (
                      <>
                        {successCount > 0 && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-[#25D366]" />
                            <span className="text-xs text-[var(--color-text-secondary)]">{successCount} sent</span>
                          </div>
                        )}
                        {errorCount > 0 && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-red-400" />
                            <span className="text-xs text-[var(--color-text-secondary)]">{errorCount} failed</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Group selector */}
        <div className="rounded-xl border border-[var(--color-border-subtle)] bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-subtle)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Select Groups</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Choose which groups to broadcast to</p>
          </div>

          <div className="p-5" style={{ height: '460px', display: 'flex', flexDirection: 'column' }}>
            <GroupSelector
              groups={groups}
              loading={isLoading}
              isError={groupsError}
              errorMessage={groupsErrorMsg?.message}
              notFetchedYet={!isFetched}
              selectedIds={selectedIds}
              sendResults={sendResults}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              onClearAll={handleClearAll}
              onRefresh={handleRefresh}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
