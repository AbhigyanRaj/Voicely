import React, { useState, useMemo } from "react";
import { useQuery } from '@tanstack/react-query';
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { 
  RefreshCw, Eye,
  AlertTriangle, X, Activity, XCircle, CheckCircle, 
  Target, PieChart as PieChartIcon, Calendar
} from 'lucide-react';
import { useAuth } from "../contexts/AuthContext";
import * as auth from "../lib/auth";
import { api } from "../lib/api";
import LiveCallModal from "./LiveCallModal";
import { Skeleton } from "./ui/skeleton";
import { StatCards } from "./analytics/StatCards";
import { Charts } from "./analytics/Charts";
import { BulkCallStats } from "./analytics/BulkCallStats";
import { RecentCallsList } from "./analytics/RecentCallsList";

interface CallData {
  _id: string;
  moduleName?: string;
  customerName: string;
  phoneNumber: string;
  status: 'completed' | 'failed' | 'in-progress' | 'initiated' | 'ringing' | 'answered' | 'busy' | 'no-answer' | 'canceled';
  duration: number;
  createdAt: string;
  completedAt?: string;
  responses?: Map<string, string>;
  transcription?: string;
  summary?: string;
  callType?: 'individual' | 'bulk';
  batchId?: string;
  evaluation?: {
    result: 'INTERESTED' | 'QUALIFIED' | 'UNQUALIFIED' | 'NURTURE' | 'URGENT' | 'BOOKED' | 'YES' | 'NO' | 'MAYBE' | 'INVESTIGATION_REQUIRED' | 'DECLINED';
    comments: string[];
    analysis?: {
      sentiment: 'Enthusiastic' | 'Hesitant' | 'Annoyed' | 'Confused' | 'Neutral';
      objections: string[];
      intentTier: 'High' | 'Medium' | 'Low';
      extractedData: Record<string, any>;
      competitorMentioned: boolean;
    };
    stageAnalysis?: {
      totalQuestions: number;
      questionsReached: number;
      dropOffPoint: string | null;
    };
  };
  module?: {
    name: string;
    _id: string;
  };
}

interface AnalyticsData {
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  averageDuration: number;
  successRate: number;
  callsThisWeek: number;
  callsThisMonth: number;
  topModules: Array<{ name: string; calls: number }>;
  recentCalls: CallData[];
  statusDistribution: Array<{ status: string; count: number; percentage: number }>;
  dailyCalls: Array<{ date: string; count: number }>;
  resultDistribution: {
    yes: number;
    no: number;
    maybe: number;
    total: number;
  };
  intentDistribution: {
    High: number;
    Medium: number;
    Low: number;
  };
  bulkCallStats: Array<{
    batchId: string;
    moduleName: string;
    totalCalls: number;
    yesCount: number;
    noCount: number;
    maybeCount: number;
    conversionRate: number;
    date: string;
  }>;
  moduleWiseResults?: {
    [moduleName: string]: {
      yes: number;
      no: number;
      maybe: number;
      total: number;
    };
  };
  objectionStats: Array<{ subject: string; count: number }>;
}

const getSentimentColor = (sentiment: string) => {
  switch (sentiment) {
    case 'Enthusiastic': return 'bg-green-500/20 text-emerald-400 border-emerald-500/30';
    case 'Hesitant': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'Annoyed': return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    case 'Confused': return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
    default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
  }
};

const getIntentColor = (tier: string) => {
  switch (tier) {
    case 'High': return 'text-emerald-400 font-bold';
    case 'Medium': return 'text-amber-400 font-semibold';
    case 'Low': return 'text-rose-400';
    default: return 'text-zinc-400';
  }
};

const getCategoryLabels = (category: string = 'startup') => {
  switch (category) {
    case 'real_estate':
      return { yes: 'Ready for Viewing', no: 'Not a Fit', maybe: 'Interested' };
    case 'medical':
      return { yes: 'Appointment Set', no: 'General Inquiry', maybe: 'Urgent Follow-up' };
    case 'ecommerce':
      return { yes: 'Purchased', no: 'Feedback', maybe: 'Abandoned Cart' };
    case 'startup':
      return { yes: 'Qualified', no: 'Unqualified', maybe: 'Nurture' };
    default:
      return { yes: 'YES', no: 'NO', maybe: 'MAYBE' };
  }
};


