/** Helpers for report templates and report.data initialization */

export type TemplateFieldOption = { value: string; label: string };

export type TemplateChecklistItem = { id: string; label: string };

export type TemplateField = {
  id: string;
  name: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  help?: string;
  order?: number;
  defaultValue?: unknown;
  options?: TemplateFieldOption[];
  checklistItems?: TemplateChecklistItem[];
};

export type TemplateSection = {
  id: string;
  title: string;
  description?: string;
  fields?: TemplateField[];
  order?: number;
  collapsible?: boolean;
  repeatable?: boolean;
};

export const TEMPLATE_FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Text area' },
  { value: 'rich-text', label: 'Rich text' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'select', label: 'Select (dropdown)' },
  { value: 'radio', label: 'Radio' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'checklist', label: 'Checklist (with files)' },
  { value: 'file', label: 'File upload' },
] as const;

export function slugifyFieldName(label: string): string {
  const base = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return base || `field_${Date.now()}`;
}

export function newSectionId(): string {
  return `sec-${crypto.randomUUID()}`;
}

export function newFieldId(): string {
  return `fld-${crypto.randomUUID()}`;
}

export function newChecklistItemId(): string {
  return `chk-${crypto.randomUUID()}`;
}

export function createEmptySection(order: number): TemplateSection {
  return {
    id: newSectionId(),
    title: 'New section',
    description: '',
    fields: [],
    order,
    collapsible: true,
  };
}

export function createEmptyField(order: number): TemplateField {
  const label = 'New field';
  return {
    id: newFieldId(),
    name: slugifyFieldName(`${label}_${order}`),
    label,
    type: 'text',
    required: false,
    order,
  };
}

export function defaultSelectOptions(): TemplateFieldOption[] {
  return [
    { value: 'option_1', label: 'Option 1' },
    { value: 'option_2', label: 'Option 2' },
  ];
}

export function defaultChecklistItems(): TemplateChecklistItem[] {
  return [
    { id: newChecklistItemId(), label: 'Checklist item 1' },
    { id: newChecklistItemId(), label: 'Checklist item 2' },
  ];
}

export function normalizeFieldForType(field: TemplateField): TemplateField {
  const next = { ...field };
  if ((next.type === 'select' || next.type === 'radio') && (!next.options || next.options.length === 0)) {
    next.options = defaultSelectOptions();
  }
  if (next.type === 'checklist' && (!next.checklistItems || next.checklistItems.length === 0)) {
    next.checklistItems = defaultChecklistItems();
  }
  return next;
}

export function countTemplateFields(sections: TemplateSection[] | undefined): number {
  if (!sections?.length) return 0;
  return sections.reduce((sum, s) => sum + (s.fields?.length ?? 0), 0);
}

/** Empty values for each field name so DetailedReportForm can bind inputs */
export function buildEmptyDataFromTemplate(sections: TemplateSection[] | undefined): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (!sections) return data;
  for (const section of sections) {
    for (const field of section.fields ?? []) {
      if (!field.name) continue;
      if (field.defaultValue !== undefined && field.defaultValue !== null) {
        data[field.name] = field.defaultValue;
      } else if (field.type === 'checkbox') {
        data[field.name] = false;
      } else if (field.type === 'checklist') {
        data[field.name] = (field.checklistItems ?? []).map((item) => ({
          id: item.id,
          label: item.label,
          checked: false,
          fileId: null as string | null,
          fileName: null as string | null,
        }));
      } else if (field.type === 'file') {
        data[field.name] = { fileId: null, fileName: null };
      } else {
        data[field.name] = '';
      }
    }
  }
  return data;
}

/** Strip HTML for plain display in lists */
export function stripHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function formatReportFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    const done = value.filter((v) => v && typeof v === 'object' && (v as { checked?: boolean }).checked).length;
    return `${done}/${value.length} checked`;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    ('fileName' in value || 'fileId' in value)
  ) {
    const f = value as { fileName?: string | null; fileId?: string | null };
    if (f.fileName?.trim()) return f.fileName.trim();
    if (f.fileId) return 'File attached';
    return 'No file attached';
  }
  if (typeof value === 'string' && value.includes('<')) return stripHtml(value);
  if (typeof value === 'object') return '-';
  return String(value);
}
