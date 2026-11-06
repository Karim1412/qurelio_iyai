'use client';

import React, { useState, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { reportApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { cn } from '@/utils/cn';

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED', 'ARCHIVED'],
  SUBMITTED: ['UNDER_REVIEW', 'DRAFT'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'DRAFT'],
  APPROVED: ['CLOSED', 'ARCHIVED'],
  REJECTED: ['DRAFT', 'ARCHIVED'],
  CLOSED: ['ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
  ARCHIVED: 'Archived',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  UNDER_REVIEW: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  CLOSED: 'bg-gray-500 text-white',
  ARCHIVED: 'bg-gray-400 text-white',
};

interface ChangeStatusDialogProps {
  report: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChanged: (reportId: string) => void;
}

export function ChangeStatusDialog({
  report,
  open,
  onOpenChange,
  onStatusChanged,
}: ChangeStatusDialogProps) {
  const [loading, setLoading] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const [comment, setComment] = useState('');

  const validTransitions = useMemo(() => {
    return VALID_TRANSITIONS[report.status] || [];
  }, [report.status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newStatus) {
      toast.error('Please select a new status');
      return;
    }

    if (!validTransitions.includes(newStatus)) {
      toast.error('Invalid status transition');
      return;
    }

    try {
      setLoading(true);
      await reportApi.changeStatus(report.id, {
        status: newStatus,
        comment: comment || undefined,
      });

      toast.success('Report status updated successfully');
      setNewStatus('');
      setComment('');
      onOpenChange(false);
      onStatusChanged(report.id);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to change status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change Report Status</DialogTitle>
          <DialogDescription>
            Update the report status and add an optional comment.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current Status */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Current Status</label>
            <Badge className={cn('w-full justify-center py-2 text-base', STATUS_COLORS[report.status] || 'bg-gray-100 text-gray-800')}>
              {STATUS_LABELS[report.status] || report.status}
            </Badge>
          </div>

          {/* Valid Transitions */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">
              New Status <span className="text-red-500">*</span>
            </label>
            {validTransitions.length === 0 ? (
              <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded border border-gray-200">
                No valid status transitions available for this report.
              </div>
            ) : (
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select new status..." />
                </SelectTrigger>
                <SelectContent>
                  {validTransitions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status] || status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Comment */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">
              Comment (Optional)
            </label>
            <Textarea
              placeholder="Add a comment about this status change..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || validTransitions.length === 0}
            >
              {loading ? 'Updating...' : 'Change Status'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
