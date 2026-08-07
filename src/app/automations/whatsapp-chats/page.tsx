/**
 * WhatsApp Chats page at /automations/whatsapp-chats.
 * Read-only view of incoming WhatsApp messages logged by Make.com into
 * whatsapp_chat_messages. The left pane lists chat threads (groups) for the active
 * account; selecting one shows that thread's messages as chat bubbles (sender, text/
 * media, time). Layout mirrors the columns of the "Daily Chats" sheet: Text Msg, User,
 * Time, Type of Message, Group Chat, Chat ID.
 */
'use client';

import { useState, useCallback, useEffect } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { api } from '@/trpc/react';
import type { ChatThread } from '@/server/api/routers/whatsapp';
import { WHATSAPP_ACCOUNTS } from '@/lib/config/whatsapp-accounts';
import type { WhatsAppAccountId } from '@/lib/config/whatsapp-accounts';

const SYDNEY_TZ = 'Australia/Sydney';

// A small palette to give each sender a stable colour in the thread.
const SENDER_COLORS = [
  'text-[#1a9e4e]', 'text-[#2563eb]', 'text-[#db2777]', 'text-[#d97706]',
  'text-[#7c3aed]', 'text-[#0891b2]', 'text-[#dc2626]', 'text-[#4f46e5]',
];

function senderColor(name: string | null): string {
  if (!name) return 'text-(--color-text-muted)';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return SENDER_COLORS[hash % SENDER_COLORS.length]!;
}

function formatMessageTime(iso: string): string {
  try {
    return formatInTimeZone(new Date(iso), SYDNEY_TZ, 'd MMM · h:mm a');
  } catch {
    return iso;
  }
}

function formatThreadTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return formatInTimeZone(new Date(iso), SYDNEY_TZ, 'd MMM · h:mm a');
  } catch {
    return '';
  }
}

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

function isImageMessage(type: string | null, text: string | null): boolean {
  if (type && type.toLowerCase().includes('image')) return true;
  if (text && isUrl(text) && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(text.trim())) return true;
  return false;
}

