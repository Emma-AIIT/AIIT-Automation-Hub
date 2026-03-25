/**
 * SidebarMain
 * Layout wrapper that offsets page content to account for the sidebar width (collapsed or expanded).
 * On mobile it renders a fixed header bar with a hamburger button that opens the sidebar overlay.
 */
'use client';

import { useSidebar } from './SidebarContext';

export function SidebarMain({ children }: { children: React.ReactNode }) {
  const { collapsed, toggleMobile } = useSidebar();
  return (
    <>
      {/* Mobile header with hamburger menu */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 z-30 flex items-center gap-3 px-4 bg-[var(--color-bg-primary)] border-b border-[var(--color-border-subtle)]">
        <button
          type="button"
          onClick={toggleMobile}
          className="p-2 -ml-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
          aria-label="Open menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span className="text-base font-semibold text-[var(--color-text-primary)] truncate">AIIT Automation Hub</span>
      </header>

      <main
        className={`flex-1 transition-[margin-left] duration-300 ease-in-out
          ml-0 pt-14
          md:pt-0 ${collapsed ? 'md:ml-[72px]' : 'md:ml-[220px]'}
        `}
      >
        {children}
      </main>
    </>
  );
}
