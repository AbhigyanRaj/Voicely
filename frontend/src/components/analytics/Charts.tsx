import React from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, RadarChart, PolarGrid, 
  PolarAngleAxis, Radar, Legend, AreaChart, Area
} from 'recharts';
import { Target, PieChart as PieChartIcon, TrendingUp, ShoppingCart, Calendar, Stethoscope } from 'lucide-react';

interface ChartsProps {
  analyticsData: any;
  selectedModuleFilter: string;
  inferModuleCategory: (moduleName?: string) => 'E-commerce' | 'Medical' | 'Real Estate' | 'Sales';
  view?: 'overview' | 'evaluations';
}

export const Charts: React.FC<ChartsProps> = ({ analyticsData, selectedModuleFilter, inferModuleCategory, view = 'overview' }) => {
  const chartConfig = {
    cartesian: {
      stroke: 'rgba(255,255,255,0.06)',
    },
    tooltip: {
      contentStyle: { 
        background: '#18181b', 
        border: '1px solid rgba(255,255,255,0.08)', 
        borderRadius: '12px',
        color: '#f4f4f5'
      },
    },
    axis: {
      tick: { fill: '#71717a', fontSize: 11 },
      axisLine: { stroke: 'transparent' },
      tickLine: { stroke: 'transparent' },
    },
  };

  return (
    <>
      {view === 'evaluations' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Objection Radar Chart */}
        <Card className="bg-zinc-900 border border-white/[0.05] shadow-md p-5 sm:p-6 rounded-lg">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-500/10 rounded-xl">
                <Target className="w-5 h-5 text-rose-400" />
              </div>
              <h3 className="text-xl font-bold text-white">Objection Radar</h3>
            </div>
            <span className="text-xs text-zinc-500 font-medium uppercase tracking-widest">Friction Analysis</span>
          </div>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={analyticsData?.objectionStats || []}>
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
                  contentStyle={chartConfig.tooltip.contentStyle}
                  itemStyle={{ color: '#fff' }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        
        {/* Lead Quality Distribution */}
        <Card className="bg-zinc-900 border border-white/[0.05] shadow-md p-5 sm:p-6 rounded-lg">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-xl">
                <PieChartIcon className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-white">Lead Intent Tiers</h3>
            </div>
            <span className="text-xs text-zinc-500 font-medium uppercase tracking-widest">Psychological Mapping</span>
          </div>
          <div className="h-[220px] w-full flex items-center">
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
                  contentStyle={chartConfig.tooltip.contentStyle}
                  itemStyle={{ color: '#fff' }}
                />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        </div>
      )}

      {view === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Dynamic Funnel/Matrix based on category */}
        {(selectedModuleFilter === 'all' || inferModuleCategory(selectedModuleFilter) === 'E-commerce') && (
          <Card className="bg-zinc-900 border border-white/[0.05] shadow-md p-5 sm:p-6 rounded-lg">
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
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={[
                    { name: 'Total', count: analyticsData?.totalCalls || 0 },
                    { name: 'Answered', count: analyticsData?.completedCalls || 0 },
                    { name: 'Converted', count: analyticsData?.resultDistribution?.yes || 0 },
                  ]}
                  margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
                >
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" {...chartConfig.axis} />
                  <Tooltip 
                    contentStyle={chartConfig.tooltip.contentStyle}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 10, 10, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {(selectedModuleFilter === 'all' || ['Medical', 'Real Estate'].includes(inferModuleCategory(selectedModuleFilter))) && (
          <Card className="bg-zinc-900 border border-white/[0.05] shadow-md p-5 sm:p-6 rounded-lg">
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
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analyticsData?.dailyCalls || []}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartConfig.cartesian.stroke} />
                  <XAxis dataKey="date" {...chartConfig.axis} />
                  <YAxis {...chartConfig.axis} />
                  <Tooltip 
                    contentStyle={chartConfig.tooltip.contentStyle}
                  />
                  <Area type="monotone" dataKey="count" stroke="#10b981" fillOpacity={1} fill="url(#colorCount)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
      </div>
      )}
    </>
  );
};
