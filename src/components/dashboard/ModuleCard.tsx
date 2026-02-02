'use client';

import { type FC, type ReactNode } from 'react';
import Link from 'next/link';

interface ModuleCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  stats: Record<string, string | number>;
  href: string;
  active?: boolean;
}

export const ModuleCard: FC<ModuleCardProps> = ({ title, description, icon, stats, href, active = true }) => {
  const content = (
    <div
      className={`
        group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300
        ${active
          ? 'border-[var(--color-border-subtle)] bg-white hover:border-[var(--color-brand-orange)]/30 hover:shadow-lg cursor-pointer'
          : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] opacity-75 cursor-default'
        }
      `}
    >
      <div className="relative flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[var(--color-accent-light)] border border-[#71b1ff]/40 flex items-center justify-center text-[var(--color-brand-orange)]">
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{title}</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{description}</p>
          </div>
        </div>
        {active && (
          <span className="flex-shrink-0 text-[var(--color-text-faint)] group-hover:translate-x-0.5 group-hover:text-[var(--color-brand-orange)] transition-all">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        )}
      </div>
      <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)] flex gap-6">
        {Object.entries(stats).map(([key, val]) => (
          <div key={key}>
            <div className="text-[10px] font-medium text-[var(--color-text-faint)] uppercase tracking-[0.1em]">{key}</div>
            <div className="text-lg font-bold text-[var(--color-text-primary)] tracking-tight mt-0.5">{val}</div>
          </div>
        ))}
      </div>
      {!active && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-2xl">
          <span className="text-xs font-medium text-[var(--color-text-muted)] px-3 py-1.5 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)]">Coming soon</span>
        </div>
      )}
    </div>
  );

  if (active) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
};
