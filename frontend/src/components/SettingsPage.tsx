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
    <div className="space-y-4">
      <Card className="bg-[#09090b] border border-white/[0.05] p-6 rounded-2xl relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/[0.02] rounded-full blur-[80px] pointer-events-none"></div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 rounded-xl">
              <LayoutGrid className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Active Workspace</h3>
              <p className="text-zinc-400 text-xs">Managing your current operational environment</p>
            </div>
          </div>
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 px-3 py-0.5 text-[10px] rounded-full">Active</Badge>
        </div>
        
        <div className="p-4 bg-zinc-800/20 border border-white/5 rounded-xl flex items-center justify-between mb-5">
          <div>
            <div className="text-white font-semibold text-sm">{user?.currentWorkspace?.name || 'Loading...'}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5 font-bold">
              {user?.currentWorkspace?.category?.replace('_', ' ') || 'General'}
            </div>
          </div>
          <Button 
            onClick={() => setIsCreatingWorkspace(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg h-8 px-3 text-xs flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Workspace</span>
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] px-1 mb-1.5">Switch Workspace</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {workspaces.filter(ws => ws._id !== user?.currentWorkspace?._id).map((ws) => (
              <button
                key={ws._id}
                onClick={() => handleSwitchWorkspace(ws._id)}
                className="p-3 bg-zinc-800/10 border border-zinc-800 hover:border-zinc-700 rounded-xl flex items-center justify-between group transition-all"
              >
                <div className="text-left">
                  <div className="text-zinc-300 font-medium text-xs group-hover:text-white transition-colors">{ws.name}</div>
                  <div className="text-[9px] text-zinc-500 uppercase tracking-widest mt-0.5">{ws.category.replace('_', ' ')}</div>
                </div>
                <RefreshCw className="w-3.5 h-3.5 text-zinc-600 group-hover:text-blue-400 group-hover:rotate-180 transition-all duration-500" />
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="bg-[#09090b] border border-white/[0.05] p-6 rounded-2xl relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/[0.02] rounded-full blur-[80px] pointer-events-none"></div>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-emerald-500/20 rounded-xl">
            <User className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Profile</h3>
            <p className="text-zinc-400 text-xs">Personal account details</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Full Name</label>
            <div className="p-3 bg-zinc-800/20 border border-white/5 rounded-xl text-zinc-200 text-xs font-medium">
              {user?.name || 'Voicely User'}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Email Address</label>
            <div className="p-3 bg-zinc-800/20 border border-white/5 rounded-xl text-zinc-200 text-xs font-medium">
              {user?.email || 'user@voicely.ai'}
            </div>
          </div>
        </div>
      </Card>

      <Card className="bg-[#09090b] border border-white/[0.05] border-dashed p-6 rounded-2xl relative overflow-hidden opacity-75">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/[0.01] rounded-full blur-[80px] pointer-events-none"></div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-500/20 rounded-xl">
              <Key className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-200">Security & 2FA</h3>
              <p className="text-zinc-500 text-xs italic">Enhanced account protection coming soon</p>
            </div>
          </div>
          <Badge variant="outline" className="text-zinc-500 border-zinc-800 text-[10px] px-2 py-0">Soon</Badge>
        </div>
      </Card>

      <Card className="bg-[#09090b] border border-rose-500/20 p-6 rounded-2xl relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-48 h-48 bg-rose-500/[0.02] rounded-full blur-[80px] pointer-events-none"></div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-500/20 rounded-xl">
              <LogOut className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Account Session</h3>
              <p className="text-zinc-500 text-xs">Sign out of all devices</p>
            </div>
          </div>
          <Button 
            onClick={handleSignOut}
            className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg px-5 h-8 text-xs font-medium"
          >
            Sign Out
          </Button>
        </div>
      </Card>
    </div>
  );

  const renderAIVoiceTab = () => (
    <div className="space-y-4">
      <Card className="bg-[#09090b] border border-white/[0.05] p-6 rounded-2xl relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/[0.02] rounded-full blur-[80px] pointer-events-none"></div>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-pink-500/20 rounded-xl">
            <Volume2 className="w-5 h-5 text-pink-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Default AI Voice</h3>
            <p className="text-zinc-400 text-xs">Preferred synthesis settings for all agents</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 block">Global Voice Preference</label>
            <select
              value={settings.voice.defaultVoice}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                voice: { ...prev.voice, defaultVoice: e.target.value }
              }))}
              className="w-full bg-zinc-950 border border-zinc-800 px-4 py-2.5 rounded-xl text-white focus:outline-none focus:border-pink-500 transition-all font-medium text-xs appearance-none"
            >
              <option value="en-US-Neural2-F">Emma (Standard Female)</option>
              <option value="en-US-Neural2-M">John (Professional Male)</option>
              <option value="en-GB-Neural2-F">Sophie (British Elegance)</option>
              <option value="hi-IN-Neural2-F">Neerja (Hindi Standard)</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Speech Rate</label>
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
                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Pitch Modulation</label>
                <Badge variant="outline" className="text-[8px] border-zinc-800 text-zinc-600 px-1.5 py-0">Locked</Badge>
              </div>
              <div className="w-full h-1 bg-zinc-800/50 rounded-lg opacity-30" />
            </div>
          </div>
        </div>
      </Card>

      <Card className="bg-[#09090b] border border-white/[0.05] border-dashed p-6 rounded-2xl relative overflow-hidden opacity-75">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/[0.01] rounded-full blur-[80px] pointer-events-none"></div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/20 rounded-xl">
              <Activity className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-200">Emotional Tone Sync</h3>
              <p className="text-zinc-500 text-xs italic">AI adjusts voice emotion based on customer sentiment</p>
            </div>
          </div>
          <Badge variant="outline" className="text-purple-500/50 border-purple-500/20 bg-purple-500/5 text-[10px] px-2 py-0">Beta</Badge>
        </div>
      </Card>
    </div>
  );

  const renderProvidersTab = () => (
    <div className="space-y-4">
      <Card className="bg-[#09090b] border border-white/[0.05] p-6 rounded-2xl relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/[0.02] rounded-full blur-[80px] pointer-events-none"></div>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-blue-500/20 rounded-xl">
            <Phone className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Call Providers</h3>
            <p className="text-zinc-400 text-xs">Configure your Twilio or Exotel accounts</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Twilio */}
          <div className="p-4 bg-zinc-800/20 border border-white/5 rounded-xl">
            <h4 className="text-zinc-200 text-xs font-bold uppercase mb-3 tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Twilio
            </h4>
            
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">Account SID</label>
                <input
                  type="text"
                  value={twilioForm.accountSid}
                  onChange={e => setTwilioForm(prev => ({...prev, accountSid: e.target.value}))}
                  placeholder="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                  className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-all text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">Auth Token</label>
                <input
                  type="password"
                  value={twilioForm.authToken}
                  onChange={e => setTwilioForm(prev => ({...prev, authToken: e.target.value}))}
                  placeholder="Enter Auth Token"
                  className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-all text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5 block">Twilio Phone Number</label>
                <input
                  type="text"
                  value={twilioForm.phoneNumber}
                  onChange={e => setTwilioForm(prev => ({...prev, phoneNumber: e.target.value}))}
                  placeholder="+1234567890"
                  className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-all text-xs"
                />
              </div>
            </div>
          </div>

          {/* Plivo (Coming Soon) */}
          <div className="p-4 bg-zinc-800/10 border border-white/5 rounded-xl opacity-60 pointer-events-none relative overflow-hidden">
            <div className="absolute top-3 right-3">
              <Badge variant="outline" className="text-zinc-400 border-zinc-700 bg-zinc-900/50 text-[9px] px-1.5 py-0">Coming Soon</Badge>
            </div>
            <h4 className="text-zinc-400 text-xs font-bold uppercase mb-3 tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 opacity-50"></span> Plivo
            </h4>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-1.5 block">Auth ID</label>
                <input disabled type="text" placeholder="MAYxxxxxxxxxxxxxxxxxx" className="w-full bg-zinc-950/50 border border-zinc-800/50 px-3 py-2 rounded-lg text-zinc-600 text-xs" />
              </div>
            </div>
          </div>

          {/* Exotel (Coming Soon) */}
          <div className="p-4 bg-zinc-800/10 border border-white/5 rounded-xl opacity-60 pointer-events-none relative overflow-hidden">
            <div className="absolute top-3 right-3">
              <Badge variant="outline" className="text-zinc-400 border-zinc-700 bg-zinc-900/50 text-[9px] px-1.5 py-0">Coming Soon</Badge>
            </div>
            <h4 className="text-zinc-400 text-xs font-bold uppercase mb-3 tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 opacity-50"></span> Exotel
            </h4>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-1.5 block">API Key</label>
                <input disabled type="text" placeholder="Enter Exotel API Key" className="w-full bg-zinc-950/50 border border-zinc-800/50 px-3 py-2 rounded-lg text-zinc-600 text-xs" />
              </div>
            </div>
          </div>

          {/* Vonage (Coming Soon) */}
          <div className="p-4 bg-zinc-800/10 border border-white/5 rounded-xl opacity-60 pointer-events-none relative overflow-hidden">
            <div className="absolute top-3 right-3">
              <Badge variant="outline" className="text-zinc-400 border-zinc-700 bg-zinc-900/50 text-[9px] px-1.5 py-0">Coming Soon</Badge>
            </div>
            <h4 className="text-zinc-400 text-xs font-bold uppercase mb-3 tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 opacity-50"></span> Vonage
            </h4>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-1.5 block">API Key</label>
                <input disabled type="text" placeholder="Enter Vonage API Key" className="w-full bg-zinc-950/50 border border-zinc-800/50 px-3 py-2 rounded-lg text-zinc-600 text-xs" />
              </div>
            </div>
          </div>

        </div>
      </Card>
    </div>
  );

  const renderIntegrationsTab = () => (
    <div className="space-y-4">
      <Card className="bg-[#09090b] border border-white/[0.05] p-6 rounded-2xl relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/[0.02] rounded-full blur-[80px] pointer-events-none"></div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 rounded-xl">
              <Send className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Telegram Remote</h3>
              <p className="text-zinc-400 text-xs">Control agents via @VoicelyBot</p>
            </div>
          </div>
          {user?.telegram?.chatId ? (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 px-3 py-0.5 text-[10px] rounded-full">Connected</Badge>
          ) : (
            <Button 
                onClick={handleGenerateTelegramCode}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm h-8 px-3 text-xs"
            >
                Connect Bot
            </Button>
          )}
        </div>

        {telegramCode && (
          <div className="mb-6 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl text-center animate-in zoom-in-95">
            <p className="text-zinc-400 text-[10px] uppercase tracking-widest font-bold mb-2">Your Linking Code</p>
            <div className="text-3xl font-mono text-blue-400 font-bold mb-1 tracking-tighter">
              {telegramCode}
            </div>
            <p className="text-zinc-500 text-[10px]">Expires in 10 minutes. Send to bot now.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <div className="p-3 bg-zinc-800/20 rounded-xl border border-white/5">
                <h4 className="text-zinc-200 text-[10px] font-bold uppercase mb-1">Status Notifications</h4>
                <p className="text-zinc-500 text-[9px]">Get call alerts directly on phone</p>
            </div>
            <div className="p-3 bg-zinc-800/20 rounded-xl border border-white/5">
                <h4 className="text-zinc-200 text-[10px] font-bold uppercase mb-1">Remote Triggers</h4>
                <p className="text-zinc-500 text-[9px]">Start individual/bulk calls via chat</p>
            </div>
        </div>
      </Card>

      <Card className="bg-[#09090b] border border-white/[0.05] border-dashed p-6 rounded-2xl relative overflow-hidden opacity-50">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/[0.01] rounded-full blur-[80px] pointer-events-none"></div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 rounded-xl">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-300">WhatsApp Automation</h3>
              <p className="text-zinc-500 text-xs italic">Send post-call summaries via WhatsApp</p>
            </div>
          </div>
          <Badge variant="outline" className="text-zinc-600 border-zinc-800 text-[10px] px-2 py-0">Soon</Badge>
        </div>
      </Card>

      <Card className="bg-[#09090b] border border-white/[0.05] border-dashed p-6 rounded-2xl relative overflow-hidden opacity-50">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/[0.01] rounded-full blur-[80px] pointer-events-none"></div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 rounded-xl">
              <Key className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-300">API Access</h3>
              <p className="text-zinc-500 text-xs italic">Generate API keys for custom integrations</p>
            </div>
          </div>
          <Badge variant="outline" className="text-zinc-600 border-zinc-800 text-[10px] px-2 py-0">Soon</Badge>
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
    <div className="min-h-screen relative overflow-hidden bg-[#050505] px-4 sm:px-6 pt-24 pb-12">
      {/* Rich Background Elements */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-blue-500/[0.03] rounded-full blur-[120px] pointer-events-none"></div>
      
      <div className="w-full max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-8 sm:mb-10 text-left">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.05] bg-white/[0.02] mb-3">
            <Settings className="w-3 h-3 text-blue-400" />
            <span className="text-[9px] font-bold tracking-widest text-zinc-300 uppercase">Configuration</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">Settings<span className="text-zinc-500">.</span></h1>
          <p className="text-zinc-400 text-xs leading-relaxed">
            Manage your account, preferences, and workspace configuration.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Sidebar */}
          <div className="lg:w-64 flex-shrink-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="bg-[#09090b] border border-white/[0.08] p-5 rounded-2xl shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
              <div className="mb-4">
                <h3 className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Menu</h3>
              </div>
              <nav className="space-y-1 relative z-10">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`w-full flex items-center px-3 py-2 rounded-lg text-xs font-medium transition-all duration-300 ${activeTab === tab.id
                        ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800 border border-transparent'
                        }`}
                    >
                      <Icon className={`w-3.5 h-3.5 mr-2.5 transition-colors ${activeTab === tab.id ? 'text-blue-400' : 'text-zinc-500'
                        }`} />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 w-full animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
            <div className="space-y-4">
            {renderTabContent()}
            
            {isCreatingWorkspace && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                <Card className="w-full max-w-sm bg-zinc-900 border-zinc-800 p-6 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-300">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-white">New Workspace</h3>
                    <button 
                      onClick={() => setIsCreatingWorkspace(false)}
                      className="p-1.5 hover:bg-white/5 rounded-full text-zinc-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Workspace Name</label>
                      <input
                        type="text"
                        value={newWorkspaceName}
                        onChange={(e) => setNewWorkspaceName(e.target.value)}
                        placeholder="e.g. Real Estate CRM"
                        className="w-full bg-zinc-950 border border-zinc-800 px-4 py-2.5 rounded-xl text-white placeholder-zinc-700 focus:outline-none focus:border-blue-500 transition-all text-xs font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Category</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'real_estate', label: 'Real Estate' },
                          { id: 'medical', label: 'Clinic' },
                          { id: 'startup', label: 'Sales' },
                          { id: 'ecommerce', label: 'E-commerce' }
                        ].map((cat) => (
                          <button
                            key={cat.id}
                            onClick={() => setNewWorkspaceCategory(cat.id as any)}
                            className={`p-2.5 rounded-xl border text-xs font-medium transition-all ${
                              newWorkspaceCategory === cat.id 
                                ? 'bg-blue-600 border-blue-500 text-white shadow-sm' 
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
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-xs font-semibold mt-2 shadow-sm"
                    >
                      {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Create Workspace"}
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
                className="h-11 px-8 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 text-sm"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
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