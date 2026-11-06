import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { DocumentAuditEvent } from '../database/entities/document-audit-event.entity';

/** Actions shown on the company activity log (excludes VIEW/DOWNLOAD/noise). */
export const DOCUMENT_ACTIVITY_ACTIONS = [
  'UPLOAD',
  'VERSION',
  'UPDATE',
  'ARCHIVE',
  'RESTORE',
  'DELETE_HARD',
  'EXTRACTION_EDIT',
  'MANUAL_TEXT',
  'SHARE_COMPANY',
  'ACL_CHANGE',
  'OWNER_CHANGE',
  'APPROVAL',
  'SUBMIT_REVIEW',
  'STANDARD_ACTIVATED',
  'PROCESSING_COMPLETE',
] as const;

@Injectable()
export class DocumentAuditService {
  constructor(
    @InjectRepository(DocumentAuditEvent)
    private readonly auditRepo: Repository<DocumentAuditEvent>,
  ) {}

  async log(
    companyId: string,
    documentId: string,
    actorUserId: string,
    action: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.auditRepo.save(
      this.auditRepo.create({ companyId, documentId, actorUserId, action, metadata }),
    );
  }

  async listForDocument(companyId: string, documentId: string): Promise<DocumentAuditEvent[]> {
    return this.auditRepo.find({
      where: { companyId, documentId },
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }

  async listCompanyActivity(companyId: string, from: Date, to: Date, take = 400): Promise<DocumentAuditEvent[]> {
    return this.auditRepo.find({
      where: {
        companyId,
        action: In([...DOCUMENT_ACTIVITY_ACTIONS]),
        createdAt: Between(from, to),
      },
      order: { createdAt: 'DESC' },
      take,
    });
  }
}
