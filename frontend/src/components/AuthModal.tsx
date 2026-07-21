import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Modal from './ui/modal';
import { Button } from './ui/button';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export interface AuthModalProps {
  open: boolean;
  defaultTab?: 'login' | 'signup';
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ open, defaultTab = 'login', onClose }) => {
  const { user, signIn, emailRegister, emailLogin, loading } = useAuth();
  const [tab, setTab] = useState<'login' | 'signup'>(defaultTab);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Close modal when user is successfully logged in
  useEffect(() => {
    if (user) {
      onClose();
    }
  }, [user, onClose]);

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
        const result = signupSchema.safeParse({ name, email, password });
        if (!result.success) {
          setError(result.error.errors[0].message);
          setSubmitting(false);
          return;
        }
        await emailRegister(name.trim(), email.trim(), password);
      } else {
        const result = loginSchema.safeParse({ email, password });
        if (!result.success) {
          setError(result.error.errors[0].message);
          setSubmitting(false);
          return;
        }
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
    // Modal will close automatically when user state updates via useEffect
  };

  const isLoading = submitting || loading;

  return (
    <Modal open={open} onClose={onClose} className="!max-w-[340px] !rounded-2xl">
      <div className="w-full p-7 flex flex-col">
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <h2 className="text-[17px] font-semibold text-zinc-900 tracking-tight">
            {tab === 'login' ? 'Welcome back' : 'Create an account'}
          </h2>
          <p className="text-zinc-500 text-[13px] mt-1 text-center">
            {tab === 'login' ? 'Enter your details to sign in' : 'Start your free trial today'}
          </p>
        </div>

        {/* Tab switcher (Segmented Control) */}
        <div className="w-full flex bg-zinc-100/70 p-[3px] rounded-lg mb-6 border border-zinc-200/50 relative">
          <div 
            className="absolute top-[3px] bottom-[3px] w-[calc(50%-3px)] bg-white rounded-md shadow-[0_1px_3px_rgba(0,0,0,0.1),0_1px_2px_rgba(0,0,0,0.06)] transition-transform duration-300 ease-out"
            style={{ transform: tab === 'login' ? 'translateX(0)' : 'translateX(100%)' }}
          />
          <button
            onClick={() => switchTab('login')}
            className={`flex-1 py-1.5 rounded-md text-[13px] font-medium transition-colors duration-300 relative z-10 ${
              tab === 'login' ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => switchTab('signup')}
            className={`flex-1 py-1.5 rounded-md text-[13px] font-medium transition-colors duration-300 relative z-10 ${
              tab === 'signup' ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleEmailSubmit} className="w-full flex flex-col">
          <div 
            className={`grid transition-all duration-300 ease-out ${
              tab === 'signup' ? 'grid-rows-[1fr] opacity-100 mb-3' : 'grid-rows-[0fr] opacity-0 mb-0'
            }`}
          >
            <div className="overflow-hidden">
              <input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={e => setName(e.target.value)}
                required={tab === 'signup'}
                disabled={isLoading}
                className="w-full bg-white/50 border border-zinc-200/80 rounded-lg px-3 py-2 text-zinc-900 text-[13px] placeholder:text-zinc-400 focus:outline-none focus:border-[#0044FF]/40 focus:ring-4 focus:ring-[#0044FF]/10 transition-all duration-300 shadow-sm hover:border-zinc-300 disabled:opacity-50"
              />
            </div>
          </div>

          <div className="mb-3">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={isLoading}
              className="w-full bg-white/50 border border-zinc-200/80 rounded-lg px-3 py-2 text-zinc-900 text-[13px] placeholder:text-zinc-400 focus:outline-none focus:border-[#0044FF]/40 focus:ring-4 focus:ring-[#0044FF]/10 transition-all duration-300 shadow-sm hover:border-zinc-300 disabled:opacity-50"
            />
          </div>
          <div className="relative mb-3">
            <input
              type={showPwd ? 'text' : 'password'}
              placeholder={tab === 'signup' ? 'Password (min 6 chars)' : 'Password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={isLoading}
              className="w-full bg-white/50 border border-zinc-200/80 rounded-lg px-3 py-2 pr-9 text-zinc-900 text-[13px] placeholder:text-zinc-400 focus:outline-none focus:border-[#0044FF]/40 focus:ring-4 focus:ring-[#0044FF]/10 transition-all duration-300 shadow-sm hover:border-zinc-300 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPwd(p => !p)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-red-600 text-[11px] font-medium bg-red-50 border border-red-100 rounded-lg px-3 py-2 shadow-sm">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-9 rounded-lg bg-[#0044FF] hover:bg-blue-700 text-white text-[13px] font-medium transition-all duration-300 shadow-[0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-[0.98] disabled:opacity-60 mt-2"
          >
            {isLoading ? 'Wait...' : tab === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        {/* Divider */}
        <div className="w-full flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-zinc-200/80" />
          <span className="text-zinc-400 text-[10px] font-medium uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-zinc-200/80" />
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          disabled={isLoading}
          className="w-full h-9 rounded-lg bg-white border border-zinc-200/80 text-zinc-700 text-[13px] font-medium flex items-center justify-center gap-2 hover:bg-zinc-50 transition-all duration-300 shadow-sm active:scale-[0.98] disabled:opacity-60"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.23l6.85-6.85C35.64 2.39 30.18 0 24 0 14.82 0 6.73 5.48 2.69 13.44l7.98 6.2C12.13 13.09 17.62 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.1 24.55c0-1.64-.15-3.22-.42-4.74H24v9.01h12.42c-.54 2.9-2.18 5.36-4.65 7.03l7.19 5.6C43.98 37.13 46.1 31.34 46.1 24.55z"/>
            <path fill="#FBBC05" d="M10.67 28.09c-1.01-2.99-1.01-6.19 0-9.18l-7.98-6.2C.99 16.36 0 20.05 0 24c0 3.95.99 7.64 2.69 11.29l7.98-6.2z"/>
            <path fill="#34A853" d="M24 48c6.18 0 11.36-2.05 15.15-5.59l-7.19-5.6c-2.01 1.35-4.59 2.15-7.96 2.15-6.38 0-11.87-3.59-14.33-8.79l-7.98 6.2C6.73 42.52 14.82 48 24 48z"/>
          </svg>
          Continue with Google
        </button>

      </div>
    </Modal>
  );
};

export default AuthModal;
