import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { fetchCompanyDisplayName } from '../common/company-display-name';
import {
  createBrandedPdfWriter,
  brandedDrawBlock,
  brandedSectionBar,
  finalizeBrandedPdf,
  stripHtmlForPdf,
} from '../common/pdf-brand-layout';
import {
  Audit, AuditStatus, AuditType, AuditFinding, AuditChecklist, AuditChangeLog, FindingType,
} from '../database/entities/audit.entity';
import { NCService } from '../nc/nc.service';
import { NCClassification, NCSource } from '../database/entities/non-conformity.entity';
import {
  type ChecklistRowDef,
  type ExtractedSection,
  compareIsoClauseRefs,
  mergeDocumentAndTemplateRows,
  rowMatchesHierarchicalScope,
  rowsFromExtractedSections,
} from './audit-checklist-from-document';
import {
  auditExportSlug,
  buildAuditSummaryStats,
  exportAuditToExcel,
  formatFindingAnswer,
  mapLinkedNcs,
} from './audit-export';
import {
  type EvidenceCheckRow as AuditEvidenceCheckRow,
  formatEvidenceChecklistForAi,
  mergeEvidenceChecksWithDefaults,
} from './audit-checklist-defaults';

/** ISO 9001:2015 style clauses: one checklist row per clause (AUD-003). */
const ISO_9001_CLAUSE_QUESTIONS: { isoClause: string; question: string }[] = [
  { isoClause: '4.1', question: 'Has the organization determined internal and external issues relevant to its purpose and strategic direction?' },
  { isoClause: '4.2', question: 'Have the needs and expectations of interested parties been determined, monitored, and reviewed?' },
  { isoClause: '4.4', question: 'Is the QMS established, implemented, maintained, and continually improved?' },
  { isoClause: '5.1', question: 'Does top management demonstrate leadership and commitment to the QMS?' },
  { isoClause: '5.2', question: 'Is the quality policy appropriate, approved by top management, communicated, understood, and available as documented information?' },
  { isoClause: '6.1', question: 'Are risks and opportunities addressed to give assurance the QMS achieves intended results?' },
  { isoClause: '6.2', question: 'Are quality objectives established, monitored, communicated, and updated?' },
  { isoClause: '7.1', question: 'Are resources determined and provided for the establishment, implementation, maintenance, and improvement of the QMS?' },
  { isoClause: '7.2', question: 'Is competence determined, evidence available, and awareness ensured?' },
  { isoClause: '7.5', question: 'Is documented information controlled (creation, update, availability, protection)?' },
  { isoClause: '8.1', question: 'Are operational planning and control established for product/service provision?' },
  { isoClause: '8.4', question: 'Are external providers evaluated, selected, monitored, and controlled?' },
  { isoClause: '8.5', question: 'Are production and service provision controlled (including identification, traceability, property, preservation)?' },
  { isoClause: '9.1', question: 'Are monitoring, measurement, analysis, and evaluation performed as planned?' },
  { isoClause: '9.2', question: 'Are internal audits conducted at planned intervals with competent auditors?' },
  { isoClause: '9.3', question: 'Does top management review the QMS at planned intervals?' },
  { isoClause: '10.2', question: 'Are nonconformities reacted to, evaluated, and corrected with corrective actions?' },
  { isoClause: '10.3', question: 'Is continual improvement demonstrated by enhancing customer satisfaction and QMS suitability?' },
];

/** ISO/IEC 42001:2023 (AIMS): hierarchical autodiagnostic-style rows (multi-level checklist). */
const ISO_42001_CLAUSE_QUESTIONS: { isoClause: string; question: string; hierarchyLevel: 1 | 2 | 3 }[] = [
  { hierarchyLevel: 1, isoClause: '4', question: 'Chapter 4: Context of the organization' },
  { hierarchyLevel: 2, isoClause: '4.1', question: '4.1 Understanding the organization and its context' },
  { hierarchyLevel: 3, isoClause: '4.1.1', question: 'The organization has determined internal and external issues relevant to its purpose and affecting its ability to achieve the intended result(s) of the AI management system.' },
  { hierarchyLevel: 2, isoClause: '4.2', question: '4.2 Understanding the needs and expectations of interested parties' },
  { hierarchyLevel: 3, isoClause: '4.2.1', question: 'The organization has determined the interested parties relevant to the AI management system and the relevant requirements of these interested parties.' },
  { hierarchyLevel: 2, isoClause: '4.3', question: '4.3 Determining the scope of the AI management system' },
  { hierarchyLevel: 3, isoClause: '4.3.1', question: 'The organization has determined the boundaries and applicability of the AI management system to establish its scope.' },
  { hierarchyLevel: 2, isoClause: '4.4', question: '4.4 AI management system' },
  { hierarchyLevel: 3, isoClause: '4.4.1', question: 'The organization has established, implemented, maintained and continually improved an AI management system, including the processes needed and their interactions, in accordance with the requirements of this document.' },
  { hierarchyLevel: 1, isoClause: '5', question: 'Chapter 5: Leadership' },
  { hierarchyLevel: 2, isoClause: '5.1', question: '5.1 Leadership and commitment' },
  { hierarchyLevel: 3, isoClause: '5.1.1', question: 'Top management has taken accountability for the effectiveness of the AI management system and ensured that the policy and objectives are established and compatible with the strategic direction.' },
  { hierarchyLevel: 2, isoClause: '5.2', question: '5.2 Policy' },
  { hierarchyLevel: 3, isoClause: '5.2.1', question: 'The organization has established an AI policy appropriate to its purpose, including commitment to applicable requirements and continual improvement of the AI management system.' },
  { hierarchyLevel: 2, isoClause: '5.3', question: '5.3 Roles, responsibilities and authorities' },
  { hierarchyLevel: 3, isoClause: '5.3.1', question: 'The organization has assigned, communicated and understood the responsibilities and authorities for relevant roles within the AI management system.' },
  { hierarchyLevel: 1, isoClause: '6', question: 'Chapter 6: Planning' },
  { hierarchyLevel: 2, isoClause: '6.1', question: '6.1 Actions to address risks and opportunities' },
  { hierarchyLevel: 3, isoClause: '6.1.1', question: 'The organization has determined risks and opportunities to be addressed to assure the AI management system achieves its intended result(s) and to prevent or reduce undesired effects.' },
  { hierarchyLevel: 2, isoClause: '6.2', question: '6.2 AI objectives and planning to achieve them' },
  { hierarchyLevel: 3, isoClause: '6.2.1', question: 'The organization has established measurable AI objectives and planned actions, responsibilities, timeframes, resources, and how results are evaluated.' },
  { hierarchyLevel: 1, isoClause: '7', question: 'Chapter 7: Support' },
  { hierarchyLevel: 2, isoClause: '7.1', question: '7.1 Resources' },
  { hierarchyLevel: 3, isoClause: '7.1.1', question: 'The organization has determined and provided the resources needed for the establishment, implementation, maintenance and improvement of the AI management system.' },
  { hierarchyLevel: 1, isoClause: '8', question: 'Chapter 8: Operation' },
  { hierarchyLevel: 2, isoClause: '8.1', question: '8.1 Operational planning and control' },
  { hierarchyLevel: 3, isoClause: '8.1.1', question: 'The organization has planned, implemented and controlled processes to meet requirements and applied the actions from 6.1 using a lifecycle view of AI systems.' },
  { hierarchyLevel: 1, isoClause: '9', question: 'Chapter 9: Performance evaluation' },
  { hierarchyLevel: 2, isoClause: '9.1', question: '9.1 Monitoring, measurement, analysis and evaluation' },
  { hierarchyLevel: 3, isoClause: '9.1.1', question: 'The organization has evaluated performance and the effectiveness of the AI management system, and retained appropriate documented information as evidence of the results.' },
  { hierarchyLevel: 1, isoClause: '10', question: 'Chapter 10: Improvement' },
  { hierarchyLevel: 2, isoClause: '10.1', question: '10.1 Continual improvement' },
  { hierarchyLevel: 3, isoClause: '10.1.1', question: 'The organization has continually improved the suitability, adequacy and effectiveness of the AI management system, including by addressing nonconformities and corrective actions.' },
  { hierarchyLevel: 2, isoClause: '10.2', question: '10.2 Nonconformity and corrective action' },
  { hierarchyLevel: 3, isoClause: '10.2.1', question: 'The organization has reacted to nonconformities, taken corrective action, and determined whether similar nonconformities could recur or appear elsewhere in the AI management system.' },
];

