'use client';

import { type FC, useState, useRef, useEffect, useCallback } from 'react';
import { api } from '@/trpc/react';
import { getWorkerColor } from '@/lib/worker-colors';
import toast from 'react-hot-toast';

interface Worker {
  id: string;
  name: string;
}

interface CreateTicketModalProps {
  open: boolean;
  onClose: () => void;
  workers: Worker[];
  onSuccess?: () => void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const CreateTicketModal: FC<CreateTicketModalProps> = ({
  open,
  onClose,
  workers,
  onSuccess,
}) => {
  const [callerName, setCallerName] = useState('');
  const [callerBusiness, setCallerBusiness] = useState('');
  const [inquiry, setInquiry] = useState('');
  const [summary, setSummary] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [source, setSource] = useState<'manual' | 'walk-in' | 'phone'>('manual');
  const [touched, setTouched] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const utils = api.useUtils();

  const createMutation = api.tickets.create.useMutation({
    onSuccess: () => {
      toast.success('Ticket created');
      void utils.tickets.getAll.invalidate();
      void utils.tickets.getStats.invalidate();
      onSuccess?.();
      handleClose();
    },
    onError: (err) => {
      toast.error(err.message ?? 'Failed to create ticket');
    },
  });

  const handleClose = useCallback(() => {
    setCallerName('');
    setCallerBusiness('');
    setInquiry('');
    setSummary('');
    setAssignedTo('');
    setSource('manual');
    setTouched(false);
    onClose();
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const name = callerName.trim();
    const inv = inquiry.trim();
    if (!name || !inv) {
      toast.error('Customer and Inquiry are required');
      return;
    }
    createMutation.mutate({
      caller_name: name,
      caller_business: callerBusiness.trim() || undefined,
      inquiry: inv,
      summary: summary.trim() || undefined,
      assigned_to: assignedTo.trim() || undefined,
      source,
    });
  };

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, handleClose]);

  useEffect(() => {
    if (!open || !containerRef.current) return;
    const el = containerRef.current;
    const focusable = el.querySelectorAll<HTMLElement>(FOCUSABLE);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first) return;

    first.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  if (!open) return null;

  const assignColor = assignedTo ? getWorkerColor(assignedTo) : null;
  const invalidName = touched && !callerName.trim();
  const invalidInquiry = touched && !inquiry.trim();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-modal="true" role="dialog">
      {/* Backdrop – refined overlay with subtle transition */}
      <div
        className="fixed inset-0 bg-[var(--color-backdrop)] transition-opacity duration-200"
        onClick={handleClose}
        aria-hidden
      />

      {/* Centered card – refined minimal: generous spacing, clear hierarchy */}
      <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div
          ref={containerRef}
          className="w-full max-w-lg bg-[var(--color-bg-card)] rounded-2xl shadow-xl border border-[var(--color-border-subtle)] pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-8 pt-8 pb-2">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--color-brand-navy)]">
              New ticket
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Status: Open · Created: now
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-6">
            <div className="space-y-2">
              <label
                htmlFor="create-caller"
                className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]"
              >
                Customer <span className="text-[var(--color-brand-orange)]">*</span>
              </label>
              <input
                id="create-caller"
                type="text"
                value={callerName}
                onChange={(e) => setCallerName(e.target.value)}
                placeholder="Name or company"
                className={`w-full px-4 py-2.5 rounded-xl border text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] bg-[var(--color-input-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-input-focus)] focus:border-transparent transition-shadow ${
                  invalidName
                    ? 'border-red-400 focus:ring-red-400'
                    : 'border-[var(--color-input-border)]'
                }`}
                autoComplete="off"
              />
              {invalidName && (
                <p className="text-xs text-red-500">Required</p>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="create-business"
                className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]"
              >
                Business
              </label>
              <input
                id="create-business"
                type="text"
                value={callerBusiness}
                onChange={(e) => setCallerBusiness(e.target.value)}
                placeholder="Optional"
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-input-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] bg-[var(--color-input-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-input-focus)] focus:border-transparent transition-shadow"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="create-inquiry"
                className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]"
              >
                Inquiry <span className="text-[var(--color-brand-orange)]">*</span>
              </label>
              <textarea
                id="create-inquiry"
                value={inquiry}
                onChange={(e) => setInquiry(e.target.value)}
                placeholder="What do they need?"
                rows={3}
                className={`w-full px-4 py-2.5 rounded-xl border text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] bg-[var(--color-input-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-input-focus)] focus:border-transparent resize-none transition-shadow ${
                  invalidInquiry
                    ? 'border-red-400 focus:ring-red-400'
                    : 'border-[var(--color-input-border)]'
                }`}
              />
              {invalidInquiry && (
                <p className="text-xs text-red-500">Required</p>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="create-summary"
                className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]"
              >
                Summary
              </label>
              <textarea
                id="create-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Optional brief summary"
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-input-border)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] bg-[var(--color-input-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-input-focus)] focus:border-transparent resize-none transition-shadow"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="create-source"
                className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]"
              >
                Source
              </label>
              <select
                id="create-source"
                value={source}
                onChange={(e) => setSource(e.target.value as 'manual' | 'walk-in' | 'phone')}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--color-input-border)] text-sm text-[var(--color-text-primary)] bg-[var(--color-input-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-input-focus)] focus:border-transparent"
              >
                <option value="manual">Manual</option>
                <option value="walk-in">Walk-in</option>
                <option value="phone">Phone</option>
              </select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="create-assigned"
                className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]"
              >
                Assigned to
              </label>
              <select
                id="create-assigned"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--color-input-focus)] focus:border-transparent bg-[var(--color-input-bg)] ${
                  assignColor
                    ? `border ${assignColor.bg} ${assignColor.text} ${assignColor.border}`
                    : 'border-[var(--color-input-border)] text-[var(--color-text-primary)]'
                }`}
              >
                <option value="">Unassigned</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.name}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--color-border-default)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--color-brand-orange)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {createMutation.isPending ? 'Creating…' : 'Create ticket'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
