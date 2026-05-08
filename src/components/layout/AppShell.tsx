// src/components/layout/AppShell.tsx
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileNav } from './MobileNav';
import { FloatingChat } from '../chat/FloatingChat';
import { DisclaimerBanner } from './DisclaimerBanner';

interface AppShellProps {
  children: React.ReactNode;
  pageTitle: string;
  pageSubtitle?: string;
  currentPath?: string;
  /** Show the persistent "educational use only" disclaimer banner. Should
   *  be true for any page rendering AI-generated health analysis (wellness
   *  plan, doctor prep, lab detail, AI chat, dashboard with insights).
   *  Universal — same banner across every applicable surface. */
  showDisclaimer?: boolean;
}

export const AppShell = ({ children, pageTitle, pageSubtitle, showDisclaimer = false }: AppShellProps) => (
  <div className="flex min-h-screen">
    <Sidebar />
    <main className="flex-1 md:ml-72 min-h-screen bg-clinical-cream overflow-x-hidden">
      {showDisclaimer && <DisclaimerBanner />}
      <TopBar title={pageTitle} subtitle={pageSubtitle} />
      <div
        className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-8 md:pb-8"
        style={{ paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))' }}
      >
        {children}
      </div>
    </main>
    <MobileNav />
    <FloatingChat />
  </div>
);
