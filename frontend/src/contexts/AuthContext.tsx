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
          console.error('Failed to refresh profile:', error);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const googleLogin = useGoogleLogin({
    onSuccess: async (response) => {
      try {
        const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${response.access_token}` },
        }).then(res => res.json());
        const authResponse = await auth.signInWithGoogle(userInfo);
        if (authResponse.success) setUser(authResponse.user);
      } catch (error) {
        console.error('Google login error:', error);
        throw error;
      }
    },
    onError: (error) => console.error('Google login error:', error),
  });

  const signIn = async () => {
    try {
      googleLogin();
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await auth.signOutUser();
      setUser(null);
    } catch (error) {
      console.error('Sign out error:', error);
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
      user, loading, signIn, signOut, setUser,
      emailRegister: emailRegisterHandler,
      emailLogin: emailLoginHandler,
    }}>
      {children}
    </AuthContext.Provider>
  );
};