export default function WhatsAppChatsPage() {
  const [activeAccount, setActiveAccount] = useState<WhatsAppAccountId>('aiit-automation');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const handleAccountSwitch = useCallback((id: WhatsAppAccountId) => {
    setActiveAccount(id);
    setSelectedChatId(null);
    setSearch('');
  }, []);

  const {
    data: threads = [],
    isLoading: threadsLoading,
    isError: threadsError,
    error: threadsErrorMsg,
    refetch: refetchThreads,
  } = api.whatsapp.listChatThreads.useQuery(
    { accountId: activeAccount },
    { staleTime: 30 * 1000, refetchInterval: 60_000 },
  );

  const {
    data: messages = [],
    isLoading: messagesLoading,
    refetch: refetchMessages,
  } = api.whatsapp.listChatMessages.useQuery(
    { accountId: activeAccount, chatId: selectedChatId! },
    { enabled: !!selectedChatId, refetchInterval: 30_000 },
  );

  // Clear selection when switching accounts
  useEffect(() => {
    setSelectedChatId(null);
  }, [activeAccount]);

  const filteredThreads = search.trim()
    ? threads.filter((t) => {
        const q = search.trim().toLowerCase();
        return (
          (t.group_chat?.toLowerCase().includes(q) ?? false) ||
          t.chat_id.toLowerCase().includes(q)
        );
      })
    : threads;

  const selectedThread = selectedChatId
    ? threads.find((t) => t.chat_id === selectedChatId) ?? null
    : null;

  const noThreadsYet = threads.length === 0 && !threadsLoading && !threadsError;

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#25D366]/10 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-(--color-text-primary)">
              WhatsApp Chats
            </h1>
            <p className="text-sm text-(--color-text-muted) mt-0.5 leading-snug">
              Read incoming messages by group — select a chat to view its history
            </p>
          </div>
        </div>
        <button
          onClick={() => void refetchThreads()}
          disabled={threadsLoading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-(--color-border-default) bg-white text-(--color-text-secondary) hover:bg-(--color-bg-hover) hover:border-(--color-border-strong) disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <svg className={threadsLoading ? 'animate-spin' : ''} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Refresh
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

      {/* Two columns: threads list | messages */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
        {/* Left: chat threads */}
        <div className="rounded-xl border border-(--color-border-subtle) bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-(--color-border-subtle)">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-(--color-text-muted)">Chats</h2>
              {threads.length > 0 && (
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-(--color-bg-secondary) text-(--color-text-muted) border border-(--color-border-subtle)">
                  {threads.length}
                </span>
              )}
            </div>
            <p className="text-xs text-(--color-text-secondary) mt-1.5 leading-relaxed">Select a chat to see its messages</p>
          </div>
          <div className="p-3 border-b border-(--color-border-subtle)">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text-faint)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search chats..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-(--color-border-default) bg-white text-(--color-text-primary) placeholder:text-(--color-text-faint) focus:outline-none focus:border-(--color-accent-primary) focus:ring-2 focus:ring-(--color-accent-primary)/10 transition"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-[320px] max-h-[560px] p-3 space-y-1">
            {threadsError ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm font-medium text-(--color-text-primary)">Failed to load chats</p>
                <p className="text-xs text-(--color-text-muted) mt-1">{threadsErrorMsg?.message ?? 'Check your connection'}</p>
              </div>
            ) : noThreadsYet ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-(--color-text-muted)">No chats yet</p>
                <p className="text-xs text-(--color-text-faint) mt-1">Messages will appear here once Make.com starts logging them</p>
              </div>
            ) : threadsLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-(--color-bg-secondary) animate-pulse" />
              ))
            ) : filteredThreads.length === 0 ? (
              <div className="py-8 text-center text-sm text-(--color-text-muted)">No chats match your search</div>
            ) : (
              filteredThreads.map((thread: ChatThread) => (
                <button
                  key={thread.chat_id}
                  onClick={() => setSelectedChatId(thread.chat_id)}
                  className={`
                    w-full flex items-start gap-3 px-3 py-3 rounded-lg border text-left transition-all
                    ${selectedChatId === thread.chat_id
                      ? 'border-[#25D366]/40 bg-[#25D366]/5'
                      : 'border-(--color-border-subtle) bg-white hover:border-(--color-border-default) hover:bg-(--color-bg-hover)'
                    }
                  `}
                >
                  <div className="shrink-0 w-8 h-8 rounded-full bg-[#25D366]/10 flex items-center justify-center mt-0.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm truncate text-(--color-text-primary) font-medium">
                      {thread.group_chat?.trim() || thread.chat_id}
                    </span>
                    <span className="block text-xs text-(--color-text-muted) mt-0.5 truncate">
                      {thread.message_count} message{thread.message_count !== 1 ? 's' : ''}
                      {thread.last_message_at ? ` · ${formatThreadTime(thread.last_message_at)}` : ''}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: messages for selected thread */}
        <div className="rounded-xl border border-(--color-border-subtle) bg-white shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-(--color-border-subtle) flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-(--color-text-primary) truncate">
                {selectedThread ? (selectedThread.group_chat?.trim() || selectedThread.chat_id) : 'Messages'}
              </h2>
              <p className="text-xs text-(--color-text-muted) mt-0.5 truncate">
                {selectedThread ? selectedThread.chat_id : 'Select a chat to view its messages'}
              </p>
            </div>
            {selectedChatId && (
              <button
                onClick={() => void refetchMessages()}
                disabled={messagesLoading}
                className="shrink-0 p-1.5 rounded-lg text-(--color-text-muted) hover:text-(--color-text-primary) hover:bg-(--color-bg-hover) transition disabled:opacity-40"
                title="Refresh messages"
              >
                <svg className={messagesLoading ? 'animate-spin' : ''} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto min-h-[420px] max-h-[620px] bg-(--color-bg-secondary)/40">
            {!selectedChatId ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <svg className="text-(--color-text-faint) mb-3" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                <p className="text-sm text-(--color-text-muted)">Select a chat from the list</p>
              </div>
            ) : messagesLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className={`h-14 rounded-lg bg-white animate-pulse ${i % 2 === 0 ? 'w-2/3' : 'w-1/2'}`} />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-sm text-(--color-text-muted)">No messages in this chat</p>
                <p className="text-xs text-(--color-text-faint) mt-1">Messages will appear here once logged</p>
              </div>
            ) : (
              <div className="p-4 space-y-2.5">
                {messages.map((msg) => {
                  const showImage = isImageMessage(msg.type_of_message, msg.text_msg);
                  const hasText = !!msg.text_msg?.trim();
                  const textIsUrl = hasText && isUrl(msg.text_msg!.trim());
                  return (
                    <div key={msg.id} className="flex flex-col max-w-[85%] sm:max-w-[70%]">
                      <div className="rounded-2xl rounded-tl-sm bg-white border border-(--color-border-subtle) shadow-sm px-3.5 py-2.5">
                        {/* Sender */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold truncate ${senderColor(msg.sender_name)}`}>
                            {msg.sender_name?.trim() || 'Unknown'}
                          </span>
                          {msg.type_of_message && (
                            <span className="text-[10px] text-(--color-text-faint) bg-(--color-bg-secondary) border border-(--color-border-subtle) rounded px-1.5 py-0.5 shrink-0">
                              {msg.type_of_message}
                            </span>
                          )}
                        </div>

                        {/* Image preview */}
                        {showImage && textIsUrl && (
                          <a href={msg.text_msg!.trim()} target="_blank" rel="noopener noreferrer" className="block mb-1.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={msg.text_msg!.trim()}
                              alt="Attachment"
                              className="max-h-56 rounded-lg border border-(--color-border-subtle) object-cover"
                              loading="lazy"
                            />
                          </a>
                        )}

                        {/* Text / link */}
                        {hasText && !(showImage && textIsUrl) && (
                          textIsUrl ? (
                            <a
                              href={msg.text_msg!.trim()}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-[#2563eb] hover:underline break-all leading-relaxed"
                            >
                              {msg.text_msg}
                            </a>
                          ) : (
                            <p className="text-sm text-(--color-text-primary) whitespace-pre-wrap break-words leading-relaxed">
                              {msg.text_msg}
                            </p>
                          )
                        )}

                        {!hasText && !showImage && (
                          <p className="text-sm text-(--color-text-faint) italic">No text</p>
                        )}

                        {/* Time */}
                        <div className="text-[10px] text-(--color-text-faint) mt-1 text-right tabular-nums">
                          {formatMessageTime(msg.sent_at)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
