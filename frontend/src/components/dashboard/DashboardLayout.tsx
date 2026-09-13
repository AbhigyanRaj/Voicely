import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Menu, X } from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

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
            navbar that no dashboard page has ever rendered. */}
        <main className="flex-1 overflow-y-auto focus:outline-none pt-14 lg:pt-0">
          {children}
        </main>
      </div>
    </div>
  );
};
