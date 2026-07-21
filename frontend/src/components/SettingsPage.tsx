import React from 'react';
import { Settings, User, CreditCard, Bell } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const SettingsPage = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-zinc-950 pt-24 pb-12 px-4 sm:px-6 relative overflow-hidden font-sans text-zinc-300">
      <div className="max-w-4xl mx-auto w-full relative z-10">
        <div className="mb-10 border-b border-white/[0.04] pb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Preferences</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-2">Settings</h1>
          <p className="text-zinc-500 text-sm max-w-lg leading-relaxed">
            Manage your account settings, billing, and notification preferences.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-1 space-y-1">
            <button className="w-full flex items-center gap-3 px-3 py-2 bg-transparent border border-white/[0.08] rounded-md text-white font-medium text-[13px]">
              <User className="w-4 h-4 text-zinc-400" />
              Account
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.02] rounded-md text-zinc-500 font-medium text-[13px] transition-colors cursor-not-allowed">
              <CreditCard className="w-4 h-4 text-zinc-500" />
              Billing
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.02] rounded-md text-zinc-500 font-medium text-[13px] transition-colors cursor-not-allowed">
              <Bell className="w-4 h-4 text-zinc-500" />
              Notifications
            </button>
          </div>
          
          <div className="md:col-span-3">
            <div className="bg-zinc-900/40 border border-white/[0.04] rounded-lg p-6 sm:p-8 relative overflow-hidden">
              <h2 className="text-lg font-semibold text-white mb-8 tracking-tight">Account Settings</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="text-[12px] font-semibold text-zinc-500 mb-2 block uppercase tracking-wider">Email Address</label>
                  <input 
                    type="email" 
                    className="w-full max-w-md bg-zinc-900/50 border border-white/[0.1] rounded-md px-3 h-10 text-zinc-400 text-[13px] focus:outline-none transition-colors cursor-not-allowed"
                    value={user?.email || "you@example.com"}
                    disabled
                  />
                  <p className="text-[12px] text-zinc-500 mt-2">Your email address cannot be changed right now.</p>
                </div>
                
                <div className="pt-6 border-t border-white/[0.08]">
                  <button className="px-4 h-9 bg-white text-black text-[13px] font-semibold rounded-md hover:bg-zinc-200 transition-colors">
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
