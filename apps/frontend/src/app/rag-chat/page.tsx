'use client';

import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/card';
import { RagChatPanel } from '@/components/rag/RagChatPanel';

export default function RagChatPage() {
  return (
    <DashboardLayout>
      <div className="mx-auto flex max-w-3xl flex-col" style={{ minHeight: 'calc(100vh - 140px)' }}>
        <Card className="flex flex-1 flex-col overflow-hidden border-[var(--border)] shadow-none">
          <RagChatPanel variant="page" />
        </Card>
      </div>
    </DashboardLayout>
  );
}