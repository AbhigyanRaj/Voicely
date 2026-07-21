import React from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';

interface BulkCallStatsProps {
  bulkCallStats: any[];
  formatDate: (dateString: string) => string;
}

export const BulkCallStats: React.FC<BulkCallStatsProps> = ({ bulkCallStats, formatDate }) => {
  if (!bulkCallStats || bulkCallStats.length === 0) {
    return (
      <Card className="bg-zinc-900 border border-white/[0.05] shadow-md p-8 sm:p-12 rounded-lg flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">No Bulk Campaigns</h3>
        <p className="text-zinc-400 text-sm max-w-md">You haven't started any bulk calling campaigns yet. Once you launch a campaign, its performance metrics will appear here.</p>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900 border border-white/[0.05] shadow-md p-5 sm:p-6 mb-6 sm:mb-8 rounded-lg">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h3 className="text-base sm:text-lg md:text-xl font-semibold text-white">Bulk Call Campaigns</h3>
          <p className="text-xs text-zinc-400 mt-1">Performance metrics for batch calling</p>
        </div>
        <Badge variant="outline" className="text-xs text-white">
          {bulkCallStats.length} Campaigns
        </Badge>
      </div>

      <div className="space-y-4">
        {bulkCallStats.map((batch) => (
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
  );
};
