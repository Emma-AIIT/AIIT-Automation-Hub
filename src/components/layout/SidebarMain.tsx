'use client';

import { useSidebar } from './SidebarContext';

export function SidebarMain({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <main
      className={`flex-1 transition-[margin-left] duration-300 ease-in-out ${collapsed ? 'ml-[72px]' : 'ml-[220px]'}`}
    >
      {children}
    </main>
  );
}
