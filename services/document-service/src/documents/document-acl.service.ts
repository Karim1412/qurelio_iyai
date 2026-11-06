import { Injectable } from '@nestjs/common';
import { DocumentAccessRule } from '../database/entities/document-access-rule.entity';
import type { Document } from '../database/entities/document.entity';

@Injectable()
export class DocumentAclService {
  /**
   * No rules → all tenant users may read (same as before).
   * With rules → user must match a rule or be DIRECTOR (Company Admin).
   */
  isAllowed(
    doc: Document,
    user: { id: string; role: string; department?: string },
    rules: DocumentAccessRule[],
    opts?: { includeArchivedAccess?: boolean },
  ): boolean {
    /** Archived docs are hidden from default list/get unless the caller explicitly includes them (e.g. ?includeArchived=true). */
    if (doc.archivedAt && !opts?.includeArchivedAccess) return false;
    if (rules.length === 0) return true;
    if (user.role === 'DIRECTOR') return true;
    for (const r of rules) {
      if (r.kind === 'USER' && r.userId === user.id) return true;
      if (r.kind === 'ROLE' && r.roleRef === user.role) return true;
      if (r.kind === 'DEPARTMENT' && r.department && user.department && r.department === user.department)
        return true;
    }
    return false;
  }
}