function sortAuditChecklists(items: AuditChecklist[]): AuditChecklist[] {
  return [...items].sort((x, y) => {
    const clauseCmp = compareIsoClauseRefs(x.isoClause, y.isoClause);
    if (clauseCmp !== 0) return clauseCmp;
    const hlX = x.hierarchyLevel ?? 99;
    const hlY = y.hierarchyLevel ?? 99;
    if (hlX !== hlY) return hlX - hlY;
    const tX = x.createdAt ? new Date(x.createdAt).getTime() : 0;
    const tY = y.createdAt ? new Date(y.createdAt).getTime() : 0;
    return tX - tY;
  });
}

type EvidenceCheckRow = { id: string; label: string; checked: boolean; source?: 'default' | 'ai' | 'user' };

@Injectable()
export class AuditService {
  private readonly log = new Logger(AuditService.name);

  constructor(
    @InjectRepository(Audit)          private auditRepo:     Repository<Audit>,
    @InjectRepository(AuditFinding)   private findingRepo:   Repository<AuditFinding>,
    @InjectRepository(AuditChecklist)  private checklistRepo: Repository<AuditChecklist>,
    @InjectRepository(AuditChangeLog) private changeLogRepo: Repository<AuditChangeLog>,
    private ncService: NCService,
    private cfg: ConfigService,
  ) {}

  private get ragUrl() {
    return (this.cfg.get('RAG_SERVICE_URL', 'http://rag-service:8000') || '').replace(/\/$/, '');
  }

  private get documentServiceUrl() {
    return (this.cfg.get('DOCUMENT_SERVICE_URL', 'http://document-service:3003') || '').replace(/\/$/, '');
  }

  private get documentInternalToken() {
    return (this.cfg.get<string>('DOCUMENT_INTERNAL_TOKEN') || '').trim();
  }

  private async fetchStructuredDocument(
    companyId: string,
    documentId: string,
  ): Promise<{ extractedStructured?: { sections?: ExtractedSection[] } } | null> {
    const base = this.documentServiceUrl;
    if (!base || !documentId) return null;
    const token = this.documentInternalToken;
    try {
      const res = await axios.get(
        `${base}/api/documents/internal/structured/${encodeURIComponent(documentId)}`,
        {
          params: { company_id: companyId },
          headers: token ? { 'X-Internal-Token': token } : {},
          timeout: 25_000,
          validateStatus: () => true,
        },
      );
      if (res.status >= 400 || !res.data) return null;
      return res.data as { extractedStructured?: { sections?: ExtractedSection[] } };
    } catch (e) {
      this.log.warn(`fetchStructuredDocument failed: ${e}`);
      return null;
    }
  }

  /** Prefer clause text from uploaded standard extraction; fall back to built-in templates. */
  private async buildChecklistRowsForAudit(
    companyId: string,
    isoDocumentId: string | undefined,
    isoStandard: string | undefined,
    scopeClauseRefs: string[] | null,
  ): Promise<ChecklistRowDef[]> {
    const refs = scopeClauseRefs?.filter((x) => String(x).trim()).map((r) => r.trim()) ?? [];
    const templateRows = this.buildChecklistRows(isoStandard, refs.length ? refs : null);

    if (!isoDocumentId || !refs.length) {
      return templateRows;
    }

    const doc = await this.fetchStructuredDocument(companyId, isoDocumentId);
    const sections = doc?.extractedStructured?.sections;
    if (!Array.isArray(sections) || !sections.length) {
      return templateRows;
    }

    const fromDoc = rowsFromExtractedSections(sections, refs, isoStandard);
    if (!fromDoc.length) {
      return templateRows;
    }

    return mergeDocumentAndTemplateRows(fromDoc, templateRows, refs);
  }

