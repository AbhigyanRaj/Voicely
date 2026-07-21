import React from 'react';
import { Card } from '../ui/card';
import { PhoneCall, TrendingUp, Clock, XCircle } from 'lucide-react';

interface StatCardsProps {
  analyticsData: any;
  timeRange: string;
  formatDuration: (seconds: number) => string;
}

export const StatCards: React.FC<StatCardsProps> = ({ analyticsData, timeRange, formatDuration }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
      <Card className="bg-zinc-900 border border-white/[0.05] shadow-md p-4 sm:p-5 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-zinc-400 text-xs mb-1">Total Calls</p>
            <div className="flex items-end gap-2">
              <p className="text-xl sm:text-2xl font-bold text-white">{analyticsData?.totalCalls || 0}</p>
              <span className="text-[10px] font-medium text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-sm mb-1 leading-none">
                 ↑ 12%
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">Last {timeRange}</p>
          </div>
          <div className="bg-blue-500/20 p-2 sm:p-2.5 rounded-xl">
            <PhoneCall className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
          </div>
        </div>
      </Card>

      <Card className="bg-zinc-900 border border-white/[0.05] shadow-md p-4 sm:p-5 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-zinc-400 text-xs mb-1">Success Rate</p>
            <div className="flex items-end gap-2">
              <p className="text-xl sm:text-2xl font-bold text-white">{analyticsData?.successRate?.toFixed(1) || 0}%</p>
              <span className="text-[10px] font-medium text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-sm mb-1 leading-none">
                 ↑ 4.2%
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">{analyticsData?.completedCalls || 0} completed</p>
          </div>
          <div className="bg-green-500/20 p-2 sm:p-2.5 rounded-xl">
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
          </div>
        </div>
      </Card>

      <Card className="bg-zinc-900 border border-white/[0.05] shadow-md p-4 sm:p-5 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-zinc-400 text-xs mb-1">Avg Duration</p>
            <div className="flex items-end gap-2">
              <p className="text-xl sm:text-2xl font-bold text-white">{formatDuration(Math.round(analyticsData?.averageDuration || 0))}</p>
              <span className="text-[10px] font-medium text-rose-400 bg-rose-400/10 px-1.5 py-0.5 rounded-sm mb-1 leading-none">
                 ↓ 2s
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">per call</p>
          </div>
          <div className="bg-yellow-500/20 p-2 sm:p-2.5 rounded-xl">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />
          </div>
        </div>
      </Card>

      <Card className="bg-zinc-900 border border-white/[0.05] shadow-md p-4 sm:p-5 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-zinc-400 text-xs mb-1">Failed Calls</p>
            <div className="flex items-end gap-2">
              <p className="text-xl sm:text-2xl font-bold text-white">{analyticsData?.failedCalls || 0}</p>
              <span className="text-[10px] font-medium text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-sm mb-1 leading-none">
                 ↓ 1.1%
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">{analyticsData?.failedCalls > 0 && analyticsData?.totalCalls > 0 ? `${((analyticsData.failedCalls / analyticsData.totalCalls) * 100).toFixed(1)}%` : '0%'} rate</p>
          </div>
          <div className="bg-red-500/20 p-2 sm:p-2.5 rounded-xl">
            <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
          </div>
        </div>
      </Card>
    </div>
  );
};
