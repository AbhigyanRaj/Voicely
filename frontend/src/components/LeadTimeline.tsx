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
    const milestones: any[] = [];
    
    // Sort and consolidate calls info a single dot unless live
    const sortedCalls = [...lead.callHistory].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    sortedCalls.forEach((call) => {
      const callTime = new Date(call.createdAt);
      
      if (call.status === 'in-progress') {
        // Show progression only for live calls
        milestones.push({ id: `${call._id}-init`, label: 'Initiated', time: callTime, status: 'completed' });
        milestones.push({ id: `${call._id}-live`, label: 'Live Now', time: callTime, status: 'active' });
      } else {
        // Consolidated dot for finished calls
        milestones.push({
          id: call._id,
          label: call.status === 'completed' ? 'Completed' : 'Call',
          time: callTime,
          status: 'completed',
          result: call.evaluation?.result
        });
      }
    });

    // Scheduled Events with sorting
    lead.scheduledEvents.forEach(event => {
      milestones.push({
        id: event._id,
        label: event.type === 'automatic_call' ? 'Callback' : 'Scheduled',
        time: new Date(event.time),
        status: event.status === 'pending' ? 'pending' : 'completed',
        isEvent: true
      });
    });

    return milestones.sort((a, b) => a.time.getTime() - b.time.getTime());
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
          const countdown = ms.status === 'pending' ? getTimerString(ms.time) : null;

          return (
            <React.Fragment key={ms.id}>
              {/* Milestone Dot */}
              <div className="flex flex-col items-center group relative px-2">
                <div className={`w-3 h-3 rounded-full transition-all duration-500 ring-4 ring-zinc-950 z-10 ${
                  isCompleted ? 'bg-emerald-500' :
                  isActive ? 'bg-indigo-500 animate-pulse shadow-[0_0_10px_rgba(99,102,241,0.5)]' :
                  'bg-zinc-800'
                }`} />
                
                <div className="absolute top-6 flex flex-col items-center w-32 left-1/2 -translate-x-1/2 pointer-events-none">
                  <span className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 whitespace-nowrap ${
                    isCompleted ? 'text-zinc-400' : isActive ? 'text-indigo-400' : 'text-zinc-600'
                  }`}>
                    {ms.label}
                  </span>
                  
                  {countdown ? (
                    <span className="text-[10px] text-indigo-400/80 font-mono font-bold animate-pulse">
                      {countdown}
                    </span>
                  ) : (
                    <span className="text-[8px] text-zinc-700 font-medium">
                      {ms.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>

              {/* Minimal Connector */}
              {!isLast && (
                <div className={`w-16 h-[1px] transition-colors duration-700 mx-1 ${
                  isCompleted ? 'bg-emerald-500/30' : 'bg-zinc-800'
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
