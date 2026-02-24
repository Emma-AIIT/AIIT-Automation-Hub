'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/trpc/react';
import toast from 'react-hot-toast';
import type { DashboardGroup } from '@/server/api/routers/whatsapp';

const PARTICIPANTS_PAGE_SIZE = 25;

export default function WhatsAppParticipantsPage() {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [participantPage, setParticipantPage] = useState(1);

  const utils = api.useUtils();
  const {
    data: dashboardGroups = [],
    isLoading: groupsLoading,
    isError: groupsError,
    error: groupsErrorMsg,
    refetch: refetchGroups,
  } = api.whatsapp.getDashboardGroups.useQuery(undefined, {
    staleTime: 30 * 1000,
  });

  const {
    data: participants = [],
    isLoading: participantsLoading,
    refetch: refetchParticipants,
  } = api.whatsapp.getParticipantsByGroupId.useQuery(
    { groupId: selectedGroupId! },
    { enabled: !!selectedGroupId }
  );

  // When participants load for the selected group, refresh the groups list so Synced / count stay correct
  useEffect(() => {
    if (selectedGroupId && participants.length > 0) {
      void utils.whatsapp.getDashboardGroups.invalidate();
    }
  }, [selectedGroupId, participants.length, utils.whatsapp.getDashboardGroups]);

  // Reset to page 1 when switching groups
  useEffect(() => {
    setParticipantPage(1);
  }, [selectedGroupId]);

  const totalParticipantPages = Math.max(1, Math.ceil(participants.length / PARTICIPANTS_PAGE_SIZE));
  const paginatedParticipants = participants.slice(
    (participantPage - 1) * PARTICIPANTS_PAGE_SIZE,
    participantPage * PARTICIPANTS_PAGE_SIZE
  );

  const syncMutation = api.whatsapp.syncParticipants.useMutation({
    onSuccess: (result) => {
      const msg =
        result.groupsProcessed != null
          ? `Synced participants for ${result.groupsProcessed} group(s)`
          : 'Participants sync completed';
      toast.success(msg, { duration: 5000 });
      void refetchGroups();
      if (selectedGroupId) void refetchParticipants();
    },
    onError: (err) => toast.error(`Sync failed: ${err.message}`, { duration: 6000 }),
  });

  const filteredGroups = search.trim()
    ? dashboardGroups.filter(
        (g) =>
          g.group_name.toLowerCase().includes(search.trim().toLowerCase()) ||
          g.group_id.toLowerCase().includes(search.trim().toLowerCase())
      )
    : dashboardGroups;

  const handleCopyAllNumbers = useCallback(() => {
    if (participants.length === 0) {
      toast.error('No participants to copy');
      return;
    }
    const text = participants.map((p) => p.participant_phone).join('\n');
    void navigator.clipboard.writeText(text).then(
      () => toast.success(`Copied ${participants.length} number(s) to clipboard`),
      () => toast.error('Failed to copy')
    );
  }, [participants]);

  const isLoading = groupsLoading || syncMutation.isPending;
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
            <h1 className="text-xl font-semibold text-(--color-text-primary)">
              WhatsApp Groups & Participants
            </h1>
            <p className="text-sm text-(--color-text-muted) mt-0.5">
              View participants and copy numbers for selected groups
            </p>
          </div>
        </div>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-(--color-border-default) bg-white text-(--color-text-secondary) hover:bg-(--color-bg-hover) hover:border-(--color-border-strong) disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <svg
            className={isLoading ? 'animate-spin' : ''}
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
          {isLoading ? 'Syncing...' : 'Sync participants'}
        </button>
      </div>

      {/* Two columns: groups list | participants */}
      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 items-start">
        {/* Left: dashboard groups list */}
        <div className="rounded-xl border border-(--color-border-subtle) bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-(--color-border-subtle)">
            <h2 className="text-sm font-semibold text-(--color-text-primary)">Groups</h2>
            <p className="text-xs text-(--color-text-secondary) mt-0.5">
              Select a group to see participants
            </p>
            <p className="text-[11px] text-(--color-text-muted) mt-1.5" title="Members = group size from WhatsApp. Participants = contacts we've pulled and stored. Some contacts can fail to pull, so counts may be lower than actual.">
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
        </div>

        {/* Right: participants for selected group */}
        <div className="rounded-xl border border-(--color-border-subtle) bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-(--color-border-subtle) flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-(--color-text-primary)">Participants</h2>
              <p className="text-xs text-(--color-text-muted) mt-0.5">
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
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-(--color-border-subtle) bg-(--color-bg-secondary)">
                        <th className="text-left py-3 px-4 font-semibold text-(--color-text-secondary)">
                          Phone
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-(--color-text-secondary)">
                          Name
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-(--color-text-secondary) hidden sm:table-cell">
                          Participant ID
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedParticipants.map((p) => (
                        <tr
                          key={p.participant_id}
                          className="border-b border-(--color-border-subtle) hover:bg-(--color-bg-hover)"
                        >
                          <td className="py-2.5 px-4 text-(--color-text-primary) font-mono text-xs">
                            {p.participant_phone}
                          </td>
                          <td className="py-2.5 px-4 text-(--color-text-secondary)">
                            {p.participant_name ?? '—'}
                          </td>
                          <td className="py-2.5 px-4 text-(--color-text-faint) font-mono text-xs hidden sm:table-cell">
                            {p.participant_id}
                          </td>
                        </tr>
                      ))}
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
    </div>
  );
}
