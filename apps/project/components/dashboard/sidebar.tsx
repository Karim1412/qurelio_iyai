'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FileText, ClipboardCheck, ChartBar as BarChart2, TriangleAlert as AlertTriangle, Users, Building2, Settings, ChevronDown, ChevronRight, Shield, Workflow, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

const navSections = [
  {
    label: 'OVERVIEW',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'MANAGEMENT',
    items: [
      { label: 'Documents', href: '/dashboard/documents', icon: FileText },
      { label: 'Workflows', href: '/dashboard/workflows', icon: Workflow },
      { label: 'Training', href: '/dashboard/training', icon: BookOpen },
    ],
  },
  {
    label: 'QUALITY',
    collapsible: true,
    items: [
      { label: 'Audits', href: '/dashboard/audits', icon: ClipboardCheck },
      { label: 'Evaluations', href: '/dashboard/evaluations', icon: BarChart2 },
      { label: 'Non-Conformities', href: '/dashboard/non-conformities', icon: AlertTriangle },
    ],
  },
  {
    label: 'ADMIN',
    collapsible: true,
    items: [
      { label: 'Team Members', href: '/dashboard/team', icon: Users },
      { label: 'Organization', href: '/dashboard/organization', icon: Building2 },
      { label: 'Compliance', href: '/dashboard/compliance', icon: Shield },
      { label: 'Settings', href: '/dashboard/settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    QUALITY: false,
    ADMIN: false,
  });

  const toggleSection = (label: string) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-white border-r border-slate-100 flex flex-col shadow-sm">
      <div className="flex items-center px-6 h-16 border-b border-slate-100">
        <Link href="/dashboard" className="flex items-center gap-1 select-none">
          <span className="text-2xl font-bold tracking-tight" style={{ color: '#2563EB' }}>
            Qureli
          </span>
          <span className="text-2xl font-bold" style={{ color: '#F59E0B' }}>
            o
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navSections.map((section) => (
          <div key={section.label} className="mb-4">
            {section.collapsible ? (
              <button
                onClick={() => toggleSection(section.label)}
                className="flex items-center justify-between w-full px-3 py-1.5 mb-1 text-[10px] font-semibold tracking-widest text-slate-400 hover:text-slate-600 transition-colors uppercase"
              >
                {section.label}
                {collapsed[section.label] ? (
                  <ChevronRight className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            ) : (
              <p className="px-3 py-1.5 mb-1 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                {section.label}
              </p>
            )}

            {!collapsed[section.label] && (
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                          isActive
                            ? 'bg-blue-50 text-blue-700 shadow-sm'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        )}
                      >
                        <Icon
                          className={cn(
                            'w-4 h-4 shrink-0',
                            isActive ? 'text-blue-600' : 'text-slate-400'
                          )}
                        />
                        {item.label}
                        {isActive && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-slate-100">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-gradient-to-r from-blue-50 to-amber-50">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
            PA
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">Pura Account</p>
            <p className="text-[10px] text-slate-400 truncate">admin@qurelio.com</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
