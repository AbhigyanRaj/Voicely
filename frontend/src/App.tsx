import Hero from "./components/Hero";
import { Routes, Route } from 'react-router-dom';
import ModulesPage from './components/ModulesPage';
import AnalyticsPage from './components/AnalyticsPage';
import SettingsPage from './components/SettingsPage';
import DeveloperPage from './components/DeveloperPage';
import ApiDocsPage from './components/ApiDocsPage';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from "./components/Navbar";
import CampaignPage from "./components/CampaignPage";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  // Updated for Vercel deployment with proper environment variables
  const googleClientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
  console.log('Google Client ID loaded:', googleClientId ? 'EXISTS' : 'MISSING');
  
  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <AuthProvider>
        <Navbar />
        <Routes>
          <Route path="/" element={<Hero />} />
          <Route path="/modules" element={
            <ProtectedRoute>
              <ModulesPage />
            </ProtectedRoute>
          } />
          <Route path="/campaign" element={
            <ProtectedRoute>
              <CampaignPage />
            </ProtectedRoute>
          } />
          <Route path="/analytics" element={
            <ProtectedRoute>
              <AnalyticsPage />
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          } />
          <Route path="/developer" element={
            <ProtectedRoute>
              <DeveloperPage />
            </ProtectedRoute>
          } />
          <Route path="/developer/docs" element={<ApiDocsPage />} />
        </Routes>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App