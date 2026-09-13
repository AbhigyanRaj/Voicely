import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'voicely.sidebar.collapsed';

/**
 * Navigation for a collections desk.
 *
 * Ordered by the shape of the working day rather than by feature: what is
 * happening now, what I am sending out, what came back, what the agent says
 * when it calls.
 *
 * No icons in the expanded state -- in an editorial system the type does the
 * work, and a row of stock glyphs beside Bodoni is the one thing that would
 * give the page away as a template. Collapsed, each destination becomes its
 * initial set in Bodoni: T, R, C, S are all distinct, so the letter is a real
 * label rather than a decoration standing in for one.
 */
export const Sidebar: React.FC = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch { /* private window */ }
  }, [collapsed]);

  const handleSignOut = async () => {
    try { await signOut(); } catch (e) { console.error('Sign out error:', e); }
  };

  const navItems = [
    { name: 'Today', path: '/today' },
    { name: 'Runs', path: '/runs' },
    { name: 'Conversations', path: '/conversations' },
    { name: 'Scripts', path: '/scripts' },
  ];

  const rowClass = (isActive: boolean) =>
    cn(
      'flex items-center h-9 rounded-ui transition-colors',
      collapsed ? 'justify-center px-0 mx-1' : 'px-3',
      isActive
        ? 'bg-paper-2 text-ink font-medium'
        : 'text-ink-2 hover:text-ink hover:bg-paper-2/60'
    );

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-paper border-r border-rule shrink-0 transition-[width] duration-200',
        collapsed ? 'w-[56px]' : 'w-[200px]'
      )}
    >
      <div className={cn('flex items-center pt-6 pb-5', collapsed ? 'justify-center px-0' : 'px-6')}>
        <span className="font-display text-[18px] font-semibold tracking-tight text-ink">
          {collapsed ? 'V' : 'Voicely'}
        </span>
      </div>

      <nav className="flex-1 px-2 space-y-0.5">
        {navItems.map(({ name, path }) => (
          <NavLink
            key={name}
            to={path}
            title={collapsed ? name : undefined}
            className={({ isActive }) => rowClass(isActive)}
          >
            {collapsed ? (
              <span className="font-display text-[16px]">{name.charAt(0)}</span>
            ) : (
              <span className="text-[15px]">{name}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-2 pb-3 pt-3 border-t border-rule">
        <NavLink
          to="/settings"
          title={collapsed ? 'Settings' : undefined}
          className={rowClass(location.pathname === '/settings')}
        >
          {collapsed ? (
            <span className="font-display text-[16px]">S</span>
          ) : (
            <span className="text-[15px]">Settings</span>
          )}
        </NavLink>

        {!collapsed && (
          <div className="flex items-baseline gap-2 px-3 pt-3">
            <span className="text-[13px] text-ink-3 truncate flex-1">
              {user?.name || user?.email || 'Signed out'}
            </span>
            <button
              onClick={handleSignOut}
              className="text-[13px] text-ink-3 hover:text-signal transition-colors shrink-0"
            >
              Sign out
            </button>
          </div>
        )}

        <button
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={collapsed ? 'Expand' : 'Collapse'}
          className={cn(
            'flex items-center gap-2 h-8 mt-1 w-full rounded-ui text-ink-3 hover:text-ink hover:bg-paper-2/60 transition-colors',
            collapsed ? 'justify-center' : 'px-3'
          )}
        >
          {/* Drawn rather than imported: two strokes that mirror the panel
              edge, so the control matches the rules used everywhere else. */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <rect x="0.5" y="1.5" width="13" height="11" rx="1.5" stroke="currentColor" />
            <line
              x1={collapsed ? '5' : '9'} y1="1.5"
              x2={collapsed ? '5' : '9'} y2="12.5"
              stroke="currentColor"
            />
          </svg>
          {!collapsed && <span className="text-[13px]">Collapse</span>}
        </button>
      </div>
    </div>
  );
};
