/**
 * WhatsApp Broadcast page — compose and send text messages or images to one or more
 * WhatsApp groups across multiple accounts (aiit-automation, susu-closets, etc.).
 * Groups are loaded from Supabase; a "Refresh groups" button triggers a Make.com sync.
 * Messages with images are forwarded as multipart via /api/whatsapp/send so Make.com
 * receives the binary file. Supports scheduled sends and logs every broadcast to Supabase.
 */
/**
 * WhatsApp Broadcast page at /automations/whatsapp-groups.
 * Allows composing a text/image message and sending it immediately or scheduling it
 * for later delivery to selected WhatsApp groups, scoped to a chosen account
 * (aiit-automation, susu-closets, etc.). Groups are loaded from Supabase and can be
 * refreshed on demand via the WhatsApp sync mutation. Each broadcast is logged to
 * Supabase for history. Image sends are routed through /api/whatsapp/send to forward
 * multipart form data to the Make.com webhook.
 */
'use client';

import { useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { api } from '@/trpc/react';
import toast from 'react-hot-toast';
import { GroupSelector } from '@/components/modules/whatsapp-groups/GroupSelector';
import { ScheduleModal } from '@/components/modules/whatsapp-groups/ScheduleModal';
import { ScheduledList } from '@/components/modules/whatsapp-groups/ScheduledList';
import { BroadcastHistory } from '@/components/modules/whatsapp-groups/BroadcastHistory';
import { WHATSAPP_ACCOUNTS } from '@/lib/config/whatsapp-accounts';
import type { WhatsAppAccountId } from '@/lib/config/whatsapp-accounts';

type SendStatus = 'idle' | 'pending' | 'success' | 'error';

// Per-group client results no longer exist (sends run server-side); GroupSelector
// still accepts the map so pass a stable empty one.
const EMPTY_SEND_RESULTS = new Map<string, SendStatus>();

const MAX_CHARS = 1000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function WhatsAppBroadcastPage() {
  const [activeAccount, setActiveAccount] = useState<WhatsAppAccountId>('aiit-automation');
  const [message, setMessage] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleCreatedBump, setScheduleCreatedBump] = useState(0);
  const [broadcastHistoryBump, setBroadcastHistoryBump] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAccountSwitch = useCallback((id: WhatsAppAccountId) => {
    setActiveAccount(id);
    setMessage('');
    setImage(null);
    setImagePreview(null);
    setSelectedIds(new Set());
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // Groups are loaded from Supabase DB — fast on every page load
  const {
    data: groups = [],
    isLoading: groupsLoading,
    isError: groupsError,
    error: groupsErrorMsg,
    refetch: refetchGroups,
  } = api.whatsapp.getGroups.useQuery(
    { accountId: activeAccount },
    { staleTime: 5 * 60 * 1000 },
  );

  const syncMutation = api.whatsapp.syncGroups.useMutation({
    onSuccess: (result) => {
      const label = result.synced !== null ? `Synced ${result.synced} groups from WhatsApp` : 'Groups synced from WhatsApp';
      toast.success(label, { duration: 6000 });
      void refetchGroups();
    },
    onError: (err) => toast.error(`Failed to pull groups: ${err.message}`, { duration: 6000 }),
  });

  const isRefreshing = syncMutation.isPending;
  const isLoading = groupsLoading || isRefreshing;

  // Show empty state if DB has no groups yet (first use)
  const notFetchedYet = groups.length === 0 && !groupsLoading && !groupsError;

  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(groups.map((g) => g.id)));
  }, [groups]);

  const handleClearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleRefresh = useCallback(() => {
    setSelectedIds(new Set());
    syncMutation.mutate({ accountId: activeAccount });
  }, [syncMutation, activeAccount]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error('Image must be under 10MB');
      e.target.value = '';
      return;
    }

    setImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleClearImage = useCallback(() => {
    setImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // Queues the whole broadcast in ONE request — the server fans out to Make.com in the
  // background and the history panel below shows live progress. The composer clears as
  // soon as the broadcast is accepted, so the next message can be queued immediately
  // and the tab can safely be closed.
  const handleSend = useCallback(async () => {
    const hasMessage = message.trim().length > 0;
    const hasImage = image !== null;
    if ((!hasMessage && !hasImage) || selectedIds.size === 0 || isSending) return;

    setIsSending(true);
    const ids = Array.from(selectedIds);
    const names = ids.map((id) => groups.find((g) => g.id === id)?.name ?? id);

    try {
      const formData = new FormData();
      formData.append('accountId', activeAccount);
      formData.append('groupIds', JSON.stringify(ids));
      formData.append('groupNames', JSON.stringify(names));
      if (hasMessage) formData.append('message', message.trim());
      if (image) formData.append('file', image, image.name);

      const res = await fetch('/api/whatsapp/broadcast', { method: 'POST', body: formData });
      const json = await res.json().catch(() => ({})) as {
        error?: string;
        intervalMinutes?: number;
        estimatedMinutes?: number;
      };
      if (!res.ok) throw new Error(json.error ?? 'Failed to queue broadcast');

      // Accepted — clear the composer so the next broadcast can be queued right away
      setMessage('');
      setImage(null);
      setImagePreview(null);
      setSelectedIds(new Set());
      if (fileInputRef.current) fileInputRef.current.value = '';
      setBroadcastHistoryBump((n) => n + 1);

      // Groups go out one at a time, spaced apart, so the useful thing to say is
      // how long the whole run takes — not that it has "sent".
      const interval = json.intervalMinutes ?? 15;
      const total = json.estimatedMinutes ?? (ids.length - 1) * interval;
      const duration =
        total < 60
          ? `about ${total} min`
          : `about ${Math.round((total / 60) * 10) / 10} hours`.replace('.0 ', ' ');

      toast.success(
        ids.length === 1
          ? 'Queued — sending now. Safe to close this tab.'
          : `Queued for ${ids.length} groups — one every ${interval} min, ${duration} in total. ` +
            `Safe to close this tab; track it in Broadcast History.`,
        { duration: 9000 },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to queue broadcast', { duration: 7000 });
    } finally {
      setIsSending(false);
    }
  }, [message, image, selectedIds, isSending, activeAccount, groups]);

  const charCount = message.length;
  const charCountColor =
    charCount > 950 ? 'text-red-500' : charCount > 800 ? 'text-amber-500' : 'text-[var(--color-text-faint)]';

  const canSend = (message.trim().length > 0 || image !== null) && selectedIds.size > 0 && !isSending;

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
            <h1 className="text-xl font-semibold text-(--color-text-primary)">WhatsApp Broadcast</h1>
            <p className="text-sm text-(--color-text-muted) mt-0.5">Send messages to your WhatsApp groups</p>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-(--color-border-default) bg-white text-(--color-text-secondary) hover:bg-(--color-bg-hover) hover:border-(--color-border-strong) disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <svg
            className={`${isLoading ? 'animate-spin' : ''}`}
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {isLoading ? 'Refreshing...' : 'Refresh groups'}
        </button>
      </div>

      {/* Account Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-(--color-bg-secondary) border border-(--color-border-subtle) w-fit">
        {WHATSAPP_ACCOUNTS.map((account) => (
          <button
            key={account.id}
            onClick={() => handleAccountSwitch(account.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
              ${activeAccount === account.id
                ? 'bg-white shadow-sm text-(--color-text-primary) border border-(--color-border-subtle)'
                : 'text-(--color-text-muted) hover:text-(--color-text-secondary) hover:bg-(--color-bg-hover)'
              }
            `}
          >
            <span className={`w-2 h-2 rounded-full bg-${account.color}-500 shrink-0`} />
            {account.name}
          </button>
        ))}
      </div>

      {/* Main content - two columns on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-6 items-start">

        {/* Left: Compose */}
        <div className="rounded-xl border border-(--color-border-subtle) bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-(--color-border-subtle)">
            <h2 className="text-sm font-semibold text-(--color-text-primary)">Compose Message</h2>
            <p className="text-xs text-(--color-text-muted) mt-0.5">
              Add a message, image, or both — sent to all selected groups
            </p>
          </div>

          <div className="p-5 space-y-3">
            {/* Textarea */}
            <div className="relative">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_CHARS))}
                placeholder="Type your message here... (optional if sending an image)"
                rows={image ? 6 : 10}
                className="w-full resize-none rounded-lg border border-(--color-border-default) bg-white px-4 py-3 text-sm text-(--color-text-primary) placeholder:text-(--color-text-faint) focus:outline-none focus:border-(--color-accent-primary) focus:ring-2 focus:ring-(--color-accent-primary)/10 transition leading-relaxed"
              />
              <div className={`absolute bottom-3 right-3 text-xs tabular-nums ${charCountColor}`}>
                {charCount}/{MAX_CHARS}
              </div>
            </div>

            {/* Image attachment */}
            {image && imagePreview ? (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-(--color-border-default) bg-(--color-bg-secondary)">
                <Image
                  src={imagePreview}
                  alt="Attachment preview"
                  width={56}
                  height={56}
                  className="w-14 h-14 rounded-md object-cover border border-(--color-border-subtle) shrink-0"
                  unoptimized
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-(--color-text-primary) truncate">{image.name}</p>
                  <p className="text-xs text-(--color-text-muted) mt-0.5">{formatFileSize(image.size)}</p>
                </div>
                <button
                  onClick={handleClearImage}
                  title="Remove image"
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-(--color-text-muted) hover:text-red-500 hover:bg-red-50 transition"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-dashed border-(--color-border-default) hover:border-[#25D366] hover:bg-[#25D366]/5 cursor-pointer transition-all group">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <svg
                  width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="text-(--color-text-muted) group-hover:text-[#25D366] transition shrink-0"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span className="text-xs text-(--color-text-muted) group-hover:text-[#25D366] transition">
                  Attach image <span className="text-(--color-text-faint)">— optional, max 10MB</span>
                </span>
              </label>
            )}

            {/* Send buttons row */}
            <div className="flex gap-2">
              <button
                onClick={handleSend}
                disabled={!canSend}
                className={`
                  flex-1 flex items-center justify-center gap-2.5 py-3 rounded-lg text-sm font-semibold transition-all
                  ${canSend
                    ? 'bg-[#25D366] hover:bg-[#20b858] text-white shadow-sm hover:shadow-md active:scale-[0.98]'
                    : 'bg-(--color-bg-hover) text-(--color-text-faint) cursor-not-allowed border border-(--color-border-subtle)'
                  }
                `}
              >
                {isSending ? (
                  <>
                    <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Queuing...
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    {selectedIds.size > 0
                      ? `Send to ${selectedIds.size} group${selectedIds.size !== 1 ? 's' : ''}`
                      : 'Send now'}
                  </>
                )}
              </button>

              {/* Schedule Send button */}
              <button
                onClick={() => setScheduleModalOpen(true)}
                disabled={!canSend}
                title="Schedule message for later"
                className={`
                  flex items-center justify-center gap-1.5 px-3.5 py-3 rounded-lg text-sm font-semibold transition-all border
                  ${canSend
                    ? 'border-(--color-border-default) text-(--color-text-secondary) hover:bg-(--color-bg-hover) hover:border-(--color-border-strong) active:scale-[0.98]'
                    : 'border-(--color-border-subtle) text-(--color-text-faint) cursor-not-allowed'
                  }
                `}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Schedule
              </button>
            </div>

            {/* Background-send note */}
            <p className="text-xs text-(--color-text-faint) leading-relaxed">
              Sends run in the background — once queued you can compose the next message
              or close this tab. Live progress appears in Broadcast History below.
            </p>
          </div>
        </div>

        {/* Right: Group selector */}
        <div className="rounded-xl border border-(--color-border-subtle) bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-(--color-border-subtle)">
            <h2 className="text-sm font-semibold text-(--color-text-primary)">Select Groups</h2>
            <p className="text-xs text-(--color-text-muted) mt-0.5">Choose which groups to broadcast to</p>
          </div>

          <div className="p-5" style={{ height: '460px', display: 'flex', flexDirection: 'column' }}>
            <GroupSelector
              groups={groups}
              loading={isLoading}
              isError={groupsError}
              errorMessage={groupsErrorMsg?.message}
              notFetchedYet={notFetchedYet}
              selectedIds={selectedIds}
              sendResults={EMPTY_SEND_RESULTS}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              onClearAll={handleClearAll}
              onRefresh={handleRefresh}
            />
          </div>
        </div>
      </div>

      {/* Scheduled messages list */}
      <ScheduledList accountId={activeAccount} onScheduleCreated={scheduleCreatedBump} />

      {/* Broadcast history (immediate sends log) */}
      <BroadcastHistory accountId={activeAccount} refreshBump={broadcastHistoryBump} />

      {/* Schedule modal */}
      <ScheduleModal
        accountId={activeAccount}
        isOpen={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        message={message}
        groupIds={Array.from(selectedIds)}
        groupNames={Array.from(selectedIds).map((id) => groups.find((g) => g.id === id)?.name ?? id)}
        onSuccess={() => setScheduleCreatedBump((n) => n + 1)}
      />
    </div>
  );
}
