/**
 * SignalNotConnectedModal - Tells the user Signal can't be used yet.
 * Opened by the Broadcast page when the Signal tab is clicked while Signal isn't
 * connected. Closes with the OK button, Escape, or a click on the backdrop; the page
 * stays on the Signal tab, which shows its usual not-connected state.
 */
'use client';

import { useEffect } from 'react';
import { PlatformIcon } from '@/components/modules/broadcast/PlatformIcon';

interface SignalNotConnectedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SignalNotConnectedModal({ isOpen, onClose }: SignalNotConnectedModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-[1px]"
      onClick={(e) => {
        // Only the backdrop itself closes it, not clicks inside the card
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signal-not-connected-title"
        aria-describedby="signal-not-connected-body"
        className="bg-white rounded-2xl shadow-xl border border-[var(--color-border-subtle)] w-full max-w-md"
      >
        <div className="px-6 py-5 border-b border-[var(--color-border-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#3A76F0]/10 text-[#3A76F0] flex items-center justify-center shrink-0">
              <PlatformIcon platform="signal" size={15} />
            </div>
            <h2 id="signal-not-connected-title" className="text-sm font-semibold text-[var(--color-text-primary)]">
              Signal not connected yet
            </h2>
          </div>
        </div>

        <div className="px-6 py-5">
          <p id="signal-not-connected-body" className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
            There&apos;s no published API or third-party service available for Signal yet.
          </p>
        </div>

        <div className="px-6 pb-5">
          <button
            autoFocus
            onClick={onClose}
            className="w-full min-h-[44px] rounded-lg bg-[#3A76F0] hover:brightness-95 text-sm font-semibold text-white transition"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
