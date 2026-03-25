/**
 * ScheduleModal - Modal for scheduling a future WhatsApp broadcast message.
 * Accepts a pre-selected list of group IDs, lets the user compose a message and pick a
 * Sydney-timezone send time, then submits the scheduled message via tRPC mutation.
 */
'use client';

import { useState, useEffect } from 'react';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { api } from '@/trpc/react';
import toast from 'react-hot-toast';
import type { WhatsAppAccountId } from '@/lib/config/whatsapp-accounts';

const SYDNEY_TZ = 'Australia/Sydney';

function getSydneyToday(): string {
  // Use date-fns-tz for reliable timezone-aware date formatting in Node.js
  return formatInTimeZone(new Date(), SYDNEY_TZ, 'yyyy-MM-dd');
}

interface ScheduleModalProps {
  accountId: WhatsAppAccountId;
  isOpen: boolean;
  onClose: () => void;
  message: string;
  groupIds: string[];
  groupNames: string[];
  onSuccess: () => void;
}

export function ScheduleModal({ accountId, isOpen, onClose, message, groupIds, groupNames, onSuccess }: ScheduleModalProps) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const today = getSydneyToday();

  // Reset fields when modal opens
  useEffect(() => {
    if (isOpen) {
      setDate(today);
      setTime('09:00');
    }
  }, [isOpen, today]);

  const scheduleMutation = api.whatsapp.scheduleMessage.useMutation();

  const handleConfirm = async () => {
    if (!date || !time) {
      toast.error('Please select a date and time');
      return;
    }

    // Convert Sydney local time → UTC for storage
    const utcDate = fromZonedTime(`${date}T${time}:00`, SYDNEY_TZ);

    if (utcDate <= new Date()) {
      toast.error('Scheduled time must be in the future');
      return;
    }

    try {
      await scheduleMutation.mutateAsync({
        accountId,
        groupIds,
        groupNames,
        message,
        scheduledAt: utcDate.toISOString(),
      });

      // Format display time back in Sydney for the toast
      const displayTime = new Date(utcDate).toLocaleString('en-AU', {
        timeZone: SYDNEY_TZ,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      });

      toast.success(`Message scheduled for ${displayTime}`);
      onSuccess();
      onClose();
    } catch {
      toast.error('Failed to schedule message. Please try again.');
    }
  };

  if (!isOpen) return null;

  const previewText = message.length > 80 ? message.slice(0, 80) + '…' : message;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-[var(--color-border-subtle)] w-full max-w-md">

          {/* Header */}
          <div className="px-6 py-5 border-b border-[var(--color-border-subtle)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#25D366]/10 flex items-center justify-center">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Schedule Message</h2>
                  <p className="text-xs text-[var(--color-text-muted)]">All times in Sydney (AEDT/AEST)</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* Summary */}
            <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-muted)] shrink-0">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {groupIds.length} group{groupIds.length !== 1 ? 's' : ''} selected
                </span>
              </div>
              {message && (
                <div className="flex items-start gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-muted)] shrink-0 mt-0.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="text-xs text-[var(--color-text-muted)] italic leading-relaxed">&ldquo;{previewText}&rdquo;</span>
                </div>
              )}
            </div>

            {/* Date picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">Date</label>
              <input
                type="date"
                value={date}
                min={today}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border-default)] bg-white px-3 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-2 focus:ring-[var(--color-accent-primary)]/10 transition"
              />
            </div>

            {/* Time picker */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">Time <span className="text-[var(--color-text-faint)] font-normal">(Sydney)</span></label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border-default)] bg-white px-3 py-2.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-2 focus:ring-[var(--color-accent-primary)]/10 transition"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pb-5 flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-[var(--color-border-default)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={scheduleMutation.isPending || !date || !time}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#25D366] hover:bg-[#20b858] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold text-white transition"
            >
              {scheduleMutation.isPending ? (
                <>
                  <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Scheduling...
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  Confirm Schedule
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
