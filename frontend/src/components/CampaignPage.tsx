import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import * as auth from '../lib/auth';
import { api } from '../lib/api';
import ContactUploader from './ContactUploader';
import { PhoneCall, Activity, Zap, CheckCircle2, Search, Calendar, Phone, Plus, ListFilter, ArrowUpRight } from 'lucide-react';
import { Skeleton } from './ui/skeleton';

const CampaignPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  
  // Pre-select module from URL if present
  const initialModuleId = searchParams.get('module');
  const [selectedModule, setSelectedModule] = useState<string | null>(initialModuleId || null);
  
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const { data: userModules = [] } = useQuery({
    queryKey: ['modules'],
    queryFn: auth.getUserModules,
    enabled: !!user,
  });

  const { data: queryData, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['campaignHistory'],
    queryFn: async () => {
      const token = auth.getStoredToken();
      if (!token) throw new Error("Authentication required");
      const data = await api.getCallHistory(token);
      if (!data.success) throw new Error("Failed to fetch campaign history");
      return data.calls || [];
    },
    enabled: !!user,
  });

  const campaignHistory = useMemo(() => {
    if (!queryData) return [];
    
    const bulkCalls = queryData.filter((call: any) => call.callType === 'bulk' && call.batchId);
    const batchGroups: { [key: string]: any[] } = {};
    
    bulkCalls.forEach((call: any) => {
      if (call.batchId) {
        if (!batchGroups[call.batchId]) {
          batchGroups[call.batchId] = [];
        }
        batchGroups[call.batchId].push(call);
      }
    });
    
    return Object.entries(batchGroups).map(([batchId, calls]) => {
      const completedInBatch = calls.filter((c: any) => c.status === 'completed' && c.evaluation?.result);
      const yesInBatch = completedInBatch.filter((c: any) => c.evaluation?.result === 'YES').length;
      
      return {
        batchId,
        moduleName: calls[0]?.moduleName || 'Unknown',
        totalCalls: calls.length,
        completedCalls: calls.filter((c: any) => c.status === 'completed').length,
        conversionRate: completedInBatch.length > 0 ? (yesInBatch / completedInBatch.length) * 100 : 0,
        date: calls[0]?.createdAt || ''
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [queryData]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-zinc-950 pt-24 pb-12 px-4 sm:px-6 font-sans">
      {/* Premium Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-zinc-950 to-zinc-950 pointer-events-none"></div>
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
      
      <div className="max-w-6xl mx-auto w-full relative z-10">
        
        {/* Page Header */}
        <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/[0.06] pb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Growth</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-2">Campaigns.</h1>
            <p className="text-zinc-500 text-sm max-w-lg leading-relaxed">
              Launch outbound voice agent campaigns and track real-time conversion performance across batches.
            </p>
          </div>
          <div className="flex gap-3">
            <button className="h-9 px-4 rounded-md border border-white/[0.08] bg-transparent text-sm text-white font-medium hover:bg-white/[0.04] transition-colors flex items-center gap-2">
              Filter
            </button>
            <button 
              onClick={() => setIsDrawerOpen(true)}
              className="h-9 px-4 rounded-md bg-white hover:bg-zinc-200 text-sm text-black font-semibold transition-colors flex items-center gap-2"
            >
              Create Campaign
            </button>
          </div>
        </div>

        <div className="w-full flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              History & Performance
            </h3>
              <span className="text-[11px] font-medium text-zinc-500 bg-transparent px-2.5 py-1 rounded-md border border-white/[0.08]">
                {campaignHistory.length} Batches
              </span>
            </div>
            
            <div className="bg-transparent border border-white/[0.08] rounded-lg shadow-sm overflow-hidden h-[calc(100%-3rem)] min-h-[500px] flex flex-col relative">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
              
              {isLoadingHistory ? (
                // Fixed Skeleton Loader styling
                <div className="p-6 space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-transparent border border-white/[0.08] rounded-md p-5">
                      <div className="flex justify-between mb-4">
                        <div className="space-y-2 w-1/2">
                          <Skeleton className="h-4 w-3/4 rounded-md bg-white/[0.05]" />
                          <Skeleton className="h-3 w-1/2 rounded-md bg-white/[0.05]" />
                        </div>
                        <Skeleton className="h-6 w-12 rounded-md bg-white/[0.05]" />
                      </div>
                      <div className="flex gap-4 pt-4 border-t border-white/[0.04]">
                        <Skeleton className="h-8 w-20 rounded-md bg-white/[0.05]" />
                        <Skeleton className="h-8 w-20 rounded-md bg-white/[0.05]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : campaignHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center flex-1">
                  <h4 className="text-white font-medium mb-2">No Campaigns Yet</h4>
                  <p className="text-zinc-500 text-sm max-w-xs leading-relaxed">
                    Your campaign history and performance metrics will appear here once you launch your first bulk call batch.
                  </p>
                </div>
              ) : (
                <div className="overflow-y-auto h-full max-h-[700px] p-5 space-y-3">
                  {campaignHistory.map((batch) => (
                    <div key={batch.batchId} className="group bg-zinc-900/40 border border-white/[0.04] rounded-md p-5 hover:bg-zinc-900/80 transition-all cursor-default">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-medium text-white">{batch.moduleName}</h4>
                            <span className="text-zinc-500 border border-zinc-600 text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-sm">Batch</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
                            <Calendar className="w-3.5 h-3.5 opacity-70" />
                            {formatDate(batch.date)}
                            <span className="mx-1 text-zinc-700">•</span>
                            <span className="font-mono text-[10px] text-zinc-600">ID: {batch.batchId.split('-')[0]}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center justify-end gap-1 mb-0.5">
                            <p className="text-sm font-medium text-white tabular-nums leading-none">{batch.conversionRate.toFixed(1)}%</p>
                          </div>
                          <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-bold mt-1">Conversion</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/[0.08]">
                        <div className="flex flex-col gap-1 bg-transparent p-3 rounded-md border border-white/[0.04]">
                          <p className="text-xs font-medium text-white leading-none">{batch.totalCalls}</p>
                          <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold">Total Calls</p>
                        </div>
                        <div className="flex flex-col gap-1 bg-transparent p-3 rounded-md border border-white/[0.04]">
                          <p className="text-xs font-medium text-white leading-none">{batch.completedCalls}</p>
                          <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold">Completed</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      {/* Centered Modal for Create Campaign */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={() => setIsDrawerOpen(false)} />
          
          <div className="relative w-full max-w-xl bg-zinc-950 border border-white/[0.08] rounded-lg shadow-2xl flex flex-col transform transition-all scale-100 opacity-100 max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.04] bg-zinc-950 rounded-t-lg">
              <div>
                <h2 className="text-lg font-medium text-white tracking-tight">Create Campaign</h2>
                <p className="text-zinc-500 text-xs mt-1">Configure your outbound voice batch</p>
              </div>
              <button 
                onClick={() => setIsDrawerOpen(false)} 
                className="w-8 h-8 rounded-md flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.1] transition-all"
              >
                <span className="text-xl leading-none">&times;</span>
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar">
              <ContactUploader
                userModules={userModules}
                selectedModule={selectedModule}
                onSubmit={(contacts) => {
                  console.log('Campaign started for:', contacts);
                  setIsDrawerOpen(false);
                }}
                onClose={() => setIsDrawerOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignPage;
