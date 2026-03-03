'use client';

import { useState, useRef } from 'react';
import { api } from '@/trpc/react';
import { SkeletonStatsRow, Skeleton } from '@/components/ui/Skeleton';
import type { InvoicingMessage } from '@/server/api/routers/invoicing';
import { formatInTimeZone } from 'date-fns-tz';
import { isToday, isThisWeek } from 'date-fns';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-orange-100 text-orange-700',
  'bg-purple-100 text-purple-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
] as const;

function getSenderColorClass(phone: string): string {
  const hash = phone.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

function getInitials(name: string | null, phone: string): string {
  if (name) {
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }
  return phone.replace(/\D/g, '').slice(-2);
}

const TZ = 'UTC';

function formatReceivedAt(isoString: string): string {
  const date = new Date(isoString + (isoString.endsWith('Z') || isoString.includes('+') ? '' : 'Z'));
  if (isToday(date)) return `Today, ${formatInTimeZone(date, TZ, 'h:mm a')}`;
  if (isThisWeek(date, { weekStartsOn: 1 })) return formatInTimeZone(date, TZ, 'EEE, h:mm a');
  return formatInTimeZone(date, TZ, 'MMM d, h:mm a');
}

function formatPhone(phone: string): string {
  return phone.replace(/@c\.us$/, '').replace(/@s\.whatsapp\.net$/, '');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isImageMessage(type: InvoicingMessage['message_type']): boolean {
  return type === 'image' || type === 'imageMessage';
}

function getImageUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${supabaseUrl}/storage/v1/object/public/${path}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterType = 'all' | 'text' | 'image';

// ─── Page ────────────────────────────────────────────────────────────────────

export default function InvoicingLogsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  const { data: stats, isLoading: statsLoading } = api.invoicing.getStats.useQuery(undefined, {
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const { data: messages, isLoading: messagesLoading } = api.invoicing.getAll.useQuery(
    { search: debouncedSearch || undefined, type: typeFilter, limit: 100 },
    { refetchInterval: 30_000, staleTime: 15_000 },
  );

  return (
    <div className="p-6 md:p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-[var(--color-brand-navy)] tracking-tight">
          Invoicing Logs
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Messages from AIIT – Need To Invoice
        </p>
      </div>

      {/* Stats */}
      {statsLoading ? (
        <SkeletonStatsRow count={4} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <div className="bg-blue-50/50 rounded-xl border-2 border-blue-100 p-6 flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-blue-400/10">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-400 uppercase tracking-wider">Total</p>
              <p className="text-4xl font-extrabold text-blue-500 mt-1">{stats?.total ?? 0}</p>
            </div>
          </div>

          <div className="bg-emerald-50/50 rounded-xl border-2 border-emerald-100 p-6 flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-emerald-400/10">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Today</p>
              <p className="text-4xl font-extrabold text-emerald-500 mt-1">{stats?.todayCount ?? 0}</p>
            </div>
          </div>

          <div className="bg-amber-50/50 rounded-xl border-2 border-amber-100 p-6 flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-amber-400/10">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-400 uppercase tracking-wider">Images</p>
              <p className="text-4xl font-extrabold text-amber-500 mt-1">{stats?.imageCount ?? 0}</p>
            </div>
          </div>

          <div className="bg-slate-50/50 rounded-xl border-2 border-slate-100 p-6 flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-slate-400/10">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
                <line x1="17" y1="10" x2="3" y2="10" />
                <line x1="21" y1="6" x2="3" y2="6" />
                <line x1="21" y1="14" x2="3" y2="14" />
                <line x1="17" y1="18" x2="3" y2="18" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Text</p>
              <p className="text-4xl font-extrabold text-slate-500 mt-1">{stats?.textCount ?? 0}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-white shadow-sm p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none"
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by sender..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-300 transition-colors"
          />
        </div>

        <div className="flex items-center gap-1 bg-[var(--color-bg-secondary)] rounded-lg p-1">
          {(['all', 'text', 'image'] as FilterType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${
                typeFilter === type
                  ? 'bg-white text-[var(--color-brand-navy)] shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Messages Feed */}
      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-white shadow-sm overflow-hidden">
        {messagesLoading ? (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-5 flex gap-4">
                <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="flex gap-2 items-center">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : !messages || messages.length === 0 ? (
          <EmptyState hasSearch={!!debouncedSearch || typeFilter !== 'all'} />
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {messages.map((msg) => (
              <MessageRow key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Message Row ─────────────────────────────────────────────────────────────

function MessageRow({ message }: { message: InvoicingMessage }) {
  const colorClass = getSenderColorClass(message.sender_phone);
  const initials = getInitials(message.sender_name, message.sender_phone);
  const displayPhone = formatPhone(message.sender_phone);

  return (
    <div className="p-5 flex gap-4 hover:bg-[var(--color-bg-hover)] transition-colors">
      {/* Avatar */}
      <div
        className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold ${colorClass}`}
      >
        {initials}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Meta row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-[var(--color-brand-navy)]">
            {message.sender_name ?? displayPhone}
          </span>
          {message.sender_name && (
            <span className="text-xs text-[var(--color-text-muted)]">{displayPhone}</span>
          )}
          <span className="text-xs text-[var(--color-text-muted)]">·</span>
          <span className="text-xs text-[var(--color-text-muted)]">
            {formatReceivedAt(message.received_at)}
          </span>
          <span
            className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
              isImageMessage(message.message_type)
                ? 'bg-amber-100 text-amber-700'
                : 'bg-blue-100 text-blue-700'
            }`}
          >
            {isImageMessage(message.message_type) ? 'IMAGE' : 'TEXT'}
          </span>
        </div>

        {/* Body */}
        <div className="mt-1.5">
          {!isImageMessage(message.message_type) ? (
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
              {message.message_text}
            </p>
          ) : (
            <div className="flex items-center gap-3">
              {message.image_url ? (
                <button
                  type="button"
                  onClick={() => window.open(getImageUrl(message.image_url!), '_blank')}
                  className="flex-shrink-0 rounded-lg overflow-hidden border border-[var(--color-border-subtle)] hover:opacity-75 transition-opacity cursor-pointer"
                  title="Click to view full size"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getImageUrl(message.image_url)}
                    alt="Invoice attachment"
                    width={64}
                    height={64}
                    className="w-16 h-16 object-cover"
                  />
                </button>
              ) : null}
              {message.image_caption ? (
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  {message.image_caption}
                </p>
              ) : !message.image_url ? (
                <p className="text-sm text-[var(--color-text-muted)] italic">Image message</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-[var(--color-bg-secondary)] flex items-center justify-center mx-auto mb-3">
        <svg
          width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5"
          className="text-[var(--color-text-muted)]"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-[var(--color-text-secondary)]">
        {hasSearch ? 'No messages match your search' : 'No messages yet'}
      </p>
      <p className="text-xs text-[var(--color-text-muted)] mt-1">
        {hasSearch
          ? 'Try adjusting your search or filter'
          : 'Messages from the WhatsApp group will appear here'}
      </p>
    </div>
  );
}
