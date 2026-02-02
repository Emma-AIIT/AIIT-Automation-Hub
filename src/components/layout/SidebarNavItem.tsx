'use client';

import Link from 'next/link';
import { useSidebar } from './SidebarContext';

interface SidebarNavItemProps {
  href: string;
  label: string;
  icon: 'dollar' | 'document' | 'users' | 'settings' | 'home';
  active?: boolean;
  badge?: { count: number; color: 'red' | 'blue' };
  disabled?: boolean;
  comingSoon?: boolean;
  collapsed?: boolean;
}

const icons: Record<SidebarNavItemProps['icon'], React.ReactNode> = {
  home: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  dollar: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  document: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  users: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

export function SidebarNavItem({
  href,
  label,
  icon,
  active = false,
  badge,
  disabled = false,
  comingSoon = false,
  collapsed = false,
}: SidebarNavItemProps) {
  const { closeMobile } = useSidebar();
  const content = (
    <div
      title={collapsed ? label : undefined}
      className={`
        relative flex items-center gap-2.5 rounded-xl text-[13px] font-medium transition-all duration-200
        ${collapsed ? 'justify-center px-0 py-2.5 w-full' : 'px-3 py-2'}
        ${active
          ? 'bg-white/[0.07] text-white/95 shadow-sm shadow-black/10'
          : 'text-white/40 hover:bg-white/[0.04] hover:text-white/65'
        }
        ${disabled ? 'opacity-30 pointer-events-none' : 'cursor-pointer'}
      `}
    >
      {/* Active indicator bar */}
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-blue-400 shadow-sm shadow-blue-400/40" />
      )}
      <span className={`flex-shrink-0 transition-colors duration-200 ${active ? 'text-blue-400' : 'text-white/30'}`}>
        {icons[icon]}
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {badge && (
            <span
              className={`
                min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold flex items-center justify-center
                ${badge.color === 'red' ? 'bg-red-500/15 text-red-400' : 'bg-blue-500/15 text-blue-400'}
              `}
            >
              {badge.count}
            </span>
          )}
          {comingSoon && (
            <span className="text-[10px] text-white/20 font-medium">Soon</span>
          )}
        </>
      )}
    </div>
  );

  if (disabled) return content;

  return (
    <Link href={href} onClick={closeMobile}>
      {content}
    </Link>
  );
}
