'use client';

import { Sidebar } from '@/components/layout/Sidebar';
import { SidebarMain } from '@/components/layout/SidebarMain';
import { SidebarProvider } from '@/components/layout/SidebarContext';

export default function AutomationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-[var(--color-bg-primary)]">
        <Sidebar />
        <SidebarMain>{children}</SidebarMain>
      </div>
    </SidebarProvider>
  );
}
