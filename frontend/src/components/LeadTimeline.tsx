import React, { useState, useEffect } from 'react';

import { getApiBaseUrl } from '../lib/api';
import { getStoredToken } from '../lib/auth';

interface TimelineEvent {
  _id: string;
  time: string;
  type: 'automatic_call' | 'manual_reminder';
  status: 'pending' | 'triggered' | 'cancelled' | 'completed';
  reason?: string;
}

interface CallHistoryItem {
  _id: string;
  status: string;
  createdAt: string;
  duration: number;
  evaluation?: {
    result: string;
  };
  summary?: string;
}

interface LeadData {
  _id: string;
  phoneNumber: string;
  customerName: string;
  status: string;
  callHistory: CallHistoryItem[];
  scheduledEvents: TimelineEvent[];
}

interface LeadTimelineProps {
  phoneNumber: string;
  workspaceId: string;
}

const LeadTimeline: React.FC<LeadTimelineProps> = ({ phoneNumber, workspaceId }) => {
  const [lead, setLead] = useState<LeadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  const fetchTimeline = async () => {
    try {
      const token = getStoredToken();
      const response = await fetch(`${getApiBaseUrl()}/leads/timeline?phoneNumber=${encodeURIComponent(phoneNumber)}&workspaceId=${workspaceId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setLead(data);
      }
    } catch (err) {
      console.error('Failed to fetch lead timeline:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeline();
    const fetchInterval = setInterval(fetchTimeline, 10000);
    const clockInterval = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(fetchInterval);
      clearInterval(clockInterval);
    };
  }, [phoneNumber, workspaceId]);

  if (loading) return <div className="h-1 bg-white/5 rounded-full w-full animate-pulse my-8" />;
  if (!lead) return null;

  const generateMilestones = () => {
    // We strictly show 4 stages for the LATEST call or the ACTIVE call
    const latestCall = lead.callHistory.length > 0 
      ? [...lead.callHistory].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
      : null;

    if (!latestCall) return [];

    const callStatus = latestCall.status;
    const evaluation = latestCall.evaluation;
    
    // Status Logic Helpers
    const isStarted = ['initiated', 'ringing', 'in-progress', 'answered', 'completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(callStatus);
    const isPickedUp = ['answered', 'completed', 'in-progress'].includes(callStatus);
    const isFailedPickup = ['busy', 'no-answer', 'failed', 'canceled'].includes(callStatus);
    const hasOutcome = !!evaluation?.result;

    // Semantic Lifecycle Mapping for Outcome Label
    const lifecycleMap: Record<string, string> = {
      'YES': 'Positive Interest',
      'NO': 'Not a Fit',
      'INTERESTED': 'Warm Lead',
      'QUALIFIED': 'Hot Lead',
      'BOOKED': 'Meeting Set',
      'DECLINED': 'Rejected',
      'MAYBE': 'Follow-up Needed',
      'SUCCESSFUL': 'Successful'
    };
    const outcomeMapped = lifecycleMap[(evaluation?.result || '').toUpperCase()];
    let outcomeLabel = outcomeMapped;
    if (!outcomeLabel) {
      if (callStatus === 'ringing') outcomeLabel = 'Awaiting Answer';
      else if (callStatus === 'in-progress' || callStatus === 'answered') outcomeLabel = 'In Conversation';
      else outcomeLabel = 'Outcome';
    }

    const stages: any[] = [
      {
        id: 'stage-1',
        label: 'Initiated',
        time: new Date(latestCall.createdAt),
        status: isStarted ? 'completed' : 'pending'
      },
      {
        id: 'stage-2',
        label: 'Picked Up',
        time: new Date(latestCall.createdAt),
        status: isPickedUp ? 'completed' : (isFailedPickup ? 'failed' : (callStatus === 'ringing' ? 'active' : 'pending'))
      },
      {
        id: 'stage-3',
        label: outcomeLabel,
        time: new Date(latestCall.createdAt),
        status: hasOutcome ? 'completed' : (callStatus === 'in-progress' ? 'active' : (isFailedPickup ? 'failed' : 'pending'))
      },
      {
        id: 'stage-4',
        label: 'Completed',
        time: new Date(latestCall.createdAt),
        status: callStatus === 'completed' ? 'completed' : (isFailedPickup ? 'failed' : (callStatus === 'in-progress' ? 'active' : 'pending'))
      }
    ];

    return stages;
  };

  const milestones = generateMilestones();

  const getTimerString = (target: Date) => {
    const diff = target.getTime() - now.getTime();
    if (diff <= 0) return 'Just now';
    if (diff > 3600000) return null; // Over an hour, don't show countdown
    
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="py-10 overflow-x-auto scrollbar-hide">
      <div className="flex items-center min-w-max px-16">
        {milestones.map((ms, index) => {
          const isLast = index === milestones.length - 1;
          const isCompleted = ms.status === 'completed';
          const isActive = ms.status === 'active';
          const isFailed = ms.status === 'failed';
          const countdown = ms.status === 'pending' ? getTimerString(ms.time) : null;

          return (
            <React.Fragment key={ms.id}>
              {/* Milestone Dot */}
              <div className="flex flex-col items-center group relative px-2">
                <div className={`w-3 h-3 rounded-full transition-all duration-500 ring-4 ring-zinc-950 z-10 ${
                  isCompleted ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' :
                  isFailed ? 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.3)]' :
                  isActive ? 'bg-indigo-500 animate-pulse shadow-[0_0_10px_rgba(99,102,241,0.5)]' :
                  'bg-zinc-800'
                }`} />
                
                <div className="absolute top-6 flex flex-col items-center w-32 left-1/2 -translate-x-1/2 pointer-events-none">
                  <span className={`text-[9px] font-bold uppercase tracking-[0.15em] mb-0.5 whitespace-nowrap ${
                    isCompleted ? 'text-zinc-300' : 
                    isFailed ? 'text-yellow-500/80' : 
                    isActive ? 'text-indigo-400' : 
                    'text-zinc-600'
                  }`}>
                    {ms.label}
                  </span>
                  
                  {!isActive && !isFailed && !isCompleted && countdown ? (
                    <span className="text-[9px] text-indigo-400/80 font-mono font-bold animate-pulse">
                      {countdown}
                    </span>
                  ) : (
                    <span className="text-[8px] text-zinc-700 font-medium">
                      {(isCompleted || isFailed || isActive) ? ms.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </span>
                  )}
                </div>
              </div>

              {/* Minimal Connector */}
              {!isLast && (
                <div className={`w-24 h-[1.5px] transition-colors duration-700 mx-1 ${
                  isCompleted ? 'bg-emerald-500/40' : 
                  isFailed ? 'bg-yellow-500/20' : 
                  isActive ? 'bg-indigo-500/20 animate-pulse' : 
                  'bg-zinc-800'
                }`} />
              )}
            </React.Fragment>
          );
        })}

        {milestones.length === 0 && (
          <span className="text-[10px] uppercase tracking-widest text-zinc-700 font-bold">Initiating Tracking...</span>
        )}
      </div>
    </div>
  );
};

export default LeadTimeline;
