// src/components/layout/AppShell.tsx
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileNav } from './MobileNav';

interface AppShellProps {
  children: React.ReactNode;
  pageTitle: string;
  pageSubtitle?: string;
  currentPath?: string;
}

export const AppShell = ({ children, pageTitle, pageSubtitle }: AppShellProps) => (
  <div className="flex min-h-screen">
    <Sidebar />
    <main className="flex-1 md:ml-72 min-h-screen bg-clinical-cream overflow-x-hidden">
      <TopBar title={pageTitle} subtitle={pageSubtitle} />
      <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8 pb-24 md:pb-8">
        {children}
      </div>
    </main>
    <MobileNav />
  </div>
);
