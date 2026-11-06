'use client';

import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { reportApi } from '@/lib/api';
import toast from 'react-hot-toast';

const NONE_SEVERITY = '__none__';

const SEVERITIES = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

interface EditReportDialogProps {
  report: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReportUpdated: () => void;
}

export function EditReportDialog({
  report,
  open,
  onOpenChange,
  onReportUpdated,
}: EditReportDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: report.title,
    description: report.description || '',
    severity: report.severity || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title) {
      toast.error('Title is required');
      return;
    }

    try {
      setLoading(true);
      await reportApi.update(report.id, {
        title: formData.title,
        description: formData.description,
        severity: formData.severity || undefined,
        reason: 'Manual edit',
      });

      toast.success('Report updated successfully');
      onOpenChange(false);
      onReportUpdated();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Report</DialogTitle>
          <DialogDescription>
            Update report information and metadata.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="Enter report title..."
              value={formData.title}
              onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Description</label>
            <Textarea
              placeholder="Enter report description..."
              value={formData.description}
              onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
              rows={3}
            />
          </div>

          {/* Severity */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Severity</label>
            <Select
              value={formData.severity || NONE_SEVERITY}
              onValueChange={(val) =>
                setFormData((p) => ({ ...p, severity: val === NONE_SEVERITY ? '' : val }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select severity..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_SEVERITY}>No severity</SelectItem>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
