import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull, In, QueryDeepPartialEntity } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  NonConformity, NCStatus, NCSource, NCClassification,
} from '../database/entities/non-conformity.entity';
import { CapaAction, CAPAType, CapaActionStatus } from '../database/entities/non-conformity.entity';
import { resolveInternalServiceToken } from '../common/internal-service-token';
import { CompanyActivityService } from '../company-activity/company-activity.service';
import {
  ExtractedSection,
  findClauseSectionByRef,
} from '../audit/audit-checklist-from-document';

@Injectable()
export class NCService {
  private readonly logger = new Logger(NCService.name);

  constructor(
    @InjectRepository(NonConformity) private ncRepo: Repository<NonConformity>,
    @InjectRepository(CapaAction) private capaRepo: Repository<CapaAction>,
    private cfg: ConfigService,
    private activity: CompanyActivityService,
  ) {}

  private get notificationUrl() {
    return (this.cfg.get('NOTIFICATION_SERVICE_URL', 'http://notification-service:3004') || '').replace(/\/$/, '');
  }

  private get internalToken() {
    return resolveInternalServiceToken(this.cfg);
  }

  private get ragUrl() {
    return (this.cfg.get('RAG_SERVICE_URL', 'http://rag-service:8000') || '').replace(/\/$/, '');
  }

  private get documentServiceUrl() {
    return (this.cfg.get('DOCUMENT_SERVICE_URL', 'http://document-service:3003') || '').replace(/\/$/, '');
  }

  private get documentInternalToken() {
    return (this.cfg.get<string>('DOCUMENT_INTERNAL_TOKEN') || '').trim();
  }

