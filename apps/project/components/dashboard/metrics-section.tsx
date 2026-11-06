'use client';

import { BarChart, Bar, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

const docData = [
  { v: 8 }, { v: 10 }, { v: 9 }, { v: 14 }, { v: 11 }, { v: 15 }, { v: 17 },
];
const evalData = [
  { v: 1 }, { v: 0 }, { v: 2 }, { v: 1 }, { v: 2 }, { v: 1 }, { v: 2 },
];
const auditData = [
  { v: 2 }, { v: 1 }, { v: 3 }, { v: 2 }, { v: 1 }, { v: 1 }, { v: 1 },
];
const teamData = [
  { v: 1 }, { v: 1 }, { v: 1 }, { v: 1 }, { v: 1 }, { v: 1 }, { v: 1 },
];

const metrics = [
  {
    label: 'Documents',
    value: 17,
    change: '+2.1%',
    trend: 'up',
    data: docData,
    color: '#3B82F6',
  },
  {
    label: 'Evaluations',
    value: 2,
    change: '+3.0%',
    trend: 'up',
    data: evalData,
    color: '#3B82F6',
  },
  {
    label: 'Open audits',
    value: 1,
    change: '+0.5%',
    trend: 'neutral',
    data: auditData,
    color: '#F59E0B',
  },
  {
    label: 'Team members',
    value: 1,
    change: '+4.2%',
    trend: 'up',
    data: teamData,
    color: '#10B981',
  },
];

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'up') return <TrendingUp className="w-3 h-3 text-emerald-500" />;
  if (trend === 'down') return <TrendingDown className="w-3 h-3 text-red-500" />;
  return <Minus className="w-3 h-3 text-slate-400" />;
}

export function MetricsSection() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-slate-500 font-medium">{m.label}</p>
              <p className="text-3xl font-bold text-slate-800 mt-1">{m.value}</p>
            </div>
            <div className="h-12 w-20">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={m.data} barSize={4}>
                  <Bar dataKey="v" fill={m.color} radius={[2, 2, 0, 0]} />
                  <Tooltip
                    content={() => null}
                    cursor={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendIcon trend={m.trend} />
            <span
              className={cn(
                'text-xs font-medium',
                m.trend === 'up'
                  ? 'text-emerald-600'
                  : m.trend === 'down'
                  ? 'text-red-500'
                  : 'text-slate-400'
              )}
            >
              {m.change}
            </span>
            <span className="text-xs text-slate-400">This year</span>
          </div>
        </div>
      ))}
    </div>
  );
}
