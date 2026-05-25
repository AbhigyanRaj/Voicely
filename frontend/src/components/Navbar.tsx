import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { LogOut, Menu, User, X, Layers, BarChart3, Settings, Crown, PlayCircle, Eye, EyeOff, Code } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import Modal from "./ui/modal";
import { Button } from "./ui/button";
import CreateModule from "./CreateModule";

// ─────────────────────────────────────────────
// Auth Modal (self-contained, reusable)
// ─────────────────────────────────────────────
interface AuthModalProps {
  open: boolean;
  defaultTab?: 'login' | 'signup';
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ open, defaultTab = 'login', onClose }) => {
  const { signIn, emailRegister, emailLogin, loading } = useAuth();
  const [tab, setTab] = useState<'login' | 'signup'>(defaultTab);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset form when tab switches
  const switchTab = (t: 'login' | 'signup') => {
    setTab(t);
    setError('');
    setName('');
    setEmail('');
    setPassword('');
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (tab === 'signup') {
        await emailRegister(name.trim(), email.trim(), password);
      } else {
        await emailLogin(email.trim(), password);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = () => {
    signIn();
    onClose();
  };

  const isLoading = submitting || loading;

  return (
    <Modal open={open} onClose={onClose}>
      <div className="w-full max-w-sm mx-auto p-8 flex flex-col items-center">
        {/* Header */}
        <h2 className="text-2xl font-bold text-white mb-1 tracking-tight">
          {tab === 'login' ? 'Welcome Back' : 'Create Account'}
        </h2>
        <p className="text-zinc-500 text-sm mb-6 text-center">
          {tab === 'login' ? 'Sign in to your Voicely account' : 'Get started with Voicely for free'}
        </p>

        {/* Tab switcher */}
        <div className="w-full flex bg-white/5 rounded-xl p-1 mb-6 border border-white/5">
          <button
            onClick={() => switchTab('login')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === 'login' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => switchTab('signup')}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === 'signup' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleEmailSubmit} className="w-full space-y-3">
          {tab === 'signup' && (
            <div>
              <input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                disabled={isLoading}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition-all disabled:opacity-50"
              />
            </div>
          )}
          <div>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={isLoading}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition-all disabled:opacity-50"
            />
          </div>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              placeholder={tab === 'signup' ? 'Password (min 6 chars)' : 'Password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={isLoading}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-11 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition-all disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPwd(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-red-400 text-xs font-medium bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:scale-100 shadow-[0_8px_24px_-8px_rgba(99,102,241,0.5)]"
          >
            {isLoading ? 'Please wait...' : tab === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        {/* Divider */}
        <div className="w-full flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-white/8" />
          <span className="text-zinc-600 text-xs font-medium uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-white/8" />
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          disabled={isLoading}
          className="w-full h-11 rounded-xl bg-white text-black text-sm font-bold flex items-center justify-center gap-3 hover:bg-zinc-100 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:scale-100"
        >
          <svg className="w-4 h-4" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.23l6.85-6.85C35.64 2.39 30.18 0 24 0 14.82 0 6.73 5.48 2.69 13.44l7.98 6.2C12.13 13.09 17.62 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.1 24.55c0-1.64-.15-3.22-.42-4.74H24v9.01h12.42c-.54 2.9-2.18 5.36-4.65 7.03l7.19 5.6C43.98 37.13 46.1 31.34 46.1 24.55z"/>
            <path fill="#FBBC05" d="M10.67 28.09c-1.01-2.99-1.01-6.19 0-9.18l-7.98-6.2C.99 16.36 0 20.05 0 24c0 3.95.99 7.64 2.69 11.29l7.98-6.2z"/>
            <path fill="#34A853" d="M24 48c6.18 0 11.36-2.05 15.15-5.59l-7.19-5.6c-2.01 1.35-4.59 2.15-7.96 2.15-6.38 0-11.87-3.59-14.33-8.79l-7.98 6.2C6.73 42.52 14.82 48 24 48z"/>
          </svg>
          Continue with Google
        </button>

        <p className="text-[10px] text-zinc-700 text-center font-medium mt-5 leading-relaxed">
          By continuing you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </Modal>
  );
};

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
    { name: 'Analytics', path: '/analytics', icon: <BarChart3 className="w-4 h-4" /> },
    { name: 'Developers', path: '/developer', icon: <Code className="w-4 h-4" /> },
    { name: 'Settings', path: '/settings', icon: <Settings className="w-4 h-4" /> },
  ];

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

              {/* Nav links (desktop, logged in) */}
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
              <div className="lg:hidden">
                <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-zinc-400 hover:text-white transition-colors p-1">
                  {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="lg:hidden">
            <div className="px-4 py-3 space-y-3 bg-zinc-900/95 backdrop-blur-sm border-t border-zinc-800">
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