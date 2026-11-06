'use client';

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RichTextEditor } from './RichTextEditor';
import { documentApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { cn } from '@/utils/cn';

interface DetailedFormFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
}

function FormField({ field, value, onChange, disabled }: DetailedFormFieldProps) {
  const baseClasses = 'text-sm';

  switch (field.type) {
    case 'text':
      return (
        <Input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || field.label}
          disabled={disabled}
          className={baseClasses}
        />
      );

    case 'textarea':
      return (
        <Textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          disabled={disabled}
          className={baseClasses}
        />
      );

    case 'rich-text':
      return (
        <RichTextEditor
          value={value || ''}
          onChange={onChange}
          placeholder={field.placeholder}
          disabled={disabled}
          editable={!disabled}
        />
      );

    case 'date':
      return (
        <Input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={baseClasses}
        />
      );

    case 'number':
      return (
        <Input
          type="number"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          className={baseClasses}
        />
      );

    case 'email':
      return (
        <Input
          type="email"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          className={baseClasses}
        />
      );

    case 'select':
      return (
        <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger className={baseClasses}>
            <SelectValue placeholder={field.placeholder || field.label} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt: any) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'checkbox':
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value || false}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="rounded"
          />
          <span className="text-sm">{field.label}</span>
        </label>
      );

    case 'radio':
      return (
        <div className="space-y-2">
          {field.options?.map((opt: { value: string; label: string }) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={field.name}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
                disabled={disabled}
              />
              {opt.label}
            </label>
          ))}
        </div>
      );

    case 'file': {
      const fileVal =
        value && typeof value === 'object'
          ? (value as { fileId?: string | null; fileName?: string | null })
          : { fileId: null, fileName: null };
      return (
        <div className="space-y-2">
          <div className="rounded-lg border border-[var(--border)] surface-muted-panel px-3 py-2.5 min-h-[2.75rem] flex flex-col justify-center">
            {fileVal.fileName ? (
              <p className="text-sm font-medium text-gray-900 truncate" title={fileVal.fileName}>
                {fileVal.fileName}
              </p>
            ) : (
              <p className="text-sm text-gray-500">No file attached</p>
            )}
          </div>
          <Input
            type="file"
            disabled={disabled}
            className={baseClasses}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              onChange({ fileId: null, fileName: file.name });
              try {
                const fd = new FormData();
                fd.append('file', file);
                const res = await documentApi.upload(fd);
                const doc = res.data;
                onChange({
                  fileId: doc.id ?? doc.documentId,
                  fileName: doc.fileName ?? doc.name ?? file.name,
                });
                toast.success('File uploaded');
              } catch {
                onChange({ fileId: null, fileName: null });
                toast.error('File upload failed');
              }
            }}
          />
        </div>
      );
    }

    case 'checklist': {
      type ChecklistRow = {
        id: string;
        label: string;
        checked: boolean;
        fileId?: string | null;
        fileName?: string | null;
      };
      const templateItems = field.checklistItems ?? [];
      const rows: ChecklistRow[] = Array.isArray(value)
        ? value
        : templateItems.map((item: { id: string; label: string }) => ({
            id: item.id,
            label: item.label,
            checked: false,
            fileId: null,
            fileName: null,
          }));

      const updateRow = (index: number, patch: Partial<ChecklistRow>) => {
        const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
        onChange(next);
      };

      return (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div
              key={row.id}
              className="rounded-lg border border-[var(--border)] p-3 space-y-2 panel-subtle"
            >
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={!!row.checked}
                  onChange={(e) => updateRow(index, { checked: e.target.checked })}
                  disabled={disabled}
                  className="mt-1 rounded"
                />
                <span className="text-sm text-gray-900">{row.label}</span>
              </label>
              {row.fileName && (
                <p className="text-xs text-gray-600 pl-6">File: {row.fileName}</p>
              )}
              <Input
                type="file"
                disabled={disabled}
                className="text-xs ml-6"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const fd = new FormData();
                    fd.append('file', file);
                    const res = await documentApi.upload(fd);
                    const doc = res.data;
                    updateRow(index, {
                      fileId: doc.id ?? doc.documentId,
                      fileName: doc.fileName ?? doc.name ?? file.name,
                    });
                    toast.success('File attached');
                  } catch {
                    toast.error('File upload failed');
                  }
                }}
              />
            </div>
          ))}
        </div>
      );
    }

    default:
      return <Input type="text" placeholder={field.label} disabled={disabled} />;
  }
}