const inferModuleCategory = (moduleName: string = ''): 'E-commerce' | 'Medical' | 'Real Estate' | 'Sales' => {
  const name = moduleName.toLowerCase();
  if (name.includes('shop') || name.includes('store') || name.includes('recovery') || name.includes('order')) return 'E-commerce';
  if (name.includes('med') || name.includes('doctor') || name.includes('health') || name.includes('clinic')) return 'Medical';
  if (name.includes('estate') || name.includes('property') || name.includes('home') || name.includes('lead')) return 'Real Estate';
  return 'Sales';
};

const DEMO_DATA: AnalyticsData = {
  totalCalls: 154,
  completedCalls: 128,
  failedCalls: 26,
  averageDuration: 142,
  successRate: 83.1,
  callsThisWeek: 42,
  callsThisMonth: 154,
  topModules: [
    { name: 'Inbound Sales', calls: 68 },
    { name: 'Lead Qualification', calls: 45 },
    { name: 'Appointment Setting', calls: 31 },
    { name: 'Feedback Collection', calls: 10 }
  ],
  recentCalls: [
    {
      _id: 'demo1',
      customerName: 'Aditya Singh',
      phoneNumber: '+91 98765 43210',
      status: 'completed',
      duration: 185,
      createdAt: new Date().toISOString(),
      moduleName: 'Inbound Sales',
      evaluation: {
        result: 'YES',
        comments: ['Highly interested in premium plan'],
        analysis: {
          sentiment: 'Enthusiastic',
          objections: ['Price'],
          intentTier: 'High',
          extractedData: { budget: '50k+', timeline: 'Immediate' },
          competitorMentioned: false
        }
      }
    },
    {
      _id: 'demo2',
      customerName: 'Priya Sharma',
      phoneNumber: '+91 88888 77777',
      status: 'completed',
      duration: 120,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      moduleName: 'Lead Qualification',
      evaluation: {
        result: 'MAYBE',
        comments: ['Needs approval from manager'],
        analysis: {
          sentiment: 'Neutral',
          objections: ['Authority'],
          intentTier: 'Medium',
          extractedData: { role: 'Manager' },
          competitorMentioned: true
        }
      }
    },
    {
      _id: 'demo3',
      customerName: 'Rahul Verma',
      phoneNumber: '+91 99999 11111',
      status: 'completed',
      duration: 45,
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      moduleName: 'Inbound Sales',
      evaluation: {
        result: 'NO',
        comments: ['Already using a competitor'],
        analysis: {
          sentiment: 'Annoyed',
          objections: ['Competition', 'Need'],
          intentTier: 'Low',
          extractedData: {},
          competitorMentioned: true
        }
      }
    }
  ],
  statusDistribution: [
    { status: 'completed', count: 128, percentage: 83.1 },
    { status: 'failed', count: 12, percentage: 7.8 },
    { status: 'no-answer', count: 14, percentage: 9.1 }
  ],
  dailyCalls: [
    { date: 'Mon', count: 12 },
    { date: 'Tue', count: 18 },
    { date: 'Wed', count: 15 },
    { date: 'Thu', count: 22 },
    { date: 'Fri', count: 19 },
    { date: 'Sat', count: 25 },
    { date: 'Sun', count: 43 }
  ],
  resultDistribution: {
    yes: 78,
    no: 32,
    maybe: 18,
    total: 128
  },
  intentDistribution: {
    High: 54,
    Medium: 48,
    Low: 26
  },
  bulkCallStats: [
    {
      batchId: 'demo_batch',
      moduleName: 'Marketing Blitz',
      totalCalls: 100,
      yesCount: 65,
      noCount: 20,
      maybeCount: 15,
      conversionRate: 65,
      date: new Date().toISOString()
    }
  ],
  moduleWiseResults: {
    'Inbound Sales': { yes: 45, no: 15, maybe: 8, total: 68 },
    'Lead Qualification': { yes: 20, no: 15, maybe: 10, total: 45 }
  },
  objectionStats: [
    { subject: 'Price', count: 45 },
    { subject: 'Timing', count: 32 },
    { subject: 'Trust', count: 18 },
    { subject: 'Need', count: 12 },
    { subject: 'Authority', count: 8 },
    { subject: 'Competition', count: 5 }
  ]
};

