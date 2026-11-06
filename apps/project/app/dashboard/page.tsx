'use client';

import { useState } from 'react';
import { Upload, TrendingUp, Calendar, ChevronDown, FileText, ClipboardCheck, CircleAlert as AlertCircle, Clock, ArrowRight } from 'lucide-react';
import { MetricsSection } from '@/components/dashboard/metrics-section';
import { NcWorkflow } from '@/components/dashboard/nc-workflow';

const periods = ['This year', 'This quarter', 'This month', 'Last 7 days'];

const quickActions = [
  { label: 'Upload new document', icon: Upload, href: '#' },
  { label: 'Run evaluation', icon: TrendingUp, href: '#' },
  { label: 'Schedule audit', icon: Calendar, href: '#' },
];

const recentDocs = [
  { name: 'Quality Manual v3.2', modified: '2 hours ago', type: 'Manual', icon: FileText },
  { name: 'Supplier Audit Checklist', modified: 'Yesterday', type: 'Checklist', icon: ClipboardCheck },
  { name: 'NC Report #001', modified: '3 days ago', type: 'Report', icon: AlertCircle },
  { name: 'Q1 Evaluation Summary', modified: '1 week ago', type: 'Report', icon: TrendingUp },
];

const upcomingTasks = [
  { label: 'ISO 9001 Renewal deadline', due: 'May 15, 2026', priority: 'high' },
  { label: 'Q2 Internal Audit', due: 'Jun 1, 2026', priority: 'medium' },
  { label: 'Supplier Evaluation', due: 'Jun 10, 2026', priority: 'low' },
];

const priorityColors: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-emerald-100 text-emerald-700',
};

export default function DashboardPage() {
  const [period, setPeriod] = useState('This year');
  const [showPeriods, setShowPeriods] = useState(false);

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div
        className="relative rounded-2xl overflow-hidden p-8 min-h-[180px] flex flex-col justify-between"
        style={{
          background: 'linear-gradient(135deg, #0F2A3F 0%, #1A4A6B 40%, #0D3352 70%, #0A2540 100%)',
        }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              'radial-gradient(circle at 80% 50%, #F59E0B 0%, transparent 50%), radial-gradient(circle at 20% 80%, #3B82F6 0%, transparent 40%)',
          }}
        />
        <div className="relative z-10">
          <p className="text-blue-300 text-xs font-semibold tracking-widest uppercase mb-1">
            PURA
          </p>
          <h1 className="text-white text-2xl font-bold mb-1">Welcome back, Pura</h1>
          <p className="text-slate-400 text-sm">
            Pick a quick action below or scroll for metrics and organization mix.
          </p>
        </div>
        <div className="relative z-10 flex flex-wrap gap-3 mt-5">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold text-slate-900 transition-all hover:scale-[1.03] active:scale-[0.98] shadow-lg"
                style={{
                  background: 'linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%)',
                }}
              >
                <Icon className="w-4 h-4" />
                {action.label}
              </button>
            );
          })}
        </div>

        <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-5">
          <div className="w-48 h-48 rounded-full border-[20px] border-white" />
        </div>
        <div className="absolute right-16 top-1/4 opacity-5">
          <div className="w-24 h-24 rounded-full border-[12px] border-amber-400" />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm text-slate-500">
            Metrics for{' '}
            <span className="font-semibold text-slate-800">{period}</span>
          </h2>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowPeriods(!showPeriods)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            {period}
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          {showPeriods && (
            <div className="absolute right-0 mt-1 w-40 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
              {periods.map((p) => (
                <button
                  key={p}
                  onClick={() => { setPeriod(p); setShowPeriods(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <MetricsSection />

      <NcWorkflow />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-slate-800">Recent Documents</h3>
            <button className="text-xs text-blue-600 font-medium hover:text-blue-700 transition-colors flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3">
            {recentDocs.map((doc) => {
              const Icon = doc.icon;
              return (
                <div
                  key={doc.name}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group"
                >
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                    <Icon className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{doc.name}</p>
                    <p className="text-xs text-slate-400">{doc.type} · {doc.modified}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 transition-colors shrink-0" />
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-slate-800">Upcoming Tasks</h3>
            <button className="text-xs text-blue-600 font-medium hover:text-blue-700 transition-colors flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3">
            {upcomingTasks.map((task) => (
              <div
                key={task.label}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-amber-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{task.label}</p>
                  <p className="text-xs text-slate-400">Due {task.due}</p>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-1 rounded-full shrink-0 capitalize ${priorityColors[task.priority]}`}
                >
                  {task.priority}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100">
            <div
              className="flex items-center gap-3 p-4 rounded-xl"
              style={{
                background: 'linear-gradient(135deg, #EFF6FF 0%, #FEF3C7 100%)',
              }}
            >
              <div className="flex-1">
                <p className="text-xs font-semibold text-slate-700">ISO 9001:2015 Compliance</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 h-1.5 rounded-full bg-white overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: '72%' }} />
                  </div>
                  <span className="text-xs font-bold text-blue-700">72%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
