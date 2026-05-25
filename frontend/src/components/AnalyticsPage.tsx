import React, { useState, useEffect } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, RadarChart, PolarGrid, 
  PolarAngleAxis, Radar, Legend, AreaChart, Area
} from 'recharts';
import { 
  PhoneCall, RefreshCw, Clock, Eye,
  AlertTriangle, X, Activity, TrendingUp, XCircle, CheckCircle, 
  Target, PieChart as PieChartIcon, ShoppingCart, Calendar, Stethoscope
} from 'lucide-react';
import { useAuth } from "../contexts/AuthContext";
import * as auth from "../lib/auth";
import { api } from "../lib/api";
import LiveCallModal from "./LiveCallModal";
import LeadTimeline from "./LeadTimeline";

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
    result: 'YES' | 'NO' | 'MAYBE' | 'INVESTIGATION_REQUIRED' | 'DECLINED';
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
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('month');
  const [error, setError] = useState("");
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<string>('all');
  const [liveCallModal, setLiveCallModal] = useState<{
    callId: string;
    customerName: string;
    phoneNumber: string;
  } | null>(null);
  const [intelModal, setIntelModal] = useState<CallData | null>(null);
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  const fetchAnalyticsData = async () => {
    if (!user) return;
    
    setLoading(true);
    setError("");
    
    try {
      const token = auth.getStoredToken();
      if (!token) {
        setError("Authentication required");
        return;
      }

      // Fetch call history from backend using the API service
      const data = await api.getCallHistory(token);
      
      if (!data.success) {
        setError("Failed to fetch analytics data");
        return;
      }

      // Process the call data to create analytics
      const calls = data.calls || [];
      
      // Filter calls based on time range
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
      
      // Calculate analytics from filtered data
      const totalCalls = filteredCalls.length;
      const completedCalls = filteredCalls.filter((call: CallData) => call.status === 'completed').length;
      const failedCalls = filteredCalls.filter((call: CallData) => ['failed', 'busy', 'no-answer', 'canceled'].includes(call.status)).length;
      
      // Fix duration calculation - duration is in seconds, convert to minutes
      const totalDuration = filteredCalls.reduce((sum: number, call: CallData) => sum + (call.duration || 0), 0);
      const averageDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
      
      const successRate = totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0;
      
      // Calculate time-based metrics
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const callsThisWeek = calls.filter((call: CallData) => 
        new Date(call.createdAt) >= weekAgo
      ).length;
      
      const callsThisMonth = calls.filter((call: CallData) => 
        new Date(call.createdAt) >= monthAgo
      ).length;
      
      // Calculate top modules
      const moduleStats: { [key: string]: number } = {};
      filteredCalls.forEach((call: CallData) => {
        const moduleName = call.moduleName || 'Unknown Module';
        moduleStats[moduleName] = (moduleStats[moduleName] || 0) + 1;
      });
      
      const topModules = Object.entries(moduleStats)
        .map(([name, calls]) => ({ name, calls }))
        .sort((a, b) => b.calls - a.calls)
        .slice(0, 5);
      
      // Calculate status distribution
      const statusCounts: { [key: string]: number } = {};
      filteredCalls.forEach((call: CallData) => {
        statusCounts[call.status] = (statusCounts[call.status] || 0) + 1;
      });
      
      const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
        percentage: totalCalls > 0 ? (count / totalCalls) * 100 : 0
      }));
      
      // Calculate daily calls for the last 7 days
      const dailyCalls = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];
        const dayCalls = filteredCalls.filter((call: CallData) => 
          call.createdAt.startsWith(dateStr)
        ).length;
        dailyCalls.push({ date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), count: dayCalls });
      }
      
      // Get recent calls (last 10)
      const recentCalls = filteredCalls
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

        // Intent Aggregation
        const intent = (call.evaluation?.analysis?.intentTier || 'Medium') as 'High' | 'Medium' | 'Low';
        intentDistribution[intent]++;

        // Objection Aggregation (Standardized)
        if (call.evaluation?.analysis?.objections) {
          call.evaluation.analysis.objections.forEach(obj => {
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
      
      // Calculate bulk call statistics
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
      
      // Objection stats already calculated in main loop
      
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

      setAnalyticsData({
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
      });
      
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setError("Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  };

  const toggleDemoMode = () => {
    if (!isDemoMode) {
      setAnalyticsData(DEMO_DATA);
      setIsDemoMode(true);
    } else {
      setIsDemoMode(false);
      fetchAnalyticsData();
    }
  };

  useEffect(() => {
    if (!isDemoMode) {
      fetchAnalyticsData();
    }
  }, [user, timeRange, isDemoMode]);






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

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 px-2 sm:px-4 py-8 sm:py-10 pt-24">
        <div className="w-full max-w-6xl mx-auto">
          <div className="flex items-center justify-center">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
            <span className="ml-3 text-white text-lg">Loading analytics...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 px-2 sm:px-4 py-8 sm:py-10 pt-24">
        <div className="w-full max-w-6xl mx-auto">
          <div className="text-center">
            <div className="text-red-400 mb-4">{error}</div>
            <Button onClick={fetchAnalyticsData} className="bg-blue-600 hover:bg-blue-700">
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
            <Button onClick={fetchAnalyticsData} className="bg-blue-600 hover:bg-blue-700">
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
    <div className="min-h-screen relative overflow-hidden bg-[#050505] px-4 sm:px-6 pt-24 pb-12">
      {/* Rich Background Elements */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-blue-500/[0.03] rounded-full blur-[120px] pointer-events-none"></div>
      
      <div className="w-full max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-6 sm:mb-8 md:mb-10 text-left">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.05] bg-white/[0.02] mb-3">
            <PieChartIcon className="w-3 h-3 text-blue-400" />
            <span className="text-[9px] font-bold tracking-widest text-zinc-300 uppercase">Insights</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">Analytics<span className="text-zinc-500">.</span></h1>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Track your call performance and insights.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-4 sm:mt-0">
              <Button 
                variant={isDemoMode ? "default" : "outline"}
                size="sm"
                onClick={toggleDemoMode}
                className={`text-xs sm:text-sm px-3 py-2 ${isDemoMode ? "bg-amber-500 hover:bg-amber-600 text-black border-none" : ""}`}
              >
                <Target className="w-4 h-4 mr-2" />
                {isDemoMode ? "Exit Demo" : "Demo Data"}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setIsDemoMode(false);
                  fetchAnalyticsData();
                }}
                className="text-xs sm:text-sm px-3 py-2"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
          
          {/* Time Range Selector with Data Summary */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {(['week', 'month', 'year'] as const).map((range) => (
                <Button
                  key={range}
                  variant={timeRange === range ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTimeRange(range)}
                  className={`text-xs sm:text-sm capitalize px-3 py-2 ${
                    timeRange === range 
                      ? "bg-white text-black hover:bg-gray-100" 
                      : "bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700"
                  }`}
                >
                  {range}
                </Button>
              ))}
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-400">
                Showing {analyticsData?.totalCalls || 0} calls from the last {timeRange}
              </p>
              <p className="text-xs text-zinc-500">
                Last updated: {new Date().toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Card className="bg-[#09090b] border border-white/[0.08] p-4 sm:p-5 rounded-2xl shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs">Total Calls</p>
                <p className="text-xl sm:text-2xl font-bold text-white">{analyticsData?.totalCalls}</p>
                <p className="text-[10px] text-zinc-500 mt-1">Last {timeRange}</p>
              </div>
              <div className="bg-blue-500/20 p-2 sm:p-2.5 rounded-xl">
                <PhoneCall className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
              </div>
            </div>
          </Card>

          <Card className="bg-[#09090b] border border-white/[0.08] p-4 sm:p-5 rounded-2xl shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs">Success Rate</p>
                <p className="text-xl sm:text-2xl font-bold text-white">{analyticsData?.successRate.toFixed(1)}%</p>
                <p className="text-[10px] text-zinc-500 mt-1">{analyticsData?.completedCalls} completed</p>
              </div>
              <div className="bg-green-500/20 p-2 sm:p-2.5 rounded-xl">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
              </div>
            </div>
          </Card>

          <Card className="bg-[#09090b] border border-white/[0.08] p-4 sm:p-5 rounded-2xl shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs">Avg Duration</p>
                <p className="text-xl sm:text-2xl font-bold text-white">{formatDuration(Math.round(analyticsData?.averageDuration || 0))}</p>
                <p className="text-[10px] text-zinc-500 mt-1">per call</p>
              </div>
              <div className="bg-yellow-500/20 p-2 sm:p-2.5 rounded-xl">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />
              </div>
            </div>
          </Card>

          <Card className="bg-[#09090b] border border-white/[0.08] p-4 sm:p-5 rounded-2xl shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-xs">Failed Calls</p>
                <p className="text-xl sm:text-2xl font-bold text-white">{analyticsData?.failedCalls}</p>
                <p className="text-[10px] text-zinc-500 mt-1">{analyticsData?.failedCalls > 0 ? `${((analyticsData.failedCalls / analyticsData.totalCalls) * 100).toFixed(1)}%` : '0%'} rate</p>
              </div>
              <div className="bg-red-500/20 p-2 sm:p-2.5 rounded-xl">
                <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
              </div>
            </div>
          </Card>
        </div>

        {/* AI Result Distribution */}
        <Card className="bg-[#09090b] border border-white/[0.08] p-5 sm:p-6 mb-6 sm:mb-8 rounded-2xl shadow-xl">
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
                  ? `${analyticsData?.resultDistribution.total || 0} Total`
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
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-green-400 font-medium uppercase tracking-wider">
                        {getCategoryLabels(user?.currentWorkspace?.category).yes}
                      </span>
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">{displayData.yes || 0}</p>
                    <p className="text-xs text-zinc-400 mt-1">
                      {displayData.total > 0 
                        ? `${((displayData.yes / displayData.total) * 100).toFixed(1)}%`
                        : '0%'} rate
                    </p>
                  </div>

                  {/* No Count */}
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-red-400 font-medium uppercase tracking-wider">
                        {getCategoryLabels(user?.currentWorkspace?.category).no}
                      </span>
                      <XCircle className="w-5 h-5 text-red-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">{displayData.no || 0}</p>
                    <p className="text-xs text-zinc-400 mt-1">
                      {displayData.total > 0 
                        ? `${((displayData.no / displayData.total) * 100).toFixed(1)}%`
                        : '0%'} rate
                    </p>
                  </div>

                  {/* Maybe Count */}
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-yellow-400 font-medium uppercase tracking-wider">
                        {getCategoryLabels(user?.currentWorkspace?.category).maybe}
                      </span>
                      <AlertTriangle className="w-5 h-5 text-yellow-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">{displayData.maybe || 0}</p>
                    <p className="text-xs text-zinc-400 mt-1">
                      {displayData.total > 0 
                        ? `${((displayData.maybe / displayData.total) * 100).toFixed(1)}%`
                        : '0%'} rate
                    </p>
                  </div>
                </div>

                {/* Visual Bar */}
                <div className="w-full h-4 bg-zinc-800 rounded-full overflow-hidden flex">
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

        {/* Bulk Call Statistics */}
        {analyticsData?.bulkCallStats && analyticsData.bulkCallStats.length > 0 && (
        <Card className="bg-[#09090b] border border-white/[0.08] p-5 sm:p-6 mb-6 sm:mb-8 rounded-2xl shadow-xl">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <div>
                <h3 className="text-base sm:text-lg md:text-xl font-semibold text-white">Bulk Call Campaigns</h3>
                <p className="text-xs text-zinc-400 mt-1">Performance metrics for batch calling</p>
              </div>
              <Badge variant="outline" className="text-xs text-white">
                {analyticsData.bulkCallStats.length} Campaigns
              </Badge>
            </div>

            <div className="space-y-4">
              {analyticsData.bulkCallStats.map((batch) => (
                <div key={batch.batchId} className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold text-white">{batch.moduleName}</h4>
                        <Badge className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">
                          Bulk
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-400">
                        {formatDate(batch.date)}  {batch.totalCalls} contacts
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-400">{batch.conversionRate.toFixed(1)}%</p>
                      <p className="text-xs text-zinc-500">conversion</p>
                    </div>
                  </div>

                  {/* Results Breakdown */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="text-center">
                      <p className="text-xl font-bold text-green-400">{batch.yesCount}</p>
                      <p className="text-xs text-zinc-400">Yes</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-red-400">{batch.noCount}</p>
                      <p className="text-xs text-zinc-400">No</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-yellow-400">{batch.maybeCount}</p>
                      <p className="text-xs text-zinc-400">Maybe</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-zinc-700 rounded-full overflow-hidden flex">
                    <div 
                      className="bg-green-500 h-full"
                      style={{ 
                        width: batch.totalCalls > 0 ? `${(batch.yesCount / batch.totalCalls) * 100}%` : '0%' 
                      }}
                    ></div>
                    <div 
                      className="bg-red-500 h-full"
                      style={{ 
                        width: batch.totalCalls > 0 ? `${(batch.noCount / batch.totalCalls) * 100}%` : '0%' 
                      }}
                    ></div>
                    <div 
                      className="bg-yellow-500 h-full"
                      style={{ 
                        width: batch.totalCalls > 0 ? `${(batch.maybeCount / batch.totalCalls) * 100}%` : '0%' 
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Visual Analysis Section */}
        <div className="mb-6 sm:mb-8 md:mb-10">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-4">Visual Insights</h2>
          <p className="text-zinc-400 text-sm sm:text-base mb-6">Deep dive into call patterns and lead quality.</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Objection Radar Chart */}
            <Card className="bg-zinc-900 border-zinc-800 p-6 rounded-[2rem] shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-rose-500/10 rounded-xl">
                    <Target className="w-5 h-5 text-rose-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Objection Radar</h3>
                </div>
                <span className="text-xs text-zinc-500 font-medium uppercase tracking-widest">Friction Analysis</span>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={analyticsData?.objectionStats || []}>
                    <PolarGrid stroke="#3f3f46" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717a', fontSize: 10 }} />
                    <Radar
                      name="Objections"
                      dataKey="count"
                      stroke="#ef4444"
                      fill="#ef4444"
                      fillOpacity={0.3}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Lead Quality Distribution */}
            <Card className="bg-zinc-900 border-zinc-800 p-6 rounded-[2rem] shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-xl">
                    <PieChartIcon className="w-5 h-5 text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Lead Intent Tiers</h3>
                </div>
                <span className="text-xs text-zinc-500 font-medium uppercase tracking-widest">Psychological Mapping</span>
              </div>
              <div className="h-[300px] w-full flex items-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'High', value: analyticsData?.intentDistribution?.High || 0 },
                        { name: 'Medium', value: analyticsData?.intentDistribution?.Medium || 0 },
                        { name: 'Low', value: analyticsData?.intentDistribution?.Low || 0 },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      <Cell fill="#10b981" />
                      <Cell fill="#f59e0b" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Dynamic Funnel/Matrix based on category */}
            {(selectedModuleFilter === 'all' || inferModuleCategory(selectedModuleFilter) === 'E-commerce') && (
              <Card className="bg-zinc-900 border-zinc-800 p-6 rounded-[2rem] shadow-xl">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-xl">
                      <TrendingUp className="w-5 h-5 text-blue-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white">Conversion Funnel</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-zinc-500" />
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">E-commerce View</span>
                  </div>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={[
                        { name: 'Total', count: analyticsData?.totalCalls || 0 },
                        { name: 'Answered', count: analyticsData?.completedCalls || 0 },
                        { name: 'Converted', count: analyticsData?.resultDistribution.yes || 0 },
                      ]}
                      margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#71717a' }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      />
                      <Bar dataKey="count" fill="#3b82f6" radius={[0, 10, 10, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {(selectedModuleFilter === 'all' || ['Medical', 'Real Estate'].includes(inferModuleCategory(selectedModuleFilter))) && (
              <Card className="bg-zinc-900 border-zinc-800 p-6 rounded-[2rem] shadow-xl">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-xl">
                      <Calendar className="w-5 h-5 text-emerald-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white">Recovery Matrix</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-zinc-500" />
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Appointment View</span>
                  </div>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analyticsData?.dailyCalls || []}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px' }}
                      />
                      <Area type="monotone" dataKey="count" stroke="#10b981" fillOpacity={1} fill="url(#colorCount)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}
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

        {/* Recent Calls Table */}
        <Card className="bg-[#09090b] border border-white/[0.08] p-5 sm:p-6 mb-10 overflow-hidden rounded-2xl shadow-xl">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-white tracking-tight">Recent Calls</h3>
          </div>
          
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="min-w-full inline-block align-middle">
              <div className="overflow-hidden">
                {analyticsData?.recentCalls && analyticsData.recentCalls.length > 0 ? (
                  <table className="min-w-full divide-y divide-white/5">
                    <thead>
                      <tr>
                        <th className="text-left py-4 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">Customer</th>
                        <th className="text-left py-4 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">Module</th>
                        <th className="text-left py-4 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">Status</th>
                        <th className="text-left py-4 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">Duration</th>
                        <th className="text-left py-4 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">Intel</th>
                        <th className="text-left py-4 px-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.02]">
                      {analyticsData.recentCalls.map((call) => (
                        <React.Fragment key={call._id}>
                          <tr className="hover:bg-white/[0.02] transition-all duration-300">
                            <td className="py-5 px-4">
                              <div>
                                <span className="text-sm text-white block font-semibold mb-0.5 whitespace-nowrap">{call.customerName}</span>
                                <span className="text-[10px] text-zinc-500 font-medium">{call.phoneNumber}</span>
                              </div>
                            </td>
                            <td className="py-5 px-4">
                              <span className="text-xs text-zinc-400 font-medium truncate block max-w-[100px]">{call.moduleName || 'Unknown'}</span>
                            </td>
                            <td className="py-5 px-4">
                              {(() => {
                                const getStatusDisplay = (status: string) => {
                                  switch (status) {
                                    case 'completed': return { text: 'Successful', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
                                    case 'failed': return { text: 'Failed', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
                                    case 'in-progress': return { text: 'In Progress', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' };
                                    default: return { text: status.charAt(0).toUpperCase() + status.slice(1), color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' };
                                  }
                                };
                                const statusDisplay = getStatusDisplay(call.status);
                                return (
                                  <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${statusDisplay.color}`}>
                                    {statusDisplay.text}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="py-5 px-4">
                              <span className="text-xs text-zinc-300 font-mono font-bold tracking-tight">{formatDuration(call.duration)}</span>
                            </td>
                            <td className="py-5 px-4">
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className={`text-[10px] px-2 py-0.5 border ${getSentimentColor(call.evaluation?.analysis?.sentiment || 'Neutral')}`}>
                                  {call.evaluation?.analysis?.sentiment || 'Neutral'}
                                </Badge>
                                {call.evaluation?.analysis?.intentTier && (
                                  <span className={`text-[9px] font-black uppercase tracking-[0.1em] ${getIntentColor(call.evaluation.analysis.intentTier)}`}>
                                    {call.evaluation.analysis.intentTier} Intent
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-5 px-4">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setExpandedCallId(expandedCallId === call._id ? null : call._id)}
                                  className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all duration-300 border ${
                                    expandedCallId === call._id 
                                      ? 'bg-emerald-500 text-white border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
                                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-300'
                                  }`}
                                >
                                  {expandedCallId === call._id ? 'Close' : 'Journey'}
                                </button>
                                <button
                                  onClick={() => setIntelModal(call)}
                                  className="px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-zinc-900 text-zinc-500 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-300 transition-all font-bold"
                                >
                                  Intel
                                </button>
                                <button
                                  onClick={() => setLiveCallModal({
                                    callId: call._id,
                                    customerName: call.customerName,
                                    phoneNumber: call.phoneNumber
                                  })}
                                  className="px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-zinc-900 text-blue-400/80 border border-zinc-800 hover:border-blue-500/30 hover:text-blue-400 transition-all flex items-center gap-1.5"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>{call.status === 'in-progress' ? 'Live' : 'Transcript'}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                          {expandedCallId === call._id && (
                            <tr className="bg-white/[0.01]">
                              <td colSpan={6} className="px-10 py-2 border-t border-white/[0.03]">
                                <LeadTimeline 
                                  phoneNumber={call.phoneNumber} 
                                  workspaceId={(call as any).workspaceId || user?.currentWorkspace?._id || ''} 
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-20 bg-white/[0.01] rounded-2xl border border-white/5">
                    <Activity className="w-8 h-8 text-zinc-800 mx-auto mb-4" />
                    <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">No recent interactions discovered</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
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