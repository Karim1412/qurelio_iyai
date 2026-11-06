'use client';

import { Bell, Search, Building2, ChevronDown } from 'lucide-react';

export function Header() {
  return (
    <header className="h-16 bg-white border-b border-slate-100 flex items-center px-6 gap-4 sticky top-0 z-10 shadow-sm">
      <div className="flex items-center gap-2.5 text-slate-600">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
          <Building2 className="w-4 h-4 text-blue-600" />
        </div>
        <span className="text-sm font-medium text-slate-700">company account</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </div>

      <div className="flex-1 max-w-md ml-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search documents, audits..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 placeholder:text-slate-400 transition-all"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-50 text-slate-500 transition-colors">
          <Bell className="w-4.5 h-4.5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-amber-400 rounded-full border-2 border-white" />
        </button>

        <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
          <div className="flex flex-col items-end">
            <span className="text-xs font-semibold text-slate-800">Pura</span>
            <span className="text-[10px] text-slate-400">Administrator</span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold shadow-sm">
            PA
          </div>
        </div>
      </div>
    </header>
  );
}
