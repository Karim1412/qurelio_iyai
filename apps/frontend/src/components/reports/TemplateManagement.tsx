'use client';

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/cn';
import { reportApi } from '@/lib/api';
import {
  countTemplateFields,
  createEmptySection,
  type TemplateSection,
} from '@/lib/report-template-utils';
import { TemplatePresets } from './TemplatePresets';
import { TemplateStructureEditor } from './TemplateStructureEditor';
import toast from 'react-hot-toast';
import { Plus, Edit, Eye, FolderSync, ArchiveRestore, Archive, Trash2 } from '@/components/icons';

const ALL_FILTER = '__all__';

const REPORT_TYPES = [
  { value: 'AUDIT', label: 'Audit Report' },
  { value: 'NON_CONFORMITY', label: 'Non-Conformity' },
  { value: 'CAPA', label: 'CAPA Report' },
  { value: 'INCIDENT', label: 'Incident Report' },
  { value: 'COMPLAINT', label: 'Complaint Report' },
];

export function TemplateManagement() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string; sections: TemplateSection[] }>({
    name: '',
    description: '',
    sections: [],
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<{ id: string; name: string } | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [filters, setFilters] = useState({
    type: '',
    isActive: true,
    search: '',
  });

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    reportType: '',
  });

  // Fetch templates
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const params = {
          ...(filters.type && { type: filters.type }),
          isActive: filters.isActive,
        };
        const response = await reportApi.listTemplates(params);
        setTemplates(response.data.data || []);
      } catch (error: any) {
        toast.error('Failed to load templates');
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchTemplates();
  }, [filters]);

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.reportType || !formData.name) {
      toast.error('Report type and name are required');
      return;
    }

    try {
      // Create basic template structure
      const newTemplate = {
        name: formData.name,
        description: formData.description,
        reportType: formData.reportType,
        sections: [createEmptySection(1)],
      };

      const response = await reportApi.createTemplate(newTemplate);
      toast.success('Template created. Customize sections and fields below');
      setFormData({ name: '', description: '', reportType: '' });
      setShowCreateDialog(false);
      const created = response.data;
      setEditingTemplate(created);
      setEditForm({
        name: created.name ?? newTemplate.name,
        description: created.description ?? '',
        sections: JSON.parse(JSON.stringify(created.sections ?? newTemplate.sections)) as TemplateSection[],
      });
      setFilters((p) => ({ ...p }));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create template');
    }
  };

  const refreshTemplates = () => setFilters((p) => ({ ...p }));

  const handleDuplicateTemplate = async (template: any) => {
    const newName = `${template.name} - Copy`;
    try {
      await reportApi.duplicateTemplate(template.id, { newName });
      toast.success('Template duplicated');
      setFilters((p) => ({ ...p }));
    } catch (error: any) {
      toast.error('Failed to duplicate template');
    }
  };

  const handleRestoreTemplate = async (template: any) => {
    try {
      await reportApi.activateTemplate(template.id);
      toast.success('Template restored');
      refreshTemplates();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to restore template');
    }
  };

  const handleArchiveTemplate = async (template: any) => {
    try {
      await reportApi.archiveTemplate(template.id);
      toast.success('Template archived');
      refreshTemplates();
    } catch (error: any) {
      toast.error('Failed to archive template');
    }
  };

  const confirmDeleteTemplate = async () => {
    const t = deleteTemplateTarget;
    if (!t) return;
    setDeletingTemplate(true);
    try {
      await reportApi.deleteTemplate(t.id);
      toast.success('Template deleted');
      setDeleteTemplateTarget(null);
      if (selectedTemplate?.id === t.id) setSelectedTemplate(null);
      if (editingTemplate?.id === t.id) setEditingTemplate(null);
      refreshTemplates();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete template');
    } finally {
      setDeletingTemplate(false);
    }
  };

  const openEditTemplate = async (template: any) => {
    try {
      const res = await reportApi.getTemplate(template.id);
      const full = res.data;
      setEditingTemplate(full);
      setEditForm({
        name: full.name ?? '',
        description: full.description ?? '',
        sections: JSON.parse(JSON.stringify(full.sections ?? [])) as TemplateSection[],
      });
    } catch {
      setEditingTemplate(template);
      setEditForm({
        name: template.name ?? '',
        description: template.description ?? '',
        sections: JSON.parse(JSON.stringify(template.sections ?? [])) as TemplateSection[],
      });
    }
  };

  const handleSaveEditTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate?.id) return;
    if (!editForm.name.trim()) {
      toast.error('Template name is required');
      return;
    }

    try {
      setSavingEdit(true);
      await reportApi.updateTemplate(editingTemplate.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        sections: editForm.sections,
        changeDescription: 'Updated template structure',
      });
      toast.success('Template updated');
      setEditingTemplate(null);
      refreshTemplates();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update template');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Report Templates</h2>
          <p className="text-sm text-gray-600 mt-1">Manage configurable report templates</p>
        </div>
        <Button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          className="shrink-0 gap-2"
        >
          <Plus className="w-4 h-4" />
          New Template
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-end">
        <div className="w-40">
          <label className="text-xs font-medium text-gray-600 block mb-2">Report Type</label>
          <Select
            value={filters.type || ALL_FILTER}
            onValueChange={(val) => setFilters((p) => ({ ...p, type: val === ALL_FILTER ? '' : val }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>All types</SelectItem>
              {REPORT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <label className="text-xs font-medium text-gray-600 block mb-2">Status</label>
          <Select
            value={filters.isActive ? 'active' : 'inactive'}
            onValueChange={(val) => setFilters((p) => ({ ...p, isActive: val === 'active' }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Professional presets (frontend catalog → saved to API on "Use Template") */}
      <div className="rounded-lg border border-border bg-[var(--surface)] p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Professional templates</h3>
          <p className="text-xs text-gray-600 mt-1">
            Five ready-made templates (ISO audit, NC, CAPA, incident, complaint). Click Use Template to add them to your company library.
          </p>
        </div>
        <TemplatePresets onSelectTemplate={() => setFilters((p) => ({ ...p }))} />
      </div>

      <h3 className="text-sm font-semibold text-gray-900">Your templates</h3>

      <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
        {loading ? (
          <li className="px-4 py-8 text-center text-sm text-gray-500">Loading templates…</li>
        ) : templates.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-gray-500">No templates found</li>
        ) : (
          templates.map((template) => (
            <li
              key={template.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white hover:bg-gray-50/80"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{template.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <Badge className="text-[10px] font-normal border border-gray-200 bg-white text-gray-700">
                    {template.reportType}
                  </Badge>
                  <span>v{template.version}</span>
                  <span>{countTemplateFields(template.sections)} fields</span>
                  {template.isActive ? (
                    <Badge className="bg-green-100 text-green-800 text-[10px]">Active</Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-800 text-[10px]">Archived</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => setSelectedTemplate(template)}
                >
                  <Eye className="w-4 h-4" />
                  Preview template
                </Button>
                {template.isActive && (
                  <Button size="sm" className="gap-1" onClick={() => openEditTemplate(template)}>
                    <Edit className="w-4 h-4" />
                    Edit template
                  </Button>
                )}
                {template.isActive ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDuplicateTemplate(template)}
                    title="Duplicate"
                  >
                    <FolderSync className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleRestoreTemplate(template)}
                    title="Restore"
                  >
                    <ArchiveRestore className="w-4 h-4" />
                  </Button>
                )}
                {template.isActive ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleArchiveTemplate(template)}
                    title="Archive"
                  >
                    <Archive className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-600"
                    onClick={() =>
                      setDeleteTemplateTarget({ id: template.id, name: template.name || 'this template' })
                    }
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </li>
          ))
        )}
      </ul>

      {/* Create Template Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Report Template</DialogTitle>
            <DialogDescription>
              Create a new template to standardize report structure and fields.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTemplate} className="space-y-4">
            {/* Report Type */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Report Type <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.reportType}
                onValueChange={(val) => setFormData((p) => ({ ...p, reportType: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type..." />
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

            {/* Name */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Template Name <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="e.g., Standard Audit Template"
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Description</label>
              <Input
                placeholder="Optional description..."
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Create Template
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Template Detail Modal - Placeholder for editing */}
      {selectedTemplate && (
        <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Template: {selectedTemplate.name}</DialogTitle>
              <DialogDescription>
                {countTemplateFields(selectedTemplate.sections)} fields, read-only structure preview.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 max-h-[50vh] overflow-auto">
              {(selectedTemplate.sections ?? []).map((section: any) => (
                <div key={section.id} className="border border-border rounded-lg p-3">
                  <h4 className="font-medium text-sm">{section.title}</h4>
                  <ul className="mt-2 space-y-1">
                    {(section.fields ?? []).map((field: any) => (
                      <li key={field.id} className="text-xs text-gray-600">
                        {field.label} ({field.type}){field.required ? ' *' : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
                Close
              </Button>
              {selectedTemplate.isActive && (
                <Button
                  onClick={() => {
                    const t = selectedTemplate;
                    setSelectedTemplate(null);
                    openEditTemplate(t);
                  }}
                >
                  Edit template
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit template dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit template</DialogTitle>
            <DialogDescription>
              Add or remove sections and fields, configure dropdown options and checklists.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEditTemplate} className="flex flex-col flex-1 min-h-0 gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">Template name</label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">Description</label>
                <Input
                  value={editForm.description}
                  onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex-1 overflow-auto min-h-0 border border-border rounded-lg p-3">
              <TemplateStructureEditor
                sections={editForm.sections}
                onChange={(sections) => setEditForm((p) => ({ ...p, sections }))}
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setEditingTemplate(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTemplateTarget}
        onOpenChange={(open) => !open && !deletingTemplate && setDeleteTemplateTarget(null)}
      >
        <DialogContent className="max-w-md gap-0 overflow-hidden border border-[var(--border)] p-0 shadow-2xl sm:rounded-2xl">
          <div className="bg-red-500/[0.09] px-6 pb-6 pt-12 dark:bg-red-950/45">
            <div className="flex gap-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-200/70 bg-[var(--surface)] text-red-600 shadow-sm dark:border-red-800/45 dark:text-red-400"
                aria-hidden
              >
                <Trash2 className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1 pr-8">
                <DialogTitle className="text-left text-[17px] font-bold leading-snug tracking-tight text-[var(--text-primary)]">
                  Delete this template?
                </DialogTitle>
                <DialogDescription className="mt-2.5 text-left text-[13px] leading-relaxed text-[var(--muted)]">
                  This permanently removes the archived template{' '}
                  <span className="font-semibold text-[var(--text-primary)]">{deleteTemplateTarget?.name}</span>
                  . This cannot be undone. Only templates in the <strong>Archived</strong> list can be deleted.
                </DialogDescription>
              </div>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-6 py-4 sm:flex-row sm:justify-end sm:gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-[var(--border)] bg-[var(--surface)] font-medium text-[var(--text-primary)] shadow-sm hover:bg-[var(--nav-hover)]"
              disabled={deletingTemplate}
              onClick={() => setDeleteTemplateTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-xl font-semibold shadow-sm"
              disabled={deletingTemplate}
              onClick={() => void confirmDeleteTemplate()}
            >
              {deletingTemplate ? 'Deleting…' : 'Delete template'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
