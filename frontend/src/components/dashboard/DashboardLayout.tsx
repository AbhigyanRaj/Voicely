import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Menu, X } from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-[#050B14] overflow-hidden text-zinc-100 font-sans">
      
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile Top Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-[#0A1128] border-b border-white/5 flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight text-white">Voicely</span>
        </div>
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-zinc-400 hover:text-white p-2 -mr-2"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative flex-1 flex max-w-xs w-full bg-[#0A1128]">
            <div className="absolute top-0 right-0 -mr-12 pt-4">
              <button
                className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="h-6 w-6 text-white" aria-hidden="true" />
              </button>
            </div>
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col w-0 overflow-hidden relative">
        <main className="flex-1 relative z-0 overflow-y-auto focus:outline-none pt-16 lg:pt-0">
          <div className="min-h-full">
            {children}
          </div>
        </main>
      </div>
      
    </div>
  );
};