  /** Clause number only (e.g. "4.1"): strips titles accidentally stored in isoClause. */
  private normalizeIsoClauseRef(raw: string): string {
    const s = (raw || '').trim();
    if (!s) return '';
    const leading = s.match(/^(\d+(?:\.\d+)*)\b/);
    if (leading) return leading[1];
    const beforeSep = s.split(/\s*[—–\-]\s*/)[0]?.trim();
    return beforeSep || s;
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
    } catch (e: any) {
      this.logger.warn(`fetchStructuredDocument failed: ${e.message}`);
      return null;
    }
  }

  private async resolveClauseSectionForNc(
    nc: NonConformity,
    companyId: string,
  ): Promise<ExtractedSection | null> {
    const clauseRef = this.normalizeIsoClauseRef(nc.isoClause || '');
    if (!clauseRef) return null;
    const docIds = Array.isArray(nc.evidenceDocumentIds) ? nc.evidenceDocumentIds : [];
    for (const docId of docIds) {
      const doc = await this.fetchStructuredDocument(companyId, String(docId));
      const section = findClauseSectionByRef(doc?.extractedStructured?.sections, clauseRef);
      if (section) return section;
    }
    return null;
  }

  private buildWhySuggestions(
    nc: NonConformity,
    section: ExtractedSection | null,
  ): {
    why1: string;
    why2: string;
    why3: string;
    why4: string;
    why5: string;
    rootCauseSuggestion: string;
  } {
    const title = (nc.title || '').replace(/\s+/g, ' ').trim() || 'this non-conformance';
    const desc = (nc.description || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    const clauseRef = this.normalizeIsoClauseRef(nc.isoClause || '');
    const std = (nc.isoStandard || 'the standard').trim();
    const summary = String(section?.summary ?? '').trim();
    const clauseLabel = clauseRef ? `clause ${clauseRef}` : 'the applicable requirement';
    const issueBit = desc ? ` In brief: ${desc}` : '';
    const reqBit = summary
      ? summary.length > 160
        ? `${summary.slice(0, 157)}…`
        : summary
      : '';

    return {
      why1: clauseRef
        ? `Why was "${title}" assessed as not meeting ${clauseLabel} of ${std}?${issueBit}`
        : `Why did we observe "${title}"?${issueBit}`,
      why2: reqBit
        ? `Why did controls not ensure this requirement for ${clauseLabel}: ${reqBit}`
        : `Why did our controls, training, or monitoring not prevent "${title}"?`,
      why3: clauseRef
        ? `Why was the gap in ${clauseLabel} not detected earlier in audits, checks, or records?`
        : 'Why was the gap not detected earlier in audits, checks, or records?',
      why4: clauseRef
        ? `Why did the process responsible for ${clauseLabel} allow this outcome (inputs, criteria, competence)?`
        : 'Why did the responsible process (inputs, responsibilities, criteria) allow this outcome?',
      why5: clauseRef
        ? `Why has a systemic fix for ${clauseLabel} of ${std} not already been implemented?`
        : 'Why has a systemic fix not already been put in place for this type of issue?',
      rootCauseSuggestion: clauseRef
        ? `Review ${clauseLabel} of ${std}${reqBit ? `, requirement: ${reqBit}` : ''} against the NC description; common patterns are unclear ownership, missing documented criteria, weak verification, or inadequate competence for the task behind "${title.slice(0, 80)}${title.length > 80 ? '…' : ''}".`
        : `Review ${clauseLabel} together with the NC description; a common pattern is unclear ownership, missing documented criteria, weak verification of outputs, or inadequate competence on the specific task behind "${title.slice(0, 80)}${title.length > 80 ? '…' : ''}".`,
    };
  }

  /** CAPA-008: anonymized lines for same-tenant NC history (no PII beyond titles/descriptions already in QM data). */
  private async buildTenantNcHistoryLines(companyId: string, excludeNcId: string): Promise<string[]> {
    const rows = await this.ncRepo.find({
      where: { companyId },
      order: { updatedAt: 'DESC' },
      take: 28,
    });
    return rows
      .filter((n) => n.id !== excludeNcId)
      .slice(0, 22)
      .map((n) => {
        const desc = (n.description || '').replace(/\s+/g, ' ').trim().slice(0, 220);
        const rc = (n.rootCause || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        const w = n.whyAnalysis && typeof n.whyAnalysis === 'object'
          ? String((n.whyAnalysis as { rootCause?: string }).rootCause ?? '').trim().slice(0, 120)
          : '';
        const causeHint = rc || w;
        return `${(n.title || 'NC').slice(0, 100)} | ${desc}${causeHint ? ` | prior analysis: ${causeHint}` : ''} | ${n.status} | ${n.classification}`;
      });
  }

  private hasSavedRca(nc: NonConformity): boolean {
    const w = nc.whyAnalysis;
    if (!w || typeof w !== 'object') return false;
    const keys = ['why1', 'why2', 'why3', 'why4', 'why5'] as const;
    return keys.some((k) => String((w as any)[k] ?? '').trim().length > 0);
  }

  private ncStatusAfterAddCapa(nc: NonConformity): NCStatus {
    // If RCA was done first, advance to CAPA_DEFINED so the plan can be reviewed before execution.
    if (nc.status === NCStatus.ROOT_CAUSE_ANALYSIS) return NCStatus.CAPA_DEFINED;
    // Keep accumulating more CAPA actions without regressing status.
    if (nc.status === NCStatus.CAPA_DEFINED) return NCStatus.CAPA_DEFINED;
    // CAPA added directly from OPEN (emergency / AI-evaluation shortcut), jump to IN_PROGRESS.
    return NCStatus.IN_PROGRESS;
  }

  private async notifyCapaAssigned(params: {
    companyId: string; assigneeUserId: string; assigneeEmail?: string | null;
    ncTitle: string; capaTitle: string; dueDate: Date; ncId: string; capaId: string;
  }) {
    const token = this.internalToken;
    const base = this.notificationUrl;
    if (!token || !base) return;
    try {
      await axios.post(
        `${base}/api/notifications/internal/capa-assigned`,
        {
          companyId: params.companyId,
          userId: params.assigneeUserId,
          userEmail: params.assigneeEmail?.trim() || null,
          ncId: params.ncId,
          capaId: params.capaId,
          ncTitle: params.ncTitle,
          capaTitle: params.capaTitle,
          dueDate: params.dueDate.toISOString(),
        },
        { headers: { 'X-Internal-Token': token }, timeout: 12_000 },
      );
    } catch (e: any) {
      this.logger.warn(`notifyCapaAssigned failed: ${e.message}`);
    }
  }

  private async notifyCapaDueSoon(params: {
    companyId: string; assigneeUserId: string; assigneeEmail?: string | null;
    ncTitle: string; capaTitle: string; dueDate: Date; ncId: string; capaId: string;
  }) {
    const token = this.internalToken;
    const base = this.notificationUrl;
    if (!token || !base) return;
    try {
      await axios.post(
        `${base}/api/notifications/internal/capa-due-soon`,
        {
          companyId: params.companyId,
          userId: params.assigneeUserId,
          userEmail: params.assigneeEmail?.trim() || null,
          ncId: params.ncId,
          capaId: params.capaId,
          ncTitle: params.ncTitle,
          capaTitle: params.capaTitle,
          dueDate: params.dueDate.toISOString(),
        },
        { headers: { 'X-Internal-Token': token }, timeout: 12_000 },
      );
    } catch (e: any) {
      this.logger.warn(`notifyCapaDueSoon failed: ${e.message}`);
    }
  }

  @Cron('5 * * * *')
  async scanCapaDueReminders(): Promise<void> {
    const token = this.internalToken;
    if (!token || !this.notificationUrl) return;

    const dueRows = await this.capaRepo
      .createQueryBuilder('c')
      .where('c.completed_at IS NULL')
      .andWhere('c.due_reminder_sent_at IS NULL')
      .andWhere('c.due_date > NOW()')
      .andWhere(`c.due_date - interval '48 hours' <= NOW()`)
      .getMany();

    for (const capa of dueRows) {
      const nc = await this.ncRepo.findOne({ where: { id: capa.nonConformityId } });
      if (!nc) continue;
      await this.notifyCapaDueSoon({
        companyId: capa.companyId,
        assigneeUserId: capa.assignedTo,
        assigneeEmail: null,
        ncTitle: nc.title,
        capaTitle: capa.title,
        dueDate: capa.dueDate,
        ncId: nc.id,
        capaId: capa.id,
      });
      await this.capaRepo.update(capa.id, { dueReminderSentAt: new Date() });
    }
  }

  async create(companyId: string, userId: string, dto: any) {
    const allowedSources = [NCSource.MANUAL, NCSource.AI_EVALUATION, NCSource.AUDIT];
    const src = allowedSources.includes(dto.source) ? dto.source : NCSource.MANUAL;
    const assignee =
      typeof dto.assignedTo === 'string' && /^[0-9a-f-]{36}$/i.test(dto.assignedTo.trim()) ? dto.assignedTo.trim() : null;
    const nc = this.ncRepo.create({
      companyId,
      detectedBy: userId,
      assignedTo: assignee,
      source: src as NCSource,
      title: dto.title,
      description: dto.description,
      classification: dto.classification,
      isoClause: dto.isoClause,
      isoStandard: dto.isoStandard,
      auditChecklistId: dto.auditChecklistId ?? null,
      evidenceDocumentIds: Array.isArray(dto.evidenceDocumentIds) ? dto.evidenceDocumentIds : null,
    });
    return this.ncRepo.save(nc);
  }

  /** Drop NC -> audit checklist links so deleting checklists or an audit does not hit FK errors. */
  async clearNcAuditChecklistLinks(checklistIds: string[]) {
    const ids = checklistIds.filter(Boolean);
    if (!ids.length) return;
    await this.ncRepo
      .createQueryBuilder()
      .update(NonConformity)
      .set({ auditChecklistId: null })
      .where('audit_checklist_id IN (:...ids)', { ids })
      .execute();
  }

  async list(companyId: string, filters: any) {
    const where: any = { companyId };
    if (filters?.status) where.status = filters.status;
    if (filters?.classification) where.classification = filters.classification;
    return this.ncRepo.find({
      where, relations: ['capaActions', 'evaluation'],
      order: { createdAt: 'DESC' },
    });
  }

  async getOne(id: string, companyId: string) {
    const nc = await this.ncRepo.findOne({
      where: { id, companyId }, relations: ['capaActions', 'evaluation'],
    });
    if (!nc) throw new NotFoundException('Non-conformity not found');
    return nc;
  }

  async findByIdsForCompany(companyId: string, ids: string[]): Promise<NonConformity[]> {
    const unique = [...new Set(ids.map((x) => String(x).trim()).filter(Boolean))];
    if (!unique.length) return [];
    return this.ncRepo.find({ where: { companyId, id: In(unique) } });
  }

  async update(id: string, companyId: string, userId: string, dto: any) {
    await this.getOne(id, companyId);
    /** RCA form sends flat why1…rootCause; if ?rca=1 is dropped by a proxy, route here instead of TypeORM columns. */
    if (dto != null && typeof dto === 'object') {
      const rcaKeys = new Set(['why1', 'why2', 'why3', 'why4', 'why5', 'rootCause']);
      const keys = Object.keys(dto).filter((k) => dto[k] !== undefined);
      if (keys.length > 0 && keys.every((k) => rcaKeys.has(k))) {
        return this.saveRca(id, companyId, userId, dto);
      }
    }
    const safe: any = {};
    for (const k of [
      'title', 'description', 'classification', 'isoClause', 'isoStandard', 'whyAnalysis', 'rootCause',
      'evidenceDocumentIds', 'assignedTo',
    ]) {
      if (dto[k] !== undefined) safe[k] = dto[k];
    }
    if (Object.keys(safe).length) await this.ncRepo.update(id, safe);
    return this.getOne(id, companyId);
  }

  async saveRca(
    id: string,
    companyId: string,
    userId: string | undefined,
    dto: { why1?: string; why2?: string; why3?: string; why4?: string; why5?: string; rootCause?: string },
  ) {
    const nc = await this.getOne(id, companyId);
    if (![NCStatus.OPEN, NCStatus.ROOT_CAUSE_ANALYSIS].includes(nc.status)) {
      throw new BadRequestException('5 Whys can only be saved while the NC is Open or in Root Cause Analysis.');
    }
    const keys = ['why1', 'why2', 'why3', 'why4', 'why5', 'rootCause'] as const;
    const whyAnalysis: Record<string, string> = {};
    for (const k of keys) {
      if (dto != null && dto[k] !== undefined) whyAnalysis[k] = String(dto[k] ?? '');
    }
    const patch: QueryDeepPartialEntity<NonConformity> = {
      whyAnalysis: whyAnalysis as NonConformity['whyAnalysis'],
    };
    const wasOpen = nc.status === NCStatus.OPEN;
    if (wasOpen) patch.status = NCStatus.ROOT_CAUSE_ANALYSIS;
    await this.ncRepo.update(id, patch);
    if (userId && wasOpen) {
      await this.activity.log(
        companyId,
        userId,
        'info',
        `NC · Root cause analysis in progress: ${nc.title || 'NC'}`,
        { ncId: id },
      );
    }
    return this.getOne(id, companyId);
  }

  /** One-click transition: OPEN → ROOT_CAUSE_ANALYSIS without requiring body content. */
  async startRca(id: string, companyId: string, userId: string) {
    const nc = await this.getOne(id, companyId);
    if (nc.status !== NCStatus.OPEN) {
      throw new BadRequestException('NC must be in Open status to start Root Cause Analysis.');
    }
    await this.ncRepo.update(id, { status: NCStatus.ROOT_CAUSE_ANALYSIS });
    await this.activity.log(
      companyId,
      userId,
      'info',
      `NC · Root cause analysis started: ${nc.title || 'NC'}`,
      { ncId: id },
    );
    return this.getOne(id, companyId);
  }

  async startCapaExecution(id: string, companyId: string, userId: string) {
    const nc = await this.getOne(id, companyId);
    if (nc.status !== NCStatus.CAPA_DEFINED) {
      throw new BadRequestException('Start execution is only available when the NC is in CAPA Defined (after RCA and planning).');
    }
    if (!(nc.capaActions?.length)) {
      throw new BadRequestException('Add at least one CAPA action before starting execution.');
    }
    await this.ncRepo.update(id, { status: NCStatus.IN_PROGRESS });
    await this.capaRepo.update(
      { nonConformityId: id, actionStatus: CapaActionStatus.PLANNED },
      { actionStatus: CapaActionStatus.IN_PROGRESS },
    );
    await this.activity.log(
      companyId,
      userId,
      'success',
      `NC · CAPA execution started: ${nc.title || 'NC'}`,
      { ncId: id },
    );
    return this.getOne(id, companyId);
  }

  async rejectNc(id: string, companyId: string, userId: string, dto: { reason?: string }) {
    const nc = await this.getOne(id, companyId);
    if ([NCStatus.CLOSED, NCStatus.REJECTED].includes(nc.status)) {
      throw new BadRequestException('NC is already terminal.');
    }
    await this.ncRepo.update(id, {
      status: NCStatus.REJECTED,
      rootCause: dto.reason?.trim() || nc.rootCause,
    });
    await this.activity.log(
      companyId,
      userId,
      'error',
      `NC · Rejected: ${nc.title || 'NC'}`,
      { ncId: id },
    );
    return { message: 'NC marked as rejected' };
  }

  async whyAnalysis(id: string, companyId: string) {
    const nc = await this.getOne(id, companyId);
    const section = await this.resolveClauseSectionForNc(nc, companyId);
    return {
      ncId: id,
      suggestions: this.buildWhySuggestions(nc, section),
    };
  }

  async addCapa(ncId: string, companyId: string, actorUserId: string, dto: any) {
    const nc = await this.getOne(ncId, companyId);
    if ([NCStatus.CLOSED, NCStatus.REJECTED, NCStatus.PENDING_VERIFICATION].includes(nc.status)) {
      throw new BadRequestException('Cannot add CAPA actions in the current NC state.');
    }
    const existing = nc.capaActions?.length ?? 0;
    if (
      nc.source === NCSource.MANUAL
      && nc.status === NCStatus.OPEN
      && !this.hasSavedRca(nc)
      && existing === 0
    ) {
      throw new BadRequestException(
        'For manually created NCs, save the 5 Whys (Root Cause Analysis) before adding CAPA actions.',
      );
    }

    const capa = this.capaRepo.create({
      companyId,
      nonConformityId: ncId,
      type: dto.type as CAPAType,
      title: dto.title,
      description: dto.description,
      assignedTo: dto.assignedTo,
      dueDate: new Date(dto.dueDate),
      notes: dto.notes,
      actionStatus: CapaActionStatus.PLANNED,
      evidenceDocumentIds: Array.isArray(dto.evidenceDocumentIds) ? dto.evidenceDocumentIds : null,
      createdByUserId: actorUserId,
    });
    const saved = await this.capaRepo.save(capa);
    const next = this.ncStatusAfterAddCapa(nc);
    await this.ncRepo.update(ncId, { status: next });

    await this.notifyCapaAssigned({
      companyId,
      assigneeUserId: saved.assignedTo,
      assigneeEmail: typeof dto.assigneeEmail === 'string' ? dto.assigneeEmail : null,
      ncTitle: nc.title,
      capaTitle: saved.title,
      dueDate: saved.dueDate,
      ncId,
      capaId: saved.id,
    });

    return saved;
  }

  async patchCapa(
    capaId: string,
    companyId: string,
    actorUserId: string,
    dto: { actionStatus?: string; evidenceDocumentIds?: string[] | null },
  ) {
    const capa = await this.capaRepo.findOne({ where: { id: capaId, companyId } });
    if (!capa) throw new NotFoundException('CAPA not found');
    if (capa.completedAt) throw new BadRequestException('Cannot edit a completed CAPA.');
    const prevStatus = capa.actionStatus;
    const patch: QueryDeepPartialEntity<CapaAction> = {};
    if (dto.actionStatus && (Object.values(CapaActionStatus) as string[]).includes(dto.actionStatus)) {
      patch.actionStatus = dto.actionStatus as CapaActionStatus;
    }
    if (dto.evidenceDocumentIds !== undefined) {
      patch.evidenceDocumentIds = dto.evidenceDocumentIds;
    }
    if (Object.keys(patch).length) await this.capaRepo.update(capaId, patch);
    const updated = await this.capaRepo.findOne({ where: { id: capaId, companyId }, relations: ['nonConformity'] });
    if (!updated) throw new NotFoundException('CAPA not found');
    if (dto.actionStatus && dto.actionStatus !== prevStatus) {
      const ncTitle = (updated.nonConformity?.title || 'NC').trim();
      await this.activity.log(
        companyId,
        actorUserId,
        'info',
        `CAPA · Status updated: ${updated.title} (NC: ${ncTitle}) → ${dto.actionStatus}`,
        { capaId, ncId: updated.nonConformityId },
      );
    }
    return updated;
  }

  async completeCapa(capaId: string, companyId: string, actorUserId: string) {
    const capa = await this.capaRepo.findOne({ where: { id: capaId, companyId } });
    if (!capa) throw new NotFoundException('CAPA not found');
    await this.capaRepo.update(capaId, {
      completedAt: new Date(),
      actionStatus: CapaActionStatus.DONE,
      completedByUserId: actorUserId,
    });
    const pending = await this.capaRepo.count({
      where: { nonConformityId: capa.nonConformityId, completedAt: IsNull() },
    });
    if (pending === 0) {
      await this.ncRepo.update(capa.nonConformityId, { status: NCStatus.PENDING_VERIFICATION });
    }
    return { message: 'CAPA marked complete' };
  }

  async verify(
    ncId: string,
    companyId: string,
    dto: { verifiedBy: string; isEffective: boolean; notes?: string; rejectNc?: boolean },
  ) {
    const nc = await this.getOne(ncId, companyId);
    if (dto.isEffective) {
      await this.ncRepo.update(ncId, { status: NCStatus.CLOSED });
      await this.capaRepo.update(
        { nonConformityId: ncId },
        { isEffective: true, verifiedBy: dto.verifiedBy, verifiedAt: new Date() },
      );
      await this.activity.log(
        companyId,
        dto.verifiedBy,
        'success',
        `NC · Verified effective & closed: ${nc.title || 'NC'}`,
        { ncId },
      );
      return { message: 'NC closed. CAPA verified effective' };
    }
    if (dto.rejectNc) {
      await this.ncRepo.update(ncId, { status: NCStatus.REJECTED });
      await this.activity.log(
        companyId,
        dto.verifiedBy,
        'error',
        `NC · Rejected at verification: ${nc.title || 'NC'}`,
        { ncId },
      );
      return { message: 'NC rejected after verification' };
    }
    await this.activity.log(
      companyId,
      dto.verifiedBy,
      'warning',
      `NC · Verification recorded (not effective): ${nc.title || 'NC'}`,
      { ncId },
    );
    return { message: 'Verification failed. NC remains in verification' };
  }

  /**
   * CAPA-008: AI probable root causes from RAG, using this NC plus same-tenant NC history (evaluation-service aggregates; RAG does not query DB).
   */
  async aiRootCauses(id: string, companyId: string) {
    const nc = await this.getOne(id, companyId);
    const historyLines = await this.buildTenantNcHistoryLines(companyId, id);
    const url = `${this.ragUrl}/api/capa/root-cause-suggestions`;
    try {
      const res = await axios.post(
        url,
        {
          title: nc.title,
          description: nc.description,
          iso_clause: nc.isoClause ?? null,
          classification: nc.classification,
          history_lines: historyLines,
        },
        { timeout: 90_000 },
      );
      const raw = res.data?.probable_causes ?? res.data?.probableCauses ?? [];
      const probableCauses = (Array.isArray(raw) ? raw : []).map((c: any, i: number) => ({
        id: String(c?.id ?? `pc${i + 1}`),
        title: String(c?.title ?? '').slice(0, 200),
        rationale: String(c?.rationale ?? '').slice(0, 1200),
        confidence: typeof c?.confidence === 'number' ? c.confidence : parseFloat(c?.confidence) || 0.5,
      }));
      return {
        ncId: id,
        probableCauses,
        model: res.data?.model ?? null,
        historySampleSize: historyLines.length,
      };
    } catch (e: any) {
      this.logger.warn(`aiRootCauses: ${e.message}`);
      const w = await this.whyAnalysis(id, companyId);
      return {
        ncId: id,
        probableCauses: [
          {
            id: 'fallback-1',
            title: 'Heuristic suggestion (AI service unavailable)',
            rationale: w.suggestions.rootCauseSuggestion,
            confidence: 0.35,
          },
        ],
        model: 'template-fallback',
        historySampleSize: historyLines.length,
      };
    }
  }

  /** CAPA-009: AI-filled 6M Ishikawa branch text (same tenant history context). */
  async aiIshikawaBranches(id: string, companyId: string) {
    const nc = await this.getOne(id, companyId);
    const historyLines = await this.buildTenantNcHistoryLines(companyId, id);
    const url = `${this.ragUrl}/api/capa/ishikawa-suggestions`;
    try {
      const res = await axios.post(
        url,
        {
          title: nc.title,
          description: nc.description,
          iso_clause: nc.isoClause ?? null,
          history_lines: historyLines,
        },
        { timeout: 90_000 },
      );
      const d = res.data || {};
      return {
        ncId: id,
        branches: {
          man: String(d.man ?? ''),
          machine: String(d.machine ?? ''),
          material: String(d.material ?? ''),
          method: String(d.method ?? ''),
          measurement: String(d.measurement ?? ''),
          environment: String(d.environment ?? ''),
        },
        model: d.model ?? null,
        historySampleSize: historyLines.length,
      };
    } catch (e: any) {
      this.logger.warn(`aiIshikawaBranches: ${e.message}`);
      return {
        ncId: id,
        branches: {
          man: 'People / competence / communication (template: connect to your NC in the editor).',
          machine: 'Tools, equipment, or software limitations.',
          material: 'Inputs, specifications, or data quality issues.',
          method: 'Procedure clarity vs actual practice.',
          measurement: 'Inspection, metrics, or calibration gaps.',
          environment: 'Organizational or external context constraints.',
        },
        model: 'template-fallback',
        historySampleSize: historyLines.length,
      };
    }
  }

  async kpis(companyId: string) {
    const [total, byStatus, byClassification, overdueCAPAs] = await Promise.all([
      this.ncRepo.count({ where: { companyId } }),
      this.ncRepo.createQueryBuilder('nc').select('nc.status').addSelect('COUNT(*)', 'count')
        .where('nc.companyId = :c', { c: companyId }).groupBy('nc.status').getRawMany(),
      this.ncRepo.createQueryBuilder('nc').select('nc.classification').addSelect('COUNT(*)', 'count')
        .where('nc.companyId = :c', { c: companyId }).groupBy('nc.classification').getRawMany(),
      this.capaRepo.count({ where: { companyId, completedAt: IsNull(), dueDate: LessThan(new Date()) } }),
    ]);
    return { total, byStatus, byClassification, overdueCAPAs };
  }
}
