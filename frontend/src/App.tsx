import React, { Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from "./components/Navbar";
import { GoogleOAuthProvider } from '@react-oauth/google';

const Hero = React.lazy(() => import('./components/Hero'));
const ModulesPage = React.lazy(() => import('./components/ModulesPage'));
const AnalyticsPage = React.lazy(() => import('./components/AnalyticsPage'));
const SettingsPage = React.lazy(() => import('./components/SettingsPage'));
const DeveloperPage = React.lazy(() => import('./components/DeveloperPage'));
const ApiDocsPage = React.lazy(() => import('./components/ApiDocsPage'));
const CampaignPage = React.lazy(() => import('./components/CampaignPage'));
const NotFoundPage = React.lazy(() => import('./components/NotFoundPage'));
import PageLoader from './components/PageLoader';
import { PageTransition } from './components/PageTransition';
import { AuthProvider } from './contexts/AuthContext';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { ErrorBoundary } from 'react-error-boundary';
import { GlobalErrorFallback } from './components/GlobalErrorBoundary';
import { DashboardLayout } from './components/dashboard/DashboardLayout';

function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || 'missing-client-id';
  const location = useLocation();

  return (
    <QueryClientProvider client={queryClient}>
      <GoogleOAuthProvider clientId={googleClientId}>
        <AuthProvider>
          <ErrorBoundary FallbackComponent={GlobalErrorFallback}>
            <Suspense fallback={<PageLoader />}>
              <PageTransition routeKey={location.pathname}>
                <Routes location={location}>
                  <Route path="/" element={<Hero />} />
                  <Route path="/modules" element={
                    <ProtectedRoute>
                      <DashboardLayout>
                        <ModulesPage />
                      </DashboardLayout>
                    </ProtectedRoute>
                  } />
                  <Route path="/campaign" element={
                    <ProtectedRoute>
                      <DashboardLayout>
                        <CampaignPage />
                      </DashboardLayout>
                    </ProtectedRoute>
                  } />
                  <Route path="/analytics" element={
                    <ProtectedRoute>
                      <DashboardLayout>
                        <AnalyticsPage />
                      </DashboardLayout>
                    </ProtectedRoute>
                  } />
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