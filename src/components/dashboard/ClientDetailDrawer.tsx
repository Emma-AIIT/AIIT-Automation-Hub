/**
 * ClientDetailDrawer
 * A slide-in drawer that displays full details for a selected debt-recovery client,
 * including outstanding balance, payment streak, weekly snapshot history, recent activity log,
 * and contact links. Fetches data via tRPC and supports ESC-key and backdrop-click dismissal.
 */
'use client';

import { type FC, useEffect, useRef, useCallback } from 'react';
import { api, type RouterOutputs } from '@/trpc/react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { format, formatDistanceToNow } from 'date-fns';

type ClientDetail = NonNullable<RouterOutputs['clients']['getById']>;
type ClientStatus = ClientDetail['status'];

interface ClientDetailDrawerProps {
  clientId: string | null;
  onClose: () => void;
}

export const ClientDetailDrawer: FC<ClientDetailDrawerProps> = ({ clientId, onClose }) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const isOpen = clientId !== null;

  const { data: client, isLoading, error } = api.clients.getById.useQuery(
    { id: clientId! },
    { enabled: isOpen }
  );

  // Handle ESC key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  // Focus trap and keyboard handling
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      drawerRef.current?.focus();
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
    }).format(amount);
  };

  const getStatusColor = (status: ClientStatus) => {
    switch (status) {
      case 'current': return '#10b981';
      case 'warning': return '#f59e0b';
      case 'critical': return '#ef4444';
      case 'suspended': return '#6b7280';
      default: return '#6b7280';
    }
  };

  // Sort weekly snapshots by date (newest first) and limit to 10
  const sortedSnapshots = client?.weekly_snapshots
    ? [...client.weekly_snapshots]
        .sort((a, b) => new Date(b.week_start).getTime() - new Date(a.week_start).getTime())
        .slice(0, 10)
    : [];

  // Sort activities by date (newest first) and limit to 5
  const recentActivities = client?.activity_log
    ? [...client.activity_log]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5)
    : [];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'call': return '📞';
      case 'sms': return '💬';
      case 'email': return '✉️';
      case 'payment': return '💳';
      case 'suspension': return '⛔';
      default: return '📌';
    }
  };

  return (
    <>
      {/* Backdrop with blur */}
      <div
        className={`fixed inset-0 z-40 transition-all duration-500 ${
          isOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[var(--color-backdrop)] backdrop-blur-sm" />
      </div>

      {/* Drawer Panel */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
        className={`fixed right-0 top-0 z-50 h-full w-full md:w-[420px] transform transition-transform duration-500 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="relative h-full overflow-hidden bg-gradient-to-b from-[var(--color-bg-elevated)] to-[var(--color-bg-primary)] border-l border-[var(--color-border-default)]">
          {/* Decorative gradient accent */}
          <div
            className="absolute top-0 left-0 right-0 h-[2px] opacity-80"
            style={{
              background: client ? `linear-gradient(90deg, transparent, ${getStatusColor(client.status)}, transparent)` : 'transparent'
            }}
          />

          {/* Subtle pattern overlay */}
          <div
            className="absolute inset-0 opacity-[0.015] pointer-events-none"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
              backgroundSize: '24px 24px'
            }}
          />

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 z-10 p-2 rounded-full bg-[var(--color-bg-card)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-border-strong)] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/20"
            aria-label="Close drawer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          {/* Content */}
          <div className="relative h-full overflow-y-auto overflow-x-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-[var(--color-border-default)]" />
                    <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
                  </div>
                  <p className="text-sm text-[var(--color-text-muted)] tracking-wide">Loading client details...</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center px-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                  </div>
                  <p className="text-[var(--color-text-secondary)] mb-4">Failed to load client details</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-[var(--color-bg-card)] border border-[var(--color-border-default)] rounded-lg text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : client ? (
              <div className="p-6 pb-12 space-y-7">
                {/* Header Section */}
                <header className="pt-2">
                  <div className="flex items-start gap-4">
                    {/* Avatar with status ring */}
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-semibold"
                        style={{
                          background: `linear-gradient(135deg, ${getStatusColor(client.status)}15, ${getStatusColor(client.status)}05)`,
                          border: `1px solid ${getStatusColor(client.status)}30`
                        }}
                      >
                        <span style={{ color: getStatusColor(client.status) }}>
                          {client.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div
                        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[var(--color-bg-elevated)]"
                        style={{ backgroundColor: getStatusColor(client.status) }}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h2 id="drawer-title" className="text-xl font-semibold text-[var(--color-text-primary)] truncate tracking-tight">
                        {client.name}
                      </h2>
                      {client.company && (
                        <p className="text-sm text-[var(--color-text-muted)] mt-0.5 truncate flex items-center gap-1.5">
                          <span className="opacity-60">🏢</span>
                          {client.company}
                        </p>
                      )}
                    </div>
                  </div>
                </header>

                {/* Contact Section */}
                <section>
                  <h3 className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.2em] mb-3">Contact</h3>
                  <div className="space-y-2">
                    {client.phone && (
                      <a
                        href={`tel:${client.phone}`}
                        className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-border-default)] transition-all duration-200 group"
                      >
                        <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/15 transition-colors">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                          </svg>
                        </div>
                        <span className="text-sm text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] transition-colors font-mono tracking-wide">
                          {client.phone}
                        </span>
                      </a>
                    )}
                    <a
                      href={`mailto:${client.email}`}
                      className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-border-default)] transition-all duration-200 group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/15 transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                          <polyline points="22,6 12,13 2,6"></polyline>
                        </svg>
                      </div>
                      <span className="text-sm text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)] transition-colors truncate">
                        {client.email}
                      </span>
                    </a>
                  </div>
                </section>

                {/* Balance Section */}
                <section>
                  <h3 className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.2em] mb-3">Outstanding Balance</h3>
                  <div className="relative p-5 rounded-xl bg-gradient-to-br from-[var(--color-bg-card)] to-[var(--color-bg-secondary)] border border-[var(--color-border-subtle)] overflow-hidden">
                    {/* Decorative corner accent */}
                    <div
                      className="absolute top-0 right-0 w-24 h-24 opacity-10"
                      style={{
                        background: `radial-gradient(circle at top right, ${getStatusColor(client.status)}, transparent 70%)`
                      }}
                    />
                    <div className="relative">
                      <p className="text-3xl font-bold tracking-tight" style={{ color: getStatusColor(client.status) }}>
                        {formatCurrency(client.current_balance)}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-[var(--color-text-muted)]">Last Week :</span>
                        <span className="text-sm text-[var(--color-text-secondary)] font-mono">
                          {formatCurrency(client.previous_balance)}
                        </span>
                        {client.current_balance !== client.previous_balance && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            client.current_balance < client.previous_balance
                              ? 'bg-green-500/10 text-green-500'
                              : 'bg-red-500/10 text-red-500'
                          }`}>
                            {client.current_balance < client.previous_balance ? '↓' : '↑'}
                            {formatCurrency(Math.abs(client.current_balance - client.previous_balance))}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Status & Streak */}
                <section className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)]">
                    <h3 className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.2em] mb-2">Status</h3>
                    <StatusBadge status={client.status} />
                  </div>
                  <div className="p-4 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)]">
                    <h3 className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.2em] mb-2">Streak</h3>
                    <div className="flex items-center gap-2">
                      <span className={`text-2xl font-bold ${
                        client.streak_days === 0 ? 'text-green-500' :
                        client.streak_days <= 14 ? 'text-amber-500' :
                        'text-red-500'
                      }`}>
                        {client.streak_days}
                      </span>
                      <div className="flex flex-col">
                        <span className="text-xs text-[var(--color-text-muted)]">days</span>
                        {client.streak_days >= 15 && (
                          <span className="text-[10px] text-red-500/80">overdue</span>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Activity Dates */}
                <section className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)]">
                    <h3 className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.2em] mb-2">Last Payment</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">💳</span>
                      <span className="text-sm text-[var(--color-text-secondary)]">
                        {client.last_payment_date
                          ? format(new Date(client.last_payment_date), 'd MMM yyyy')
                          : 'Never'}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)]">
                    <h3 className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.2em] mb-2">Last Contact</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📅</span>
                      <span className="text-sm text-[var(--color-text-secondary)]">
                        {client.last_contact_date
                          ? format(new Date(client.last_contact_date), 'd MMM yyyy')
                          : 'Never'}
                      </span>
                    </div>
                  </div>
                </section>

                {/* Weekly History */}
                {sortedSnapshots.length > 0 && (
                  <section>
                    <h3 className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.2em] mb-3">Weekly History</h3>
                    <div className="space-y-1">
                      {sortedSnapshots.map((snapshot, index) => (
                        <div
                          key={snapshot.id}
                          className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-hover)] transition-all duration-200"
                          style={{
                            animationDelay: `${index * 50}ms`
                          }}
                        >
                          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            snapshot.payment_made ? 'bg-green-500' : 'bg-red-500'
                          }`} />
                          <span className="text-sm text-[var(--color-text-muted)] font-mono flex-shrink-0">
                            {format(new Date(snapshot.week_start), 'd MMM')}
                          </span>
                          <div className="flex-1 h-px bg-[var(--color-border-subtle)]" />
                          <span className="text-sm text-[var(--color-text-secondary)] font-mono">
                            {formatCurrency(snapshot.balance)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Recent Activities */}
                {recentActivities.length > 0 && (
                  <section>
                    <h3 className="text-[10px] font-semibold text-[var(--color-text-faint)] uppercase tracking-[0.2em] mb-3">Recent Activity</h3>
                    <div className="space-y-2">
                      {recentActivities.map((activity) => (
                        <div
                          key={activity.id}
                          className="flex items-start gap-3 p-3 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)]"
                        >
                          <span className="text-lg flex-shrink-0">{getActivityIcon(activity.activity_type)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-[var(--color-text-secondary)] capitalize">
                                {activity.activity_type}
                              </span>
                              {activity.outcome && (
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  activity.outcome === 'Answered' ? 'bg-green-500/10 text-green-500' :
                                  activity.outcome === 'Voicemail' ? 'bg-amber-500/10 text-amber-500' :
                                  activity.outcome === 'No Answer' ? 'bg-red-500/10 text-red-500' :
                                  'bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]'
                                }`}>
                                  {activity.outcome}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[var(--color-text-muted)] mt-1">
                              {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Action Buttons (Future Enhancement Placeholder) */}
                <section className="pt-2">
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      disabled
                      className="p-3 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] flex flex-col items-center gap-1.5 opacity-50 cursor-not-allowed"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                      </svg>
                      <span className="text-[10px] uppercase tracking-wide">Call</span>
                    </button>
                    <button
                      disabled
                      className="p-3 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] flex flex-col items-center gap-1.5 opacity-50 cursor-not-allowed"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                      </svg>
                      <span className="text-[10px] uppercase tracking-wide">SMS</span>
                    </button>
                    <button
                      disabled
                      className="p-3 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border-subtle)] text-[var(--color-text-faint)] flex flex-col items-center gap-1.5 opacity-50 cursor-not-allowed"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                        <polyline points="22,6 12,13 2,6"></polyline>
                      </svg>
                      <span className="text-[10px] uppercase tracking-wide">Email</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-faint)] text-center mt-2 tracking-wide">Actions coming soon</p>
                </section>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
};