const AnalyticsPage: React.FC = () => {
  const { user } = useAuth();
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('month');
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'evaluations' | 'bulk' | 'calls'>('dashboard');
  const [liveCallModal, setLiveCallModal] = useState<{
    callId: string;
    customerName: string;
    phoneNumber: string;
  } | null>(null);
  const [intelModal, setIntelModal] = useState<CallData | null>(null);
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  const { data: queryData, isLoading, error, refetch } = useQuery({
    queryKey: ['analyticsData'],
    queryFn: async () => {
      const token = auth.getStoredToken();
      if (!token) throw new Error("Authentication required");
      const data = await api.getCallHistory(token);
      if (!data.success) throw new Error("Failed to fetch analytics data");
      return data.calls || [];
    },
    enabled: !!user && !isDemoMode,
  });

  const analyticsData = useMemo(() => {
    if (isDemoMode) return DEMO_DATA;
    if (!queryData) return null;
    
    const calls = queryData;
    const now = new Date();
    let filteredCalls = calls;
    
    if (timeRange === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filteredCalls = calls.filter((call: CallData) => new Date(call.createdAt) >= weekAgo);
    } else if (timeRange === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filteredCalls = calls.filter((call: CallData) => new Date(call.createdAt) >= monthAgo);
    } else if (timeRange === 'year') {
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      filteredCalls = calls.filter((call: CallData) => new Date(call.createdAt) >= yearAgo);
    }
    
    const totalCalls = filteredCalls.length;
    const completedCalls = filteredCalls.filter((call: CallData) => call.status === 'completed').length;
    const failedCalls = filteredCalls.filter((call: CallData) => ['failed', 'busy', 'no-answer', 'canceled'].includes(call.status)).length;
    
    const totalDuration = filteredCalls.reduce((sum: number, call: CallData) => sum + (call.duration || 0), 0);
    const averageDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
    
    const successRate = totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0;
    
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const callsThisWeek = calls.filter((call: CallData) => 
      new Date(call.createdAt) >= weekAgo
    ).length;
    
    const callsThisMonth = calls.filter((call: CallData) => 
      new Date(call.createdAt) >= monthAgo
    ).length;
    
    const moduleStats: { [key: string]: number } = {};
    filteredCalls.forEach((call: CallData) => {
      const moduleName = call.moduleName || 'Unknown Module';
      moduleStats[moduleName] = (moduleStats[moduleName] || 0) + 1;
    });
    
    const topModules = Object.entries(moduleStats)
      .map(([name, calls]) => ({ name, calls }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 5);
    
    const statusCounts: { [key: string]: number } = {};
    filteredCalls.forEach((call: CallData) => {
      statusCounts[call.status] = (statusCounts[call.status] || 0) + 1;
    });
    
    const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
      percentage: totalCalls > 0 ? (count / totalCalls) * 100 : 0
    }));
    
    const dailyCalls = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split('T')[0];
      const dayCalls = filteredCalls.filter((call: CallData) => 
        call.createdAt.startsWith(dateStr)
      ).length;
      dailyCalls.push({ date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), count: dayCalls });
    }
    
    const recentCalls = [...filteredCalls]
      .sort((a: CallData, b: CallData) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    const getResultKey = (result: string = ''): 'yes' | 'no' | 'maybe' | null => {
      const r = result.toUpperCase();
      if (['YES', 'BOOKED', 'PURCHASED', 'QUALIFIED'].includes(r)) return 'yes';
      if (['NO', 'GENERAL_INQUIRY', 'FEEDBACK_RECEIVED', 'UNQUALIFIED', 'DECLINED'].includes(r)) return 'no';
      if (['MAYBE', 'INTERESTED', 'URGENT', 'ABANDONED_CART', 'NURTURE', 'INVESTIGATION_REQUIRED'].includes(r)) return 'maybe';
      return null;
    };

    const completedCallsWithResults = filteredCalls.filter((call: CallData) => 
      call.evaluation?.result
    );
    
    const resultDistribution = { yes: 0, no: 0, maybe: 0, total: 0 };
    const intentDistribution = { High: 0, Medium: 0, Low: 0 };
    const moduleWiseResults: { [key: string]: { yes: number; no: number; maybe: number; total: number } } = {};
    const objectionCounts: { [key: string]: number } = {};

    completedCallsWithResults.forEach((call: CallData) => {
      const key = getResultKey(call.evaluation?.result);
      if (!key) return;

      const intent = (call.evaluation?.analysis?.intentTier || 'Medium') as 'High' | 'Medium' | 'Low';
      intentDistribution[intent]++;

      if (call.evaluation?.analysis?.objections) {
        call.evaluation.analysis.objections.forEach((obj: string) => {
          objectionCounts[obj] = (objectionCounts[obj] || 0) + 1;
        });
      }

      const moduleName = call.module?.name || 'Unknown Module';
      if (!moduleWiseResults[moduleName]) {
        moduleWiseResults[moduleName] = { yes: 0, no: 0, maybe: 0, total: 0 };
      }

      resultDistribution.total++;
      resultDistribution[key]++;
      
      moduleWiseResults[moduleName].total++;
      moduleWiseResults[moduleName][key]++;
    });
    
    const bulkCalls = filteredCalls.filter((call: CallData) => call.callType === 'bulk' && call.batchId);
    const batchGroups: { [key: string]: CallData[] } = {};
    
    bulkCalls.forEach((call: CallData) => {
      if (call.batchId) {
        if (!batchGroups[call.batchId]) {
          batchGroups[call.batchId] = [];
        }
        batchGroups[call.batchId].push(call);
      }
    });
    
    const objectionStats = Object.entries(objectionCounts)
      .map(([subject, count]) => ({ subject, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const bulkCallStats = Object.entries(batchGroups).map(([batchId, calls]) => {
      const completedInBatch = calls.filter(c => c.status === 'completed' && c.evaluation?.result);
      const yesInBatch = completedInBatch.filter(c => c.evaluation?.result === 'YES').length;
      const noInBatch = completedInBatch.filter(c => c.evaluation?.result === 'NO').length;
      const maybeInBatch = completedInBatch.filter(c => c.evaluation?.result === 'MAYBE').length;
      
      return {
        batchId,
        moduleName: calls[0]?.moduleName || 'Unknown',
        totalCalls: calls.length,
        yesCount: yesInBatch,
        noCount: noInBatch,
        maybeCount: maybeInBatch,
        conversionRate: completedInBatch.length > 0 ? (yesInBatch / completedInBatch.length) * 100 : 0,
        date: calls[0]?.createdAt || ''
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      totalCalls,
      completedCalls,
      failedCalls,
      averageDuration,
      successRate,
      callsThisWeek,
      callsThisMonth,
      topModules,
      recentCalls,
      statusDistribution,
      dailyCalls,
      resultDistribution,
      intentDistribution,
      bulkCallStats,
      moduleWiseResults,
      objectionStats: objectionStats.length > 0 ? objectionStats : [
        { subject: 'Price', count: 0 },
        { subject: 'Timing', count: 0 },
        { subject: 'Trust', count: 0 },
        { subject: 'Need', count: 0 },
        { subject: 'Authority', count: 0 },
        { subject: 'Competition', count: 0 },
      ]
    };
  }, [queryData, isDemoMode, timeRange]);

  const toggleDemoMode = () => {
    setIsDemoMode(!isDemoMode);
  };






  // Fix duration formatting - duration is in seconds
  const formatDuration = (seconds: number) => {
    if (!seconds || seconds === 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading && !isDemoMode) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-[#0a0a0a] pt-24 pb-12 px-4 sm:px-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-[#0a0a0a] to-[#0a0a0a] pointer-events-none"></div>
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
        
        <div className="w-full max-w-7xl mx-auto relative z-10 space-y-8">
          
          {/* Header Skeleton */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 border-b border-white/[0.06] pb-8">
            <div className="space-y-4">
              <Skeleton className="w-24 h-6 rounded-full bg-white/[0.04]" />
              <Skeleton className="w-48 h-10 rounded-lg bg-white/[0.04]" />
              <Skeleton className="w-72 h-4 rounded-md bg-white/[0.04]" />
            </div>
            <Skeleton className="w-64 h-10 rounded-xl bg-white/[0.04]" />
          </div>

          {/* Stat Cards Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                <div className="flex justify-between items-start mb-4">
                  <div className="space-y-3">
                    <Skeleton className="w-20 h-4 rounded-md bg-white/[0.04]" />
                    <Skeleton className="w-32 h-8 rounded-lg bg-white/[0.04]" />
                  </div>
                  <Skeleton className="w-10 h-10 rounded-xl bg-white/[0.04]" />
                </div>
              </div>
            ))}
          </div>

          {/* Charts Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 relative h-[400px] flex flex-col">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
              <Skeleton className="w-48 h-6 rounded-md bg-white/[0.04] mb-8" />
              <Skeleton className="w-full flex-1 rounded-xl bg-white/[0.02] border border-white/[0.03]" />
            </div>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 relative h-[400px] flex flex-col">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
              <Skeleton className="w-40 h-6 rounded-md bg-white/[0.04] mb-8" />
              <div className="flex-1 flex items-center justify-center">
                <Skeleton className="w-48 h-48 rounded-full bg-white/[0.02] border border-white/[0.03]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !isDemoMode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 px-2 sm:px-4 py-8 sm:py-10 pt-24">
        <div className="w-full max-w-6xl mx-auto">
          <div className="text-center">
            <div className="text-red-400 mb-4">{error.message || "Failed to load analytics data"}</div>
            <Button onClick={() => refetch()} className="bg-blue-600 hover:bg-blue-700">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 px-2 sm:px-4 py-8 sm:py-10 pt-24">
        <div className="w-full max-w-6xl mx-auto">
          <div className="text-center">
            <div className="text-zinc-400 mb-4">No analytics data available</div>
            <Button onClick={() => refetch()} className="bg-blue-600 hover:bg-blue-700">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Live Call Modal */}
        {liveCallModal && (
          <LiveCallModal
            callId={liveCallModal.callId}
            customerName={liveCallModal.customerName}
            phoneNumber={liveCallModal.phoneNumber}
            onClose={() => setLiveCallModal(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-zinc-950 px-4 sm:px-6 pt-24 pb-12">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-zinc-950 to-zinc-950 pointer-events-none"></div>
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
      
      <div className="w-full max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-6 sm:mb-8 text-left flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight mb-1">Analytics<span className="text-zinc-500">.</span></h1>
            <p className="text-zinc-400 text-xs">Track your call performance and insights.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative flex items-center bg-zinc-900 border border-white/[0.05] rounded-lg overflow-hidden group hover:border-white/10 transition-colors">
              <div className="pl-3 pr-2 flex items-center justify-center pointer-events-none">
                <Calendar className="w-4 h-4 text-zinc-400 group-hover:text-white transition-colors" />
              </div>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as 'week' | 'month' | 'year')}
                className="bg-transparent text-sm text-white font-medium pl-1 pr-8 py-2 outline-none appearance-none cursor-pointer w-36"
              >
                <option value="week" className="bg-zinc-900">Last 7 Days</option>
                <option value="month" className="bg-zinc-900">Last 30 Days</option>
                <option value="year" className="bg-zinc-900">This Year</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1L5 5L9 1" stroke="#A1A1AA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            
            <button 
              onClick={toggleDemoMode}
              className={`text-xs px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-all ${isDemoMode ? "bg-amber-500 hover:bg-amber-600 text-black" : "bg-zinc-900 border border-white/[0.05] text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}
            >
              <Target className="w-4 h-4" />
              {isDemoMode ? "Exit Demo" : "Demo"}
            </button>
            <button 
              onClick={() => {
                setIsDemoMode(false);
                refetch();
              }}
              className="text-xs px-4 py-2 rounded-lg flex items-center gap-2 font-medium bg-zinc-900 border border-white/[0.05] text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
          


        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-zinc-900/50 border border-white/[0.05] rounded-lg w-fit mb-8 overflow-x-auto max-w-full">
          {[
            { id: 'dashboard', label: 'Overview' },
            { id: 'evaluations', label: 'Evaluations' },
            { id: 'bulk', label: 'Bulk Campaigns' },
            { id: 'calls', label: 'Call Logs' },
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)} 
              className={`px-4 py-2 rounded-md text-[13px] font-medium transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <StatCards 
              analyticsData={analyticsData} 
              timeRange={timeRange} 
              formatDuration={formatDuration} 
            />
            <Charts 
              analyticsData={analyticsData} 
              selectedModuleFilter={selectedModuleFilter} 
              inferModuleCategory={inferModuleCategory}
              view="overview"
            />
          </div>
        )}

        {activeTab === 'evaluations' && (
          <div className="space-y-6">
            {/* AI Result Distribution */}
            <Card className="bg-zinc-900 border border-white/[0.05] shadow-md p-5 sm:p-6 mb-6 sm:mb-8 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">AI Evaluation Results</h3>
              <p className="text-xs text-zinc-400 mt-1">Lead qualification from customer conversations</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Module Filter Dropdown */}
              <select
                value={selectedModuleFilter}
                onChange={(e) => setSelectedModuleFilter(e.target.value)}
                className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 hover:bg-zinc-700 transition-colors"
              >
                <option value="all">All Modules</option>
                {analyticsData?.moduleWiseResults && Object.keys(analyticsData.moduleWiseResults).map((moduleName) => (
                  <option key={moduleName} value={moduleName}>{moduleName}</option>
                ))}
              </select>
              <Badge variant="outline" className="text-xs text-white">
                {selectedModuleFilter === 'all' 
                  ? `${analyticsData?.resultDistribution?.total || 0} Total`
                  : `${analyticsData?.moduleWiseResults?.[selectedModuleFilter]?.total || 0} Calls`
                }
              </Badge>
            </div>
          </div>
          
          {(() => {
            const displayData = selectedModuleFilter === 'all' 
              ? analyticsData?.resultDistribution
              : analyticsData?.moduleWiseResults?.[selectedModuleFilter];
            
            if (!displayData || displayData.total === 0) {
              return (
                <div className="text-center py-8">
                  <p className="text-zinc-400 text-sm">No evaluation data available for this module</p>
                </div>
              );
            }
            
            return (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  {/* Yes Count */}
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-green-400 font-bold uppercase tracking-wider">
                        {getCategoryLabels(user?.currentWorkspace?.category).yes}
                      </span>
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    </div>
                    <p className="text-xl font-bold text-white">{displayData.yes || 0}</p>
                    <p className="text-[10px] text-zinc-400">
                      {displayData.total > 0 
                        ? `${((displayData.yes / displayData.total) * 100).toFixed(1)}%`
                        : '0%'} rate
                    </p>
                  </div>

                  {/* No Count */}
                  <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">
                        {getCategoryLabels(user?.currentWorkspace?.category).no}
                      </span>
                      <XCircle className="w-4 h-4 text-red-400" />
                    </div>
                    <p className="text-xl font-bold text-white">{displayData.no || 0}</p>
                    <p className="text-[10px] text-zinc-400">
                      {displayData.total > 0 
                        ? `${((displayData.no / displayData.total) * 100).toFixed(1)}%`
                        : '0%'} rate
                    </p>
                  </div>

                  {/* Maybe Count */}
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-yellow-400 font-bold uppercase tracking-wider">
                        {getCategoryLabels(user?.currentWorkspace?.category).maybe}
                      </span>
                      <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    </div>
                    <p className="text-xl font-bold text-white">{displayData.maybe || 0}</p>
                    <p className="text-[10px] text-zinc-400">
                      {displayData.total > 0 
                        ? `${((displayData.maybe / displayData.total) * 100).toFixed(1)}%`
                        : '0%'} rate
                    </p>
                  </div>
                </div>

                {/* Visual Bar */}
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden flex">
                  <div 
                    className="bg-green-500 h-full transition-all duration-500"
                    style={{ 
                      width: displayData.total > 0 
                        ? `${(displayData.yes / displayData.total) * 100}%` 
                        : '0%' 
                    }}
                  ></div>
                  <div 
                    className="bg-red-500 h-full transition-all duration-500"
                    style={{ 
                      width: displayData.total > 0 
                        ? `${(displayData.no / displayData.total) * 100}%` 
                        : '0%' 
                    }}
                  ></div>
                  <div 
                    className="bg-yellow-500 h-full transition-all duration-500"
                    style={{ 
                      width: displayData.total > 0 
                        ? `${(displayData.maybe / displayData.total) * 100}%` 
                        : '0%' 
                    }}
                  ></div>
                </div>
              </>
            );
          })()}
        </Card>
        
        <Charts 
          analyticsData={analyticsData} 
          selectedModuleFilter={selectedModuleFilter} 
          inferModuleCategory={inferModuleCategory}
          view="evaluations"
        />
          </div>
        )}

        {activeTab === 'bulk' && (
          <div className="space-y-6">
            <BulkCallStats 
              bulkCallStats={analyticsData?.bulkCallStats} 
              formatDate={formatDate} 
            />
          </div>
        )}

        {/* Live Call Modal */}
        {liveCallModal && (
          <LiveCallModal
            callId={liveCallModal.callId}
            customerName={liveCallModal.customerName}
            phoneNumber={liveCallModal.phoneNumber}
            onClose={() => setLiveCallModal(null)}
          />
        )}

        {activeTab === 'calls' && (
          <div className="space-y-6">
            <RecentCallsList
              recentCalls={analyticsData?.recentCalls}
              user={user}
              formatDuration={formatDuration}
              getSentimentColor={getSentimentColor}
              getIntentColor={getIntentColor}
              expandedCallId={expandedCallId}
              setExpandedCallId={setExpandedCallId}
              setIntelModal={setIntelModal}
              setLiveCallModal={setLiveCallModal}
            />
          </div>
        )}
      </div>

      {/* Lead Intel Modal */}
      {intelModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <Card className="bg-zinc-900 border-zinc-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem] shadow-2xl relative">
            <button 
              onClick={() => setIntelModal(null)}
              className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/5 text-zinc-500 hover:text-white transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-8 md:p-10">
              <div className="flex items-center gap-4 mb-8">
                <div className={`p-3 rounded-2xl ${getSentimentColor(intelModal.evaluation?.analysis?.sentiment || 'Neutral')}`}>
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">Lead Intelligence</h3>
                  <p className="text-zinc-400 text-sm">Psychological breakdown for {intelModal.customerName}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-zinc-800/30 p-5 rounded-2xl border border-white/5">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Sentiment</p>
                  <p className={`text-lg font-semibold ${getSentimentColor(intelModal.evaluation?.analysis?.sentiment || 'Neutral').split(' ').slice(1).join(' ')}`}>
                    {intelModal.evaluation?.analysis?.sentiment || 'Neutral'}
                  </p>
                </div>
                <div className="bg-zinc-800/30 p-5 rounded-2xl border border-white/5">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">Intent Tier</p>
                  <p className={`text-lg font-semibold ${getIntentColor(intelModal.evaluation?.analysis?.intentTier || 'Medium')}`}>
                    {intelModal.evaluation?.analysis?.intentTier || 'Medium'} Intent
                  </p>
                </div>
              </div>

              {intelModal.summary && (
                <div className="mb-8 p-6 bg-white/[0.02] rounded-2xl border border-white/5">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-3">AI Executive Summary</p>
                  <p className="text-zinc-300 leading-relaxed italic">"{intelModal.summary}"</p>
                </div>
              )}

              {intelModal.evaluation?.analysis?.objections && intelModal.evaluation.analysis.objections.length > 0 && (
                <div className="mb-8">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-4">Core Objections & Friction</p>
                  <div className="flex flex-wrap gap-2">
                    {intelModal.evaluation.analysis.objections.map((obj, i) => (
                      <span key={i} className="px-4 py-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full text-xs font-medium">
                        {obj}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
      {/* Live Call Modal */}
      {liveCallModal && (
        <LiveCallModal
          callId={liveCallModal.callId}
          customerName={liveCallModal.customerName}
          phoneNumber={liveCallModal.phoneNumber}
          onClose={() => setLiveCallModal(null)}
        />
      )}
    </div>
  );
};

export default AnalyticsPage;