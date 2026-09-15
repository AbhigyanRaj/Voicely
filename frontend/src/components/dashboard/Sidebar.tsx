import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'voicely.sidebar.collapsed';

/**
 * Marks for the four destinations.
 *
 * Drawn here rather than imported. A lucide set beside Bodoni is the one thing
 * that gives an interface away as a template, but the previous answer to that
 * was worse: collapsed, the nav became the bare letters T, C, S, which is a
 * monogram, not a navigation. Nobody can read T and know it means the day's
 * desk, and Scripts and Settings both began with S.
 *
 * So: one stroke weight, square ends softened, geometry built from the same
 * rect-and-line vocabulary as the collapse control below. Each silhouette is
 * distinct at 16px -- a bordered block, a bubble, a page, two sliders -- so the
 * collapsed rail is legible without reading anything.
 */
const marks = {
  today: (
    <>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <line x1="2.5" y1="6.5" x2="13.5" y2="6.5" />
      <rect x="4.75" y="8.75" width="2.5" height="2.5" fill="currentColor" stroke="none" />
    </>
  ),
  conversations: (
    <path d="M4 3 H12 A2 2 0 0 1 14 5 V9 A2 2 0 0 1 12 11 H7 L4.5 13.5 V11 H4 A2 2 0 0 1 2 9 V5 A2 2 0 0 1 4 3 Z" />
  ),
  scripts: (
    <>
      <rect x="3" y="2" width="10" height="12" rx="1.5" />
      <line x1="5.5" y1="5.5" x2="10.5" y2="5.5" />
      <line x1="5.5" y1="8" x2="10.5" y2="8" />
      <line x1="5.5" y1="10.5" x2="8.5" y2="10.5" />
    </>
  ),
  settings: (
    <>
      <line x1="2.5" y1="5.5" x2="13.5" y2="5.5" />
      <circle cx="6" cy="5.5" r="1.75" />
      <line x1="2.5" y1="10.5" x2="13.5" y2="10.5" />
      <circle cx="10" cy="10.5" r="1.75" />
    </>
  ),
} as const;

const Mark: React.FC<{ of: keyof typeof marks }> = ({ of }) => (
  <svg
    width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"
    fill="none" stroke="currentColor" strokeWidth="1.25"
    strokeLinecap="round" strokeLinejoin="round"
    className="shrink-0"
  >
    {marks[of]}
  </svg>
);

/**
 * Navigation for a collections desk.
 *
 * Ordered by the shape of the working day rather than by feature: what is
 * happening now, what came back, what the agent says when it calls.
 *
 * Runs is deliberately absent. It pointed at /runs, which has never had a
 * route, so it fell through to the catch-all and rendered the dark 404 outside
 * this shell: a nav item that threw you out of the product. It returns when
 * there is real dialling to list.
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
    { name: 'Today', path: '/today', mark: 'today' },
    { name: 'Conversations', path: '/conversations', mark: 'conversations' },
    { name: 'Scripts', path: '/scripts', mark: 'scripts' },
  ] as const;

  const rowClass = (isActive: boolean) =>
    cn(
      'group relative flex items-center h-9 rounded-ui transition-colors',
      collapsed ? 'justify-center px-0' : 'gap-2.5 px-3',
      isActive
        ? 'bg-paper-2 text-ink font-medium'
        : 'text-ink-2 hover:text-ink hover:bg-paper-2/60'
    );

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-paper border-r border-rule shrink-0 transition-[width] duration-200',
        collapsed ? 'w-[60px]' : 'w-[204px]'
      )}
    >
      {/* No wordmark: you know which product you are in by the time you are
          signed into it, and the nav reads better starting near the top edge. */}
      <nav className="flex-1 px-2.5 pt-5 space-y-1">
        {navItems.map(({ name, path, mark }) => (
          <NavLink
            key={name}
            to={path}
            title={collapsed ? name : undefined}
            className={({ isActive }) => rowClass(isActive)}
          >
            {({ isActive }) => (
              <>
                {/* The active rule. A pill alone reads as a hover state; the
                    bar is what says "you are here" at a glance down the rail. */}
                <span
                  className={cn(
                    'absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-ink transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <Mark of={mark} />
                {!collapsed && <span className="text-[14px]">{name}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-2.5 pb-3 pt-2.5 border-t border-rule">
        <NavLink
          to="/settings"
          title={collapsed ? 'Settings' : undefined}
          className={rowClass(location.pathname === '/settings')}
        >
          <span
            className={cn(
              'absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-ink transition-opacity',
              location.pathname === '/settings' ? 'opacity-100' : 'opacity-0'
            )}
          />
          <Mark of="settings" />
          {!collapsed && <span className="text-[14px]">Settings</span>}
        </NavLink>

        {!collapsed && (
          <div className="px-3 pt-3 pb-1">
            <div className="text-[13px] text-ink-2 truncate leading-snug">
              {user?.name || user?.email || 'Signed out'}
            </div>
            <button
              onClick={handleSignOut}
              className="text-[12px] text-ink-3 hover:text-ink transition-colors mt-0.5"
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
            'flex items-center gap-2.5 h-8 mt-1 w-full rounded-ui text-ink-3 hover:text-ink hover:bg-paper-2/60 transition-colors',
            collapsed ? 'justify-center' : 'px-3'
          )}
        >
          {/* Two strokes mirroring the panel edge, so the control matches the
              rules used everywhere else. */}
          <svg
            width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"
            fill="none" stroke="currentColor" strokeWidth="1.25"
            strokeLinecap="round" strokeLinejoin="round" className="shrink-0"
          >
            <rect x="2" y="3" width="12" height="10" rx="1.5" />
            <line x1={collapsed ? '6' : '10'} y1="3" x2={collapsed ? '6' : '10'} y2="13" />
          </svg>
          {!collapsed && <span className="text-[13px]">Collapse</span>}
        </button>
      </div>
    </div>
  );
};
