import React from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Layers, PlayCircle, BarChart3, Code, Settings, LogOut, Zap, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Sidebar: React.FC = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();

  const handleSignOut = async () => {
    try { await signOut(); } catch (e) { console.error('Sign out error:', e); }
  };

  const navItems = [
    { name: 'Analytics', path: '/analytics', icon: <BarChart3 strokeWidth={1.5} className="w-5 h-5" /> },
    { name: 'Voice Agents', path: '/modules', icon: <Layers strokeWidth={1.5} className="w-5 h-5" /> },
    { name: 'Campaigns', path: '/campaign', icon: <PlayCircle strokeWidth={1.5} className="w-5 h-5" /> },
    { name: 'Developers', path: '/developer', icon: <Code strokeWidth={1.5} className="w-5 h-5" /> },
    { name: 'Settings', path: '/settings', icon: <Settings strokeWidth={1.5} className="w-5 h-5" /> },
  ];

  const userPlan = user?.subscription?.tier
    ? user.subscription.tier.charAt(0).toUpperCase() + user.subscription.tier.slice(1)
    : 'Free';

  return (
    <div className="flex flex-col w-[60px] h-full bg-[#131313] border-r border-white/[0.03] text-zinc-300 flex-shrink-0 relative">
      <div className="flex flex-col items-center h-full py-4">
        
        {/* Top Logo / Home Link */}
        <Link 
          to="/"
          title="Back to Home"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-[#222222] transition-colors mb-4"
        >
          <Home strokeWidth={1.5} className="w-5 h-5" />
        </Link>
        
        {/* Center Nav Items */}
        <nav className="flex-1 flex flex-col items-center gap-4 w-full">
          {navItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.path}
              title={item.name}
              className={({ isActive }) =>
                cn(
                  "flex items-center justify-center w-[38px] h-[38px] rounded-xl transition-all duration-300",
                  isActive 
                    ? "bg-[#222222] text-zinc-100 shadow-sm border border-white/[0.03]" 
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-[#222222]/50"
                )
              }
            >
              {React.cloneElement(item.icon as React.ReactElement, {
                className: cn(
                  "w-5 h-5",
                  location.pathname === item.path ? "text-zinc-200" : "text-zinc-500 group-hover:text-zinc-300"
                )
              })}
            </NavLink>
          ))}
        </nav>

        {/* Bottom Actions */}
        <div className="mt-auto flex flex-col items-center gap-5">
          <button 
            onClick={handleSignOut} 
            className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-[#222222] transition-colors"
            title="Sign out"
          >
            <LogOut strokeWidth={1.5} className="w-[18px] h-[18px]" />
          </button>
          
          <div className="w-8 h-8 rounded-full bg-[#222222] flex items-center justify-center border border-white/5 cursor-pointer hover:ring-2 ring-white/10 transition-all relative" title={user?.email || 'User'}>
            <span className="text-[10px] font-bold text-zinc-300 tracking-wider">
              {user?.email?.substring(0, 2).toUpperCase() || 'US'}
            </span>
            {/* Claude-style notification dot */}
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 border-2 border-[#131313] rounded-full"></span>
          </div>
        </div>
        
      </div>
    </div>
  );
};
