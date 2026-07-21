import React from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Activity, Eye } from 'lucide-react';
import LeadTimeline from '../LeadTimeline';

interface RecentCallsListProps {
  recentCalls: any[];
  user: any;
  formatDuration: (seconds: number) => string;
  getSentimentColor: (sentiment: string) => string;
  getIntentColor: (tier: string) => string;
  expandedCallId: string | null;
  setExpandedCallId: (id: string | null) => void;
  setIntelModal: (call: any) => void;
  setLiveCallModal: (call: any) => void;
}

export const RecentCallsList: React.FC<RecentCallsListProps> = ({
  recentCalls,
  user,
  formatDuration,
  getSentimentColor,
  getIntentColor,
  expandedCallId,
  setExpandedCallId,
  setIntelModal,
  setLiveCallModal
}) => {
  return (
    <Card className="bg-zinc-900/40 border border-white/[0.04] p-5 sm:p-6 mb-6 overflow-hidden rounded-lg shadow-none">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xl font-bold text-white tracking-tight">Recent Calls</h3>
      </div>
      
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <div className="min-w-full inline-block align-middle">
          <div className="overflow-hidden">
            {recentCalls && recentCalls.length > 0 ? (
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
                  {recentCalls.map((call) => (
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
                              className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${
                                expandedCallId === call._id 
                                  ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
                                  : 'bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 hover:text-white'
                              }`}
                            >
                              {expandedCallId === call._id ? 'Close' : 'Journey'}
                            </button>
                            <button
                              onClick={() => setIntelModal(call)}
                              className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all"
                            >
                              Intel
                            </button>
                            <button
                              onClick={() => setLiveCallModal({
                                callId: call._id,
                                customerName: call.customerName,
                                phoneNumber: call.phoneNumber
                              })}
                              className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-zinc-800/50 text-blue-400 hover:bg-zinc-800 hover:text-blue-300 transition-all flex items-center gap-1.5"
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
                              workspaceId={call.workspaceId || user?.currentWorkspace?._id || ''} 
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
  );
};
