import React, { useState } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  User,
  CreditCard,
  Settings,
  Key,
  Volume2,
  Save,
  LogOut,
  BarChart3,
  Send,
  RefreshCw,
  LayoutGrid,
  Plus,
  X,
  Activity,
  ShieldCheck,
  Phone
} from "lucide-react";
import * as auth from "../lib/auth";
import { api } from "../lib/api";
import { getProviders, saveProvider } from "../lib/settings";
import type { ProviderCredential } from "../lib/settings";
import { useAuth } from "../contexts/AuthContext";

interface UserSettings {
  notifications: {
    email: boolean;
    sms: boolean;
    push: boolean;
    callReminders: boolean;
    weeklyReports: boolean;
  };
  privacy: {
    shareAnalytics: boolean;
    allowTracking: boolean;
    publicProfile: boolean;
  };
  preferences: {
    theme: 'light' | 'dark' | 'auto';
    language: string;
    timezone: string;
    dateFormat: string;
  };
  security: {
    twoFactorAuth: boolean;
    sessionTimeout: number;
    passwordChangeRequired: boolean;
  };
  voice: {
    defaultVoice: string;
    speechRate: number;
    volume: number;
  };
}

interface Workspace {
  _id: string;
  name: string;
  category: 'real_estate' | 'medical' | 'startup' | 'ecommerce';
  isActive: boolean;
}

