'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { reportApi } from '@/lib/api';
import { buildEmptyDataFromTemplate, countTemplateFields } from '@/lib/report-template-utils';
import toast from 'react-hot-toast';

const REPORT_TYPES = [
  { value: 'AUDIT', label: 'Audit Report' },
  { value: 'NON_CONFORMITY', label: 'Non-Conformity Report' },
  { value: 'CAPA', label: 'CAPA Report' },
  { value: 'INCIDENT', label: 'Incident Report' },
  { value: 'COMPLAINT', label: 'Complaint Report' },
];

const NONE_SEVERITY = '__none__';
const NONE_TEMPLATE = '__none_template__';

const SEVERITIES = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

interface CreateReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReportCreated: (report?: any) => void;
  /** Pre-select a template (e.g. from Templates tab → Create report) */
  initialTemplateId?: string | null;
}

export function CreateReportDialog({
  open,
  onOpenChange,
  onReportCreated,
  initialTemplateId,
}: CreateReportDialogProps) {
  const [loading, setLoading] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(NONE_TEMPLATE);
  const [formData, setFormData] = useState({
    type: '',
    title: '',
    severity: '',
  });

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      try {
        setTemplatesLoading(true);
        const res = await reportApi.listTemplates({ isActive: true, take: 100 });
        const list = res.data?.data ?? [];
        setTemplates(list);
      } catch {
        toast.error('Could not load templates');
      } finally {
        setTemplatesLoading(false);
      }
    };
    load();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (initialTemplateId) {
      setSelectedTemplateId(initialTemplateId);
    }
  }, [open, initialTemplateId]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId],
  );

  useEffect(() => {
    if (selectedTemplate?.reportType) {
      setFormData((p) => ({ ...p, type: selectedTemplate.reportType }));
    }
  }, [selectedTemplate?.id, selectedTemplate?.reportType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.type || !formData.title) {
      toast.error('Report type and title are required');
      return;
    }

    try {
      setLoading(true);
      const initialData = selectedTemplate
        ? buildEmptyDataFromTemplate(selectedTemplate.sections)
        : {};

      const res = await reportApi.create({
        type: formData.type,
        title: formData.title,
        severity: formData.severity || undefined,
        templateVersionId: selectedTemplate ? selectedTemplate.id : undefined,
        data: initialData,
      });

      toast.success(
        selectedTemplate
          ? 'Report created. Fill in the template fields in the detail panel'
          : 'Report created successfully',
      );
      setFormData({ type: '', title: '', severity: '' });
      setSelectedTemplateId(NONE_TEMPLATE);
      onOpenChange(false);
      onReportCreated(res.data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create report');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      setSelectedTemplateId(NONE_TEMPLATE);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Report</DialogTitle>
          <DialogDescription>
            Choose a template from your library (after &quot;Use Template&quot;) to get the full form with all sections and fields.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Template: pick first for best UX */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">
              Template (recommended)
            </label>
            <Select
              value={selectedTemplateId}
              onValueChange={setSelectedTemplateId}
              disabled={templatesLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={templatesLoading ? 'Loading templates…' : 'Select a template…'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_TEMPLATE}>No template (basic report)</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({countTemplateFields(t.sections)} fields)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templates.length === 0 && !templatesLoading && (
              <p className="text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded p-2">
                No templates in your library yet. Open the Templates tab → Professional templates → Use Template, then try again.
              </p>
            )}
            {selectedTemplate && (
              <p className="text-xs text-gray-600 mt-2">
                {selectedTemplate.description || 'Template selected'}, type is set to{' '}
                <span className="font-medium">{selectedTemplate.reportType}</span>.
              </p>
            )}
          </div>

          {/* Type */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">
              Report Type <span className="text-red-500">*</span>
            </label>
            <Select
              value={formData.type}
              onValueChange={(val) => {
                setFormData((p) => ({ ...p, type: val }));
                if (selectedTemplateId !== NONE_TEMPLATE) {
                  const stillValid = templates.some(
                    (t) => t.id === selectedTemplateId && t.reportType === val,
                  );
                  if (!stillValid) setSelectedTemplateId(NONE_TEMPLATE);
                }
              }}
              disabled={!!selectedTemplate}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select report type..." />
              </SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          {/* Severity */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Severity (optional)</label>
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

          <div className="flex gap-2 justify-end pt-4">
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Report'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
