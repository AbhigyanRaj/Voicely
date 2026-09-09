import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import * as auth from '../lib/auth';

interface AuthContextType {
  user: auth.User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: auth.User | null) => void;
  emailRegister: (name: string, email: string, password: string) => Promise<void>;
  emailLogin: (email: string, password: string) => Promise<void>;
  /** Last sign-in failure, for the UI to surface. */
  authError: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<auth.User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedUser = auth.getCurrentUser();
      const token = auth.getStoredToken();
      if (token && storedUser) {
        setUser(storedUser);
        try {
          const profile = await auth.getUserProfile();
          if (profile) {
            setUser(profile);
            auth.setStoredUser(profile);
          }
        } catch (error) {
          // Token expiry handling
          console.warn('Token expired or invalid, signing out');
          await auth.signOutUser();
          setUser(null);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const [authError, setAuthError] = useState<string | null>(null);

  const googleLogin = useGoogleLogin({
    onSuccess: async (response) => {
      // The server resolves the profile from this token; fetching userinfo here
      // and forwarding the claims is what made the endpoint forgeable.
      try {
        setAuthError(null);
        const authResponse = await auth.signInWithGoogle(response.access_token);
        if (authResponse.success) setUser(authResponse.user);
        else setAuthError('Sign-in failed. Please try again.');
      } catch (error: any) {
        // Rethrowing from an async callback was an unhandled rejection, so a
        // failed sign-in produced no visible feedback at all.
        console.error('Google sign-in failed:', error);
        setAuthError(error?.message || 'Sign-in failed. Please try again.');
      }
    },
    onError: (error) => {
      console.error('Google OAuth error:', error);
      setAuthError('Google sign-in was cancelled or blocked.');
    },
  });

  const signIn = async () => {
    setAuthError(null);
    googleLogin();
  };

  const signOut = async () => {
    try {
      await auth.signOutUser();
      setUser(null);
    } catch (error) {
      throw error;
    }
  };

  const emailRegisterHandler = async (name: string, email: string, password: string) => {
    const response = await auth.emailRegister(name, email, password);
    if (response.success) setUser(response.user);
  };

  const emailLoginHandler = async (email: string, password: string) => {
    const response = await auth.emailLogin(email, password);
    if (response.success) setUser(response.user);
  };

  return (
    <AuthContext.Provider value={{
      user, loading, signIn, signOut, setUser, authError,
      emailRegister: emailRegisterHandler,
      emailLogin: emailLoginHandler,
    }}>
      {children}
    </AuthContext.Provider>
  );
};