  private async logChange(auditId: string, userId: string, action: string, detail: Record<string, unknown> | null) {
    await this.changeLogRepo.save(
      this.changeLogRepo.create({ auditId, userId, action, detail }),
    );
  }

  private buildChecklistRows(isoStandard: string | undefined, scopeClauseRefs: string[] | null | undefined): ChecklistRowDef[] {
    const std = (isoStandard || '').toLowerCase();
    const refs = scopeClauseRefs?.filter((x) => String(x).trim()).map((r) => r.trim()) ?? [];

    if (std.includes('42001')) {
      let rows: ChecklistRowDef[] = ISO_42001_CLAUSE_QUESTIONS.map((q) => ({
        isoClause: q.isoClause,
        question: q.question,
        hierarchyLevel: q.hierarchyLevel,
      }));
      if (refs.length) {
        rows = rows.filter((row) => refs.some((ref) => rowMatchesHierarchicalScope(row.isoClause, ref)));
      }
      return rows;
    }

    if (std.includes('9001')) {
      let rows: ChecklistRowDef[] = ISO_9001_CLAUSE_QUESTIONS.map((q) => ({
        isoClause: q.isoClause,
        question: q.question.replace(/^Clause\s+[\d.]+\s*[—–-]\s*/i, '').trim(),
        hierarchyLevel: 3,
      }));
      if (refs.length) {
        const set = new Set(refs);
        rows = rows.filter((r) => set.has(r.isoClause));
      }
      return rows;
    }
    return [];
  }

