'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SIDEBAR_MODULES } from '@/lib/mock-data/quotes';
import { SidebarNavItem } from './SidebarNavItem';
import { useSidebar } from './SidebarContext';

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle, mobileOpen, closeMobile } = useSidebar();

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div
        className={`md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeMobile}
        aria-hidden
      />

      <aside
        className={`fixed left-0 top-0 bottom-0 flex flex-col z-50 overflow-hidden
          w-[260px] transition-[transform,width] duration-300 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:w-[220px]
          ${collapsed ? 'md:!w-[72px]' : ''}
        `}
      >
      {/* Layered background */}
      <div className="absolute inset-0 bg-[#0a0e1a]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0f1628]/80 via-[#0a0e1a] to-[#060914]" />
      {/* Subtle side glow */}
      <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-white/[0.06] to-transparent" />

      {/* Brand + mobile close button */}
      <div className="relative px-3 pt-7 pb-6 flex items-center justify-between md:justify-start">
        <Link href="/automations" onClick={closeMobile} className={`flex items-center gap-3 group ${collapsed ? 'md:justify-center md:w-full' : ''}`}>
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/30 transition-shadow duration-300 flex-shrink-0">
            <span className="text-white text-sm font-bold tracking-tight">A</span>
            <div className="absolute inset-0 rounded-xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <div className="text-[14px] font-bold text-white/95 tracking-[-0.01em]">AIIT</div>
              <div className="text-[11px] text-white/30 font-medium tracking-wide">Automation Hub</div>
            </div>
          )}
        </Link>
        {/* Mobile close button */}
        <button
          type="button"
          onClick={closeMobile}
          className="md:hidden p-2 -mr-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Divider */}
      <div className={`h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent ${collapsed ? 'mx-3' : 'mx-5'}`} />

      {/* Navigation */}
      <nav className="relative flex-1 px-2 pt-5 pb-3 space-y-6 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/5">
        {/* Dashboard */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2.5 text-[10px] font-semibold text-white/25 uppercase tracking-[0.18em]">
              Dashboard
            </p>
          )}
          <SidebarNavItem
            href="/automations"
            label="Overview"
            icon="home"
            active={pathname === '/automations'}
            collapsed={collapsed}
          />
        </div>

        {/* Automations */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-2.5 text-[10px] font-semibold text-white/25 uppercase tracking-[0.18em]">
              Automations
            </p>
          )}
          <div className="space-y-0.5">
            {SIDEBAR_MODULES.map((mod) => (
              <SidebarNavItem
                key={mod.id}
                href={mod.route}
                label={mod.label}
                icon={mod.icon}
                active={pathname === mod.route}
                badge={mod.badge}
                disabled={mod.disabled}
                comingSoon={mod.comingSoon}
                collapsed={collapsed}
              />
            ))}
          </div>
        </div>

      </nav>

      {/* Collapse toggle - hidden on mobile */}
      <div className="hidden md:block relative px-2 pb-2">
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-all duration-200 text-white/40 hover:text-white/70"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="flex-shrink-0 text-white/30">
            {collapsed ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            )}
          </span>
          {!collapsed && <span className="text-[12px] font-medium truncate">Collapse</span>}
        </button>
      </div>

      {/* User profile */}
      <div className="relative px-2 pb-5 pt-2">
        <div className={`mb-3 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent ${collapsed ? 'mx-0' : 'mx-2'}`} />
        <div className={`flex items-center rounded-xl hover:bg-white/[0.04] transition-all duration-200 cursor-pointer group ${collapsed ? 'justify-center p-2' : 'gap-2.5 px-3 py-2.5'}`}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-white/[0.06] flex items-center justify-center group-hover:border-white/[0.1] transition-colors duration-200 flex-shrink-0">
            <span className="text-[11px] font-semibold text-blue-400/80">A</span>
          </div>
          {!collapsed && (
            <div className="leading-tight min-w-0 flex-1">
              <div className="text-[12px] font-medium text-white/70 truncate group-hover:text-white/85 transition-colors duration-200">Admin</div>
              <div className="text-[10px] text-white/25 truncate">All In IT Solutions</div>
            </div>
          )}
        </div>
      </div>
    </aside>
    </>
  );
}