interface DetailedReportFormProps {
  template: any;
  reportId: string;
  reportVersion: number;
  reportData?: Record<string, any>;
  onSubmit: (data: Record<string, any>) => void;
  onFormDataChange?: (data: Record<string, any>) => void;
  isLoading?: boolean;
  disabled?: boolean;
  showSaveButton?: boolean;
}

export function DetailedReportForm({
  template,
  reportId,
  reportVersion,
  reportData = {},
  onSubmit,
  onFormDataChange,
  isLoading = false,
  disabled = false,
  showSaveButton = true,
}: DetailedReportFormProps) {
  const [formData, setFormData] = useState<Record<string, any>>(reportData);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    template?.sections?.reduce((acc: any, sec: any) => ({ ...acc, [sec.id]: true }), {}) || {}
  );

  // Reset only when switching reports or after save (version bump). Key on parent also remounts.
  useEffect(() => {
    setFormData(reportData || {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync on report identity, not every reportData ref
  }, [reportId, reportVersion]);

  const handleFieldChange = (fieldName: string, value: any) => {
    setFormData((prev) => {
      const next = { ...prev, [fieldName]: value };
      onFormDataChange?.(next);
      return next;
    });
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showSaveButton) return;

    // Validate required fields
    for (const section of template?.sections || []) {
      for (const field of section.fields || []) {
        if (field.required && !formData[field.name]) {
          toast.error(`${field.label} is required`);
          return;
        }
      }
    }

    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Sections */}
      {template?.sections?.map((section: any) => (
        <div key={section.id} className="border border-[var(--border)] rounded-lg overflow-hidden">
          {/* Section Header */}
          {section.collapsible ? (
            <button
              type="button"
              onClick={() => toggleSection(section.id)}
              className="w-full px-4 py-3 surface-muted-panel hover:bg-[var(--table-row-hover)] border-b border-[var(--border)] flex items-center justify-between"
            >
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">{section.title}</h3>
                {section.description && (
                  <p className="text-xs text-gray-600 mt-1">{section.description}</p>
                )}
              </div>
              <span className={cn(
                'transition-transform',
                expandedSections[section.id] ? 'rotate-180' : ''
              )}>
                ▼
              </span>
            </button>
          ) : (
            <div className="px-4 py-3 surface-muted-panel border-b border-[var(--border)]">
              <h3 className="font-semibold text-gray-900">{section.title}</h3>
              {section.description && (
                <p className="text-xs text-gray-600 mt-1">{section.description}</p>
              )}
            </div>
          )}

          {/* Section Content */}
          {(!section.collapsible || expandedSections[section.id]) && (
            <div className="p-4 space-y-4">
              {section.fields?.map((field: any) => (
                <div key={field.id}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {field.label}
                    {field.required && <span className="text-red-500"> *</span>}
                  </label>
                  {field.help && (
                    <p className="text-xs text-gray-600 mb-2">{field.help}</p>
                  )}
                  <FormField
                    field={field}
                    value={formData[field.name]}
                    onChange={(value) => handleFieldChange(field.name, value)}
                    disabled={disabled}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {showSaveButton && (
        <div className="flex gap-3 justify-end pt-4 border-t border-[var(--border)]">
          <Button type="submit" disabled={isLoading || disabled} className="gap-2">
            {isLoading ? 'Saving...' : 'Save Report'}
          </Button>
        </div>
      )}
    </form>
  );
}