const SettingsPage: React.FC = () => {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'general' | 'ai_voice' | 'providers' | 'integrations'>('general');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [providers, setProviders] = useState<ProviderCredential[]>([]);
  const [twilioForm, setTwilioForm] = useState({ accountSid: '', authToken: '', phoneNumber: '' });
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspaceCategory, setNewWorkspaceCategory] = useState<'real_estate' | 'medical' | 'startup' | 'ecommerce'>('startup');
  const [telegramCode, setTelegramCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({
    notifications: {
      email: true,
      sms: false,
      push: true,
      callReminders: true,
      weeklyReports: true,
    },
    privacy: {
      shareAnalytics: true,
      allowTracking: false,
      publicProfile: false,
    },
    preferences: {
      theme: 'dark',
      language: 'en',
      timezone: 'UTC',
      dateFormat: 'MM/DD/YYYY',
    },
    security: {
      twoFactorAuth: false,
      sessionTimeout: 30,
      passwordChangeRequired: false,
    },
    voice: {
      defaultVoice: 'en-US-Neural2-F',
      speechRate: 1.0,
      volume: 0.8,
    },
  });

  const handleSaveSettings = async () => {
    setLoading(true);
    // Simulate API call
    if (activeTab === 'providers') {
      try {
        await saveProvider('twilio', twilioForm.accountSid, twilioForm.authToken, twilioForm.phoneNumber);
        // show success maybe?
      } catch (error) {
        console.error('Failed to save provider', error);
      }
    } else {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    setLoading(false);
  };

  const fetchProviders = async () => {
    try {
      const p = await getProviders();
      setProviders(p);
      const twilioProvider = p.find(x => x.providerName === 'twilio');
      if (twilioProvider) {
        setTwilioForm({
          accountSid: twilioProvider.credentials.accountSid || '',
          authToken: '********',
          phoneNumber: twilioProvider.credentials.phoneNumber || ''
        });
      }
    } catch (error) {
      console.error('Failed to fetch providers', error);
    }
  };

  const fetchWorkspaces = async () => {
    const token = auth.getStoredToken();
    if (!token) return;
    try {
      const data = await api.getWorkspaces(token);
      if (data.success) {
        setWorkspaces(data.workspaces);
      }
    } catch (error) {
      console.error('Failed to fetch workspaces:', error);
    }
  };

  const handleCreateWorkspace = async () => {
    const token = auth.getStoredToken();
    if (!token || !newWorkspaceName) return;
    setLoading(true);
    try {
      const data = await api.createWorkspace(token, newWorkspaceName, newWorkspaceCategory);
      if (data.success) {
        setWorkspaces(prev => [...prev, data.workspace]);
        setIsCreatingWorkspace(false);
        setNewWorkspaceName("");
      }
    } catch (error) {
      console.error('Failed to create workspace:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchWorkspace = async (workspaceId: string) => {
    const token = auth.getStoredToken();
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.switchWorkspace(token, workspaceId);
      if (data.success) {
        // Reload page to refresh all data context
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to switch workspace:', error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchWorkspaces();
    fetchProviders();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const tabs = [
    { id: 'general', label: 'General', icon: User },
    { id: 'ai_voice', label: 'AI & Voice', icon: Volume2 },
    { id: 'providers', label: 'Call Providers', icon: Phone },
    { id: 'integrations', label: 'Integrations', icon: Send },
  ];

  const handleGenerateTelegramCode = async () => {
    setLoading(true);
    try {
      const result = await auth.generateTelegramCode();
      if (result.success) {
        setTelegramCode(result.code);
      }
    } catch (error) {
      console.error('Failed to generate code:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderGeneralTab = () => (
    <div className="space-y-6">
      <Card className="bg-zinc-900/40 backdrop-blur-xl border-zinc-800 p-8 rounded-3xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 rounded-2xl">
              <LayoutGrid className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Active Workspace</h3>
              <p className="text-zinc-400 text-sm">Managing your current operational environment</p>
            </div>
          </div>
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 px-4 py-1 rounded-full">Active</Badge>
        </div>
        
        <div className="p-6 bg-zinc-800/20 border border-white/5 rounded-2xl flex items-center justify-between mb-6">
          <div>
            <div className="text-white font-bold text-lg">{user?.currentWorkspace?.name || 'Loading...'}</div>
            <div className="text-xs text-zinc-500 uppercase tracking-widest mt-1 font-bold">
              {user?.currentWorkspace?.category?.replace('_', ' ') || 'General'}
            </div>
          </div>
          <Button 
            onClick={() => setIsCreatingWorkspace(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 px-4 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Workspace</span>
          </Button>
        </div>

        <div className="space-y-3">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] px-2 mb-2">Switch Workspace</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {workspaces.filter(ws => ws._id !== user?.currentWorkspace?._id).map((ws) => (
              <button
                key={ws._id}
                onClick={() => handleSwitchWorkspace(ws._id)}
                className="p-4 bg-zinc-800/10 border border-zinc-800 hover:border-zinc-700 rounded-2xl flex items-center justify-between group transition-all"
              >
                <div className="text-left">
                  <div className="text-zinc-300 font-bold text-sm group-hover:text-white transition-colors">{ws.name}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">{ws.category.replace('_', ' ')}</div>
                </div>
                <RefreshCw className="w-4 h-4 text-zinc-600 group-hover:text-blue-400 group-hover:rotate-180 transition-all duration-500" />
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="bg-zinc-900/40 backdrop-blur-xl border-zinc-800 p-8 rounded-3xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-emerald-500/20 rounded-2xl">
            <User className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Profile</h3>
            <p className="text-zinc-400 text-sm">Personal account details</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Full Name</label>
            <div className="p-4 bg-zinc-800/20 border border-white/5 rounded-2xl text-zinc-200 font-medium">
              {user?.name || 'Voicely User'}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Email Address</label>
            <div className="p-4 bg-zinc-800/20 border border-white/5 rounded-2xl text-zinc-200 font-medium">
              {user?.email || 'user@voicely.ai'}
            </div>
          </div>
        </div>
      </Card>

      <Card className="bg-zinc-900/40 backdrop-blur-xl border-zinc-800 p-8 rounded-3xl border-dashed opacity-75">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-rose-500/20 rounded-2xl">
              <Key className="w-6 h-6 text-rose-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-zinc-200">Security & 2FA</h3>
              <p className="text-zinc-500 text-sm italic">Enhanced account protection coming soon</p>
            </div>
          </div>
          <Badge variant="outline" className="text-zinc-500 border-zinc-800">Soon</Badge>
        </div>
      </Card>

      <Card className="bg-rose-500/5 border-rose-500/10 p-8 rounded-3xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-rose-500/20 rounded-2xl">
              <LogOut className="w-6 h-6 text-rose-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Account Session</h3>
              <p className="text-zinc-500 text-sm">Sign out of all devices</p>
            </div>
          </div>
          <Button 
            onClick={handleSignOut}
            className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-2xl px-8"
          >
            Sign Out
          </Button>
        </div>
      </Card>
    </div>
  );

  const renderAIVoiceTab = () => (
    <div className="space-y-6">
      <Card className="bg-zinc-900/40 backdrop-blur-xl border-zinc-800 p-8 rounded-3xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-pink-500/20 rounded-2xl">
            <Volume2 className="w-6 h-6 text-pink-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Default AI Voice</h3>
            <p className="text-zinc-400 text-sm">Preferred synthesis settings for all agents</p>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 block">Global Voice Preference</label>
            <select
              value={settings.voice.defaultVoice}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                voice: { ...prev.voice, defaultVoice: e.target.value }
              }))}
              className="w-full bg-zinc-950 border border-zinc-800 px-6 py-4 rounded-2xl text-white focus:outline-none focus:border-pink-500 transition-all font-medium appearance-none"
            >
              <option value="en-US-Neural2-F">Emma (Standard Female)</option>
              <option value="en-US-Neural2-M">John (Professional Male)</option>
              <option value="en-GB-Neural2-F">Sophie (British Elegance)</option>
              <option value="hi-IN-Neural2-F">Neerja (Hindi Standard)</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Speech Rate</label>
                <span className="text-pink-400 font-mono text-xs">{settings.voice.speechRate}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={settings.voice.speechRate}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  voice: { ...prev.voice, speechRate: parseFloat(e.target.value) }
                }))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Pitch Modulation</label>
                <Badge variant="outline" className="text-[8px] border-zinc-800 text-zinc-600">Locked</Badge>
              </div>
              <div className="w-full h-1.5 bg-zinc-800/50 rounded-lg opacity-30" />
            </div>
          </div>
        </div>
      </Card>

      <Card className="bg-zinc-900/40 backdrop-blur-xl border-zinc-800 p-8 rounded-3xl border-dashed opacity-75">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-500/20 rounded-2xl">
              <Activity className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-zinc-200">Emotional Tone Sync</h3>
              <p className="text-zinc-500 text-sm italic">AI adjusts voice emotion based on customer sentiment</p>
            </div>
          </div>
          <Badge variant="outline" className="text-purple-500/50 border-purple-500/20 bg-purple-500/5">Beta</Badge>
        </div>
      </Card>
    </div>
  );

  const renderProvidersTab = () => (
    <div className="space-y-6">
      <Card className="bg-zinc-900/40 backdrop-blur-xl border-zinc-800 p-8 rounded-3xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-blue-500/20 rounded-2xl">
            <Phone className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Call Providers</h3>
            <p className="text-zinc-400 text-sm">Configure your Twilio or Exotel accounts</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Twilio */}
          <div className="p-6 bg-zinc-800/20 border border-white/5 rounded-2xl">
            <h4 className="text-zinc-200 text-sm font-bold uppercase mb-4 tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span> Twilio
            </h4>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Account SID</label>
                <input
                  type="text"
                  value={twilioForm.accountSid}
                  onChange={e => setTwilioForm(prev => ({...prev, accountSid: e.target.value}))}
                  placeholder="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                  className="w-full bg-zinc-950 border border-zinc-800 px-4 py-3 rounded-xl text-white focus:outline-none focus:border-blue-500 transition-all text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Auth Token</label>
                <input
                  type="password"
                  value={twilioForm.authToken}
                  onChange={e => setTwilioForm(prev => ({...prev, authToken: e.target.value}))}
                  placeholder="Enter Auth Token"
                  className="w-full bg-zinc-950 border border-zinc-800 px-4 py-3 rounded-xl text-white focus:outline-none focus:border-blue-500 transition-all text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Twilio Phone Number</label>
                <input
                  type="text"
                  value={twilioForm.phoneNumber}
                  onChange={e => setTwilioForm(prev => ({...prev, phoneNumber: e.target.value}))}
                  placeholder="+1234567890"
                  className="w-full bg-zinc-950 border border-zinc-800 px-4 py-3 rounded-xl text-white focus:outline-none focus:border-blue-500 transition-all text-sm"
                />
              </div>
            </div>
          </div>

          {/* Plivo (Coming Soon) */}
          <div className="p-6 bg-zinc-800/10 border border-white/5 rounded-2xl opacity-60 pointer-events-none relative overflow-hidden">
            <div className="absolute top-4 right-4">
              <Badge variant="outline" className="text-zinc-400 border-zinc-700 bg-zinc-900/50">Coming Soon</Badge>
            </div>
            <h4 className="text-zinc-400 text-sm font-bold uppercase mb-4 tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 opacity-50"></span> Plivo
            </h4>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-600 uppercase tracking-widest mb-2 block">Auth ID</label>
                <input disabled type="text" placeholder="MAYxxxxxxxxxxxxxxxxxx" className="w-full bg-zinc-950/50 border border-zinc-800/50 px-4 py-3 rounded-xl text-zinc-600 text-sm" />
              </div>
            </div>
          </div>

          {/* Exotel (Coming Soon) */}
          <div className="p-6 bg-zinc-800/10 border border-white/5 rounded-2xl opacity-60 pointer-events-none relative overflow-hidden">
            <div className="absolute top-4 right-4">
              <Badge variant="outline" className="text-zinc-400 border-zinc-700 bg-zinc-900/50">Coming Soon</Badge>
            </div>
            <h4 className="text-zinc-400 text-sm font-bold uppercase mb-4 tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500 opacity-50"></span> Exotel
            </h4>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-600 uppercase tracking-widest mb-2 block">API Key</label>
                <input disabled type="text" placeholder="Enter Exotel API Key" className="w-full bg-zinc-950/50 border border-zinc-800/50 px-4 py-3 rounded-xl text-zinc-600 text-sm" />
              </div>
            </div>
          </div>

          {/* Vonage (Coming Soon) */}
          <div className="p-6 bg-zinc-800/10 border border-white/5 rounded-2xl opacity-60 pointer-events-none relative overflow-hidden">
            <div className="absolute top-4 right-4">
              <Badge variant="outline" className="text-zinc-400 border-zinc-700 bg-zinc-900/50">Coming Soon</Badge>
            </div>
            <h4 className="text-zinc-400 text-sm font-bold uppercase mb-4 tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500 opacity-50"></span> Vonage
            </h4>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-600 uppercase tracking-widest mb-2 block">API Key</label>
                <input disabled type="text" placeholder="Enter Vonage API Key" className="w-full bg-zinc-950/50 border border-zinc-800/50 px-4 py-3 rounded-xl text-zinc-600 text-sm" />
              </div>
            </div>
          </div>

        </div>
      </Card>
    </div>
  );

  const renderIntegrationsTab = () => (
    <div className="space-y-6">
      <Card className="bg-zinc-900/40 backdrop-blur-xl border-zinc-800 p-8 rounded-3xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 rounded-2xl">
              <Send className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Telegram Remote</h3>
              <p className="text-zinc-400 text-sm">Control agents via @VoicelyBot</p>
            </div>
          </div>
          {user?.telegram?.chatId ? (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 px-4 rounded-full">Connected</Badge>
          ) : (
            <Button 
                onClick={handleGenerateTelegramCode}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-lg shadow-blue-600/20"
            >
                Connect Bot
            </Button>
          )}
        </div>

        {telegramCode && (
          <div className="mb-8 p-6 bg-blue-500/5 border border-blue-500/20 rounded-2xl text-center animate-in zoom-in-95">
            <p className="text-zinc-400 text-xs uppercase tracking-widest font-bold mb-3">Your Linking Code</p>
            <div className="text-5xl font-mono text-blue-400 font-bold mb-2 tracking-tighter">
              {telegramCode}
            </div>
            <p className="text-zinc-500 text-xs">Expires in 10 minutes. Send to bot now.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            <div className="p-4 bg-zinc-800/20 rounded-2xl border border-white/5">
                <h4 className="text-zinc-200 text-xs font-bold uppercase mb-1">Status Notifications</h4>
                <p className="text-zinc-500 text-[10px]">Get call alerts directly on phone</p>
            </div>
            <div className="p-4 bg-zinc-800/20 rounded-2xl border border-white/5">
                <h4 className="text-zinc-200 text-xs font-bold uppercase mb-1">Remote Triggers</h4>
                <p className="text-zinc-500 text-[10px]">Start individual/bulk calls via chat</p>
            </div>
        </div>
      </Card>

      <Card className="bg-zinc-900/40 backdrop-blur-xl border-zinc-800 p-8 rounded-3xl border-dashed opacity-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/20 rounded-2xl">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-zinc-300">WhatsApp Automation</h3>
              <p className="text-zinc-500 text-sm italic">Send post-call summaries via WhatsApp</p>
            </div>
          </div>
          <Badge variant="outline" className="text-zinc-600 border-zinc-800">Soon</Badge>
        </div>
      </Card>

      <Card className="bg-zinc-900/40 backdrop-blur-xl border-zinc-800 p-8 rounded-3xl border-dashed opacity-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/20 rounded-2xl">
              <Key className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-zinc-300">API Access</h3>
              <p className="text-zinc-500 text-sm italic">Generate API keys for custom integrations</p>
            </div>
          </div>
          <Badge variant="outline" className="text-zinc-600 border-zinc-800">Soon</Badge>
        </div>
      </Card>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general': return renderGeneralTab();
      case 'ai_voice': return renderAIVoiceTab();
      case 'providers': return renderProvidersTab();
      case 'integrations': return renderIntegrationsTab();
      default: return renderGeneralTab();
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 px-3 sm:px-4 md:px-6 py-6 sm:py-8 md:py-10 pt-20 sm:pt-24">
      <div className="w-full max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <div className="flex items-center mb-4 mt-10">
            <div className="p-2 bg-blue-500/20 rounded-lg mr-4">
              <Settings className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-zinc-100 mb-1">Settings</h1>
              <p className="text-zinc-400 text-sm sm:text-base">Manage your account, preferences, and security settings</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <div className="lg:w-72 flex-shrink-0">
            <Card className="bg-zinc-900/50 border-zinc-800 p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Settings</h3>
              </div>
              <nav className="space-y-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`w-full flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === tab.id
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-lg shadow-blue-500/10'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent'
                        }`}
                    >
                      <Icon className={`w-4 h-4 mr-3 transition-colors ${activeTab === tab.id ? 'text-blue-400' : 'text-zinc-500'
                        }`} />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </Card>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            <div className="animate-in slide-in-from-left-2 duration-300">
            {renderTabContent()}
            
            {isCreatingWorkspace && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                <Card className="w-full max-w-md bg-zinc-900/90 backdrop-blur-2xl border-zinc-800 p-8 rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 duration-300">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-2xl font-bold text-white">New Workspace</h3>
                    <button 
                      onClick={() => setIsCreatingWorkspace(false)}
                      className="p-2 hover:bg-white/5 rounded-full text-zinc-400 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Workspace Name</label>
                      <input
                        type="text"
                        value={newWorkspaceName}
                        onChange={(e) => setNewWorkspaceName(e.target.value)}
                        placeholder="e.g. Real Estate CRM"
                        className="w-full bg-zinc-950 border border-zinc-800 px-6 py-4 rounded-2xl text-white placeholder-zinc-700 focus:outline-none focus:border-blue-500 transition-all font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Category</label>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { id: 'real_estate', label: 'Real Estate' },
                          { id: 'medical', label: 'Clinic' },
                          { id: 'startup', label: 'Sales' },
                          { id: 'ecommerce', label: 'E-commerce' }
                        ].map((cat) => (
                          <button
                            key={cat.id}
                            onClick={() => setNewWorkspaceCategory(cat.id as any)}
                            className={`p-4 rounded-2xl border text-sm font-bold transition-all ${
                              newWorkspaceCategory === cat.id 
                                ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20' 
                                : 'bg-zinc-800/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Button 
                      onClick={handleCreateWorkspace}
                      disabled={loading || !newWorkspaceName}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 rounded-2xl text-lg font-bold mt-4 shadow-lg shadow-blue-600/20"
                    >
                      {loading ? <RefreshCw className="w-6 h-6 animate-spin" /> : "Create Workspace"}
                    </Button>
                  </div>
                </Card>
              </div>
            )}
            </div>

            {/* Save Button */}
            <div className="mt-8 flex justify-end">
              <Button
                onClick={handleSaveSettings}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-zinc-100 font-medium rounded-lg shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/30"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-zinc-100 mr-2"></div>
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage; 