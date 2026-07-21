import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Menu, X, LogOut, Code, Layers, Settings, User, PlayCircle, BarChart3 } from 'lucide-react';
import { AuthModal } from './AuthModal';
import CreateModule from './CreateModule';
import { ArrowRight } from 'lucide-react';

const landingNavItems = [
  { name: 'Overview', id: 'overview' },
  { name: 'Highlights', id: 'highlights' },
  { name: 'Results', id: 'results' },
  { name: 'FAQ', id: 'faq' }
];

// ─────────────────────────────────────────────
// Navbar
// ─────────────────────────────────────────────
const Navbar: React.FC = () => {
  const { user, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [authModal, setAuthModal] = useState<null | 'signup' | 'login'>(null);
  const [createModuleOpen, setCreateModuleOpen] = useState(false);
  const location = useLocation();

  const userPlan = user?.subscription?.tier
    ? user.subscription.tier.charAt(0).toUpperCase() + user.subscription.tier.slice(1)
    : 'Free';

  const handleSignOut = async () => {
    try { await signOut(); } catch (e) { console.error('Sign out error:', e); }
  };

  const navItems = [
    { name: 'My Voice Agents', path: '/modules', icon: <Layers className="w-4 h-4" /> },
    { name: 'Campaigns', path: '/campaign', icon: <PlayCircle className="w-4 h-4" /> },
    { name: 'Analytics', path: '/analytics', icon: <BarChart3 className="w-4 h-4" /> },
    { name: 'Developers', path: '/developer', icon: <Code className="w-4 h-4" /> },
    { name: 'Settings', path: '/settings', icon: <Settings className="w-4 h-4" /> },
  ];

  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setIsMenuOpen(false);
    }
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-transparent backdrop-blur-sm">
        <div className="w-full mx-auto">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-10">
            <div className="flex items-center justify-between w-full py-10">
              {/* Logo */}
              <div className="flex flex-1">
                <Link to="/" className="flex">
                  <img src="/logo.png" alt="Voicely" className="h-12 w-auto hover:opacity-80 transition-opacity mt-2" />
                </Link>
              </div>

              {/* Landing Page Navbar vs Dashboard Navbar */}
              {location.pathname === '/' ? (
                <>
                  <div className="hidden lg:flex absolute left-1/2 -translate-x-1/2 items-center justify-center gap-8">
                    {landingNavItems.map((item) => (
                      <a key={item.name} href={`#${item.id}`} onClick={(e) => handleScroll(e, item.id)} className="text-[13px] text-zinc-600 hover:text-black font-medium transition-colors">
                        {item.name}
                      </a>
                    ))}
                  </div>
                  <div className="hidden lg:flex items-center justify-end flex-shrink-0 z-10">
                    {!user ? (
                      <button
                        onClick={() => setAuthModal('login')}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium bg-white text-black border border-zinc-200 shadow-sm hover:shadow-md transition-all group"
                      >
                        Start a Pilot <ArrowRight className="w-3.5 h-3.5 bg-black text-white rounded-full p-0.5 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-4">
                        <Link to="/analytics" className="text-[13px] text-zinc-600 hover:text-black font-medium transition-colors">Dashboard</Link>
                        <button
                          onClick={() => setCreateModuleOpen(true)}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium bg-white text-black border border-zinc-200 shadow-sm hover:shadow-md transition-all group"
                        >
                          Create Agent <ArrowRight className="w-3.5 h-3.5 bg-black text-white rounded-full p-0.5 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                        <button onClick={handleSignOut} className="text-zinc-400 hover:text-red-500 transition-colors p-1" title="Sign out">
                          <LogOut className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="lg:hidden flex items-center justify-end flex-1">
                    <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-zinc-800 hover:text-black transition-colors p-1">
                      {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Dashboard Nav links (desktop, logged in) */}
                  {user && (
                    <div className="hidden lg:flex items-center justify-center gap-6 flex-shrink-0">
                      {navItems.map((item) => (
                        <Link
                          key={item.path}
                          to={item.path}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            location.pathname === item.path
                              ? 'text-blue-400 bg-blue-400/10'
                              : 'text-zinc-300 hover:text-white hover:bg-zinc-800/50'
                          }`}
                        >
                          {item.icon}
                          {item.name}
                        </Link>
                      ))}
                      <button
                        onClick={() => setCreateModuleOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:text-white hover:bg-blue-600/20 transition-all hover:scale-[1.03] active:scale-[0.97]"
                      >
                        <Layers className="w-3.5 h-3.5 animate-pulse" />
                        Create Agent
                      </button>
                    </div>
                  )}

                  {/* Right section (desktop) */}
                  <div className="hidden lg:flex items-center justify-end flex-1 space-x-3">
                    {user ? (
                      <>
                        <div className="flex items-center space-x-1.5">
                          <User className="w-4 h-4 text-zinc-400" />
                          <span className="text-zinc-300 text-xs">{user.name}</span>
                          <button onClick={handleSignOut} className="text-zinc-400 hover:text-white transition-colors p-1" title="Sign out">
                            <LogOut className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setAuthModal('login')}
                          className="text-zinc-300 hover:text-white px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                        >
                          Sign In
                        </button>
                        <button
                          onClick={() => setAuthModal('signup')}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
                        >
                          Get Started
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Mobile menu toggle */}
                  <div className="lg:hidden flex items-center justify-end flex-1">
                    <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-zinc-400 hover:text-white transition-colors p-1">
                      {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="lg:hidden">
            <div className={`px-4 py-3 space-y-3 backdrop-blur-sm border-t ${location.pathname === '/' ? 'bg-white/95 border-zinc-100 shadow-sm' : 'bg-zinc-900/95 border-zinc-800'}`}>
              {location.pathname === '/' ? (
                <>
                  <div className="space-y-2">
                    {landingNavItems.map((item) => (
                      <a key={item.name} href={`#${item.id}`} onClick={(e) => handleScroll(e, item.id)} className="block px-3 py-2 text-sm font-medium text-zinc-600 hover:text-black transition-colors">
                        {item.name}
                      </a>
                    ))}
                  </div>
                  {!user ? (
                    <button
                      onClick={() => { setAuthModal('login'); setIsMenuOpen(false); }}
                      className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg text-sm font-medium bg-white text-black border border-zinc-200 shadow-sm hover:shadow-md transition-all"
                    >
                      Start a Pilot
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <Link to="/analytics" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 text-sm font-medium text-zinc-600 hover:text-black">Dashboard</Link>
                      <button
                        onClick={() => { setCreateModuleOpen(true); setIsMenuOpen(false); }}
                        className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg text-sm font-medium bg-white text-black border border-zinc-200 shadow-sm hover:shadow-md transition-all"
                      >
                        Create Agent
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {user ? (
                    <>
                      <div className="space-y-2">
                        {navItems.map((item) => (
                          <Link
                            key={item.path} to={item.path}
                            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                              location.pathname === item.path
                                ? 'text-blue-400 bg-blue-400/10'
                                : 'text-zinc-300 hover:text-white hover:bg-zinc-800'
                            }`}
                            onClick={() => setIsMenuOpen(false)}
                          >
                            {item.icon}{item.name}
                          </Link>
                        ))}
                        <button
                          onClick={() => { setCreateModuleOpen(true); setIsMenuOpen(false); }}
                          className="flex items-center gap-3 w-full px-3 py-2 rounded-full text-sm font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 hover:text-white hover:bg-blue-600/20 transition-all"
                        >
                          <Layers className="w-4 h-4" />
                          Create Agent
                        </button>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-zinc-400" />
                          <span className="text-zinc-300 text-xs">{user.name}</span>
                        </div>
                        <button onClick={() => { handleSignOut(); setIsMenuOpen(false); }} className="text-zinc-400 hover:text-white transition-colors p-1">
                          <LogOut className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <button
                        onClick={() => { setAuthModal('login'); setIsMenuOpen(false); }}
                        className="block w-full text-left text-zinc-300 hover:text-white px-3 py-2 rounded-full text-sm font-medium transition-colors"
                      >
                        Sign In
                      </button>
                      <button
                        onClick={() => { setAuthModal('signup'); setIsMenuOpen(false); }}
                        className="block w-full bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-full text-sm font-bold transition-colors"
                      >
                        Get Started
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Auth Modal */}
      <AuthModal
        open={!!authModal}
        defaultTab={authModal === 'signup' ? 'signup' : 'login'}
        onClose={() => setAuthModal(null)}
      />

      <CreateModule open={createModuleOpen} onClose={() => setCreateModuleOpen(false)} />
    </>
  );
};

export default Navbar;