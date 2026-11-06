/**
 * Metier permission “Approve Documents” (DOC-004):
 * only Company Admin (DIRECTOR) and Quality Manager may approve or reject.
 */
export const APPROVE_DOCUMENT_ROLES = ['DIRECTOR', 'QUALITY_MANAGER'] as const;

/** ISO standards library: upload, archive, restore, activate, edit extraction (STD-001–006). */
export const MANAGE_STANDARDS_ROLES = ['DIRECTOR', 'QUALITY_MANAGER'] as const;

export function canApproveDocuments(role: string): boolean {
  return (APPROVE_DOCUMENT_ROLES as readonly string[]).includes(role);
}

export function canManageStandards(role: string): boolean {
  return (MANAGE_STANDARDS_ROLES as readonly string[]).includes(role);
}
