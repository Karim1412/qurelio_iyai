'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { format } from 'date-fns';
import { reportApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ModificationTimeline } from './ModificationTimeline';
import { ApprovalHistory } from './ApprovalHistory';
import { ChangeStatusDialog } from './ChangeStatusDialog';
import { DetailedReportForm } from './DetailedReportForm';
import { formatReportFieldValue } from '@/lib/report-template-utils';
import { buildReportChangeEvents } from '@/lib/report-history-utils';
import { useCompanyUserNameMap } from '@/hooks/useCompanyUserNameMap';
import { FileDown } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { ReportSeverityBadge, ReportStatusBadge } from './ReportBadges';

const NONE_SEVERITY = '__none__';

const SEVERITIES = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

interface ReportDetailProps {
  report: any;
  onReportUpdated: (reportId: string) => void;
}

export function ReportDetail({ report, onReportUpdated }: ReportDetailProps) {
  const { exportReports, canCreateOrEditReports, isReadOnly } = usePermissions();
  const { nameMap } = useCompanyUserNameMap();
  const [modifications, setModifications] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<any | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [generalInfo, setGeneralInfo] = useState({
    title: report.title ?? '',
    severity: report.severity ?? '',
  });
  const [formData, setFormData] = useState<Record<string, unknown>>(report.data || {});

  const templateId = report.templateVersionId as string | null | undefined;
  const canEdit =
    canCreateOrEditReports &&
    !isReadOnly &&
    !report.isLocked &&
    report.status !== 'CLOSED' &&
    report.status !== 'APPROVED';

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const [modRes, verRes, appRes] = await Promise.all([
          reportApi.getModifications(report.id),
          reportApi.getVersions(report.id),
          reportApi.getApprovals(report.id),
        ]);
        setModifications(modRes.data || []);
        setVersions(verRes.data || []);
        setApprovals(appRes.data || []);
      } catch (error: any) {
        console.error('Failed to fetch history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [report.id, report.version]);

  const changeCount = useMemo(
    () => buildReportChangeEvents(versions, modifications, nameMap).length,
    [versions, modifications, nameMap],
  );

  useEffect(() => {
    if (!templateId) {
      setTemplate(null);
      return;
    }
    const loadTemplate = async () => {
      try {
        setTemplateLoading(true);
        const res = await reportApi.getTemplate(templateId);
        setTemplate(res.data);
      } catch {
        setTemplate(null);
        toast.error('Could not load report template');
      } finally {
        setTemplateLoading(false);
      }
    };
    loadTemplate();
  }, [templateId, report.id]);

  useEffect(() => {
    setGeneralInfo({
      title: report.title ?? '',
      severity: report.severity ?? '',
    });
    setFormData(report.data || {});
  }, [report.id, report.version, report.title, report.severity, report.data]);

  const validateTemplateFields = useCallback(() => {
    if (!template) return true;
    for (const section of template.sections || []) {
      for (const field of section.fields || []) {
        if (field.required && !formData[field.name]) {
          toast.error(`${field.label} is required`);
          return false;
        }
      }
    }
    return true;
  }, [template, formData]);

  const handleSaveAll = useCallback(async () => {
    if (!generalInfo.title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!validateTemplateFields()) return;

    try {
      setSaving(true);
      await reportApi.update(report.id, {
        title: generalInfo.title.trim(),
        severity: generalInfo.severity || undefined,
        data: formData,
        reason: 'Updated report',
      });
      toast.success('Changes saved');
      onReportUpdated(report.id);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save report');
    } finally {
      setSaving(false);
    }
  }, [report.id, generalInfo, formData, validateTemplateFields, onReportUpdated]);

  const handleFormDataChange = useCallback((data: Record<string, unknown>) => {
    setFormData(data);
  }, []);

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = async () => {
    try {
      setExportingPdf(true);
      const res = await reportApi.export(report.id, 'pdf');
      const ct = String(res.headers['content-type'] ?? '').toLowerCase();
      if (res.status >= 400 || ct.includes('application/json')) {
        let msg = 'PDF export failed';
        try {
          const text = typeof (res.data as Blob).text === 'function' ? await (res.data as Blob).text() : '';
          if (text) {
            const j = JSON.parse(text) as { message?: string };
            if (j?.message) msg = Array.isArray(j.message) ? j.message[0] : j.message;
          }
        } catch {
          /* ignore */
        }
        toast.error(msg);
        return;
      }
      const slug = (generalInfo.title || report.title || 'report')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 60) || 'report';
      downloadBlob(new Blob([res.data]), `${slug}.pdf`);
      toast.success('PDF download started');
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(typeof msg === 'string' ? msg : 'PDF export failed');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">
      <div className="sticky top-0 z-10 border-b border-border bg-[var(--surface)] p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="truncate text-lg font-bold text-[var(--text-primary)]">{generalInfo.title || report.title}</h2>
            {template && (
              <p className="mt-1 text-xs text-[var(--link-accent)]">
                Template: <span className="font-medium">{template.name}</span>
              </p>
            )}
            {!templateId && (
              <p className="mt-1 text-xs text-[var(--badge-progress-text)]">
                No template linked. Create a new report and select a template for the full form.
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
            {exportReports && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportPdf}
                disabled={exportingPdf}
                className="gap-1.5"
              >
                <FileDown className="h-3.5 w-3.5" />
                {exportingPdf ? 'Exporting...' : 'Export PDF'}
              </Button>
            )}
            <Button size="sm" onClick={handleSaveAll} disabled={!canEdit || saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowStatusDialog(true)}
              disabled={report.isLocked}
            >
              Change Status
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <ReportStatusBadge status={report.status} />
          {(generalInfo.severity || report.severity) && (
            <ReportSeverityBadge severity={generalInfo.severity || report.severity} />
          )}
          {report.isLocked && (
            <span className="report-locked-badge report-status-badge border text-xs font-medium">
              Locked for Editing
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs text-[var(--muted)]">
          <div>
            <span className="font-medium">Created:</span> {format(new Date(report.createdAt), 'PPp')}
          </div>
          <div>
            <span className="font-medium">Version:</span> {report.version}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-4">
        <Tabs defaultValue="details" className="h-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Form</TabsTrigger>
            <TabsTrigger value="modifications">Changes ({changeCount})</TabsTrigger>
            <TabsTrigger value="approvals">Approvals ({approvals.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            <div className="border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">General Information</h3>
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">
                  Title <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="Enter report title..."
                  value={generalInfo.title}
                  onChange={(e) => setGeneralInfo((p) => ({ ...p, title: e.target.value }))}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Severity</label>
                <Select
                  value={generalInfo.severity || NONE_SEVERITY}
                  onValueChange={(val) =>
                    setGeneralInfo((p) => ({ ...p, severity: val === NONE_SEVERITY ? '' : val }))
                  }
                  disabled={!canEdit}
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
            </div>

            {templateLoading && (
              <p className="py-8 text-center text-sm text-[var(--muted)]">Loading template form…</p>
            )}

            {!templateLoading && template && (
              <DetailedReportForm
                key={`${report.id}-${report.version}`}
                template={template}
                reportId={report.id}
                reportVersion={report.version}
                reportData={report.data || {}}
                onSubmit={() => {}}
                onFormDataChange={handleFormDataChange}
                showSaveButton={false}
                disabled={!canEdit}
              />
            )}

            {!templateLoading && !template && templateId && (
              <p className="text-sm text-red-600">Template not found. It may have been deleted.</p>
            )}

            {!templateId && (
              <>
                <div className="border border-border rounded-lg p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Report data</h3>
                  {Object.entries(report.data || {}).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-start justify-between gap-3 border-b border-[var(--border)] py-2 last:border-b-0"
                    >
                      <span className="text-sm font-medium capitalize text-[var(--muted)]">
                        {key.replace(/_/g, ' ')}:
                      </span>
                      <span className="max-w-xs text-right text-sm text-[var(--text-primary)]">
                        {formatReportFieldValue(value)}
                      </span>
                    </div>
                  ))}
                  {Object.keys(report.data || {}).length === 0 && (
                    <p className="text-sm text-[var(--muted)]">No field data. Create a report with a template selected.</p>
                  )}
                </div>
              </>
            )}

            <div className="border border-border rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Metadata</h3>
              {report.dueDate && (
                <div className="flex items-center justify-between border-b border-[var(--border)] py-2">
                  <span className="text-sm font-medium text-[var(--muted)]">Due Date:</span>
                  <span className="text-sm text-[var(--text-primary)]">{format(new Date(report.dueDate), 'PPp')}</span>
                </div>
              )}
              {report.submittedAt && (
                <div className="flex items-center justify-between border-b border-[var(--border)] py-2">
                  <span className="text-sm font-medium text-[var(--muted)]">Submitted:</span>
                  <span className="text-sm text-[var(--text-primary)]">{format(new Date(report.submittedAt), 'PPp')}</span>
                </div>
              )}
              {report.approvedAt && (
                <div className="flex items-center justify-between border-b border-[var(--border)] py-2">
                  <span className="text-sm font-medium text-[var(--muted)]">Approved:</span>
                  <span className="text-sm text-[var(--text-primary)]">{format(new Date(report.approvedAt), 'PPp')}</span>
                </div>
              )}
              {report.approvalComment && (
                <div className="py-2">
                  <span className="mb-1 block text-sm font-medium text-[var(--muted)]">Comment:</span>
                  <p className="surface-muted-panel rounded border p-2 text-sm text-[var(--text-primary)]">
                    {report.approvalComment}
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="modifications" className="mt-4">
            {loading ? (
              <div className="py-8 text-center text-[var(--muted)]">Loading...</div>
            ) : (
              <ModificationTimeline
                versions={versions}
                modifications={modifications}
                nameMap={nameMap}
              />
            )}
          </TabsContent>

          <TabsContent value="approvals" className="mt-4">
            {loading ? (
              <div className="py-8 text-center text-[var(--muted)]">Loading...</div>
            ) : (
              <ApprovalHistory approvals={approvals} nameMap={nameMap} />
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ChangeStatusDialog
        report={report}
        open={showStatusDialog}
        onOpenChange={setShowStatusDialog}
        onStatusChanged={() => onReportUpdated(report.id)}
      />
    </div>
  );
}
