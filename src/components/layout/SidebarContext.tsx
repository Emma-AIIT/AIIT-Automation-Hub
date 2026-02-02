'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

const SIDEBAR_COLLAPSED_KEY = 'aiit-sidebar-collapsed';

interface SidebarContextType {
  collapsed: boolean;
  toggle: () => void;
  mobileOpen: boolean;
  toggleMobile: () => void;
  closeMobile: () => void;
}

function noop() {
  // default context; real toggle is provided by SidebarProvider
}
const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  toggle: noop,
  mobileOpen: false,
  toggleMobile: noop,
  closeMobile: noop,
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored !== null) setCollapsed(stored === 'true');
    } catch {
      // ignore
    }
  }, [mounted]);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const toggleMobile = () => setMobileOpen((o) => !o);
  const closeMobile = () => setMobileOpen(false);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle, mobileOpen, toggleMobile, closeMobile }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
