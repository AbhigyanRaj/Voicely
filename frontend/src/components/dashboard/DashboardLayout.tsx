import React, { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Menu, X } from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const NOTICE_KEY = 'voicely.notice.dismissed';

/**
 * What this build is, stated before anyone has to work it out.
 *
 * There is no phone line: you call the agent yourself from the browser. That is
 * the intended shape of this build rather than something broken, and a visitor
 * has no way of telling those apart unless we say so.
 *
 * Deliberately not vermilion. `signal` means a person has to deal with
 * something, and spending it on a standing notice would leave the colour
 * meaning nothing the first time a dispute actually needs it.
 *
 * Dismissible, because a permanent strip becomes furniture. The statement that
 * cannot be dismissed lives on Today.
 */
const EarlyBuildNotice: React.FC = () => {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(NOTICE_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    if (!dismissed) return;
    try { localStorage.setItem(NOTICE_KEY, '1'); } catch { /* private window */ }
  }, [dismissed]);

  if (dismissed) return null;

  return (
    <div className="shrink-0 bg-paper-2 border-b border-rule">
      <div className="flex items-center gap-3 px-6 lg:px-9 py-2.5">
        <p className="text-[13px] text-ink-2 leading-snug">
          <span className="text-ink font-medium">Early build</span>
          {' · '}
          you call the agent yourself to test it. Outbound dialling isn’t built yet.
        </p>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss notice"
          className="ml-auto shrink-0 text-ink-3 hover:text-ink transition-colors text-[15px] leading-none px-1"
        >
          &times;
        </button>
      </div>
    </div>
  );
};

/**
 * Shell for the collections desk.
 *
 * Every surface colour here now comes from a token. This file previously set
 * #050B14, the mobile header #0A1128 and the sidebar #131313 -- three unrelated
 * darks meeting at two visible seams.
 */
export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-paper overflow-hidden text-ink font-sans">
      <div className="hidden lg:flex shrink-0">
        <Sidebar />
      </div>

      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-paper border-b border-rule flex items-center justify-between px-4 z-40">
        <span className="font-display text-[16px] font-semibold tracking-tight text-ink">Voicely</span>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          className="text-ink-2 hover:text-ink p-2 -mr-2 transition-colors"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-ink/30 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative flex max-w-[180px] w-full" onClick={() => setMobileMenuOpen(false)}>
            <Sidebar />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col w-0 overflow-hidden">
        {/* pt-14 clears the mobile header only. The old pt-24 cleared a marketing
            navbar that no dashboard page has ever rendered. Inside the column
            rather than above it, so the strip spans the content and stops at
            the sidebar edge. */}
        <div className="pt-14 lg:pt-0 shrink-0">
          <EarlyBuildNotice />
        </div>
        <main className="flex-1 overflow-y-auto focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
};
