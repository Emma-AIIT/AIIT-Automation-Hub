/**
 * WhatsApp Groups & Participants page at /automations/whatsapp-participants.
 * Shows a searchable list of dashboard groups for the active account, and displays
 * paginated participant phone numbers and names for the selected group. Supports
 * syncing participants from WhatsApp via Make.com, copying numbers to clipboard, and
 * downloading all unique phone numbers across all groups as a .txt file. Contacts with
 * LID/private IDs are flagged as unextractable and excluded from number exports.
 */
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { api } from '@/trpc/react';
import toast from 'react-hot-toast';
import type { DashboardGroup } from '@/server/api/routers/whatsapp';
import { WHATSAPP_ACCOUNTS } from '@/lib/config/whatsapp-accounts';
import type { WhatsAppAccountId } from '@/lib/config/whatsapp-accounts';
import { ParticipantMessageHistory } from '@/components/modules/whatsapp-participants/ParticipantMessageHistory';

const PARTICIPANTS_PAGE_SIZE = 25;
const MAX_CHARS = 1000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB - Make.com webhook limit

type SendStatus = 'pending' | 'success' | 'error';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function WhatsAppParticipantsPage() {
  const [activeAccount, setActiveAccount] = useState<WhatsAppAccountId>('aiit-automation');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [participantPage, setParticipantPage] = useState(1);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendResults, setSendResults] = useState<Map<string, SendStatus>>(new Map());
  const [historyBump, setHistoryBump] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClearImage = useCallback(() => {
    setImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

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

  const handleAccountSwitch = useCallback((id: WhatsAppAccountId) => {
    setActiveAccount(id);
    setSelectedGroupId(null);
    setSearch('');
    setParticipantPage(1);
    setSelectedParticipantIds(new Set());
    setMessage('');
    setImage(null);
    setImagePreview(null);
    setSendResults(new Map());
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const utils = api.useUtils();
  const {
    data: dashboardGroups = [],
    isLoading: groupsLoading,
    isError: groupsError,
    error: groupsErrorMsg,
    refetch: refetchGroups,
  } = api.whatsapp.getDashboardGroups.useQuery(
    { accountId: activeAccount },
    { staleTime: 30 * 1000 },
  );

  const {
    data: participants = [],
    isLoading: participantsLoading,
    refetch: refetchParticipants,
  } = api.whatsapp.getParticipantsByGroupId.useQuery(
    { accountId: activeAccount, groupId: selectedGroupId! },
    { enabled: !!selectedGroupId }
  );

  // When participants load for the selected group, refresh the groups list so Synced / count stay correct
  useEffect(() => {
    if (selectedGroupId && participants.length > 0) {
      void utils.whatsapp.getDashboardGroups.invalidate();
    }
  }, [selectedGroupId, participants.length, utils.whatsapp.getDashboardGroups]);

  // Reset to page 1, clear selection and composer when switching groups or accounts
  useEffect(() => {
    setParticipantPage(1);
    setSelectedParticipantIds(new Set());
    setMessage('');
    setImage(null);
    setImagePreview(null);
    setSendResults(new Map());
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [selectedGroupId, activeAccount]);

  const totalParticipantPages = Math.max(1, Math.ceil(participants.length / PARTICIPANTS_PAGE_SIZE));
  const paginatedParticipants = participants.slice(
    (participantPage - 1) * PARTICIPANTS_PAGE_SIZE,
    participantPage * PARTICIPANTS_PAGE_SIZE
  );

  const selectedGroup = selectedGroupId
    ? dashboardGroups.find((g) => g.group_id === selectedGroupId)
    : null;

  const syncMutation = api.whatsapp.syncParticipants.useMutation({
    onSuccess: (result) => {
      const name =
        result.groupName ??
        (result.groupId && selectedGroup?.group_id === result.groupId ? selectedGroup.group_name : null) ??
        (result.groupId ? `group ${result.groupId}` : null);
      const msg = result.started
        ? name
          ? `Sync started for ${name}. Refresh in a few minutes to see updated participants.`
          : 'Sync started. Refresh in a few minutes to see updated participants.'
        : name
          ? `Synced participants for ${name}`
          : 'Participants sync completed';
      toast.success(msg, { duration: 6000 });
      void refetchGroups();
      if (selectedGroupId) void refetchParticipants();
    },
    onError: (err) =>
      toast.error(err.message ? `Sync failed: ${err.message}` : 'Sync failed', { duration: 8000 }),
  });

  const handleSyncParticipants = useCallback(() => {
    if (!selectedGroupId || !selectedGroup) {
      toast.error('Select a group to sync');
      return;
    }
    toast.success('Sync request sent', { duration: 4000 });
    syncMutation.mutate({ accountId: activeAccount, groupId: selectedGroupId, groupName: selectedGroup.group_name ?? '' });
  }, [selectedGroupId, selectedGroup, syncMutation, activeAccount]);

  const filteredGroups = search.trim()
    ? dashboardGroups.filter(
        (g) =>
          g.group_name.toLowerCase().includes(search.trim().toLowerCase()) ||
          g.group_id.toLowerCase().includes(search.trim().toLowerCase())
      )
    : dashboardGroups;

  const isUnextractable = useCallback((p: { participant_id: string; participant_phone: string }) => {
    return p.participant_id.endsWith('@lid') || !p.participant_phone?.trim();
  }, []);

  const participantsWithNumbers = participants.filter((p) => p.participant_phone?.trim() && p.participant_id.endsWith('@c.us'));
  const unextractableCount = participants.filter((p) => isUnextractable(p)).length;

  // Contacts that can be messaged 1:1 (real @c.us chatId). LID/private contacts are excluded.
  const messageableParticipants = participants.filter(
    (p) => p.participant_id.endsWith('@c.us') && !!p.participant_phone?.trim()
  );

  const toggleParticipant = useCallback((participantId: string) => {
    setSelectedParticipantIds((prev) => {
      const next = new Set(prev);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  }, []);

  const allMessageableSelected =
    messageableParticipants.length > 0 &&
    messageableParticipants.every((p) => selectedParticipantIds.has(p.participant_id));

  const toggleSelectAll = useCallback(() => {
    setSelectedParticipantIds((prev) => {
      const allSelected =
        messageableParticipants.length > 0 &&
        messageableParticipants.every((p) => prev.has(p.participant_id));
      if (allSelected) return new Set();
      return new Set(messageableParticipants.map((p) => p.participant_id));
    });
  }, [messageableParticipants]);

  const selectedRecipients = messageableParticipants
    .filter((p) => selectedParticipantIds.has(p.participant_id))
    .map((p) => ({ chatId: p.participant_id, phone: p.participant_phone, name: p.participant_name }));

  const sendMutation = api.whatsapp.sendParticipantMessage.useMutation();
  const logMutation = api.whatsapp.logParticipantMessage.useMutation();

  // Sends the composed message (and optional image) to each selected participant
  // individually (1:1). Text-only sends go via the sendMessage webhook; image sends are
  // routed through /api/whatsapp/send as multipart so Make.com receives the binary file.
  // Each batch is logged to Supabase (logParticipantMessage) so history updates immediately.
  const handleSendMessages = useCallback(async () => {
    const trimmed = message.trim();
    const hasImage = image !== null;
    if ((!trimmed && !hasImage) || selectedRecipients.length === 0 || isSending) return;

    setIsSending(true);
    const next = new Map<string, SendStatus>();
    selectedRecipients.forEach((r) => next.set(r.chatId, 'pending'));
    setSendResults(new Map(next));

    let successCount = 0;
    let errorCount = 0;
    const makeErrors: string[] = [];

    for (const recipient of selectedRecipients) {
      try {
        if (hasImage) {
          // Send via multipart API route so Make.com receives the file as binary
          const formData = new FormData();
          formData.append('chatId', recipient.chatId);
          formData.append('accountId', activeAccount);
          formData.append('target', 'participant');
          if (trimmed) formData.append('message', trimmed);
          formData.append('file', image, image.name);

          const res = await fetch('/api/whatsapp/send', { method: 'POST', body: formData });
          if (!res.ok) {
            const json = await res.json().catch(() => ({})) as { makeError?: string };
            if (json.makeError && !makeErrors.includes(json.makeError)) makeErrors.push(json.makeError);
            throw new Error(json.makeError ?? 'Failed to send');
          }
        } else {
          await sendMutation.mutateAsync({ accountId: activeAccount, chatId: recipient.chatId, message: trimmed });
        }
        next.set(recipient.chatId, 'success');
        successCount++;
      } catch (err) {
        if (err instanceof Error && err.message && !makeErrors.includes(err.message)) {
          makeErrors.push(err.message);
        }
        next.set(recipient.chatId, 'error');
        errorCount++;
      }
      setSendResults(new Map(next));
    }

    setIsSending(false);

    // Log this batch to Supabase so the history panel updates immediately (mirrors Broadcast)
    const overallStatus = errorCount === 0 ? 'sent' : successCount === 0 ? 'failed' : 'partial';
    logMutation.mutate({
      accountId: activeAccount,
      message: trimmed || undefined,
      recipientIds: selectedRecipients.map((r) => r.chatId),
      recipientPhones: selectedRecipients.map((r) => r.phone),
      recipientNames: selectedRecipients.map((r) => r.name ?? ''),
      hasFile: hasImage,
      fileName: image?.name,
      status: overallStatus,
      makeError: makeErrors.length > 0 ? makeErrors.join('; ') : undefined,
      sentCount: successCount,
      failedCount: errorCount,
    });
    setHistoryBump((n) => n + 1);

    if (errorCount === 0) {
      toast.success(`Message sent to ${successCount} contact${successCount !== 1 ? 's' : ''}`);
      setMessage('');
      setSelectedParticipantIds(new Set());
      handleClearImage();
    } else if (successCount === 0) {
      toast.error(`Failed to send to all ${errorCount} contact${errorCount !== 1 ? 's' : ''}`);
    } else {
      toast(`Sent to ${successCount}, failed for ${errorCount}`, { icon: '⚠️' });
    }
  }, [message, image, selectedRecipients, isSending, sendMutation, logMutation, activeAccount, handleClearImage]);

  const charCount = message.length;
  const charCountColor =
    charCount > 950 ? 'text-red-500' : charCount > 800 ? 'text-amber-500' : 'text-(--color-text-faint)';
  const canSend = (message.trim().length > 0 || image !== null) && selectedRecipients.length > 0 && !isSending;
  const sendSuccessCount = Array.from(sendResults.values()).filter((s) => s === 'success').length;
  const sendErrorCount = Array.from(sendResults.values()).filter((s) => s === 'error').length;

  const handleCopyAllNumbers = useCallback(() => {
    if (participantsWithNumbers.length === 0) {
      toast.error(participants.length === 0 ? 'No participants to copy' : 'No phone numbers to copy (all are LID/private)');
      return;
    }
    const text = participantsWithNumbers.map((p) => p.participant_phone).join('\n');
    void navigator.clipboard.writeText(text).then(
      () => toast.success(`Copied ${participantsWithNumbers.length} number(s) to clipboard`),
      () => toast.error('Failed to copy')
    );
  }, [participantsWithNumbers, participants.length]);

  const isLoading = groupsLoading;
  const syncButtonDisabled = isLoading || !selectedGroupId;
  const noGroupsYet = dashboardGroups.length === 0 && !groupsLoading && !groupsError;

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#25D366]/10 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-(--color-text-primary)">
              WhatsApp Groups & Participants
            </h1>
            <p className="text-sm text-(--color-text-muted) mt-0.5 leading-snug">
              View participants and download numbers for selected groups
            </p>
          </div>
        </div>
        <button
          onClick={handleSyncParticipants}
          disabled={syncButtonDisabled}
          title={!selectedGroupId ? 'Select a group to sync' : undefined}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-(--color-border-default) bg-white text-(--color-text-secondary) hover:bg-(--color-bg-hover) hover:border-(--color-border-strong) disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Sync participants
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

      {/* Two columns: groups list | participants */}
      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 items-start">
        {/* Left: dashboard groups list */}
        <div className="rounded-xl border border-(--color-border-subtle) bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-(--color-border-subtle)">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-(--color-text-muted)">
              Groups
            </h2>
            <p className="text-xs text-(--color-text-secondary) mt-1.5 leading-relaxed">
              Select a group to see participants
            </p>
            <p className="text-xs font-medium text-(--color-text-primary) mt-2 leading-snug" title="Members = group size from WhatsApp. Participants = contacts we've pulled and stored. Some contacts can fail to pull, so counts may be lower than actual.">
              Members = group size · Participants = pulled &amp; stored (counts may be lower if some contacts failed to pull)
            </p>
          </div>
          <div className="p-3 border-b border-(--color-border-subtle)">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text-faint)"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
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
          </div>
          <div className="flex-1 overflow-y-auto min-h-[280px] max-h-[420px] p-3 space-y-1">
            {groupsError ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm font-medium text-(--color-text-primary)">Failed to load groups</p>
                <p className="text-xs text-(--color-text-muted) mt-1">
                  {groupsErrorMsg?.message ?? 'Check your connection'}
                </p>
              </div>
            ) : noGroupsYet ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-(--color-text-muted)">No dashboard groups yet</p>
                <p className="text-xs text-(--color-text-faint) mt-1">
                  Import a CSV or run Sync participants to populate groups
                </p>
              </div>
            ) : groupsLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-(--color-bg-secondary) animate-pulse" />
              ))
            ) : filteredGroups.length === 0 ? (
              <div className="py-8 text-center text-sm text-(--color-text-muted)">
                No groups match your search
              </div>
            ) : (
              filteredGroups.map((group: DashboardGroup) => (
                <button
                  key={group.group_id}
                  onClick={() => setSelectedGroupId(group.group_id)}
                  className={`
                    w-full flex items-start gap-3 px-3 py-3 rounded-lg border text-left transition-all
                    ${
                      selectedGroupId === group.group_id
                        ? 'border-[#25D366]/40 bg-[#25D366]/5'
                        : 'border-(--color-border-subtle) bg-white hover:border-(--color-border-default) hover:bg-(--color-bg-hover)'
                    }
                  `}
                >
                  <div className="shrink-0 w-8 h-8 rounded-full bg-[#25D366]/10 flex items-center justify-center mt-0.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm truncate text-(--color-text-primary) font-medium">
                      {group.group_name}
                    </span>
                    <span className="block text-xs text-(--color-text-muted) mt-0.5 wrap-break-word line-clamp-2">
                      {group.size != null ? `${group.size} members` : group.group_id}
                      {group.participant_count > 0
                        ? ` · ${group.participant_count} participants`
                        : ' · No participants yet'}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
          {/* Download all numbers across all groups for this account */}
          {dashboardGroups.length > 0 && (
            <div className="p-3 border-t border-(--color-border-subtle) bg-(--color-bg-secondary)">
              <a
                href={`/api/whatsapp/download-phones?accountId=${activeAccount}`}
                download
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg bg-[#25D366] text-white hover:bg-[#20b858] transition"
                title="Download unique phone numbers from all groups as a .txt file"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download all numbers (all groups)
              </a>
              <p className="text-xs text-(--color-text-muted) mt-2 leading-relaxed text-center">
                Downloads a <span className="font-medium">.txt file</span> of all unique numbers across every group — no duplicates. Open the file, Select All, then copy &amp; paste wherever you need.
              </p>
            </div>
          )}
        </div>

        {/* Right: participants for selected group */}
        <div className="rounded-xl border border-(--color-border-subtle) bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-(--color-border-subtle) flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-(--color-text-muted)">
                Participants
              </h2>
              <p className="text-xs text-(--color-text-secondary) mt-1.5 leading-relaxed">
                {selectedGroupId
                  ? dashboardGroups.find((g) => g.group_id === selectedGroupId)?.group_name ?? 'Selected group'
                  : 'Select a group to see participants'}
              </p>
            </div>
            {selectedGroupId && participants.length > 0 && (
              <button
                onClick={handleCopyAllNumbers}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-[#25D366] text-white hover:bg-[#20b858] transition"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy all numbers
              </button>
            )}
          </div>
          <div className="flex-1 overflow-auto min-h-[280px]">
            {!selectedGroupId ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <svg
                  className="text-(--color-text-faint) mb-3"
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <p className="text-sm text-(--color-text-muted)">Select a group from the list</p>
              </div>
            ) : participantsLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-lg bg-(--color-bg-secondary) animate-pulse" />
                ))}
              </div>
            ) : participants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-(--color-text-muted)">No participants for this group</p>
                <p className="text-xs text-(--color-text-faint) mt-1">
                  Run Sync participants to pull from WhatsApp, or import a CSV
                </p>
              </div>
            ) : (
              <>
                {unextractableCount > 0 && (
                  <div className="flex items-start gap-3 px-4 py-3 border-b border-amber-200/60 bg-amber-50/70" role="alert">
                    <span className="shrink-0 mt-0.5 w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center" aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <path d="M12 9v4" />
                        <path d="M12 17h.01" />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-amber-900">
                          {unextractableCount} participant{unextractableCount !== 1 ? 's' : ''} without phone numbers
                        </p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-200/70 text-amber-800">
                          LID / private
                        </span>
                      </div>
                      <p className="text-xs mt-0.5 text-amber-700/80 leading-relaxed">
                        These contacts use a WhatsApp private ID and have no extractable phone number. They appear in the list but are excluded from &quot;Copy all numbers&quot;.
                      </p>
                    </div>
                  </div>
                )}
                {selectedParticipantIds.size > 0 && (
                  <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-(--color-border-subtle) bg-[#25D366]/5">
                    <span className="text-sm font-medium text-(--color-text-primary)">
                      {selectedParticipantIds.size} selected
                    </span>
                    <span className="text-xs text-(--color-text-muted)">— compose your message below</span>
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={() => setSelectedParticipantIds(new Set())}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-(--color-border-default) bg-white text-(--color-text-secondary) hover:bg-(--color-bg-hover) transition"
                    >
                      Clear
                    </button>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-(--color-border-subtle) bg-(--color-bg-secondary)">
                        <th className="w-10 py-3 px-4 text-left">
                          <input
                            type="checkbox"
                            checked={allMessageableSelected}
                            ref={(el) => {
                              if (el) {
                                el.indeterminate =
                                  selectedParticipantIds.size > 0 && !allMessageableSelected;
                              }
                            }}
                            onChange={toggleSelectAll}
                            disabled={messageableParticipants.length === 0}
                            className="h-4 w-4 rounded border-(--color-border-default) text-[#25D366] focus:ring-[#25D366] disabled:opacity-40 disabled:cursor-not-allowed align-middle"
                            aria-label="Select all messageable contacts"
                            title={messageableParticipants.length === 0 ? 'No messageable contacts' : 'Select all contacts with a phone number'}
                          />
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-(--color-text-muted)">
                          Phone
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-(--color-text-muted)">
                          Name
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-(--color-text-muted) hidden sm:table-cell">
                          Participant ID
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedParticipants.map((p) => {
                        const unextractable = isUnextractable(p);
                        const messageable = p.participant_id.endsWith('@c.us') && !!p.participant_phone?.trim();
                        const isChecked = selectedParticipantIds.has(p.participant_id);
                        return (
                          <tr
                            key={p.participant_id}
                            className={`border-b border-(--color-border-subtle) hover:bg-(--color-bg-hover) ${isChecked ? 'bg-[#25D366]/5' : ''}`}
                          >
                            <td className="w-10 py-2.5 px-4">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleParticipant(p.participant_id)}
                                disabled={!messageable}
                                className="h-4 w-4 rounded border-(--color-border-default) text-[#25D366] focus:ring-[#25D366] disabled:opacity-40 disabled:cursor-not-allowed align-middle"
                                aria-label={`Select ${p.participant_name?.trim() || p.participant_phone}`}
                                title={messageable ? undefined : 'No phone number — cannot message (LID/private)'}
                              />
                            </td>
                            <td className="py-2.5 px-4 font-mono text-xs tabular-nums">
                              {unextractable ? (
                                <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500/70 dark:bg-red-400/70 shrink-0" aria-hidden />
                                  Could not extract (LID/private)
                                </span>
                              ) : (
                                <span className="text-(--color-text-primary)">{p.participant_phone}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-(--color-text-secondary) leading-relaxed">
                              {unextractable ? (p.participant_name?.trim() || '—') : (p.participant_name ?? '—')}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-xs text-(--color-text-faint) hidden sm:table-cell tabular-nums">
                              {p.participant_id}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {participants.length > PARTICIPANTS_PAGE_SIZE && (
                  <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-(--color-border-subtle) bg-(--color-bg-secondary)">
                    <p className="text-xs text-(--color-text-muted)">
                      Showing {(participantPage - 1) * PARTICIPANTS_PAGE_SIZE + 1}–{Math.min(participantPage * PARTICIPANTS_PAGE_SIZE, participants.length)} of {participants.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setParticipantPage((prev) => Math.max(1, prev - 1))}
                        disabled={participantPage <= 1}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-(--color-border-default) bg-white text-(--color-text-secondary) hover:bg-(--color-bg-hover) disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="text-xs text-(--color-text-muted)">
                        Page {participantPage} of {totalParticipantPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setParticipantPage((prev) => Math.min(totalParticipantPages, prev + 1))}
                        disabled={participantPage >= totalParticipantPages}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-(--color-border-default) bg-white text-(--color-text-secondary) hover:bg-(--color-bg-hover) disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Compose: send a message individually to each selected participant */}
      {selectedGroupId && (
        <div className="rounded-xl border border-(--color-border-subtle) bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-(--color-border-subtle)">
            <h2 className="text-sm font-semibold text-(--color-text-primary)">Compose Message</h2>
            <p className="text-xs text-(--color-text-muted) mt-0.5">
              Add a message, image, or both — sent individually to each selected participant (tick contacts in the table above)
            </p>
          </div>

          <div className="p-5 space-y-3">
            {/* Textarea */}
            <div className="relative">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_CHARS))}
                placeholder="Type your message here... (optional if sending an image)"
                rows={6}
                disabled={isSending}
                className="w-full resize-none rounded-lg border border-(--color-border-default) bg-white px-4 py-3 text-sm text-(--color-text-primary) placeholder:text-(--color-text-faint) focus:outline-none focus:border-(--color-accent-primary) focus:ring-2 focus:ring-(--color-accent-primary)/10 transition leading-relaxed disabled:opacity-60"
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
                  disabled={isSending}
                  title="Remove image"
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-(--color-text-muted) hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
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
                  disabled={isSending}
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

            {/* Send button */}
            <button
              onClick={() => void handleSendMessages()}
              disabled={!canSend}
              className={`
                w-full flex items-center justify-center gap-2.5 py-3 rounded-lg text-sm font-semibold transition-all
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
                  Sending...
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  {selectedRecipients.length > 0
                    ? `Send to ${selectedRecipients.length} contact${selectedRecipients.length !== 1 ? 's' : ''}`
                    : 'Select contacts to send'}
                </>
              )}
            </button>

            {/* Send summary */}
            {sendResults.size > 0 && !isSending && (sendSuccessCount > 0 || sendErrorCount > 0) && (
              <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-bg-secondary) px-4 py-3">
                <p className="text-xs font-medium text-(--color-text-secondary) mb-2">Last send results</p>
                <div className="flex items-center gap-4">
                  {sendSuccessCount > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#25D366]" />
                      <span className="text-xs text-(--color-text-secondary)">{sendSuccessCount} sent</span>
                    </div>
                  )}
                  {sendErrorCount > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-400" />
                      <span className="text-xs text-(--color-text-secondary)">{sendErrorCount} failed</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Message history (individual sends — logged by the app after each send) */}
      <ParticipantMessageHistory accountId={activeAccount} refreshBump={historyBump} />
    </div>
  );
}
