'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  TEMPLATE_FIELD_TYPES,
  createEmptyField,
  createEmptySection,
  defaultChecklistItems,
  defaultSelectOptions,
  newChecklistItemId,
  normalizeFieldForType,
  slugifyFieldName,
  type TemplateField,
  type TemplateFieldOption,
  type TemplateSection,
} from '@/lib/report-template-utils';
import { Plus, Trash2 } from '@/components/icons';

interface TemplateStructureEditorProps {
  sections: TemplateSection[];
  onChange: (sections: TemplateSection[]) => void;
}

export function TemplateStructureEditor({ sections, onChange }: TemplateStructureEditorProps) {
  const setSections = (updater: (prev: TemplateSection[]) => TemplateSection[]) => {
    onChange(updater(sections));
  };

  const updateSection = (sectionIndex: number, patch: Partial<TemplateSection>) => {
    setSections((prev) => {
      const next = [...prev];
      next[sectionIndex] = { ...next[sectionIndex], ...patch };
      return next;
    });
  };

  const removeSection = (sectionIndex: number) => {
    setSections((prev) => prev.filter((_, i) => i !== sectionIndex));
  };

  const addSection = () => {
    setSections((prev) => [...prev, createEmptySection(prev.length + 1)]);
  };

  const updateField = (sectionIndex: number, fieldIndex: number, patch: Partial<TemplateField>) => {
    setSections((prev) => {
      const next = [...prev];
      const section = { ...next[sectionIndex] };
      const fields = [...(section.fields ?? [])];
      let field = { ...fields[fieldIndex], ...patch };
      if (patch.type) {
        field = normalizeFieldForType(field);
      }
      fields[fieldIndex] = field;
      section.fields = fields;
      next[sectionIndex] = section;
      return next;
    });
  };

  const removeField = (sectionIndex: number, fieldIndex: number) => {
    setSections((prev) => {
      const next = [...prev];
      const section = { ...next[sectionIndex] };
      section.fields = (section.fields ?? []).filter((_, i) => i !== fieldIndex);
      next[sectionIndex] = section;
      return next;
    });
  };

  const addField = (sectionIndex: number) => {
    setSections((prev) => {
      const next = [...prev];
      const section = { ...next[sectionIndex] };
      const fields = [...(section.fields ?? [])];
      fields.push(createEmptyField(fields.length + 1));
      section.fields = fields;
      next[sectionIndex] = section;
      return next;
    });
  };

  const updateSelectOption = (
    sectionIndex: number,
    fieldIndex: number,
    optionIndex: number,
    patch: Partial<TemplateFieldOption>,
  ) => {
    setSections((prev) => {
      const next = [...prev];
      const section = { ...next[sectionIndex] };
      const fields = [...(section.fields ?? [])];
      const field = { ...fields[fieldIndex] };
      const options = [...(field.options ?? [])];
      options[optionIndex] = { ...options[optionIndex], ...patch };
      if (patch.label && !patch.value) {
        options[optionIndex].value = slugifyFieldName(patch.label);
      }
      field.options = options;
      fields[fieldIndex] = field;
      section.fields = fields;
      next[sectionIndex] = section;
      return next;
    });
  };

  const addSelectOption = (sectionIndex: number, fieldIndex: number) => {
    setSections((prev) => {
      const next = [...prev];
      const section = { ...next[sectionIndex] };
      const fields = [...(section.fields ?? [])];
      const field = { ...fields[fieldIndex] };
      const options = [...(field.options ?? defaultSelectOptions())];
      const n = options.length + 1;
      options.push({ value: `option_${n}`, label: `Option ${n}` });
      field.options = options;
      fields[fieldIndex] = field;
      section.fields = fields;
      next[sectionIndex] = section;
      return next;
    });
  };

  const removeSelectOption = (sectionIndex: number, fieldIndex: number, optionIndex: number) => {
    setSections((prev) => {
      const next = [...prev];
      const section = { ...next[sectionIndex] };
      const fields = [...(section.fields ?? [])];
      const field = { ...fields[fieldIndex] };
      field.options = (field.options ?? []).filter((_, i) => i !== optionIndex);
      fields[fieldIndex] = field;
      section.fields = fields;
      next[sectionIndex] = section;
      return next;
    });
  };

  const updateChecklistItem = (
    sectionIndex: number,
    fieldIndex: number,
    itemIndex: number,
    label: string,
  ) => {
    setSections((prev) => {
      const next = [...prev];
      const section = { ...next[sectionIndex] };
      const fields = [...(section.fields ?? [])];
      const field = { ...fields[fieldIndex] };
      const items = [...(field.checklistItems ?? [])];
      items[itemIndex] = { ...items[itemIndex], label };
      field.checklistItems = items;
      fields[fieldIndex] = field;
      section.fields = fields;
      next[sectionIndex] = section;
      return next;
    });
  };

  const addChecklistItem = (sectionIndex: number, fieldIndex: number) => {
    setSections((prev) => {
      const next = [...prev];
      const section = { ...next[sectionIndex] };
      const fields = [...(section.fields ?? [])];
      const field = { ...fields[fieldIndex] };
      const items = [...(field.checklistItems ?? [])];
      items.push({ id: newChecklistItemId(), label: `Item ${items.length + 1}` });
      field.checklistItems = items;
      fields[fieldIndex] = field;
      section.fields = fields;
      next[sectionIndex] = section;
      return next;
    });
  };

  const removeChecklistItem = (sectionIndex: number, fieldIndex: number, itemIndex: number) => {
    setSections((prev) => {
      const next = [...prev];
      const section = { ...next[sectionIndex] };
      const fields = [...(section.fields ?? [])];
      const field = { ...fields[fieldIndex] };
      field.checklistItems = (field.checklistItems ?? []).filter((_, i) => i !== itemIndex);
      fields[fieldIndex] = field;
      section.fields = fields;
      next[sectionIndex] = section;
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {sections.map((section, sectionIndex) => (
        <div
          key={section.id ?? sectionIndex}
          className="rounded-lg border border-border bg-gray-50/80 p-4 space-y-3"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-2">
              <label className="text-xs font-medium text-gray-600 block">Section title</label>
              <Input
                value={section.title}
                onChange={(e) => updateSection(sectionIndex, { title: e.target.value })}
              />
              <label className="text-xs font-medium text-gray-600 block">Section description (optional)</label>
              <Textarea
                rows={2}
                value={section.description ?? ''}
                onChange={(e) => updateSection(sectionIndex, { description: e.target.value })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-red-600 shrink-0 mt-6"
              onClick={() => removeSection(sectionIndex)}
              disabled={sections.length <= 1}
              title="Remove section"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-3 pl-1">
            {(section.fields ?? []).map((field, fieldIndex) => (
              <div
                key={field.id ?? fieldIndex}
                className="rounded-md border border-border bg-white p-3 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Field {fieldIndex + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-red-600 px-2"
                    onClick={() => removeField(sectionIndex, fieldIndex)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Label</label>
                    <Input
                      value={field.label}
                      onChange={(e) => {
                        const label = e.target.value;
                        updateField(sectionIndex, fieldIndex, {
                          label,
                          name: slugifyFieldName(label),
                        });
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Field key</label>
                    <Input
                      value={field.name}
                      onChange={(e) =>
                        updateField(sectionIndex, fieldIndex, { name: slugifyFieldName(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Type</label>
                    <Select
                      value={field.type}
                      onValueChange={(val) => updateField(sectionIndex, fieldIndex, { type: val })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEMPLATE_FIELD_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <Checkbox
                        checked={!!field.required}
                        onCheckedChange={(checked) =>
                          updateField(sectionIndex, fieldIndex, { required: checked === true })
                        }
                      />
                      Required
                    </label>
                  </div>
                </div>

                {(field.type === 'select' || field.type === 'radio') && (
                  <div className="space-y-2 rounded-md bg-gray-50 p-2 border border-dashed border-gray-200">
                    <p className="text-xs font-medium text-gray-600">Dropdown / radio options</p>
                    {(field.options ?? []).map((opt, optionIndex) => (
                      <div key={optionIndex} className="flex gap-2 items-center">
                        <Input
                          className="flex-1"
                          placeholder="Label"
                          value={opt.label}
                          onChange={(e) =>
                            updateSelectOption(sectionIndex, fieldIndex, optionIndex, {
                              label: e.target.value,
                            })
                          }
                        />
                        <Input
                          className="w-32"
                          placeholder="Value"
                          value={opt.value}
                          onChange={(e) =>
                            updateSelectOption(sectionIndex, fieldIndex, optionIndex, {
                              value: e.target.value,
                            })
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-red-600"
                          onClick={() => removeSelectOption(sectionIndex, fieldIndex, optionIndex)}
                          disabled={(field.options?.length ?? 0) <= 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => addSelectOption(sectionIndex, fieldIndex)}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add option
                    </Button>
                  </div>
                )}

                {field.type === 'checklist' && (
                  <div className="space-y-2 rounded-md bg-gray-50 p-2 border border-dashed border-gray-200">
                    <p className="text-xs font-medium text-gray-600">
                      Checklist items (users can tick and attach a file per item in reports)
                    </p>
                    {(field.checklistItems ?? []).map((item, itemIndex) => (
                      <div key={item.id} className="flex gap-2">
                        <Input
                          className="flex-1"
                          value={item.label}
                          onChange={(e) =>
                            updateChecklistItem(sectionIndex, fieldIndex, itemIndex, e.target.value)
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-red-600"
                          onClick={() => removeChecklistItem(sectionIndex, fieldIndex, itemIndex)}
                          disabled={(field.checklistItems?.length ?? 0) <= 1}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => addChecklistItem(sectionIndex, fieldIndex)}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add checklist item
                    </Button>
                  </div>
                )}
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1 w-full"
              onClick={() => addField(sectionIndex)}
            >
              <Plus className="w-4 h-4" />
              Add field
            </Button>
          </div>
        </div>
      ))}

      <Button type="button" variant="secondary" className="gap-2 w-full" onClick={addSection}>
        <Plus className="w-4 h-4" />
        Add section
      </Button>
    </div>
  );
}
