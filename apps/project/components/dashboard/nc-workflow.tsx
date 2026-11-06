'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const statusData = [
  { name: 'Open', value: 1, color: '#3B82F6' },
  { name: 'In Progress', value: 0, color: '#F59E0B' },
  { name: 'Closed', value: 0, color: '#10B981' },
];

const workflowItems = [
  { label: 'OPEN', percentage: 100, color: '#3B82F6', count: 1 },
  { label: 'IN REVIEW', percentage: 0, color: '#F59E0B', count: 0 },
  { label: 'CLOSED', percentage: 0, color: '#10B981', count: 0 },
];

const recentAudits = [
  { name: 'ISO 9001 Annual Review', status: 'Scheduled', date: 'Apr 28, 2026', type: 'Internal' },
  { name: 'Process Efficiency Check', status: 'Open', date: 'Mar 15, 2026', type: 'External' },
  { name: 'Q1 Quality Review', status: 'Closed', date: 'Jan 10, 2026', type: 'Internal' },
];

const statusColors: Record<string, string> = {
  Scheduled: 'bg-blue-50 text-blue-700',
  Open: 'bg-amber-50 text-amber-700',
  Closed: 'bg-emerald-50 text-emerald-700',
};

export function NcWorkflow() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-md transition-shadow">
        <h3 className="text-sm font-semibold text-slate-800 mb-5">NC / Workflow mix</h3>
        <div className="space-y-4">
          {workflowItems.map((item) => (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-500 tracking-wider">
                  {item.label}
                </span>
                <span className="text-xs font-bold text-slate-700">{item.percentage}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${item.percentage}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">{item.count} non-conformit{item.count === 1 ? 'y' : 'ies'}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Total NCs this period</span>
            <span className="text-xs font-bold text-slate-800">1</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Resolution rate</span>
            <span className="text-xs font-semibold text-emerald-600">0%</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-md transition-shadow">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Status distribution</h3>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={statusData.filter((d) => d.value > 0)}
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={58}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {statusData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2 mt-2">
          {statusData.map((s) => (
            <div key={s.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-xs text-slate-600">{s.name}</span>
              </div>
              <span className="text-xs font-semibold text-slate-800">{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-slate-800">Recent Audits</h3>
          <button className="text-xs text-blue-600 font-medium hover:text-blue-700 transition-colors">
            View all
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Audit</th>
                <th className="text-left pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                <th className="text-left pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                <th className="text-left pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recentAudits.map((audit) => (
                <tr key={audit.name} className="group hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 pr-4">
                    <span className="font-medium text-slate-800 text-sm">{audit.name}</span>
                  </td>
                  <td className="py-3.5 pr-4">
                    <span className="text-slate-500 text-sm">{audit.type}</span>
                  </td>
                  <td className="py-3.5 pr-4">
                    <span className="text-slate-500 text-sm">{audit.date}</span>
                  </td>
                  <td className="py-3.5">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[audit.status]}`}
                    >
                      {audit.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
