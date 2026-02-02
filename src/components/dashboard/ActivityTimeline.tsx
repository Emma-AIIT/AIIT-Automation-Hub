'use client';

import { type FC } from 'react';

export interface ActivityItem {
  id: string;
  type: 'call' | 'payment' | 'quote' | 'ticket' | 'sync';
  title: string;
  description: string;
  time: string;
}

const typeConfig: Record<ActivityItem['type'], { icon: React.ReactNode; color: string }> = {
  call: {
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    ),
    color: 'bg-blue-50 text-blue-600 border-blue-200/50',
  },
  payment: {
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    color: 'bg-emerald-50 text-emerald-600 border-emerald-200/50',
  },
  quote: {
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    ),
    color: 'bg-purple-50 text-purple-600 border-purple-200/50',
  },
  ticket: {
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18" />
      </svg>
    ),
    color: 'bg-amber-50 text-amber-600 border-amber-200/50',
  },
  sync: {
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    ),
    color: 'bg-gray-100 text-gray-600 border-gray-200/50',
  },
};

interface ActivityTimelineProps {
  activities?: ActivityItem[];
  isLoading?: boolean;
}

export const ActivityTimeline: FC<ActivityTimelineProps> = ({ activities = [], isLoading = false }) => {
  return (
    <div className="h-full flex flex-col bg-white rounded-2xl border border-[var(--color-border-subtle)] p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Recent Activity</h2>
        <span className="text-xs text-[var(--color-text-faint)]">Last 24 hours</span>
      </div>
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-bg-hover)] animate-pulse" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="h-4 w-32 bg-[var(--color-bg-hover)] rounded animate-pulse" />
                <div className="h-3 w-full max-w-[200px] bg-[var(--color-bg-hover)] rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : activities.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)] py-4">No recent activity</p>
      ) : (
        <div className="space-y-4">
          {activities.map((item) => {
            const config = typeConfig[item.type];
            return (
              <div key={item.id} className="flex items-start gap-3 group">
                <div className={`flex-shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center ${config.color}`}>
                  {config.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{item.title}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{item.description}</p>
                </div>
                <span className="flex-shrink-0 text-xs text-[var(--color-text-faint)]">{item.time}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
