'use client';

import { Bar, BarChart, ResponsiveContainer } from 'recharts';
import { cn } from '@/utils/cn';

const defaultData = [12, 18, 10, 22, 16, 24, 14, 20].map((v, i) => ({ i, v }));

export function StatSparkline({
  color = 'var(--brand-primary)',
  data = defaultData,
  compact = false,
}: {
  color?: string;
  data?: { i: number; v: number }[];
  compact?: boolean;
}) {
  return (
    <div className={cn('w-[72px] shrink-0', compact ? 'h-9' : 'h-[52px] w-[88px]')}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Bar dataKey="v" fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
