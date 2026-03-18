'use client';

import { Sidebar } from '@/components/layout/Sidebar';
import { SidebarMain } from '@/components/layout/SidebarMain';
import { SidebarProvider } from '@/components/layout/SidebarContext';
import { SearchPalette } from '@/components/search/SearchPalette';
import { SearchContext } from '@/components/search/SearchContext';
import { useSearchPalette } from '@/components/search/useSearchPalette';

export default function AutomationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { open, setOpen } = useSearchPalette();

  return (
    <SearchContext.Provider value={{ openSearch: () => setOpen(true) }}>
      <SidebarProvider>
        <SearchPalette open={open} onClose={() => setOpen(false)} />
        <div className="flex min-h-screen bg-[var(--color-bg-primary)]">
          <Sidebar />
          <SidebarMain>{children}</SidebarMain>
        </div>
      </SidebarProvider>
    </SearchContext.Provider>
  );
}
