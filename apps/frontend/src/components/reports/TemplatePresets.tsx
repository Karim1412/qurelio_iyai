'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { reportApi } from '@/lib/api';
import { PROFESSIONAL_TEMPLATES } from '@/lib/professional-templates';
import { countTemplateFields } from '@/lib/report-template-utils';
import toast from 'react-hot-toast';
import { Eye, Plus } from '@/components/icons';

interface TemplatePresetsProps {
  onSelectTemplate: (template: any) => void;
}

export function TemplatePresets({ onSelectTemplate }: TemplatePresetsProps) {
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [previewPreset, setPreviewPreset] = useState<(typeof PROFESSIONAL_TEMPLATES)[number] | null>(null);

  const handleLoadTemplate = async (template: (typeof PROFESSIONAL_TEMPLATES)[number]) => {
    try {
      setLoadingIds((prev) => new Set([...prev, template.id]));
      const { id: _presetId, ...payload } = template;
      const res = await reportApi.createTemplate(payload);
      const created = res.data;
      toast.success(`"${template.name}" added to your library.`, { duration: 5000 });
      onSelectTemplate(created);
    } catch {
      toast.error('Failed to load template');
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(template.id);
        return next;
      });
    }
  };

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
        {PROFESSIONAL_TEMPLATES.map((template) => (
          <li
            key={template.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white hover:bg-gray-50/80"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{template.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge className="text-[10px] font-normal border border-gray-200 bg-white text-gray-700">
                  {template.reportType}
                </Badge>
                <span className="text-xs text-gray-500">
                  {template.sections?.length ?? 0} sections · {countTemplateFields(template.sections)} fields
                </span>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => setPreviewPreset(template)}
              >
                <Eye className="w-4 h-4" />
                Preview template
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1"
                disabled={loadingIds.has(template.id)}
                onClick={() => void handleLoadTemplate(template)}
              >
                <Plus className="w-4 h-4" />
                {loadingIds.has(template.id) ? 'Adding…' : 'Use template'}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={!!previewPreset} onOpenChange={(open) => !open && setPreviewPreset(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{previewPreset?.name}</DialogTitle>
            <DialogDescription>{previewPreset?.description}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-3 min-h-0">
            {(previewPreset?.sections ?? []).map((section) => (
              <div key={section.id} className="border border-border rounded-lg p-3">
                <h4 className="font-medium text-sm text-gray-900">{section.title}</h4>
                {section.description && (
                  <p className="text-xs text-gray-600 mt-0.5">{section.description}</p>
                )}
                <ul className="mt-2 space-y-1.5">
                  {(section.fields ?? []).map((field) => {
                    const previewField = field as {
                      type: string;
                      options?: { label: string }[];
                      checklistItems?: { label: string }[];
                    };
                    return (
                    <li key={field.id} className="text-xs text-gray-600 flex flex-wrap gap-x-2">
                      <span className="font-medium text-gray-800">{field.label}</span>
                      <span className="text-gray-400">({field.type})</span>
                      {field.required && <span className="text-red-500">*</span>}
                      {(previewField.type === 'select' || previewField.type === 'radio') && previewField.options?.length ? (
                        <span className="text-gray-500">
                          {previewField.options.map((o) => o.label).join(', ')}
                        </span>
                      ) : null}
                      {previewField.type === 'checklist' && previewField.checklistItems?.length ? (
                        <span className="text-gray-500 w-full">
                          {previewField.checklistItems.map((i) => i.label).join('; ')}
                        </span>
                      ) : null}
                    </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPreviewPreset(null)}>
              Close
            </Button>
            {previewPreset && (
              <Button
                className="gap-1"
                disabled={loadingIds.has(previewPreset.id)}
                onClick={() => {
                  void handleLoadTemplate(previewPreset);
                  setPreviewPreset(null);
                }}
              >
                <Plus className="w-4 h-4" />
                Use template
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