  async create(companyId: string, userId: string, dto: any) {
    const title = (dto.title || dto.name || '').trim();
    if (!title) throw new BadRequestException('Audit name (title) is required');
    const type = dto.type as AuditType;
    if (!['INTERNAL', 'SUPPLIER', 'CERTIFICATION'].includes(type))
      throw new BadRequestException('Type must be INTERNAL, SUPPLIER, or CERTIFICATION');
    const leadAuditor = (dto.leadAuditor || '').trim();
    if (!leadAuditor) throw new BadRequestException('Lead auditor is required');
    if (!dto.scheduledAt) throw new BadRequestException('Start date is required');
    if (!dto.scheduledEndAt) throw new BadRequestException('End date is required');

    const start = new Date(dto.scheduledAt);
    const end = new Date(dto.scheduledEndAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
      throw new BadRequestException('Invalid start or end date');
    if (end < start) throw new BadRequestException('End date must be on or after start date');

    const scopeClauseRefs = Array.isArray(dto.scopeClauseRefs)
      ? dto.scopeClauseRefs.map((x: unknown) => String(x).trim()).filter(Boolean)
      : null;
    if (!scopeClauseRefs?.length) {
      throw new BadRequestException('Select at least one clause in scope');
    }

    const isoLabel = dto.isoStandard ? String(dto.isoStandard).trim() : '';
    let scope = (dto.scope || '').trim();
    if (!scope) {
      scope = isoLabel
        ? `${isoLabel} clauses: ${scopeClauseRefs.join(', ')}`
        : `Audit scope clauses: ${scopeClauseRefs.join(', ')}`;
    }

    const audit = this.auditRepo.create({
      companyId,
      title,
      type,
      scheduledAt: start,
      scheduledEndAt: end,
      leadAuditor,
      scope,
      scopeClauseRefs,
      isoStandard: dto.isoStandard ? String(dto.isoStandard).trim() : null,
    });
    await this.auditRepo.save(audit);
    await this.logChange(audit.id, userId, 'AUDIT_CREATED', { title, type, scheduledAt: start, scheduledEndAt: end });

    const isoDocumentId = dto.isoDocumentId ? String(dto.isoDocumentId).trim() : undefined;
    const checklistRows = await this.buildChecklistRowsForAudit(
      companyId,
      isoDocumentId,
      audit.isoStandard ?? undefined,
      scopeClauseRefs,
    );
    if (checklistRows.length) {
      const isoStd = audit.isoStandard ?? undefined;
      await this.checklistRepo.save(
        checklistRows.map((q) => {
          const hl = q.hierarchyLevel;
          const isLeaf = hl == null || hl === 3;
          const evidenceChecks = isLeaf
            ? mergeEvidenceChecksWithDefaults(null, q.question, q.isoClause, isoStd)
            : null;
          return this.checklistRepo.create({
            auditId: audit.id,
            isoClause: q.isoClause,
            question: q.question,
            hierarchyLevel: q.hierarchyLevel,
            evidenceChecks: evidenceChecks as any,
          });
        }),
      );
      await this.logChange(audit.id, userId, 'CHECKLIST_GENERATED', { count: checklistRows.length });
    }

    return this.getOne(audit.id, companyId);
  }

  /** AUD-009 (V2): AI-style suggestions: editable draft; caller replaces checklist via applySuggestedChecklist. */
  async suggestChecklist(isoStandard: string, scopeClauseRefs?: string[]) {
    const rows = this.buildChecklistRows(isoStandard, scopeClauseRefs);
    return {
      suggestions: rows.map((r) => ({
        isoClause: r.isoClause,
        question: r.question,
        hierarchyLevel: r.hierarchyLevel,
      })),
    };
  }

  async applySuggestedChecklist(
    auditId: string,
    companyId: string,
    userId: string,
    items: { isoClause: string; question: string; hierarchyLevel?: number | null }[],
  ) {
    const audit = await this.getOne(auditId, companyId);
    if (audit.status !== AuditStatus.PLANNED) throw new BadRequestException('Checklist can only be replaced while audit is PLANNED');
    if (!items?.length) throw new BadRequestException('At least one checklist item is required');
    await this.checklistRepo.delete({ auditId: audit.id });
    const isoStd = audit.isoStandard ?? undefined;
    await this.checklistRepo.save(
      items.map((q) => {
        const h = q.hierarchyLevel;
        const level = h === undefined || h === null || String(h) === '' ? null : Math.min(3, Math.max(1, Number(h)));
        const isoClause = String(q.isoClause).trim();
        const question = String(q.question).trim();
        const isLeaf = level == null || level === 3;
        const evidenceChecks = isLeaf
          ? mergeEvidenceChecksWithDefaults(null, question, isoClause, isoStd)
          : null;
        return this.checklistRepo.create({
          auditId: audit.id,
          isoClause,
          question,
          hierarchyLevel: level === null || Number.isNaN(level) ? null : level,
          evidenceChecks: evidenceChecks as any,
        });
      }),
    );
    await this.logChange(audit.id, userId, 'CHECKLIST_REPLACED', { count: items.length });
    return this.getOne(auditId, companyId);
  }

  async list(companyId: string, status?: AuditStatus) {
    const qb = this.auditRepo
      .createQueryBuilder('a')
      .where('a.companyId = :companyId', { companyId })
      .orderBy('a.scheduledAt', 'DESC')
      .loadRelationCountAndMap('a.checklistCount', 'a.checklists')
      .loadRelationCountAndMap('a.findingCount', 'a.findings');
    if (status) qb.andWhere('a.status = :status', { status });
    const rows = await qb.getMany();
    return (rows as any[]).map((r) => {
      const { checklistCount, findingCount, ...rest } = r;
      return { ...rest, _count: { checklists: checklistCount ?? 0, findings: findingCount ?? 0 } };
    });
  }

  async getOne(id: string, companyId: string) {
    const a = await this.auditRepo.findOne({
      where: { id, companyId },
      relations: ['findings', 'checklists'],
    });
    if (!a) throw new NotFoundException('Audit not found');
    if (a.checklists?.length) {
      a.checklists = sortAuditChecklists(a.checklists);
    }
    return a;
  }

  async getChangeLog(id: string, companyId: string) {
    await this.getOne(id, companyId);
    return this.changeLogRepo.find({
      where: { auditId: id },
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }

  async update(
    id: string,
    companyId: string,
    userId: string,
    dto: { title?: string; leadAuditor?: string; scope?: string },
  ) {
    const audit = await this.getOne(id, companyId);
    if (audit.status === AuditStatus.CANCELLED || audit.status === AuditStatus.COMPLETED) {
      throw new BadRequestException('Cannot edit a completed or cancelled audit');
    }

    const changes: Record<string, unknown> = {};

    if (dto.title !== undefined) {
      const title = String(dto.title).trim();
      if (!title) throw new BadRequestException('Audit name (title) is required');
      if (title !== audit.title) {
        changes.title = { from: audit.title, to: title };
        audit.title = title;
      }
    }

    if (dto.leadAuditor !== undefined) {
      const leadAuditor = String(dto.leadAuditor).trim();
      if (!leadAuditor) throw new BadRequestException('Lead auditor is required');
      if (leadAuditor !== audit.leadAuditor) {
        changes.leadAuditor = { from: audit.leadAuditor, to: leadAuditor };
        audit.leadAuditor = leadAuditor;
      }
    }

    if (dto.scope !== undefined) {
      const scope = String(dto.scope).trim();
      if (!scope) throw new BadRequestException('Scope is required');
      if (scope !== audit.scope) {
        changes.scope = { from: audit.scope, to: scope };
        audit.scope = scope;
      }
    }

    if (Object.keys(changes).length === 0) {
      return audit;
    }

    await this.auditRepo.save(audit);
    await this.logChange(id, userId, 'AUDIT_UPDATED', changes);
    return this.getOne(id, companyId);
  }

  /** Permanently removes a cancelled audit and related findings, checklists, and change logs (DB CASCADE). */
  async remove(id: string, companyId: string) {
    const audit = await this.getOne(id, companyId);
    if (audit.status !== AuditStatus.CANCELLED) {
      throw new BadRequestException('Only cancelled audits can be deleted. Cancel the audit first.');
    }
    await this.ncService.clearNcAuditChecklistLinks((audit.checklists || []).map((c) => c.id));
    await this.auditRepo.delete({ id, companyId });
    return { message: 'Audit deleted' };
  }

  /** Marks a planned or in-progress audit as cancelled (retained for history; delete from Cancelled tab). */
  async cancel(id: string, companyId: string, userId: string) {
    const audit = await this.getOne(id, companyId);
    if (audit.status !== AuditStatus.PLANNED && audit.status !== AuditStatus.IN_PROGRESS) {
      throw new BadRequestException('Only planned or in-progress audits can be cancelled');
    }
    await this.auditRepo.update(id, { status: AuditStatus.CANCELLED });
    await this.logChange(id, userId, 'AUDIT_CANCELLED', {});
    return { message: 'Audit cancelled' };
  }

  async start(id: string, companyId: string, userId: string) {
    const audit = await this.getOne(id, companyId);
    if (audit.status !== AuditStatus.PLANNED) {
      throw new BadRequestException('Only planned audits can be started');
    }
    await this.auditRepo.update(id, { status: AuditStatus.IN_PROGRESS, startedAt: new Date() });
    await this.logChange(id, userId, 'AUDIT_STARTED', {});
    return { message: 'Audit started' };
  }

  async addFinding(id: string, companyId: string, userId: string, dto: any) {
    await this.getOne(id, companyId);
    const f = await this.findingRepo.save(
      this.findingRepo.create({
        auditId: id,
        type: dto.type as FindingType,
        isoClause: dto.isoClause,
        description: dto.description,
        evidence: dto.evidence,
        recordedBy: dto.recordedBy || userId,
      }),
    );
    await this.logChange(id, userId, 'FINDING_ADDED', { findingId: f.id, type: dto.type });
    return f;
  }

  private sanitizeEvidenceChecks(raw: unknown): EvidenceCheckRow[] | null {
    if (raw === null) return null;
    if (!Array.isArray(raw)) throw new BadRequestException('evidenceChecks must be an array');
    const out: EvidenceCheckRow[] = [];
    for (const item of raw.slice(0, 48)) {
      if (!item || typeof item !== 'object') continue;
      const id = String((item as EvidenceCheckRow).id ?? '').trim();
      const label = String((item as EvidenceCheckRow).label ?? '').trim().slice(0, 500);
      if (!id || !label) continue;
      const checked = Boolean((item as EvidenceCheckRow).checked);
      const src = (item as EvidenceCheckRow).source;
      const source = src === 'default' || src === 'ai' || src === 'user' ? src : undefined;
      out.push({ id, label, checked, ...(source ? { source } : {}) });
    }
    return out.length ? out : null;
  }

  async updateChecklist(checklistId: string, companyId: string, userId: string, dto: {
    answer?: string;
    score?: number | null | string;
    notes?: string;
    attachmentDocumentId?: string | null;
    evidenceChecks?: EvidenceCheckRow[] | null;
  }) {
    const row = await this.checklistRepo.findOne({
      where: { id: checklistId },
      relations: ['audit'],
    });
    if (!row?.audit || row.audit.companyId !== companyId) throw new NotFoundException('Checklist item not found');

    const prev = {
      answer: row.answer, notes: row.notes, attachmentDocumentId: row.attachmentDocumentId, ncId: row.ncId, score: row.score,
    };
    const patch: {
      answer?: FindingType;
      notes?: string | null;
      attachmentDocumentId?: string | null;
      score?: number | null;
      evidenceChecks?: EvidenceCheckRow[] | null;
    } = {};
    if (dto.notes !== undefined) patch.notes = dto.notes ?? null;
    if (dto.evidenceChecks !== undefined) patch.evidenceChecks = this.sanitizeEvidenceChecks(dto.evidenceChecks);
    if (dto.attachmentDocumentId !== undefined) patch.attachmentDocumentId = dto.attachmentDocumentId || null;
    if (dto.score !== undefined) {
      if (dto.score === null || dto.score === '' || (typeof dto.score === 'string' && dto.score.trim() === '')) {
        patch.score = null;
      } else {
        const n = typeof dto.score === 'number' ? dto.score : Number(dto.score);
        if (Number.isNaN(n) || n < 0 || n > 100) throw new BadRequestException('Score (percentage) must be between 0 and 100');
        patch.score = Math.round(n);
      }
    }
    if (dto.answer !== undefined && dto.answer !== '') {
      const u = String(dto.answer).toUpperCase();
      if (!['CONFORMANT', 'NON_CONFORMANT', 'OBSERVATION', 'STRENGTH'].includes(u))
        throw new BadRequestException('Invalid answer status');
      patch.answer = u as FindingType;
    }
    await this.checklistRepo.update(checklistId, patch);
    const updated = await this.checklistRepo.findOne({ where: { id: checklistId }, relations: ['audit'] });
    if (!updated) throw new NotFoundException('Checklist item not found');

    if (patch.answer === FindingType.NON_CONFORMANT && !updated.ncId) {
      const nc = await this.ncService.create(companyId, userId, {
        title: `Audit finding: clause ${updated.isoClause}`,
        description: [updated.question, updated.notes].filter(Boolean).join('\n\n'),
        classification: NCClassification.MAJOR,
        isoClause: updated.isoClause,
        isoStandard: updated.audit.isoStandard || undefined,
        source: NCSource.AUDIT,
        auditChecklistId: updated.id,
      });
      await this.checklistRepo.update(checklistId, { ncId: nc.id });
      await this.logChange(updated.auditId, userId, 'NC_CREATED_FROM_CHECKLIST', { checklistId, ncId: nc.id });
    }

    await this.logChange(row.auditId, userId, 'CHECKLIST_UPDATED', {
      checklistId,
      before: prev,
      after: {
        answer: updated.answer,
        score: updated.score,
        notes: dto.notes !== undefined ? updated.notes : prev.notes,
      },
    });
    return { message: 'Updated' };
  }

  private static readonly AI_FILL_MAX_ROWS = 15;

  /** AUD: AI-suggested evaluation + 0–100 % for one checklist criterion (leaf rows, in-progress audits). */
  async suggestChecklistAiScore(checklistId: string, companyId: string): Promise<{
    score: number;
    answer: FindingType;
    rationale?: string;
    model?: string;
  }> {
    const row = await this.checklistRepo.findOne({
      where: { id: checklistId },
      relations: ['audit'],
    });
    if (!row?.audit || row.audit.companyId !== companyId) throw new NotFoundException('Checklist item not found');
    if (row.audit.status !== AuditStatus.IN_PROGRESS) {
      throw new BadRequestException('AI audit row is only available while the audit is in progress.');
    }
    const hl = row.hierarchyLevel;
    const isLeaf = hl == null || hl === 3;
    if (!isLeaf) throw new BadRequestException('AI audit row is only available on criteria (leaf) rows.');

    const evidenceChecks = mergeEvidenceChecksWithDefaults(
      row.evidenceChecks as AuditEvidenceCheckRow[] | null,
      row.question,
      row.isoClause,
      row.audit.isoStandard,
    );
    const evidenceChecklistText = formatEvidenceChecklistForAi(evidenceChecks);

    const fallback = this.heuristicChecklistAiRow(row, evidenceChecks);
    const base = this.ragUrl;
    if (!base) {
      return fallback;
    }
    try {
      const res = await axios.post<{
        score: number;
        answer?: string;
        rationale?: string;
        model?: string;
      }>(
        `${base}/api/audit/checklist-score`,
        {
          question: row.question,
          answer: row.answer ? String(row.answer) : '',
          notes: row.notes ?? '',
          iso_clause: row.isoClause,
          iso_standard: row.audit.isoStandard ?? '',
          evidence_checklist_text: evidenceChecklistText,
        },
        { timeout: 45_000 },
      );
      const n = Math.round(Number(res.data?.score));
      if (Number.isNaN(n)) throw new Error('invalid score');
      const score = Math.min(100, Math.max(0, n));
      const fromLlm = this.normalizeAiAnswer(res.data?.answer);
      const answer = (fromLlm ?? row.answer ?? fallback.answer) as FindingType;
      return {
        score,
        answer,
        rationale: res.data?.rationale ?? fallback.rationale,
        model: res.data?.model ?? fallback.model,
      };
    } catch (e) {
      this.log.warn(`RAG checklist audit row failed, using heuristic: ${e}`);
      return fallback;
    }
  }

  /** AI-generated evidence checklist lines for one leaf criterion; replaces prior `source: ai` rows only. */
  async generateAiEvidenceChecklistItems(
    checklistId: string,
    companyId: string,
    userId: string,
  ): Promise<{
    items: EvidenceCheckRow[];
    added: number;
    message: string;
  }> {
    const row = await this.checklistRepo.findOne({
      where: { id: checklistId },
      relations: ['audit'],
    });
    if (!row?.audit || row.audit.companyId !== companyId) throw new NotFoundException('Checklist item not found');
    if (row.audit.status !== AuditStatus.IN_PROGRESS) {
      throw new BadRequestException('AI evidence lines are only available while the audit is in progress.');
    }
    const hl = row.hierarchyLevel;
    const isLeaf = hl == null || hl === 3;
    if (!isLeaf) throw new BadRequestException('AI evidence lines are only available on criteria (leaf) rows.');

    const stored = (Array.isArray(row.evidenceChecks) ? row.evidenceChecks : []) as EvidenceCheckRow[];
    const baseline = mergeEvidenceChecksWithDefaults(
      stored,
      row.question,
      row.isoClause,
      row.audit.isoStandard,
    );
    const kept = baseline;
    const existingLabels = [
      ...baseline.map((e) => String(e?.label ?? '').trim()),
      ...stored
        .filter((e) => e?.source === 'ai' || String(e?.id ?? '').startsWith('ai-'))
        .map((e) => String(e?.label ?? '').trim()),
    ].filter(Boolean);

    let lines: string[] = [];
    const base = this.ragUrl;
    if (base) {
      try {
        const res = await axios.post<{ items?: string[]; model?: string }>(
          `${base}/api/audit/clause-evidence-items`,
          {
            question: row.question,
            iso_clause: row.isoClause,
            iso_standard: row.audit.isoStandard ?? '',
            existing_labels: existingLabels.length ? existingLabels : undefined,
          },
          { timeout: 90_000 },
        );
        lines = Array.isArray(res.data?.items) ? res.data.items.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
      } catch (e) {
        this.log.warn(`RAG clause evidence items failed: ${e}`);
      }
    }
    if (!lines.length) {
      const q = (row.question || '').trim().slice(0, 200);
      lines = [
        `Is documented information available for clause ${row.isoClause}?`,
        q
          ? `Does your organization meet: ${q.replace(/\?$/, '')}?`
          : `Is this requirement applied in your product or process for clause ${row.isoClause}?`,
      ];
    }

    const labelSet = new Set(
      [...kept.map((e) => String(e?.label ?? '').trim().toLowerCase()).filter(Boolean), ...existingLabels.map((l) => l.toLowerCase())],
    );
    const newRows: EvidenceCheckRow[] = [];
    for (const label of lines) {
      const t = label.slice(0, 500);
      if (!t || labelSet.has(t.toLowerCase())) continue;
      labelSet.add(t.toLowerCase());
      newRows.push({
        id: `ai-${randomUUID()}`,
        label: t,
        checked: false,
        source: 'ai',
      });
      if (newRows.length >= 12) break;
    }

    const merged = [...kept, ...newRows].slice(0, 48);
    await this.checklistRepo.update(checklistId, { evidenceChecks: merged as any });
    await this.logChange(row.auditId, userId, 'CHECKLIST_AI_EVIDENCE', { checklistId, added: newRows.length });

    return {
      items: merged,
      added: newRows.length,
      message: newRows.length
        ? `Added ${newRows.length} AI checklist line(s).`
        : 'No new AI lines were added (duplicates or empty response).',
    };
  }

  /** Fill up to AI_FILL_MAX_ROWS leaf checklist rows that have no evaluation yet (IN_PROGRESS only). */
  async bulkAiFillEmptyChecklistCriteria(
    auditId: string,
    companyId: string,
    userId: string,
  ): Promise<{ filled: number; capped: boolean; message: string }> {
    const audit = await this.getOne(auditId, companyId);
    if (audit.status !== AuditStatus.IN_PROGRESS) {
      throw new BadRequestException('AI bulk fill is only available while the audit is in progress.');
    }
    const emptyLeaves = (audit.checklists || []).filter((c) => {
      const leaf = c.hierarchyLevel == null || c.hierarchyLevel === 3;
      return leaf && !c.answer;
    });
    const rows = emptyLeaves.slice(0, AuditService.AI_FILL_MAX_ROWS);
    if (!rows.length) {
      return {
        filled: 0,
        capped: false,
        message: 'No empty criteria rows. Every leaf row already has an evaluation.',
      };
    }
    for (const r of rows) {
      const sug = await this.suggestChecklistAiScore(r.id, companyId);
      await this.updateChecklist(r.id, companyId, userId, {
        answer: String(sug.answer),
        score: sug.score,
      });
    }
    const capped = emptyLeaves.length > AuditService.AI_FILL_MAX_ROWS;
    return {
      filled: rows.length,
      capped,
      message: capped
        ? `Applied AI to ${rows.length} row(s). More than ${AuditService.AI_FILL_MAX_ROWS} empty rows remain. Run again to continue.`
        : `Applied AI evaluation and score to ${rows.length} criterion row(s).`,
    };
  }

  private normalizeAiAnswer(raw: unknown): FindingType | null {
    const s = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '_').replace(/-/g, '_');
    if (s === 'NONCONFORMANT') return FindingType.NON_CONFORMANT;
    const allowed: FindingType[] = [
      FindingType.CONFORMANT,
      FindingType.NON_CONFORMANT,
      FindingType.OBSERVATION,
      FindingType.STRENGTH,
    ];
    return (allowed as string[]).includes(s) ? (s as FindingType) : null;
  }

  private heuristicChecklistAiRow(
    row: AuditChecklist,
    evidenceChecks?: AuditEvidenceCheckRow[],
  ): {
    score: number;
    answer: FindingType;
    rationale: string;
    model: string;
  } {
    const checks = evidenceChecks ?? mergeEvidenceChecksWithDefaults(
      row.evidenceChecks as AuditEvidenceCheckRow[] | null,
      row.question,
      row.isoClause,
      row.audit?.isoStandard,
    );
    const ev = formatEvidenceChecklistForAi(checks).toLowerCase();
    const notes = (row.notes || '').toLowerCase();
    const hasNotes = Boolean((row.notes || '').trim());
    const baseNote = hasNotes ? ' Auditor notes were considered.' : '';

    const a = String(row.answer || '').toUpperCase();
    if (a === 'CONFORMANT') {
      return {
        answer: FindingType.CONFORMANT,
        score: 88,
        rationale: `Conformant: score in the high conformant band.${baseNote}`,
        model: 'heuristic',
      };
    }
    if (a === 'NON_CONFORMANT') {
      return {
        answer: FindingType.NON_CONFORMANT,
        score: 22,
        rationale: `Non-conformant: low band until corrective evidence is available.${baseNote}`,
        model: 'heuristic',
      };
    }
    if (a === 'OBSERVATION') {
      return {
        answer: FindingType.OBSERVATION,
        score: 62,
        rationale: `Observation: mid band until closed.${baseNote}`,
        model: 'heuristic',
      };
    }
    if (a === 'STRENGTH') {
      return {
        answer: FindingType.STRENGTH,
        score: 94,
        rationale: `Strong point: high band.${baseNote}`,
        model: 'heuristic',
      };
    }

    if (ev.includes('[x]') && ev.includes('gap')) {
      return {
        answer: FindingType.NON_CONFORMANT,
        score: 28,
        rationale: `Checklist marks a gap or deviation. Draft non-conformant.${baseNote}`,
        model: 'heuristic',
      };
    }
    if (notes && /non-?conform|not implemented|missing|major\s*nc/.test(notes)) {
      return {
        answer: FindingType.NON_CONFORMANT,
        score: 24,
        rationale: `Notes suggest a significant gap. Draft non-conformant; verify on site.${baseNote}`,
        model: 'heuristic',
      };
    }
    if (notes && /observation|could improve|minor|opportunity/.test(notes)) {
      return {
        answer: FindingType.OBSERVATION,
        score: 58,
        rationale: `Notes read as observation-level; refine after evidence review.${baseNote}`,
        model: 'heuristic',
      };
    }
    if (notes && /excellent|best practice|exemplary/.test(notes)) {
      return {
        answer: FindingType.STRENGTH,
        score: 95,
        rationale: `Notes support a strong-point rating (draft).${baseNote}`,
        model: 'heuristic',
      };
    }

    const posTicks = (ev.match(/\[x\]/g) || []).length;
    if (posTicks >= 3 && !ev.includes('gap')) {
      return {
        answer: FindingType.CONFORMANT,
        score: hasNotes ? 86 : 84,
        rationale: `Multiple checklist items verified without a gap. Draft conformant.${baseNote}`,
        model: 'heuristic',
      };
    }
    if (posTicks >= 1) {
      return {
        answer: FindingType.OBSERVATION,
        score: 62,
        rationale: `Partial checklist verification: observation until more evidence is recorded.${baseNote}`,
        model: 'heuristic',
      };
    }

    return {
      answer: FindingType.CONFORMANT,
      score: hasNotes ? 79 : 82,
      rationale:
        `Provisional conformant desk review from criterion and checklist; validate on site and adjust.${baseNote}`,
      model: 'heuristic',
    };
  }

  async complete(id: string, companyId: string, userId: string, conclusion: string) {
    const audit = await this.getOne(id, companyId);
    if (!conclusion?.trim()) throw new BadRequestException('Conclusion is required');

    const checklists = audit.checklists || [];
    const findings = audit.findings || [];
    const ncIds = [...new Set(checklists.map((c) => c.ncId).filter(Boolean))] as string[];

    const report = {
      generatedAt: new Date().toISOString(),
      summary: conclusion.trim(),
      scope: audit.scope,
      isoStandard: audit.isoStandard,
      scopeClauseRefs: audit.scopeClauseRefs,
      checklist: checklists.map((c) => ({
        isoClause: c.isoClause,
        question: c.question,
        answer: c.answer,
        score: c.score,
        hierarchyLevel: c.hierarchyLevel,
        notes: c.notes,
        ncId: c.ncId,
        attachmentDocumentId: c.attachmentDocumentId,
        evidenceChecks: c.evidenceChecks,
      })),
      findings: findings.map((f) => ({
        id: f.id,
        type: f.type,
        isoClause: f.isoClause,
        description: f.description,
        evidence: f.evidence,
        recordedBy: f.recordedBy,
      })),
      linkedNcIds: ncIds,
    };

    await this.auditRepo.update(id, {
      status: AuditStatus.COMPLETED,
      completedAt: new Date(),
      overallConclusion: conclusion.trim(),
      completedReport: report as any,
    });
    await this.logChange(id, userId, 'AUDIT_COMPLETED', { conclusion: conclusion.slice(0, 500) });
    return { message: 'Audit completed' };
  }

  async kpis(companyId: string) {
    const [total, byStatus, byType] = await Promise.all([
      this.auditRepo.count({ where: { companyId } }),
      this.auditRepo.createQueryBuilder('a').select('a.status').addSelect('COUNT(*)', 'count')
        .where('a.companyId = :c', { c: companyId }).groupBy('a.status').getRawMany(),
      this.auditRepo.createQueryBuilder('a').select('a.type').addSelect('COUNT(*)', 'count')
        .where('a.companyId = :c', { c: companyId }).groupBy('a.type').getRawMany(),
    ]);
    return { total, byStatus, byType };
  }

  private async loadLinkedNcMap(audit: Audit, companyId: string) {
    const ids = [...new Set((audit.checklists || []).map((c) => c.ncId).filter(Boolean))] as string[];
    const rows = await this.ncService.findByIdsForCompany(companyId, ids);
    return mapLinkedNcs(rows);
  }

  async export(id: string, companyId: string, format?: string): Promise<{ body: Buffer; contentType: string; filename: string }> {
    const audit = await this.getOne(id, companyId);
    const f = (format || 'xlsx').toLowerCase().replace('application/', '');
    const companyName = await fetchCompanyDisplayName(this.cfg, companyId);
    const ncById = await this.loadLinkedNcMap(audit, companyId);
    const slug = auditExportSlug(audit);

    if (f === 'pdf') {
      const body = await this.exportPdf(audit, companyName, ncById);
      return { body, contentType: 'application/pdf', filename: `${slug}.pdf` };
    }
    if (f === 'xlsx' || f === 'excel' || f === 'vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      const body = await this.exportExcel(audit, companyName, ncById);
      return {
        body,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `${slug}.xlsx`,
      };
    }
    throw new BadRequestException('Format must be xlsx or pdf');
  }

  private async exportExcel(
    audit: Audit,
    companyName: string,
    ncById: ReturnType<typeof mapLinkedNcs>,
  ): Promise<Buffer> {
    return exportAuditToExcel(audit, companyName, ncById);
  }

  private async exportPdf(
    audit: Audit,
    companyName: string,
    ncById: ReturnType<typeof mapLinkedNcs>,
  ): Promise<Buffer> {
    const w = await createBrandedPdfWriter({
      companyName,
      reportTitle: audit.title || 'Audit report',
    });
    const line = (text: string, size = 10, isBold = false, gap = 3) => {
      brandedDrawBlock(w, text, size, isBold, gap);
    };
    const bar = (label: string) => brandedSectionBar(w, label);
    const gap = (n: number) => { w.y -= n; };

    bar('Audit information');
    line(`Company: ${companyName}`, 10, false);
    line(`Title: ${audit.title || '-'}`, 10, false);
    line(`Type: ${audit.type} · Status: ${audit.status}`, 10, false);
    line(`ISO standard: ${audit.isoStandard || '-'}`, 10, false);
    line(`Lead auditor: ${audit.leadAuditor || '-'}`, 10, false);
    if (audit.scheduledAt) {
      line(`Scheduled start: ${new Date(audit.scheduledAt).toLocaleDateString('en-GB')}`, 10, false);
    }
    if (audit.scheduledEndAt) {
      line(`Scheduled end: ${new Date(audit.scheduledEndAt).toLocaleDateString('en-GB')}`, 10, false);
    }
    if (audit.startedAt) {
      line(`Started: ${new Date(audit.startedAt).toLocaleString('en-GB')}`, 10, false);
    }
    if (audit.completedAt) {
      line(`Completed: ${new Date(audit.completedAt).toLocaleString('en-GB')}`, 10, false);
    }
    line(`Scope: ${audit.scope || '-'}`, 10, false);
    const refs = Array.isArray(audit.scopeClauseRefs) ? audit.scopeClauseRefs.join(', ') : '';
    if (refs) line(`Scope clauses: ${refs}`, 10, false);
    gap(6);

    const stats = buildAuditSummaryStats(audit);
    bar('Audit summary');
    line(
      `Criteria evaluated: ${stats.evaluated}/${stats.totalCriteria} · Scored: ${stats.scored} · Checklist lines ticked: ${stats.checklistLinesChecked}/${stats.checklistLinesTotal} · Findings: ${stats.findingsCount} · NC links: ${stats.ncLinked}`,
      10,
      false,
    );
    gap(6);

    bar('Overall conclusion');
    line(stripHtmlForPdf((audit.overallConclusion || '-').slice(0, 8000)), 10, false);
    gap(8);

    bar('Checklist results');
    const checklists = [...(audit.checklists || [])]
      .filter((c) => !c.hierarchyLevel || c.hierarchyLevel === 3)
      .sort((a, b) => a.isoClause.localeCompare(b.isoClause, undefined, { numeric: true }))
      .slice(0, 200);
    if (!checklists.length) {
      line('No checklist items recorded.', 10, false);
    } else {
      checklists.forEach((c) => {
        const scorePart = c.score != null ? ` · Score ${c.score}%` : '';
        const ans = formatFindingAnswer(c.answer);
        line(`Clause ${c.isoClause}: ${ans}${scorePart}`, 10, true, 3);
        line(c.question || '-', 10, false, 2);
        const checks = (Array.isArray(c.evidenceChecks) ? c.evidenceChecks : []) as EvidenceCheckRow[];
        if (checks.length) {
          line('Checklist (yes/no lines):', 9, true, 2);
          checks.forEach((ch) => {
            const tick = ch.checked ? '[x]' : '[ ]';
            line(`  ${tick} ${stripHtmlForPdf((ch.label || '').slice(0, 400))}`, 9, false, 1);
          });
        }
        if (c.notes) line(`Auditor notes: ${stripHtmlForPdf(c.notes.slice(0, 800))}`, 9, false, 2);
        if (c.ncId) {
          const nc = ncById.get(c.ncId);
          line(
            nc
              ? `Linked NC: ${nc.title} (${nc.status}), ${c.ncId}`
              : `Linked NC: ${c.ncId}`,
            9,
            false,
            2,
          );
        }
        gap(4);
      });
    }
    gap(6);

    bar('Findings');
    const findings = audit.findings || [];
    if (!findings.length) {
      line('No findings recorded.', 10, false);
    } else {
      findings.forEach((f) => {
        const clause = f.isoClause ? ` · Clause ${f.isoClause}` : '';
        line(`${formatFindingAnswer(f.type)}${clause}`, 10, true, 3);
        line(stripHtmlForPdf((f.description || '-').slice(0, 2000)), 10, false, 2);
        if (f.evidence) line(`Evidence: ${stripHtmlForPdf(f.evidence.slice(0, 1200))}`, 9, false, 2);
        gap(4);
      });
    }
    gap(6);

    bar('Linked non-conformities');
    if (!ncById.size) {
      line('No NC records linked from checklist items.', 10, false);
    } else {
      [...ncById.values()].forEach((nc) => {
        line(`${nc.title}: ${nc.status} (${nc.classification})`, 10, true, 2);
        line(`ID: ${nc.id}${nc.isoClause ? ` · Clause ${nc.isoClause}` : ''}`, 9, false, 2);
        gap(3);
      });
    }

    return finalizeBrandedPdf(w);
  }
}
