'use client';

import React from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';
import { CheckCircle, Ban } from '@/components/icons';
import { resolveUserDisplayName } from '@/lib/report-history-utils';

interface Approval {
  id: string;
  approverUserId: string;
  action: string;
  comment: string;
  createdAt: string;
}

interface ApprovalHistoryProps {
  approvals: Approval[];
  nameMap: Map<string, string>;
}

const getActionIcon = (action: string) => {
  if (action === 'APPROVED') return <CheckCircle className="w-5 h-5 text-green-600" />;
  if (action === 'REJECTED') return <Ban className="w-5 h-5 text-red-600" />;
  return <div className="w-5 h-5 bg-gray-300 rounded-full" />;
};

const getActionColor = (action: string) => {
  if (action === 'APPROVED') return 'bg-green-50 border-green-200';
  if (action === 'REJECTED') return 'bg-red-50 border-red-200';
  return 'bg-gray-50 border-gray-200';
};

const getActionBadgeColor = (action: string) => {
  if (action === 'APPROVED') return 'bg-green-100 text-green-800';
  if (action === 'REJECTED') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-800';
};

export function ApprovalHistory({ approvals, nameMap }: ApprovalHistoryProps) {
  if (approvals.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No approval history yet
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {approvals.map((approval) => {
        const approverName = resolveUserDisplayName(nameMap, approval.approverUserId);
        return (
          <div
            key={approval.id}
            className={cn('border rounded-lg p-4', getActionColor(approval.action))}
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 pt-1">
                {getActionIcon(approval.action)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {approval.action === 'APPROVED' ? 'Report Approved' : 'Report Rejected'}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">by {approverName}</p>
                  </div>
                  <Badge className={cn('text-xs font-medium', getActionBadgeColor(approval.action))}>
                    {approval.action === 'APPROVED' ? '✓ Approved' : '✗ Rejected'}
                  </Badge>
                </div>

                {approval.comment && (
                  <div className="mt-3 bg-white rounded p-3 border border-gray-200">
                    <p className="text-sm font-medium text-gray-600 mb-1">Comment</p>
                    <p className="text-sm text-gray-900">{approval.comment}</p>
                  </div>
                )}

                <p className="text-xs text-gray-600 mt-2">
                  {format(new Date(approval.createdAt), 'PPp')}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
