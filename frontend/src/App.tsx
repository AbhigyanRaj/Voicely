import React, { Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { GoogleOAuthProvider } from '@react-oauth/google';

const Hero = React.lazy(() => import('./components/Hero'));
const TodayPage = React.lazy(() => import('./components/collections/TodayPage'));
const ConversationsPage = React.lazy(() => import('./components/collections/ConversationsPage'));
const ConversationDetail = React.lazy(() => import('./components/collections/ConversationDetail'));
const ScriptsPage = React.lazy(() => import('./components/collections/ScriptsPage'));
const SettingsPage = React.lazy(() => import('./components/SettingsPage'));
const DeveloperPage = React.lazy(() => import('./components/DeveloperPage'));
const ApiDocsPage = React.lazy(() => import('./components/ApiDocsPage'));
const NotFoundPage = React.lazy(() => import('./components/NotFoundPage'));
import PageLoader from './components/PageLoader';
import { PageTransition } from './components/PageTransition';
import { AuthProvider } from './contexts/AuthContext';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { GlobalErrorFallback } from './components/GlobalErrorBoundary';
import { DashboardLayout } from './components/dashboard/DashboardLayout';

function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || 'missing-client-id';
  const location = useLocation();

  return (
    <QueryClientProvider client={queryClient}>
      <GoogleOAuthProvider clientId={googleClientId}>
        <AuthProvider>
          <ErrorBoundary FallbackComponent={GlobalErrorFallback as React.ComponentType<FallbackProps>}>
            <Suspense fallback={<PageLoader />}>
              <PageTransition routeKey={location.pathname}>
                <Routes location={location}>
                  <Route path="/" element={<Hero />} />
                  {/* The collections desk. Home after sign-in: the old home was
                      /analytics, which is a report rather than a place to work. */}
                  <Route path="/today" element={
                    <ProtectedRoute>
                      <DashboardLayout>
                        <TodayPage />
                      </DashboardLayout>
                    </ProtectedRoute>
                  } />
                  {/* The old reporting page is gone -- it showed hardcoded trend
                      deltas and gated its charts on substring-matching the agent's
                      name. Its one real feature, the call list, is Conversations
                      now. Kept as a redirect because it is linked from the
                      marketing page and from saved bookmarks. */}
                  <Route path="/conversations" element={
                    <ProtectedRoute>
                      <DashboardLayout>
                        <ConversationsPage />
                      </DashboardLayout>
                    </ProtectedRoute>
                  } />
                  <Route path="/conversations/:id" element={
                    <ProtectedRoute>
                      <DashboardLayout>
                        <ConversationDetail />
                      </DashboardLayout>
                    </ProtectedRoute>
                  } />
                  <Route path="/scripts" element={
                    <ProtectedRoute>
                      <DashboardLayout>
                        <ScriptsPage />
                      </DashboardLayout>
                    </ProtectedRoute>
                  } />
                  {/* The agent builder lives at /scripts now. */}
                  <Route path="/modules" element={<Navigate to="/scripts" replace />} />
                  <Route path="/analytics" element={<Navigate to="/today" replace />} />
                  <Route path="/settings" element={
                    <ProtectedRoute>
                      <DashboardLayout>
                        <SettingsPage />
                      </DashboardLayout>
                    </ProtectedRoute>
                  } />
                  <Route path="/developer" element={
                    <ProtectedRoute>
                      <DashboardLayout>
                        <DeveloperPage />
                      </DashboardLayout>
                    </ProtectedRoute>
                  } />
                  <Route path="/developer/docs" element={<ApiDocsPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </PageTransition>
            </Suspense>
          </ErrorBoundary>
        </AuthProvider>
      </GoogleOAuthProvider>
    </QueryClientProvider>
  );
}

export default App