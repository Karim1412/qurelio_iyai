import {
  Injectable, NotFoundException, Logger, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import axios from 'axios';
import { Readable } from 'stream';
import * as ExcelJS from 'exceljs';
import { PDFFont } from 'pdf-lib';
import {
  createBrandedPdfWriter,
  brandedDrawBlock,
  brandedSectionBar,
  finalizeBrandedPdf,
} from '../common/pdf-brand-layout';
import { Evaluation, EvaluationStatus } from '../database/entities/evaluation.entity';
import { NonConformity, NCClassification, NCSource } from '../database/entities/non-conformity.entity';
import { CompanyActivityService } from '../company-activity/company-activity.service';
import { findEvaluationResultIndex, scoreIsPublishable } from './evaluation-policy';

type ClauseRow = {
  resultId?: string;
  requirementId?: string;
  clauseReference: string;
  clauseTitle: string;
  clauseSummary: string;
  clauseTextExcerpt: string;
  /** Condition gating the requirement ("IF: the machine is mobile"); empty when unconditional. */
  applicableIf?: string;
  /** Other clauses whose conditions gate this requirement. */
  conditionalClauses?: string;
  /** Cross-references cited by the requirement ("7.2.10", "IEC 60364-5-52:2009, 524"). */
  references?: string;
  /** Auditor-facing outcome: PASS | FAIL | N/A | MISSING_INFO (| INCONCLUSIVE on engine error). */
  status?: string;
  /** Status-prefixed rationale citing source document and page. */
  justification?: string;
  verdict: string;
  confidence: number;
  supportingEvidence: { documentId: string; excerpt: string; similarityScore: number; sourceLabel?: string }[];
  gaps: string[];
  suggestions: string[];
  legacyScore?: number;
  legacyStatus?: string;
  override?: { verdict: string; userId: string; reason: string; at: string };
  reasoning?: string;
  requirementElements?: { element: string; evidence_refs: number[]; status: string; notes: string }[];
  evidenceAssessment?: { chunk_id: number; relevance: string; supports: boolean; covers_elements: string[] }[];
  decisionSource?: string;
  evidenceCoverage?: string;
  applicability?: Record<string, unknown>;
  inconclusiveReason?: string;
  productStandardComparison?: Record<string, unknown>;
  displayStatus?: string;
  statusExplanation?: string;
  recommendedAction?: string;
  missingInformation?: string[];
};

type ClauseLookupEntry = { title: string; summary: string };
type EvaluationActor = { id: string; role: string; department?: string };
type AssessmentInputManifest = {
  ok: boolean;
  productId: string | null;
  standard: Record<string, unknown>;
  evidence: Array<{ id: string; name: string; version: number; approvalStatus: string | null; extractionHash: string; updatedAt: string | null }>;
  productSnapshotHash: string;
  warnings: string[];
};

/** Frozen at evaluation create for Qleer-style reports (standard / product / company). */
type ReportPack = {
  standard: { reference: string; title: string; version: string; effectiveDate: string };
  product: {
    name: string;
    reference: string;
    revision: string;
    category: string;
    subCategory: string;
    tradeMark: string;
    created: string;
    environment: string;
    users: string;
    tempHumidity: string;
    ipRating: string;
    description: string;
  };
  company: { companyName: string; address: string; email: string; phone: string };
  initiator: { firstName: string; lastName: string; email: string };
};

type EvaluationExportBundle = {
  ev: Evaluation;
  lookup: Map<string, ClauseLookupEntry>;
  docFileName: string;
  standardTitleMeta: string;
  isoFromDoc: string;
  filenameBase: string;
  reportRef: string;
  reportPack: ReportPack;
};

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    @InjectRepository(Evaluation) private evalRepo: Repository<Evaluation>,
    @InjectRepository(NonConformity) private ncRepo: Repository<NonConformity>,
    private cfg: ConfigService,
    @InjectQueue('evaluation') private evalQueue: Queue,
    private companyActivity: CompanyActivityService,
  ) {}

  private get ragUrl() {
    return (this.cfg.get('RAG_SERVICE_URL', 'http://rag-service:8000') || '').replace(/\/$/, '');
  }

  private get notificationUrl() {
    return (this.cfg.get('NOTIFICATION_SERVICE_URL', 'http://notification-service:3004') || '').replace(/\/$/, '');
  }

  /** Token for notification-service internal routes (accepts NOTIFICATION or DOCUMENT on that service). */
  private get internalToken() {
    return (this.cfg.get('NOTIFICATION_INTERNAL_TOKEN') || this.cfg.get('DOCUMENT_INTERNAL_TOKEN') || '').trim();
  }

  /** document-service internal routes validate DOCUMENT_INTERNAL_TOKEN only (not NOTIFICATION_INTERNAL_TOKEN). */
  private get documentInternalToken() {
    return (this.cfg.get<string>('DOCUMENT_INTERNAL_TOKEN') || '').trim();
  }

  private get documentServiceUrl() {
    return (this.cfg.get('DOCUMENT_SERVICE_URL', 'http://document-service:3003') || '').replace(/\/$/, '');
  }

  private get authServiceUrl() {
    return (this.cfg.get('AUTH_SERVICE_URL', 'http://auth-service:3002') || '').replace(/\/$/, '');
  }

  /** One segment of export basename: spaces → `_`, illegal path chars → `-`, capped length. */
  private slugExportSegment(raw: string, maxLen: number): string {
    let s = (raw || '').trim();
    if (!s) return '';
    s = s.replace(/[/\\?%*|"<>]/g, '-').replace(/:/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/-+/g, '-');
    s = s.replace(/^_+|_+$/g, '').replace(/^-+|-+$/g, '');
    if (!s) return '';
    return s.slice(0, maxLen).replace(/[_-]+$/, '');
  }

  private normClauseLookupKey(clauseRef: string): string {
    return (clauseRef || '')
      .trim()
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  private looksLikeUuid(s: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((s || '').trim());
  }

  /**
   * Human-facing product label: never a UUID (snapshots sometimes misused `product` for id).
   */
  private resolveHumanProductName(
    snap: Record<string, unknown>,
    meta: Record<string, unknown>,
    reportPack?: ReportPack | null,
    folderName?: string,
    docName?: string,
  ): string {
    const cands = [
      snap.productName,
      meta.productName,
      reportPack?.product?.name,
      folderName,
      docName,
    ];
    for (const c of cands) {
      const s = typeof c === 'string' ? c.trim() : '';
      if (!s || s === '-' || this.looksLikeUuid(s)) continue;
      return s;
    }
    return 'Product';
  }

  /** Long standard label for reports (title / library name before short norm code). */
  private resolveStandardDisplayName(
    ev: Evaluation,
    snap: Record<string, unknown>,
    meta: Record<string, unknown>,
    enrich: { standardTitleMeta: string; docFileName: string; isoFromDoc: string },
    reportPack?: ReportPack | null,
  ): string {
    const fromPack = reportPack?.standard?.title && reportPack.standard.title !== '-'
      ? reportPack.standard.title
      : '';
    const chain = [
      fromPack,
      meta.standardTitle,
      meta.standardName,
      enrich.standardTitleMeta,
      enrich.docFileName,
      meta.standardReference,
      meta.isoStandard,
      ev.isoStandard,
      enrich.isoFromDoc,
    ];
    for (const c of chain) {
      const s = typeof c === 'string' ? c.trim() : '';
      if (s) return s;
    }
    return 'Standard';
  }

  /** PDF/Excel "Report reference": `Standard name · Product name · YYYY-MM-DD`. */
  private buildReportReference(
    ev: Evaluation,
    snap: Record<string, unknown>,
    meta: Record<string, unknown>,
    enrich: { standardTitleMeta: string; docFileName: string; isoFromDoc: string },
    reportPack: ReportPack,
  ): string {
    const std = this.resolveStandardDisplayName(ev, snap, meta, enrich, reportPack);
    const prod = this.resolveHumanProductName(snap, meta, reportPack, reportPack.product.name !== '-' ? reportPack.product.name : undefined, undefined);
    const dSrc = ev.completedAt ?? ev.createdAt;
    const ds = dSrc ? new Date(dSrc).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    return `${std} · ${prod} · ${ds}`;
  }

  /**
   * Download basename: `{standard}__{product}__{YYYY-MM-DD}__{8-hex}` (matches report ref + unique suffix).
   */
  private exportFilenameBase(
    ev: Evaluation,
    enrich: { standardTitleMeta: string; docFileName: string; isoFromDoc: string },
    reportPack: ReportPack,
  ): string {
    const snap = (ev.requestSnapshot ?? {}) as Record<string, unknown>;
    const meta = (snap.evaluationMetadata as Record<string, unknown> | undefined) ?? {};
    const std = this.resolveStandardDisplayName(ev, snap, meta, enrich, reportPack);
    const prod = this.resolveHumanProductName(
      snap,
      meta,
      reportPack,
      reportPack.product.name !== '-' ? reportPack.product.name : undefined,
      undefined,
    );
    const stdSlug = this.slugExportSegment(std, 88) || 'standard';
    const prodSlug = this.slugExportSegment(prod, 56) || 'product';
    const dSrc = ev.completedAt ?? ev.createdAt;
    const d = dSrc ? new Date(dSrc) : new Date();
    const ds = d.toISOString().slice(0, 10);
    const shortId = ev.id.replace(/-/g, '').slice(0, 8).toLowerCase();
    return [stdSlug, prodSlug, ds, shortId].join('__');
  }

  private truncateForExport(text: string, max: number): string {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max - 1)}…`;
  }

  /** Truncate without collapsing newlines (clause bodies, long norm text). */
  private clipExportText(text: string, max: number): string {
    const t = (text || '').trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max - 1)}…`;
  }

  private composeDetailedSummary(content: string, bullets: string[]): string {
    const c = (content || '').trim();
    const bs = (bullets || [])
      .filter((b): b is string => typeof b === 'string' && String(b).trim().length > 0)
      .map((b) => String(b).trim());
    const parts: string[] = [];
    if (c) parts.push(c);
    if (bs.length) parts.push(bs.map((b) => `• ${b}`).join('\n'));
    return parts.join('\n\n').trim();
  }

  private deriveClauseTitle(clauseNumber: string, heading: string): string {
    const h = (heading || '').trim();
    const cn = (clauseNumber || '').trim();
    if (cn && h) {
      try {
        const esc = cn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const stripped = h.replace(new RegExp(`^${esc}\\s*[-–—.:)]*\\s*`, 'i'), '').trim();
        if (stripped.length >= 2) return stripped;
      } catch {
        /* ignore bad regex */
      }
    }
    return h || cn || '-';
  }

  /** Map one ISO section row to one or more lookup keys (numeric clauses, Annex A, A.1, …). */
  private deriveClauseKeysFromIsoSection(clauseNumber: string, heading: string): string[] {
    const keys = new Set<string>();
    const addRaw = (raw: string) => {
      const t = (raw || '').trim();
      if (!t) return;
      keys.add(this.normClauseLookupKey(t));
    };
    const cn = (clauseNumber || '').trim();
    const h = (heading || '').trim();
    if (cn) addRaw(cn);
    const mNum = h.match(/^(\d+(?:\.\d+)*(?:\([a-z]\))?)\b/i);
    if (mNum) addRaw(mNum[1]);
    const mAx = h.match(/^Annex\s+([A-Z])\b/i);
    if (mAx) {
      addRaw(`Annex ${mAx[1]}`);
      addRaw(mAx[1]);
    }
    const mApp = h.match(/^Appendix\s+([A-Z])\b/i);
    if (mApp) {
      addRaw(`Appendix ${mApp[1]}`);
      addRaw(mApp[1]);
    }
    const mLetter = h.match(/^([A-Z]\.\d+(?:\.\d+)*)\b/);
    if (mLetter) addRaw(mLetter[1]);
    const mZ = h.match(/^([A-Z])\s+(\d+(?:\.\d+)*)\b/);
    if (mZ) addRaw(`${mZ[1]}.${mZ[2]}`);
    return [...keys];
  }

  private normClauseRefVariants(ref: string): string[] {
    const raw = (ref || '').trim();
    const keys = new Set<string>();
    const add = (s: string) => {
      const k = this.normClauseLookupKey(s);
      if (k) keys.add(k);
    };
    add(raw);
    add(raw.replace(/[–—−]/g, '-'));
    const deParen = raw.replace(/\([^)]*\)/g, '').trim();
    if (deParen && deParen !== raw) add(deParen);
    return [...keys];
  }

  private parentClauseKeys(ref: string): string[] {
    const base = this.normClauseLookupKey(ref.replace(/\([^)]*\)/g, ''));
    if (!base.includes('.')) return [];
    const segs = base.split('.');
    const out: string[] = [];
    for (let i = segs.length - 1; i >= 1; i--) {
      const p = segs.slice(0, i).join('.');
      if (p && p !== base) out.push(p);
    }
    return out;
  }

  private pickClauseEnhancement(lookup: Map<string, ClauseLookupEntry>, clauseRef: string): ClauseLookupEntry {
    const tryKeys = [...this.normClauseRefVariants(clauseRef), ...this.parentClauseKeys(clauseRef)];
    for (const k of tryKeys) {
      const hit = lookup.get(k);
      if (hit) return hit;
    }
    const k = this.normClauseLookupKey(clauseRef);
    const noAnnex = k.replace(/^annex/, '');
    if (noAnnex !== k) {
      const a = lookup.get(noAnnex);
      if (a) return a;
    }
    return { title: '', summary: '' };
  }

  private str(v: unknown): string {
    if (typeof v === 'string') return v.trim();
    if (v == null) return '';
    return String(v).trim();
  }

  private reportPackPlaceholder(s: string): boolean {
    const t = (s || '').trim();
    return !t || t === '-';
  }

  /** Prefer snapshot initiator; fall back to evaluation row (email / user id). */
  private formatPreparedBy(ev: Evaluation, reportPack: ReportPack): string {
    const fn = this.reportPackPlaceholder(reportPack.initiator.firstName) ? '' : reportPack.initiator.firstName.trim();
    const ln = this.reportPackPlaceholder(reportPack.initiator.lastName) ? '' : reportPack.initiator.lastName.trim();
    const em = this.reportPackPlaceholder(reportPack.initiator.email) ? '' : reportPack.initiator.email.trim();
    const name = `${fn} ${ln}`.replace(/\s+/g, ' ').trim();
    if (name && em) return `${name} (${em})`;
    if (name) return name;
    if (em) return em;
    const ie = (ev.initiatorEmail || '').trim();
    if (ie) return ie;
    const uid = (ev.initiatedBy || '').trim();
    if (uid) return `User ID: ${uid}`;
    return '-';
  }

  /** Product folder / file registration date from report pack (`created` ISO day or datetime). */
  private formatProductFileAddedDisplay(reportPack: ReportPack): string {
    const raw = this.str(reportPack.product.created);
    if (!raw || raw === '-') return '-';
    const d = new Date(raw.includes('T') ? raw : `${raw}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' });
  }

  private emptyReportPack(): ReportPack {
    const dash = '-';
    return {
      standard: { reference: dash, title: dash, version: dash, effectiveDate: dash },
      product: {
        name: dash,
        reference: dash,
        revision: dash,
        category: dash,
        subCategory: dash,
        tradeMark: dash,
        created: dash,
        environment: dash,
        users: dash,
        tempHumidity: dash,
        ipRating: dash,
        description: dash,
      },
      company: { companyName: dash, address: dash, email: dash, phone: dash },
      initiator: { firstName: dash, lastName: dash, email: dash },
    };
  }

  private async fetchStructuredDoc(
    companyId: string,
    documentId: string,
  ): Promise<Record<string, unknown> | null> {
    const base = this.documentServiceUrl;
    const token = this.documentInternalToken;
    if (!base || !documentId) return null;
    try {
      const r = await axios.get(
        `${base}/api/documents/internal/structured/${encodeURIComponent(documentId)}`,
        {
          params: { company_id: companyId },
          headers: token ? { 'X-Internal-Token': token } : {},
          timeout: 25000,
          validateStatus: () => true,
        },
      );
      if (r.status >= 400 || !r.data) return null;
      return r.data as Record<string, unknown>;
    } catch (e: any) {
      this.logger.warn(`structured doc fetch: ${e?.message ?? e}`);
      return null;
    }
  }

  private async fetchAuthCompanyDisplayName(companyId: string): Promise<string | null> {
    const base = this.authServiceUrl;
    const token = this.documentInternalToken;
    if (!base || !token || !this.str(companyId)) return null;
    try {
      const r = await axios.get(
        `${base}/api/internal/companies/${encodeURIComponent(companyId)}/display-name`,
        {
          headers: { 'X-Internal-Token': token },
          timeout: 12000,
          validateStatus: () => true,
        },
      );
      if (r.status !== 200 || typeof r.data?.name !== 'string') return null;
      const n = this.str(r.data.name);
      return n || null;
    } catch (e: any) {
      this.logger.warn(`auth company display-name: ${e?.message ?? e}`);
      return null;
    }
  }

  /** When snapshot company is empty, fill from evaluationMetadata or auth-service. */
  private async enrichReportPackCompany(
    companyId: string,
    reportPack: ReportPack,
    snap: Record<string, unknown>,
  ): Promise<ReportPack> {
    const cur = this.str(reportPack.company.companyName);
    if (cur && cur !== '-') return reportPack;
    const meta = (snap.evaluationMetadata as Record<string, unknown> | undefined) ?? {};
    const rc = (snap.reportContext as Record<string, unknown> | undefined) ?? {};
    const co = (rc.company as Record<string, unknown> | undefined) ?? {};
    const fromSnap = this.str(meta.companyName) || this.str(co.companyName);
    if (fromSnap && fromSnap !== '-') {
      return { ...reportPack, company: { ...reportPack.company, companyName: fromSnap } };
    }
    const fromAuth = await this.fetchAuthCompanyDisplayName(companyId);
    if (fromAuth) {
      return { ...reportPack, company: { ...reportPack.company, companyName: fromAuth } };
    }
    return reportPack;
  }

  private buildClauseLookupFromStructuredPayload(data: Record<string, unknown> | null): {
    lookup: Map<string, ClauseLookupEntry>;
    docFileName: string;
    standardTitleMeta: string;
    isoFromDoc: string;
  } {
    const empty = (): {
      lookup: Map<string, ClauseLookupEntry>;
      docFileName: string;
      standardTitleMeta: string;
      isoFromDoc: string;
    } => ({
      lookup: new Map(),
      docFileName: '',
      standardTitleMeta: '',
      isoFromDoc: '',
    });
    if (!data) return empty();
    const extracted = data.extractedStructured as Record<string, unknown> | null | undefined;
    const sections = (extracted?.sections as Array<Record<string, unknown>> | undefined) ?? [];
    const lookup = new Map<string, ClauseLookupEntry>();
    for (const s of sections) {
      const clauseNumber = typeof s.clauseNumber === 'string' ? s.clauseNumber.trim() : '';
      const heading = typeof s.heading === 'string' ? s.heading.trim() : '';
      const content = typeof s.content === 'string' ? s.content.trim() : '';
      const bullets = Array.isArray(s.bullets)
        ? (s.bullets as unknown[]).filter((x): x is string => typeof x === 'string')
        : [];
      const title = this.deriveClauseTitle(clauseNumber, heading);
      const summaryRaw = this.composeDetailedSummary(content, bullets);
      const summary = this.clipExportText(summaryRaw, 16_000);
      const keys = this.deriveClauseKeysFromIsoSection(clauseNumber, heading);
      for (const key of keys) {
        const prev = lookup.get(key);
        if (!prev || summary.length > prev.summary.length) {
          const bestTitle = !prev || title.length >= prev.title.length ? title : prev.title;
          lookup.set(key, { title: bestTitle, summary });
        }
      }
    }
    const meta = extracted?.standardMetadata as Record<string, unknown> | undefined;
    const stdTitle = typeof meta?.title === 'string' ? meta.title.trim() : '';
    const docTitle = typeof extracted?.title === 'string' ? (extracted.title as string).trim() : '';
    return {
      lookup,
      docFileName: typeof data.name === 'string' ? data.name.trim() : '',
      standardTitleMeta: stdTitle || docTitle,
      isoFromDoc: typeof data.isoStandard === 'string' ? data.isoStandard.trim() : '',
    };
  }

  private buildReportPackFromSnapshots(
    isoRaw: Record<string, unknown> | null,
    prodRaw: Record<string, unknown> | null,
    snap: Record<string, unknown>,
    isoStandardCol: string,
    createdAt: Date,
  ): ReportPack {
    const e = this.emptyReportPack();
    const meta = (snap.evaluationMetadata as Record<string, unknown> | undefined) ?? {};
    const rc = (snap.reportContext as Record<string, unknown> | undefined) ?? {};
    const extIso = (isoRaw?.extractedStructured as Record<string, unknown> | undefined) ?? {};
    const stdMeta = (extIso.standardMetadata as Record<string, unknown> | undefined) ?? {};
    const extProd = (prodRaw?.extractedStructured as Record<string, unknown> | undefined) ?? {};
    const pp = (extProd.productProfile as Record<string, unknown> | undefined) ?? {};
    const folder = (prodRaw?.productFolder as Record<string, unknown> | undefined) ?? {};
    const rawMerged = (folder.mergedProfile as Record<string, unknown> | undefined) ?? {};
    const provenance = (folder.fieldProvenance as Record<string, any> | undefined) ?? {};
    const manifest = snap.evidenceManifest as AssessmentInputManifest | undefined;
    const allowed = new Set((manifest?.evidence || []).map((doc) => doc.id));
    const trustedField = (path: string) => allowed.has(String(provenance[path]?.documentId || ''));
    const trustedSection = (name: string): Record<string, unknown> => {
      const section = rawMerged[name];
      if (!section || typeof section !== 'object' || Array.isArray(section)) return {};
      return Object.fromEntries(Object.entries(section as Record<string, unknown>).filter(([key]) => trustedField(`${name}.${key}`)));
    };
    // Report metadata must not reintroduce merged values from restricted or
    // unselected sources after the assessment has filtered its evidence.
    const mergedRoot: Record<string, any> = {
      basicInformation: trustedSection('basicInformation'),
      usage: trustedSection('usage'),
      qualitySpecificationNarrative: trustedField('qualitySpecificationNarrative') ? rawMerged.qualitySpecificationNarrative : undefined,
      generalDescription: trustedField('generalDescription') ? rawMerged.generalDescription : undefined,
    };
    const basic = {
      ...((pp.basicInformation as Record<string, unknown> | undefined) ?? {}),
      ...((mergedRoot.basicInformation as Record<string, unknown> | undefined) ?? {}),
    };
    const usage = {
      ...((pp.usage as Record<string, unknown> | undefined) ?? {}),
      ...((mergedRoot.usage as Record<string, unknown> | undefined) ?? {}),
    };

    const isoRef =
      this.str(meta.standardReference) ||
      this.str(isoRaw?.isoStandard) ||
      isoStandardCol ||
      this.str(stdMeta.reference) ||
      '-';
    const title =
      this.str(meta.standardTitle) ||
      this.str(meta.standardName) ||
      this.str(stdMeta.title) ||
      this.str(extIso.title) ||
      this.str(isoRaw?.name) ||
      '-';
    const eff = this.str(stdMeta.effectiveDate) || '-';
    const version =
      this.str(meta.standardVersion) ||
      this.str(meta.normVersion) ||
      this.str(stdMeta.reference) ||
      isoRef;

    const prodName = this.resolveHumanProductName(
      snap,
      meta,
      null,
      this.str(folder.name),
      typeof prodRaw?.name === 'string' ? prodRaw.name : undefined,
    );

    const catTags = Array.isArray(folder.categoryTags)
      ? (folder.categoryTags as string[]).filter(Boolean).join(', ')
      : '';

    const desc =
      this.str(pp.qualitySpecificationNarrative) ||
      this.str(pp.generalDescription) ||
      this.str(pp.regulatoryNotes) ||
      this.str(pp.technicalCharacteristics) ||
      this.str(mergedRoot.qualitySpecificationNarrative) ||
      this.str(mergedRoot.generalDescription) ||
      '-';

    e.standard = { reference: isoRef, title, version: version || '-', effectiveDate: eff };
    e.product = {
      name: prodName,
      reference: this.str(basic.reference) || this.str(folder.reference) || '-',
      revision: this.str(basic.revision) || this.str(folder.revision) || '-',
      category: this.str(basic.category) || catTags || '-',
      subCategory: this.str(basic.subCategory) || '-',
      tradeMark: this.str(basic.tradeMark) || '-',
      created: folder.createdAt
        ? new Date(String(folder.createdAt)).toISOString().slice(0, 10)
        : createdAt.toISOString().slice(0, 10),
      environment: this.str(usage.environment) || '-',
      users: this.str(usage.users) || '-',
      tempHumidity: this.str(usage.tempHumidity) || '-',
      ipRating: this.str(usage.ipRating) || '-',
      description: desc,
    };

    const co = (rc.company as Record<string, unknown> | undefined) ?? {};
    const ini = (rc.initiator as Record<string, unknown> | undefined) ?? {};
    e.company = {
      companyName: this.str(co.companyName) || this.str(meta.companyName) || '-',
      address: this.str(co.address) || this.str(co.field) || '-',
      email: this.str(co.email) || '-',
      phone: this.str(co.phone) || '-',
    };
    e.initiator = {
      firstName: this.str(ini.firstName) || '-',
      lastName: this.str(ini.lastName) || '-',
      email: this.str(ini.email) || '-',
    };
    return e;
  }

  private readValidReportPack(snap: Record<string, unknown>): ReportPack | null {
    const rp = snap.reportPack;
    if (!rp || typeof rp !== 'object') return null;
    const o = rp as Record<string, unknown>;
    const std = o.standard;
    if (!std || typeof std !== 'object') return null;
    const ref = this.str((std as Record<string, unknown>).reference);
    if (!ref || ref === '-') return null;
    return rp as unknown as ReportPack;
  }

  private conformityStatus(eff: string): string {
    const u = (eff || '').toUpperCase();
    if (u === 'SATISFIED') return 'PASS';
    if (u === 'PARTIALLY_SATISFIED') return 'MISSING';
    if (u === 'NOT_SATISFIED') return 'FAIL';
    if (u === 'INCONCLUSIVE') return 'INCONCLUSIVE';
    return '-';
  }

  private verdictShort(eff: string): string {
    const u = (eff || '').toUpperCase();
    if (u === 'SATISFIED') return 'P';
    if (u === 'PARTIALLY_SATISFIED') return 'M';
    if (u === 'NOT_SATISFIED') return 'F';
    return '-';
  }

  private extractApplicableIf(text: string): string {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    const m = t.match(/\bIF:?\s+(.+)/i);
    return m ? m[1].trim().slice(0, 800) : '-';
  }

  private extractNormRefs(text: string): string {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    const hits = t.match(/\b(?:IEC|ISO|EN|NF|ANSI|IEEE)\s*[\d-]+(?::\d{4})?(?:\+A\d+:\d{4})?/gi);
    return hits?.length ? [...new Set(hits)].join('; ').slice(0, 800) : '-';
  }

  private isStructuralClauseRow(r: ClauseRow, enh: ClauseLookupEntry): boolean {
    const comparison = (r.productStandardComparison || {}) as Record<string, any>;
    if (String(comparison.method || '').toLowerCase() === 'heading_only_clause') return true;
    const noBody = !this.str(enh.summary) && !this.str(r.clauseTextExcerpt);
    const noEv = !(r.supportingEvidence || []).length;
    return noBody && noEv;
  }

  /** Translate internal engine codes into clear client-facing results. */
  private displayStatus(row: ClauseRow, structural = false): string {
    // A human override takes precedence over the original engine presentation.
    const status = this.effectiveStatus(row);
    if (!row.override?.verdict && this.str(row.displayStatus)) return this.str(row.displayStatus);
    if (status === 'PASS') return 'Conformity supported';
    if (status === 'FAIL') return 'Requirement not met';
    if (status === 'MISSING_INFO') return 'Evidence needed';
    if (status === 'INCONCLUSIVE') return 'Assessment needs review';
    if (status === 'N/A') {
      const app = (row.applicability || {}) as Record<string, any>;
      const comparison = (row.productStandardComparison || {}) as Record<string, any>;
      const scope = String(app.scope || '').toUpperCase();
      const method = String(comparison.method || '').toLowerCase();
      const kind = String(app.kind || '').toUpperCase();
      if (structural || method === 'heading_only_clause' || ['STRUCTURAL_HEADING', 'HEADING_ONLY'].includes(kind)) return 'Heading only — not scored';
      if (scope === 'OUT_OF_SCOPE') return 'Outside product scope';
      if (kind.includes('INFORMATIVE') || method.includes('informative')) return 'Informative content';
      return 'Applicability needs confirmation';
    }
    return 'Assessment needs review';
  }

  private displayExplanation(row: ClauseRow, structural = false): string {
    if (row.override?.verdict) {
      return `A reviewer changed the result to ${this.displayStatus(row, structural)}. ${row.override.reason ? `Reviewer rationale: ${row.override.reason}` : 'No override rationale is available.'}`;
    }
    if (this.str(row.statusExplanation)) return this.str(row.statusExplanation);
    const status = this.effectiveStatus(row);
    if (structural) return 'This row is a clause heading, not a standalone auditable requirement. It is excluded from conformity scoring.';
    if (status === 'N/A') {
      const app = (row.applicability || {}) as Record<string, any>;
      const comparison = (row.productStandardComparison || {}) as Record<string, any>;
      const scope = String(app.scope || '').toUpperCase();
      return scope === 'OUT_OF_SCOPE'
        ? (this.str(app.reason || comparison.reason) || 'The recorded scope analysis indicates that this requirement is outside the current product scope.')
        : 'The record does not contain enough scope rationale to confirm that this requirement can be excluded. Verify the applicable condition and product scope with the cited source.';
    }
    const raw = this.str(row.justification);
    return raw.replace(/^\s*(?:PASS|FAIL|MISSING[_ ]INFO|INCONCLUSIVE)\s*:\s*/i, '') || 'No additional explanation was returned by the engine.';
  }

  private displayRecommendedAction(row: ClauseRow): string {
    if (this.str(row.recommendedAction)) return this.str(row.recommendedAction);
    const status = this.effectiveStatus(row);
    if (status === 'PASS') return 'Keep the cited evidence linked to the product and verify it remains current.';
    if (status === 'FAIL') return 'Verify the evidence and, if the finding is confirmed, create a non-conformity and corrective action.';
    if (status === 'MISSING_INFO') return 'Upload or link the missing evidence, resolve conflicting values, and rerun the evaluation.';
    if (status === 'N/A') return 'Verify the applicability condition and product scope with the cited source before treating this requirement as excluded.';
    return 'Check the standard extraction, clause mapping and evidence retrieval, then retry or complete a qualified manual review.';
  }

  /** Remove UUIDs, document markers, page numbers, path-encoded text, and JSON noise. */
  private cleanEvidenceText(text: string): string {
    let s = (text || '').trim();
    s = s.replace(/\\n/g, '\n');

    // Remove entire lines that start with a UUID (with or without trailing whitespace/numbers)
    s = s.split('\n').map(line => {
      let l = line.trim();
      // Strip leading UUIDs: "aca03ef5-...: 5" or "aca03ef5-...:" or just "aca03ef5-..."
      l = l.replace(/^\[?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]?,?\s*[:;]?\s*\d*[\s:;,]*/, '').trim();
      // Strip UUIDs embedded mid-line as well
      l = l.replace(/\[?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]?,?\s*[:;]?\s*/gi, '').trim();
      // Remove path-encoded text like "/c76/c101/c32/..."
      l = l.replace(/\/[a-z0-9]{2,4}(\/[a-z0-9]{2,4})+\s*/gi, '').trim();
      // Remove isolated numbers like "4/11", "4/ 9", "(1) 6", "8,8 11"
      l = l.replace(/^[\d\s,()/-]+$/, '').trim();
      // Remove lines that start with a digit/section reference that is just a number (page numbers)
      l = l.replace(/^\d{1,2}\/\d{1,2}\s*$/, '').trim();
      return l;
    }).filter(line => {
      const t = line.trim();
      if (!t) return false;
      // Skip if line is just punctuation/numbers
      if (/^[\d\s,;:.()/\-]+$/.test(t)) return false;
      // Skip if very short (less than 3 meaningful chars)
      if (t.replace(/[\s\d]/g, '').length < 2) return false;
      return true;
    }).join('\n');

    // Collapse multiple newlines to one
    s = s.replace(/\n{3,}/g, '\n\n');
    s = s.trim();
    return s;
  }

  /** Deduplicate evidence chunks by text content and filter empty ones. */
  private deduplicateEvidence(chunks: { sourceLabel?: string; documentId?: string; excerpt: string }[]): { sourceLabel?: string; documentId?: string; excerpt: string }[] {
    const seen = new Set<string>();
    const out: typeof chunks = [];
    for (const c of chunks) {
      const cleaned = this.cleanEvidenceText(c.excerpt || '');
      if (!cleaned || cleaned.length < 10) continue;
      const firstLine = cleaned.split('\n')[0].trim().slice(0, 80);
      const key = firstLine.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out.slice(0, 5);
  }

  private clientFacingComparison(value: Record<string, any>, row: ClauseRow, structural: boolean): Record<string, any> {
    const comparison = { ...(value || {}) };
    const clientLabel = this.displayStatus({ ...row, productStandardComparison: comparison }, structural);
    if ('decision' in comparison) comparison.decision = clientLabel;
    if (typeof comparison.postJudgmentStatus === 'string') comparison.postJudgmentStatus = clientLabel;
    if (typeof comparison.status === 'string' && ['N/A', 'NA', 'NOT_APPLICABLE', 'PASS', 'FAIL', 'MISSING_INFO', 'INCONCLUSIVE'].includes(comparison.status.toUpperCase())) {
      comparison.status = this.displayStatus({ ...row, productStandardComparison: comparison }, structural);
    }
    if (typeof comparison.reason === 'string') comparison.reason = comparison.reason.replace(/^\s*(?:PASS|FAIL|N\/?A|MISSING[_ ]INFO|INCONCLUSIVE)\s*:\s*/i, '');
    if (typeof comparison.coverage === 'string') {
      const coverage = comparison.coverage.toUpperCase();
      comparison.coverage = coverage === 'NONE' ? 'No relevant evidence located'
        : coverage === 'NOT_APPLICABLE' ? 'Not applicable to this row'
        : coverage.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
    }
    return comparison;
  }

  private buildJustification(r: ClauseRow, structural: boolean): string {
    const parts: string[] = [];
    parts.push(`Result: ${this.displayStatus(r, structural)}`);
    parts.push(`Explanation: ${this.displayExplanation(r, structural)}`);
    const missing = Array.isArray(r.missingInformation) ? r.missingInformation : [];
    if (missing.length) parts.push(`Information needed: ${missing.join('; ')}`);
    const evLines = (r.supportingEvidence || []).slice(0, 6).map((x) => {
      const src = x.sourceLabel || x.documentId || '';
      const txt = this.cleanEvidenceText(x.excerpt || '');
      return src ? `${src}: ${txt}` : txt;
    });
    if (evLines.length) parts.push(`Evidence: ${evLines.join(' | ')}`);
    if ((r.gaps || []).length) parts.push(`Gaps: ${(r.gaps || []).map((gap) => this.str(gap).replace(/^\s*(?:PASS|FAIL|N\/?A|MISSING[_ ]INFO|INCONCLUSIVE)\s*:\s*/i, '')).filter(Boolean).join('; ')}`);
    const nextAction = this.displayRecommendedAction(r);
    if (nextAction) parts.push(`Next step: ${nextAction}`);
    if ((r.suggestions || []).length) parts.push(`Additional recommendations: ${(r.suggestions || []).join('; ')}`);
    if (r.override) parts.push(`Override: ${r.override.verdict}, ${r.override.reason}`);
    return parts.join('\n').slice(0, 8000);
  }

  private async loadEvaluationExportBundle(id: string, companyId: string): Promise<EvaluationExportBundle> {
    const ev = await this.getOne(id, companyId);
    const snap = (ev.requestSnapshot ?? {}) as Record<string, unknown>;
    const [isoRaw, prodRaw] = await Promise.all([
      this.fetchStructuredDoc(companyId, ev.isoDocumentId),
      this.fetchStructuredDoc(companyId, ev.productDocumentId),
    ]);
    const { lookup, docFileName, standardTitleMeta, isoFromDoc } = this.buildClauseLookupFromStructuredPayload(isoRaw);
    let reportPack = this.readValidReportPack(snap);
    if (!reportPack) {
      reportPack = this.buildReportPackFromSnapshots(
        isoRaw,
        prodRaw,
        snap,
        ev.isoStandard,
        ev.createdAt ? new Date(ev.createdAt) : new Date(),
      );
    } else {
      const pc = this.str(reportPack.product.created);
      if (!pc || pc === '-') {
        const merged = this.buildReportPackFromSnapshots(
          isoRaw,
          prodRaw,
          snap,
          ev.isoStandard,
          ev.createdAt ? new Date(ev.createdAt) : new Date(),
        );
        reportPack = { ...reportPack, product: { ...reportPack.product, created: merged.product.created } };
      }
    }
    reportPack = await this.enrichReportPackCompany(companyId, reportPack, snap);
    const enrich = { docFileName, standardTitleMeta, isoFromDoc };
    const meta = (snap.evaluationMetadata as Record<string, unknown> | undefined) ?? {};
    const filenameBase = this.exportFilenameBase(ev, enrich, reportPack);
    const reportRef = this.buildReportReference(ev, snap, meta, enrich, reportPack);
    return { ev, lookup, docFileName, standardTitleMeta, isoFromDoc, filenameBase, reportRef, reportPack };
  }

  /** STD-004: only Active, Ready ISO standards may be used in evaluations. */
  private async assertIsoDocumentEligibleForEvaluation(companyId: string, isoDocumentId: string): Promise<void> {
    const base = this.documentServiceUrl;
    if (!base) {
      this.logger.warn('DOCUMENT_SERVICE_URL not set; skipping ISO activation check');
      return;
    }
    const token = this.documentInternalToken;
    try {
      const r = await axios.get(
        `${base}/api/documents/internal/eval-check/${encodeURIComponent(isoDocumentId)}`,
        {
          params: { company_id: companyId },
          headers: token ? { 'X-Internal-Token': token } : {},
          timeout: 20000,
          validateStatus: () => true,
        },
      );
      if (r.status >= 400 || !r.data?.ok) {
        const reason = r.data?.reason ?? `HTTP_${r.status}`;
        throw new BadRequestException(
          `This standard cannot be used for evaluation (${reason}). Activate it under Documents → Standard documents.`,
        );
      }
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      this.logger.warn(`ISO eval eligibility check failed: ${e?.message ?? e}`);
      throw new BadRequestException(
        'Could not verify the selected standard. Ensure the document service is reachable and the standard is activated.',
      );
    }
  }

  private verdictWeight(v: string): number {
    const u = (v || '').toUpperCase();
    if (u === 'SATISFIED') return 1;
    if (u === 'PARTIALLY_SATISFIED') return 0.5;
    return 0;
  }

  private effectiveVerdict(row: ClauseRow): string {
    return row.override?.verdict ?? row.verdict;
  }

  /**
   * EVAL-004: weight by exact clause id, wildcard key `4.*`, section key `4` (matches 4.x), or `group:4.1`.
   * When multiple patterns match, the most specific (longest winning prefix) wins.
   */
  resolveClauseWeight(clauseRef: string, clauseWeights: Record<string, number> | null | undefined): number {
    if (!clauseWeights || !Object.keys(clauseWeights).length) return 1;
    const ref = clauseRef || '';
    const direct = clauseWeights[ref];
    if (direct != null && Number.isFinite(Number(direct)) && Number(direct) > 0) return Number(direct);

    let best = -1;
    let w = 1;
    for (const [key, raw] of Object.entries(clauseWeights)) {
      const weight = Number(raw);
      if (!Number.isFinite(weight) || weight <= 0) continue;
      let spec = -1;
      if (key.endsWith('.*')) {
        const p = key.slice(0, -2);
        if (ref === p || ref.startsWith(`${p}.`)) spec = p.length;
      } else if (key.startsWith('group:')) {
        const g = key.slice('group:'.length);
        if (ref === g || ref.startsWith(`${g}.`)) spec = 1000 + g.length;
      } else if (!key.includes('.')) {
        if (ref === key || ref.startsWith(`${key}.`)) spec = key.length;
      }
      if (spec > best) {
        best = spec;
        w = weight;
      }
    }
    return best >= 0 ? w : 1;
  }

  /**
   * A weighted score is available only when all applicable rows have a decision.
   * N/A rows do not enter the calculation. Missing or inconclusive evidence
   * withholds the score instead of creating an unrealistically reassuring result.
   *
   * Falls back to the legacy verdict vocabulary for evaluations stored before the
   * conformity-matrix statuses existed.
   */
  computeWeightedScore(rows: ClauseRow[], clauseWeights: Record<string, number> | null): number | null {
    if (!scoreIsPublishable((rows || []).map((row) => this.effectiveStatus(row)))) return null;
    const unscored = new Set(['N/A', 'INCONCLUSIVE']);
    const scored = (rows || []).filter((r) => !unscored.has(this.effectiveStatus(r)));
    if (!scored.length) return null;
    if (clauseWeights && Object.keys(clauseWeights).length) {
      const grouped = new Map<string, ClauseRow[]>();
      for (const r of scored) {
        const base = (r.clauseReference || '').replace(/\s*\([^)]*\)\s*$/, '');
        const arr = grouped.get(base) ?? [];
        arr.push(r);
        grouped.set(base, arr);
      }
      let tw = 0;
      let acc = 0;
      for (const [ref, group] of grouped.entries()) {
        const w = this.resolveClauseWeight(ref, clauseWeights);
        const clauseScore = group.reduce((sum, row) => sum + this.statusWeight(row), 0) / group.length;
        tw += w;
        acc += w * clauseScore;
      }
      return tw > 0 ? Math.round((100 * acc) / tw * 100) / 100 : null;
    }
    const acc = scored.reduce((s, r) => s + this.statusWeight(r), 0);
    return Math.round((100 * acc) / scored.length * 100) / 100;
  }

  /** Worksheet status, honouring a manual override and tolerating legacy rows. */
  private effectiveStatus(row: ClauseRow): string {
    const overridden = row.override?.verdict;
    if (overridden) return this.verdictToStatus(overridden);
    const s = (row.status || '').toUpperCase();
    if (s === 'NA' || s === 'N/A') return 'N/A';
    if (s === 'PASS' || s === 'SATISFIED' || s === 'CONFORMANT') return 'PASS';
    if (s === 'FAIL' || s === 'NOT_SATISFIED' || s === 'MINOR_NC' || s === 'MAJOR_NC' || s === 'CRITICAL_NC') return 'FAIL';
    if (s === 'MISSING_INFO' || s === 'PARTIALLY_SATISFIED') return 'MISSING_INFO';
    if (s === 'INCONCLUSIVE' || s === 'ERROR') return s === 'ERROR' ? 'INCONCLUSIVE' : s;
    return this.verdictToStatus(row.verdict);
  }

  private verdictToStatus(verdict: string): string {
    const v = (verdict || '').toUpperCase();
    if (v === 'SATISFIED') return 'PASS';
    if (v === 'NOT_SATISFIED') return 'FAIL';
    if (v === 'PARTIALLY_SATISFIED') return 'MISSING_INFO';
    if (v === 'INCONCLUSIVE') return 'INCONCLUSIVE';
    return 'MISSING_INFO';
  }

  /** PASS counts fully; FAIL and MISSING_INFO count as zero (undemonstrated). */
  private statusWeight(row: ClauseRow): number {
    return this.effectiveStatus(row) === 'PASS' ? 1 : 0;
  }

  /**
   * Export the engine's explicit applicability state instead of treating every
   * row as applicable by default. `REVIEW` is intentionally preserved when the
   * compliance scope gate could not safely decide.
   */
  private applicabilityLabel(row: ClauseRow, lookup?: Map<string, ClauseLookupEntry>): 'YES' | 'NO' | 'REVIEW' {
    const scope = String((row.applicability as any)?.scope || '').toUpperCase();
    if (scope === 'IN_SCOPE') return 'YES';
    if (scope === 'OUT_OF_SCOPE') return 'NO';
    if (scope === 'REVIEW') return 'REVIEW';
    if ((row as any).applicable === false) return 'NO';
    if (this.effectiveStatus(row) === 'N/A') return 'NO';
    if (lookup && this.isStructuralClauseRow(row, this.pickClauseEnhancement(lookup, row.clauseReference))) return 'NO';
    return 'REVIEW';
  }

  private normalizeResults(raw: any[]): ClauseRow[] {
    return (raw || []).map((r: any, index: number) => ({
      // A clause can contain many requirements. The per-run row ID remains
      // stable through edits and is used instead of the shared clause label.
      resultId: String(r.result_id ?? r.resultId ?? `row-${index + 1}`),
      clauseReference: r.clause_reference ?? r.clauseReference,
      requirementId: r.requirement_id ?? r.requirementId ?? '',
      clauseTitle: r.clause_title ?? r.clauseTitle ?? '',
      clauseSummary: r.clause_summary ?? r.clauseSummary ?? '',
      clauseTextExcerpt: r.clause_text_excerpt ?? r.clauseTextExcerpt ?? '',
      // Conformity-matrix columns (PASS / FAIL / N/A / MISSING_INFO worksheet).
      applicableIf: r.applicable_if ?? r.applicableIf ?? '',
      conditionalClauses: r.conditional_clauses ?? r.conditionalClauses ?? '',
      references: r.references ?? '',
      status: r.status ?? '',
      justification: r.justification ?? '',
      verdict: r.verdict,
      confidence: typeof r.confidence === 'number' ? r.confidence : parseFloat(r.confidence) || 0,
      supportingEvidence: (r.supporting_evidence ?? r.supportingEvidence ?? []).map((e: any) => ({
        documentId: e.document_id ?? e.documentId,
        excerpt: e.excerpt ?? '',
        similarityScore: e.similarity_score ?? e.similarityScore ?? 0,
        sourceLabel: e.source_label ?? e.sourceLabel,
      })),
      gaps: r.gaps ?? [],
      suggestions: r.suggestions ?? [],
      legacyScore: r.legacy_score ?? r.legacyScore,
      legacyStatus: r.legacy_status ?? r.legacyStatus,
      override: r.override,
      reasoning: r.reasoning ?? '',
      requirementElements: r.requirementElements ?? r.requirement_elements ?? [],
      evidenceAssessment: r.evidenceAssessment ?? r.evidence_assessment ?? [],
      decisionSource: r.decision_source ?? r.decisionSource ?? "",
      evidenceCoverage: r.evidence_coverage ?? r.evidenceCoverage ?? "",
      applicability: r.applicability ?? {},
      inconclusiveReason: r.inconclusive_reason ?? r.inconclusiveReason ?? '',
      productStandardComparison: r.product_standard_comparison ?? r.productStandardComparison ?? {},
      displayStatus: r.display_status ?? r.displayStatus ?? '',
      statusExplanation: r.status_explanation ?? r.statusExplanation ?? '',
      recommendedAction: r.recommended_action ?? r.recommendedAction ?? '',
      missingInformation: r.missing_information ?? r.missingInformation ?? [],
    }));
  }

  private classifyNc(row: ClauseRow): NCClassification {
    const text = `${row.clauseReference} ${row.clauseTitle} ${row.clauseSummary} ${row.clauseTextExcerpt} ${row.justification}`.toLowerCase();
    const critical = [
      'electric shock', 'fire hazard', 'explosion', 'protective', 'emergency stop',
      'safety function', 'guarding', 'interlock', 'life safety', 'pressure vessel',
      'sterility', 'implant', 'critical safety', 'hazardous', 'shall not exceed',
    ].some(k => text.includes(k));
    return critical ? NCClassification.MAJOR : NCClassification.MINOR;
  }

  /**
   * NC drafts come from FAIL rows only. MISSING_INFO is a documentation gap to
   * chase, not a demonstrated non-conformity, and N/A rows are out of scope,
   * raising NCs for either would flood the register with false findings.
   */
  private buildNcDrafts(rows: ClauseRow[], ev: Evaluation): Record<string, unknown>[] {
    return rows
      .filter((r) => this.effectiveStatus(r) === 'FAIL')
      .map((r) => ({
        clauseReference: r.clauseReference,
        title: `NC draft: ${r.clauseReference}`,
        description: (r.gaps && r.gaps.length
          ? r.gaps
          : [r.justification || 'Gap vs standard requirement']
        ).join('; '),
        classification: this.classifyNc(r),
        isoClause: r.clauseReference,
        isoStandard: ev.isoStandard,
      }));
  }

  private async resolveProductEvidenceIds(companyId: string, productDocumentId: string): Promise<string[]> {
    const base = this.documentServiceUrl;
    const token = this.documentInternalToken;
    if (!base || !productDocumentId) return [productDocumentId];

    try {
      const selected = await this.fetchStructuredDoc(companyId, productDocumentId);
      const productId = selected?.productFolder && typeof (selected.productFolder as any)?.id === 'string'
        ? String((selected.productFolder as any).id)
        : null;
      if (!productId) return [productDocumentId];

      const response = await axios.get(
        `${base}/api/documents/internal/products/${encodeURIComponent(productId)}/evidence`,
        {
          params: { company_id: companyId },
          headers: token ? { 'X-Internal-Token': token } : {},
          timeout: 15_000,
          validateStatus: () => true,
        },
      );
      if (response.status >= 400 || !Array.isArray(response.data?.documents)) {
        this.logger.warn(`resolve product evidence returned HTTP ${response.status}`);
        return [productDocumentId];
      }
      const ids = response.data.documents
        .map((d: any) => String(d?.id || ''))
        .filter(Boolean);
      return ids.length ? Array.from(new Set(ids)) : [productDocumentId];
    } catch (error: any) {
      this.logger.warn(`resolve product evidence failed: ${error?.message ?? error}`);
      return [productDocumentId];
    }
  }

  private async validateAssessmentInputs(
    companyId: string, standardId: string, productDocumentId: string, evidenceIds: string[], actor: EvaluationActor,
  ): Promise<AssessmentInputManifest> {
    if (!this.documentServiceUrl || !this.documentInternalToken || !actor?.id || !actor?.role) {
      throw new BadRequestException('Cannot verify product evidence and document access. Check service configuration.');
    }
    try {
      const response = await axios.post(`${this.documentServiceUrl}/api/documents/internal/evaluation-evidence/validate`, {
        company_id: companyId, standard_document_id: standardId, product_document_id: productDocumentId,
        evidence_document_ids: evidenceIds, actor,
      }, { headers: { 'X-Internal-Token': this.documentInternalToken }, timeout: 30_000 });
      if (!response.data?.ok || !Array.isArray(response.data?.evidence) || !response.data.evidence.length) {
        throw new Error('Document validation returned no usable evidence');
      }
      return response.data as AssessmentInputManifest;
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Document validation failed';
      throw new BadRequestException(typeof message === 'string' ? message : 'Could not verify assessment inputs');
    }
  }

  private sameAssessmentInputs(a: AssessmentInputManifest, b: AssessmentInputManifest): boolean {
    const canonical = (manifest: AssessmentInputManifest) => JSON.stringify({
      standard: manifest.standard,
      evidence: [...(manifest.evidence || [])].sort((x, y) => x.id.localeCompare(y.id)),
      productSnapshotHash: manifest.productSnapshotHash,
    });
    return canonical(a) === canonical(b);
  }

  private scoreForEvaluation(rows: ClauseRow[], ev: Evaluation): number | null {
    const manifest = (ev.requestSnapshot as any)?.evidenceManifest as AssessmentInputManifest | undefined;
    if (!manifest || (manifest.warnings || []).length) return null;
    return this.computeWeightedScore(rows, ev.clauseWeights);
  }

  private summaryForEvaluation(rows: ClauseRow[], ev: Evaluation, score: number | null): string {
    const count = (status: string) => rows.filter((row) => this.effectiveStatus(row) === status).length;
    const manifest = (ev.requestSnapshot as any)?.evidenceManifest as AssessmentInputManifest | undefined;
    const readiness = !manifest
      ? ' Source versions were not captured for this older assessment; run it again to verify the evidence.'
      : (manifest.warnings || []).length
        ? ' Some evidence was not approved when the assessment ran. Approve the documents and run the assessment again.'
        : '';
    const scoreText = score === null
      ? 'The overall score is withheld until the evidence and assessment are ready for review.'
      : `Assessment score: ${score}%.`;
    return `Supported: ${count('PASS')}. Potential issues: ${count('FAIL')}. Evidence needed: ${count('MISSING_INFO')}. Needs review: ${count('INCONCLUSIVE')}. Not applicable: ${count('N/A')}. ${scoreText}${readiness}`;
  }

  async create(
    companyId: string,
    userId: string,
    userEmail: string | undefined,
    dto: {
      isoDocumentId: string;
      productDocumentId: string;
      isoStandard: string;
      evidenceDocumentIds?: string[];
      scoringMethod?: string;
      clauseWeights?: Record<string, number>;
      productName?: string;
      evaluationMetadata?: Record<string, unknown>;
      reportContext?: Record<string, unknown>;
    },
    actor: EvaluationActor,
  ): Promise<{ job_id: string; evaluationId: string; status: string; message: string }> {
    const requestedEvidenceIds = Array.isArray(dto.evidenceDocumentIds)
      ? Array.from(new Set(dto.evidenceDocumentIds.filter(Boolean)))
      : [];
    // A product-level conformity evaluation must use the complete approved evidence
    // set by default. The UI intentionally omits evidenceDocumentIds for the normal
    // case, so resolve every READY document attached to the selected product here.
    // A caller that explicitly supplies multiple documents can still narrow the set.
    const manifest = await this.validateAssessmentInputs(companyId, dto.isoDocumentId, dto.productDocumentId, requestedEvidenceIds, actor);
    const evidenceIds = manifest.evidence.map((doc) => doc.id);

    const meta = (dto.evaluationMetadata ?? {}) as Record<string, unknown>;
    let productNameTop =
      dto.productName ??
      (typeof meta.productName === 'string' ? meta.productName.trim() : null) ??
      null;
    if (productNameTop && this.looksLikeUuid(productNameTop)) productNameTop = null;

    const requestSnapshot: Record<string, unknown> = {
      isoDocumentId: dto.isoDocumentId,
      productDocumentId: dto.productDocumentId,
      isoStandard: dto.isoStandard,
      evidenceDocumentIds: evidenceIds,
      scoringMethod: dto.scoringMethod ?? 'AI_AUTOMATIC',
      clauseWeights: dto.clauseWeights ?? null,
      productName: productNameTop,
      evaluationMetadata: dto.evaluationMetadata ?? null,
      reportContext: dto.reportContext ?? null,
      evaluationActor: actor,
      evidenceManifest: manifest,
    };

    await this.assertIsoDocumentEligibleForEvaluation(companyId, dto.isoDocumentId);

    try {
      const [isoRaw, prodRaw] = await Promise.all([
        this.fetchStructuredDoc(companyId, dto.isoDocumentId),
        this.fetchStructuredDoc(companyId, dto.productDocumentId),
      ]);
      const reportPack = this.buildReportPackFromSnapshots(
        isoRaw,
        prodRaw,
        requestSnapshot,
        dto.isoStandard,
        new Date(),
      );
      requestSnapshot.reportPack = reportPack;
      if (!requestSnapshot.productName && reportPack.product?.name && reportPack.product.name !== '-') {
        requestSnapshot.productName = reportPack.product.name;
      }
    } catch (e: any) {
      this.logger.warn(`reportPack at create: ${e?.message ?? e}`);
    }

    const ev = this.evalRepo.create({
      companyId,
      initiatedBy: userId,
      initiatorEmail: userEmail ?? null,
      status: EvaluationStatus.QUEUED,
      isoDocumentId: dto.isoDocumentId,
      isoStandard: dto.isoStandard,
      productDocumentId: dto.productDocumentId,
      evidenceDocumentIds: evidenceIds,
      scoringMethod: dto.scoringMethod ?? 'AI_AUTOMATIC',
      clauseWeights: dto.clauseWeights ?? null,
      requestSnapshot: requestSnapshot as any,
    });
    await this.evalRepo.save(ev);

    await this.evalQueue.add(
      'run',
      { evaluationId: ev.id },
      {
        removeOnComplete: true,
        attempts: 2,
        backoff: { type: 'exponential', delay: 10_000 },
      },
    );

    return {
      job_id: ev.id,
      evaluationId: ev.id,
      status: 'Queued',
      message: 'Evaluation queued',
    };
  }

  async runEvaluationJob(evaluationId: string, attempt = 1, maxAttempts = 1): Promise<void> {
    await this.evalRepo.update(evaluationId, { status: EvaluationStatus.PROCESSING, startedAt: new Date() });
    const ev = await this.evalRepo.findOne({ where: { id: evaluationId } });
    if (!ev) {
      this.logger.error(`Evaluation ${evaluationId} not found`);
      return;
    }

    try {
      const snapshot = (ev.requestSnapshot ?? {}) as Record<string, unknown>;
      const actor = snapshot.evaluationActor as EvaluationActor | undefined;
      const savedManifest = snapshot.evidenceManifest as AssessmentInputManifest | undefined;
      if (!actor || !savedManifest) {
        throw new Error('This evaluation predates evidence validation. Retry it or start a new evaluation.');
      }
      // Old/previously created evaluations may have persisted only the primary
      // product document. Refresh that legacy single-document snapshot so they also
      // evaluate against the complete current product evidence set.
      let runtimeEvidenceIds = Array.isArray(ev.evidenceDocumentIds)
        ? ev.evidenceDocumentIds.filter(Boolean)
        : [];
      const before = await this.validateAssessmentInputs(ev.companyId, ev.isoDocumentId, ev.productDocumentId, runtimeEvidenceIds, actor);
      if (!this.sameAssessmentInputs(savedManifest, before)) throw new Error('Assessment inputs changed after the run was queued. Retry using the current document versions.');

      const res = await axios.post(
        `${this.ragUrl}/api/evaluate`,
        {
          evaluation_id: ev.id,
          company_id: ev.companyId,
          iso_document_id: ev.isoDocumentId,
          product_document_id: ev.productDocumentId,
          iso_standard: ev.isoStandard,
          evidence_document_ids: runtimeEvidenceIds.length ? runtimeEvidenceIds : [ev.productDocumentId],
          scoring_method: ev.scoringMethod,
          clause_weights: ev.clauseWeights ?? undefined,
          assessment_provisional: (savedManifest.warnings || []).length > 0,
        },
        // Do not impose a finite Axios timeout on a complete compliance run. The RAG
        // engine now bounds each clause independently, so the job can safely wait for
        // all clauses without converting a slow/rate-limited tail into a global FAILED.
        {
          timeout: 0,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        },
      );

      const { results } = res.data;
      const after = await this.validateAssessmentInputs(ev.companyId, ev.isoDocumentId, ev.productDocumentId, runtimeEvidenceIds, actor);
      if (!this.sameAssessmentInputs(before, after)) throw new Error('Assessment inputs changed while the evaluation was running. Retry using the current document versions.');
      const rows = this.normalizeResults(results);
      if (!rows.length) {
        throw new Error(
          'Compliance engine returned no requirement results. The selected standard extraction may be incomplete or unavailable; evaluation must not be marked completed with a 0% score.',
        );
      }
      const hasJudgement = rows.some((r) => {
        const s = this.effectiveStatus(r);
        return s === 'PASS' || s === 'FAIL' || s === 'MISSING_INFO' || s === 'N/A' || s === 'INCONCLUSIVE';
      });
      if (!hasJudgement) {
        throw new Error('Compliance engine returned no usable conformity judgments. Evaluation remains failed/review-required.');
      }
      // Finalization is intentionally staged. The engine can finish all technical
      // requirement checks successfully, and then a secondary post-processing step
      // (NC draft construction, notification, etc.) can fail. Previously that late
      // exception changed an otherwise completed evaluation to FAILED — exactly the
      // visible "99% -> failed" symptom.
      const storedScore = this.scoreForEvaluation(rows, ev);
      // Do not fall back to a partial engine score when coverage is incomplete.
      const finalScore = storedScore;
      const finalSummary = this.summaryForEvaluation(rows, ev, finalScore);

      // Persist the completed technical evaluation first. After this point,
      // best-effort ancillary work must never downgrade the evaluation status.
      await this.evalRepo.update(evaluationId, {
        status: EvaluationStatus.COMPLETED,
        conformityScore: finalScore,
        results: rows as any,
        summary: finalSummary,
        completedAt: new Date(),
        errorMessage: null,
      });

      try {
        const ncDrafts = this.buildNcDrafts(rows, ev);
        await this.evalRepo.update(evaluationId, { ncDrafts: ncDrafts as any });
      } catch (postError: any) {
        // NC drafting is auxiliary; it must not invalidate a completed compliance
        // calculation. Keep the technical result and log the problem for repair.
        this.logger.error(`Eval ${evaluationId} NC draft post-processing failed: ${postError?.message ?? postError}`);
      }

      await this.notifyComplete(ev, finalScore);

      this.logger.log(`Eval ${evaluationId} done: ${finalScore === null ? 'score withheld' : `${finalScore}%`}`);
    } catch (e: any) {
      const msg = String(e?.response?.data?.detail || e?.message || 'Evaluation failed');
      const willRetry = attempt < maxAttempts && this.isRetryableEvaluationFailure(e, msg);
      if (willRetry) {
        // BullMQ can only retry if the worker throws. The previous handler swallowed
        // every error after marking the row FAILED, so the queue's configured
        // attempts/backoff never ran. Keep the record queued and let BullMQ retry;
        // only the final/non-retryable error is exposed as FAILED to the user.
        await this.evalRepo.update(evaluationId, {
          status: EvaluationStatus.QUEUED,
          errorMessage: `Temporary evaluation failure (attempt ${attempt}/${maxAttempts}); retry scheduled. ${msg}`.slice(0, 4000),
          completedAt: null,
        });
        this.logger.warn(`Eval ${evaluationId} will retry after attempt ${attempt}/${maxAttempts}: ${msg}`);
        throw e;
      }
      await this.evalRepo.update(evaluationId, {
        status: EvaluationStatus.FAILED,
        errorMessage: msg.slice(0, 4000),
        completedAt: new Date(),
      });
      await this.notifyFailed(ev, msg);
      this.logger.error(`Eval ${evaluationId} failed after attempt ${attempt}/${maxAttempts}: ${msg}`);
    }
  }

  private isRetryableEvaluationFailure(error: any, message: string): boolean {
    const detail = String(message || '').toLowerCase();
    // Don't retry known configuration/data failures; repeating these cannot repair
    // a missing extraction or an invalid evaluation request.
    if (/(no usable structured extraction|run\/finish standards|no requirement results|no usable conformity judgments|selected standard.*has no usable|invalid api key|unauthorized|authentication failed|insufficient credits|quota exhausted|status code 401|status code 403|status code 402)/i.test(detail)) {
      return false;
    }
    const status = Number(error?.response?.status || error?.status || 0);
    if ([408, 425, 429, 502, 503, 504].includes(status)) return true;
    if (status >= 500 && status <= 599) {
      // The RAG service reports exhausted clause-provider errors as HTTP 500; if
      // their detail includes transient provider/network terms, one Bull retry can
      // recover. Other 5xx responses also get one bounded retry unless known above.
      return true;
    }
    if (!error?.response) {
      const code = String(error?.code || '').toUpperCase();
      if (['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'EAI_AGAIN'].includes(code)) return true;
      if (axios.isAxiosError(error)) return true;
      return /timed out|timeout|temporarily unavailable|connection reset|network error|rate.?limit/i.test(detail);
    }
    return false;
  }

  private async notifyComplete(ev: Evaluation, score: number | null) {
    const token = this.internalToken;
    if (!token || !this.notificationUrl) return;
    try {
      await axios.post(
        `${this.notificationUrl}/api/notifications/internal/evaluation-complete`,
        {
          companyId: ev.companyId,
          userId: ev.initiatedBy,
          userEmail: ev.initiatorEmail,
          evaluationId: ev.id,
          score,
          isoStandard: ev.isoStandard,
        },
        { headers: { 'X-Internal-Token': token }, timeout: 15_000 },
      );
    } catch (e: any) {
      this.logger.warn(`notifyComplete failed: ${e.message}`);
    }
  }

  private async notifyFailed(ev: Evaluation, err: string) {
    const token = this.internalToken;
    if (!token || !this.notificationUrl) return;
    try {
      await axios.post(
        `${this.notificationUrl}/api/notifications/internal/evaluation-failed`,
        {
          companyId: ev.companyId,
          userId: ev.initiatedBy,
          userEmail: ev.initiatorEmail,
          evaluationId: ev.id,
          isoStandard: ev.isoStandard,
          error: err.slice(0, 500),
        },
        { headers: { 'X-Internal-Token': token }, timeout: 15_000 },
      );
    } catch (e: any) {
      this.logger.warn(`notifyFailed failed: ${e.message}`);
    }
  }

  async list(companyId: string) {
    const rows = await this.evalRepo
      .createQueryBuilder('e')
      .where('e.companyId = :companyId', { companyId })
      .orderBy('e.createdAt', 'DESC')
      .loadRelationCountAndMap('e.ncCount', 'e.nonConformities')
      .getMany();
    return (rows as any[]).map((r) => {
      const snap = (r.requestSnapshot ?? {}) as Record<string, unknown>;
      const meta = (snap.evaluationMetadata as Record<string, unknown> | undefined) ?? {};
      const rp = snap.reportPack as Record<string, unknown> | undefined;
      const rpp = rp?.product as Record<string, unknown> | undefined;
      let productName =
        (typeof snap.productName === 'string' && snap.productName.trim()) ||
        (typeof meta.productName === 'string' && meta.productName.trim()) ||
        (typeof rpp?.name === 'string' && rpp.name.trim()) ||
        null;
      if (productName && this.looksLikeUuid(productName)) productName = null;
      return {
        id: r.id,
        status: r.status,
        conformityScore: r.status === EvaluationStatus.COMPLETED
          ? this.scoreForEvaluation(this.normalizeResults(r.results ?? []), r) : r.conformityScore,
        isoStandard: r.isoStandard,
        isoDocumentId: r.isoDocumentId,
        productDocumentId: r.productDocumentId,
        productId: typeof meta.productId === 'string' ? meta.productId : null,
        productName,
        initiatedBy: r.initiatedBy,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
        scoringMethod: r.scoringMethod,
        requestSnapshot: r.requestSnapshot,
        _count: { nonConformities: r.ncCount ?? 0 },
      };
    });
  }

  async getOne(id: string, companyId: string) {
    const ev = await this.evalRepo.findOne({
      where: { id, companyId },
      relations: ['nonConformities', 'nonConformities.capaActions'],
    });
    if (!ev) throw new NotFoundException('Evaluation not found');
    if (ev.status === EvaluationStatus.COMPLETED) {
      ev.results = this.normalizeResults(ev.results ?? []);
      ev.conformityScore = this.scoreForEvaluation(ev.results, ev);
      ev.summary = this.summaryForEvaluation(ev.results, ev, ev.conformityScore);
    }
    return ev;
  }

  /**
   * Open an SSE stream of live agent-activity events for one evaluation.
   * Tenant ownership is checked first; the rag-service then provides the actual feed.
   */
  async openLiveStream(id: string, companyId: string): Promise<Readable> {
    const ev = await this.evalRepo.findOne({ where: { id, companyId }, select: ['id'] });
    if (!ev) throw new NotFoundException('Evaluation not found');

    const upstreamUrl = `${this.ragUrl}/api/evaluations/${encodeURIComponent(id)}/stream`;
    try {
      const res = await axios.get<Readable>(upstreamUrl, {
        responseType: 'stream',
        timeout: 0,
        validateStatus: () => true,
        headers: { Accept: 'text/event-stream' },
      });
      if (res.status >= 400) {
        const stream: Readable | undefined = res.data as Readable | undefined;
        if (stream) stream.destroy?.();
        throw new BadRequestException(`Upstream stream rejected (HTTP ${res.status})`);
      }
      return res.data;
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      this.logger.warn(`openLiveStream failed for ${id}: ${e?.message ?? e}`);
      throw new BadRequestException('RAG service stream unavailable');
    }
  }

  async patchClauseVerdict(
    id: string,
    companyId: string,
    userId: string,
    clauseRef: string,
    body: { verdict: string; reason: string },
  ) {
    const v = (body.verdict || '').toUpperCase();
    if (!['SATISFIED', 'PARTIALLY_SATISFIED', 'NOT_SATISFIED'].includes(v))
      throw new BadRequestException('Invalid verdict');
    if (!body.reason?.trim()) throw new BadRequestException('Reason is required');

    const ev = await this.getOne(id, companyId);
    if (ev.status !== EvaluationStatus.COMPLETED) throw new BadRequestException('Evaluation is not completed');

    const rows = this.normalizeResults(ev.results as any[]);
    const ix = findEvaluationResultIndex(rows, clauseRef);
    if (ix === -2) throw new BadRequestException('This clause contains multiple requirements. Refresh and select a specific requirement.');
    if (ix < 0) throw new NotFoundException('Clause not found in evaluation');

    rows[ix].override = {
      verdict: v,
      userId,
      reason: body.reason.trim(),
      at: new Date().toISOString(),
    };

    const audit = [...(ev.overrideAudit as any[] || []), {
      clauseReference: rows[ix].clauseReference,
      resultId: rows[ix].resultId,
      requirementId: rows[ix].requirementId,
      userId,
      verdict: v,
      reason: body.reason.trim(),
      at: new Date().toISOString(),
    }];

    const score = this.scoreForEvaluation(rows, ev);

    await this.evalRepo.update(id, {
      results: rows as any,
      conformityScore: score,
      summary: this.summaryForEvaluation(rows, ev, score),
      overrideAudit: audit as any,
      ncDrafts: this.buildNcDrafts(rows, ev) as any,
    });

    const snap = (ev.requestSnapshot ?? {}) as Record<string, unknown>;
    const meta = (snap.evaluationMetadata as Record<string, unknown> | undefined) ?? {};
    const label = this.resolveHumanProductName(snap, meta, null, undefined, undefined);
    await this.companyActivity.log(
      companyId,
      userId,
      'info',
      `Evaluation · Requirement verdict overridden: ${ev.isoStandard} (${label}), ${rows[ix].clauseReference} → ${v.replace(/_/g, ' ')}`,
      { evaluationId: id, clauseRef: rows[ix].clauseReference, resultId: rows[ix].resultId, requirementId: rows[ix].requirementId, verdict: v },
    );

    return this.getOne(id, companyId);
  }

  async confirmNcDrafts(id: string, companyId: string, userId: string) {
    const ev = await this.getOne(id, companyId);
    if (!ev.ncDrafts?.length) throw new BadRequestException('No NC drafts to confirm');

    for (const d of ev.ncDrafts) {
      const draft = d as Record<string, string>;
      const nc = this.ncRepo.create({
        companyId: ev.companyId,
        detectedBy: userId,
        source: NCSource.AI_EVALUATION,
        evaluationId: ev.id,
        title: draft.title,
        description: draft.description,
        classification: (draft.classification as NCClassification) || NCClassification.MAJOR,
        isoClause: draft.isoClause,
        isoStandard: draft.isoStandard,
      });
      await this.ncRepo.save(nc);
    }

    await this.evalRepo.update(id, {
      ncDrafts: [],
      ncDraftsConfirmedAt: new Date(),
    });

    const n = ev.ncDrafts.length;
    await this.companyActivity.log(
      companyId,
      userId,
      'success',
      `Evaluation · Confirmed NC drafts from AI: ${ev.isoStandard} (${n} non-conformit${n === 1 ? 'y' : 'ies'})`,
      { evaluationId: id, count: n },
    );

    return { message: 'Non-conformities created', evaluationId: id };
  }

  async retry(id: string, companyId: string, userId: string, actor: EvaluationActor) {
    const ev = await this.evalRepo.findOne({ where: { id, companyId } });
    if (!ev) throw new NotFoundException('Evaluation not found');
    if (ev.status !== EvaluationStatus.FAILED) throw new BadRequestException('Only failed evaluations can be retried');

    const snap = ev.requestSnapshot as Record<string, unknown> | null;
    if (!snap) throw new BadRequestException('Missing stored request payload for retry');
    const manifest = await this.validateAssessmentInputs(companyId, ev.isoDocumentId, ev.productDocumentId,
      Array.isArray(ev.evidenceDocumentIds) ? ev.evidenceDocumentIds : [], actor);

    // TypeORM QueryDeepPartialEntity omits `null` for nullable columns; runtime accepts null to clear.
    await this.evalRepo.update(id, {
      status: EvaluationStatus.QUEUED,
      errorMessage: '',
      completedAt: null,
      conformityScore: null,
      results: null,
      summary: '',
      ncDrafts: [],
      ncDraftsConfirmedAt: null,
      overrideAudit: [],
      evidenceDocumentIds: manifest.evidence.map((doc) => doc.id),
      requestSnapshot: { ...snap, evaluationActor: actor, evidenceManifest: manifest },
    } as any);

    await this.evalQueue.add('run', { evaluationId: id }, { removeOnComplete: true, attempts: 2 });

    await this.companyActivity.log(
      companyId,
      userId,
      'info',
      `Evaluation · Re-queued after failure: ${ev.isoStandard}`,
      { evaluationId: id },
    );

    return { job_id: id, evaluationId: id, status: 'Queued', message: 'Evaluation re-queued' };
  }

  private wrapPdfLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const normalized = (text || '').replace(/\r\n/g, '\n');
    const linesOut: string[] = [];
    for (const para of normalized.split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      let cur = '';
      for (const w of words) {
        const candidate = cur ? `${cur} ${w}` : w;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          cur = candidate;
          continue;
        }
        if (cur) {
          linesOut.push(cur);
          cur = '';
        }
        let rest = w;
        while (rest.length > 0) {
          if (font.widthOfTextAtSize(rest, size) <= maxWidth) {
            cur = rest;
            break;
          }
          let lo = 1;
          let hi = rest.length;
          while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            const slice = rest.slice(0, mid);
            if (font.widthOfTextAtSize(slice, size) <= maxWidth) lo = mid;
            else hi = mid - 1;
          }
          const take = Math.max(1, lo);
          linesOut.push(rest.slice(0, take));
          rest = rest.slice(take);
        }
      }
      if (cur) linesOut.push(cur);
      if (!words.length) linesOut.push('');
    }
    return linesOut.length ? linesOut : [''];
  }

  /** Excel "Report Ref" line: `Standard ref -- Product -- YYYY-MM-DD` (template row 5). */
  private buildExcelReportRefDashLine(ev: Evaluation, reportPack: ReportPack): string {
    const ref =
      reportPack.standard.reference && reportPack.standard.reference !== '-'
        ? reportPack.standard.reference
        : ev.isoStandard;
    const prod =
      reportPack.product.name && reportPack.product.name !== '-'
        ? reportPack.product.name
        : '-';
    const dSrc = ev.completedAt ?? ev.createdAt;
    const ds = dSrc ? new Date(dSrc).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    return `${ref} -- ${prod} -- ${ds}`;
  }

  private async exportExcelWith(bundle: EvaluationExportBundle): Promise<Buffer> {
    const { ev, lookup, reportPack } = bundle;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Qurelio';
    wb.created = new Date();

    const rows = this.normalizeResults(ev.results as any[]);

    // ── Colours ──────────────────────────────────────────────────
    const BRAND_PRIMARY = 'FF1A56DB';
    const BRAND_DARK = 'FF0F3460';
    const WHITE = 'FFFFFFFF';
    const TEXT_DARK = 'FF1E293B';
    const TEXT_MUTED = 'FF64748B';
    const GRID = 'FFE2E8F0';
    const PASS_BG = 'FFE8F5E9';
    const MINOR_BG = 'FFFFF8E1';
    const MAJOR_BG = 'FFFFEBEE';
    const NA_BG = 'FFF5F5F5';

    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: GRID } },
      left: { style: 'thin', color: { argb: GRID } },
      bottom: { style: 'thin', color: { argb: GRID } },
      right: { style: 'thin', color: { argb: GRID } },
    };

    // ═══════════════════════════════════════════════════════════════
    // SHEET 1: Clause-by-Clause Analysis (matches frontend UI)
    // ═══════════════════════════════════════════════════════════════
    const ws = wb.addWorksheet('Clause-by-Clause Analysis', {
      properties: { tabColor: { argb: BRAND_PRIMARY } },
    });
    const COL_COUNT = 15;

    ws.getColumn(1).width = 10;    // Clause #
    ws.getColumn(2).width = 28;    // Title
    ws.getColumn(3).width = 55;    // Summary
    ws.getColumn(4).width = 12;    // Applicable
    ws.getColumn(5).width = 14;    // Status
    ws.getColumn(6).width = 12;    // Confidence
    ws.getColumn(7).width = 55;    // Justification
    ws.getColumn(8).width = 55;    // Evidence Found
    ws.getColumn(9).width = 55;    // Gaps
    ws.getColumn(10).width = 55;   // Recommendations
    ws.getColumn(11).width = 30;   // Override
    ws.getColumn(12).width = 24;   // Decision Source
    ws.getColumn(13).width = 20;   // Evidence Coverage
    ws.getColumn(14).width = 80;   // Product-Standard-Regulation Comparison
    ws.getColumn(15).width = 50;   // Inconclusive Reason

    // ── Title row ────────────────────────────────────────────────
    const stdRef = reportPack.standard.reference && reportPack.standard.reference !== '-'
      ? reportPack.standard.reference : ev.isoStandard;
    ws.mergeCells(1, 1, 1, COL_COUNT);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = `CLAUSE-BY-CLAUSE ANALYSIS: ${stdRef}`;
    titleCell.font = { bold: true, size: 14, color: { argb: WHITE } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_DARK } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center', indent: 1 };
    ws.getRow(1).height = 32;
    for (let c = 1; c <= COL_COUNT; c++) { ws.getCell(1, c).fill = titleCell.fill; }

    ws.getRow(2).height = 6;

    // ── Header row ───────────────────────────────────────────────
    const headers = [
      { h: 'Clause #', w: 10 },
      { h: 'Title', w: 28 },
      { h: 'Requirement summary', w: 55 },
      { h: 'Applicable', w: 12 },
      { h: 'Result', w: 28 },
      { h: 'Confidence', w: 12 },
      { h: 'Decision explanation', w: 65 },
      { h: 'Evidence Found', w: 55 },
      { h: 'Missing information / gaps', w: 65 },
      { h: 'Recommended next step', w: 65 },
      { h: 'Override', w: 30 },
      { h: 'Decision Source', w: 24 },
      { h: 'Evidence Coverage', w: 20 },
      { h: 'Product-Standard-Regulation Comparison', w: 80 },
      { h: 'Inconclusive Reason', w: 50 },
    ];
    const hdrRow = 3;
    headers.forEach(({ h }, i) => {
      const c = ws.getCell(hdrRow, i + 1);
      c.value = h;
      c.font = { bold: true, size: 10, color: { argb: WHITE } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PRIMARY } };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = thinBorder;
    });
    ws.getRow(hdrRow).height = 26;

    // ── Data rows (mirrors frontend normalizeEvalRow) ────────────
    let dr = hdrRow + 1;
    for (const row of rows) {
      const u = this.effectiveStatus(row).toUpperCase();

      // The worksheet status is authoritative. Legacy verdicts remain available
      // for compatibility, but MISSING_INFO must never be turned into an NC.
      let statusKey = 'N/A';
      if (u === 'PASS') statusKey = 'CONFORMANT';
      else if (u === 'FAIL') statusKey = 'FAIL';
      else if (u === 'MISSING_INFO') statusKey = 'MISSING_INFO';
      else if (u === 'INCONCLUSIVE') statusKey = 'INCONCLUSIVE';
      else if (u === 'N/A') statusKey = 'N/A';

      const enhancement = this.pickClauseEnhancement(lookup, row.clauseReference);
      const structural = this.isStructuralClauseRow(row, enhancement);
      const statusLabel = this.displayStatus(row, structural);

      // Confidence (0-1, same normalisation as frontend)
      let conf = typeof row.confidence === 'number' ? row.confidence : parseFloat(String(row.confidence)) || 0;
      if (conf > 1) conf /= 100;

      // Applicable (same logic as frontend: defaults true)
      const applicable = this.applicabilityLabel(row, lookup);

      // Justification (from raw data or gaps, same as frontend)
      const justification = this.displayExplanation(row, structural) ||
        ((row as any).justification ?? (Array.isArray(row.gaps) && row.gaps.length ? row.gaps.join('; ') : '')) || '-';

      // Clean text: collapse whitespace, replace newlines with "; "
      const cleanText = (t: string) =>
        (t || '').replace(/\r?\n+/g, '; ').replace(/[ \t]+/g, ' ').trim();

      // Evidence found (first evidence excerpt, cleaned)
      const allEvChunks = this.deduplicateEvidence(row.supportingEvidence || []);
      const firstEv = allEvChunks[0];
      const evidenceFound = firstEv
        ? this.cleanEvidenceText(firstEv.excerpt || '').split('\n')[0].slice(0, 200)
        : '';

      // Supporting evidence text (deduplicated, cleaned, numbered)
      const evidenceChunks = allEvChunks.map(
        (x, i) => {
          const src = x.sourceLabel ? `[${x.sourceLabel}]` : '';
          const txt = this.cleanEvidenceText(x.excerpt || '');
          const firstLine = txt.split('\n')[0].trim().slice(0, 150);
          if (!firstLine) return null;
          return `${i + 1}. ${src ? `${src} ` : ''}${firstLine}`;
        },
      ).filter(Boolean);
      const evidenceText = evidenceChunks.join('\n');

      // Gaps
      const missing = Array.isArray(row.missingInformation) ? row.missingInformation : [];
      const gapsText = [...missing, ...(Array.isArray(row.gaps) ? row.gaps : [])].filter(Boolean).join('\n');

      // The first recommendation is a deterministic, status-specific next step.
      const suggestionsText = [this.displayRecommendedAction(row), ...(Array.isArray(row.suggestions) ? row.suggestions : [])].filter(Boolean).join('\n');

      // Override
      const overrideText = row.override
        ? `${row.override.verdict ? row.override.verdict.replace(/_/g, ' ') : ''}${row.override.reason ? `, ${row.override.reason}` : ''}`
        : '';

      const excelRow = ws.getRow(dr);
      excelRow.getCell(1).value = row.clauseReference || '-';
      excelRow.getCell(2).value = row.clauseTitle || `Clause ${row.clauseReference || '-'}`;
      excelRow.getCell(3).value = cleanText(row.clauseSummary || row.clauseTextExcerpt || '');
      excelRow.getCell(4).value = applicable;
      excelRow.getCell(5).value = statusLabel;
      excelRow.getCell(6).value = statusKey !== 'N/A' ? `${(conf * 100).toFixed(0)}%` : '-';
      excelRow.getCell(7).value = justification;
      excelRow.getCell(8).value = evidenceText || '-';
      excelRow.getCell(9).value = gapsText || '-';
      excelRow.getCell(10).value = suggestionsText || '-';
      excelRow.getCell(11).value = overrideText || '-';
      excelRow.getCell(12).value = (row as any).decisionSource || (row as any).decision_source || '-';
      excelRow.getCell(13).value = (row as any).evidenceCoverage || (row as any).evidence_coverage || '-';
      excelRow.getCell(14).value = JSON.stringify(this.clientFacingComparison((row as any).productStandardComparison || (row as any).product_standard_comparison || {}, row, structural));
      excelRow.getCell(15).value = (row as any).inconclusiveReason || (row as any).inconclusive_reason || '';

      // Row background colour by status
      let bg = WHITE;
      if (statusKey === 'CONFORMANT') bg = PASS_BG;
      else if (statusKey === 'FAIL') bg = MAJOR_BG;
      else if (statusKey === 'MISSING_INFO') bg = MINOR_BG;
      else bg = NA_BG;

      for (let c = 1; c <= COL_COUNT; c++) {
        const cell = excelRow.getCell(c);
        cell.font = { size: 10, color: { argb: TEXT_DARK } };
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border = thinBorder;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      }

      // Status cell bold colour
      const stCell = excelRow.getCell(5);
      stCell.alignment = { vertical: 'middle', horizontal: 'center' };
      if (statusKey === 'CONFORMANT') {
        stCell.font = { bold: true, size: 10, color: { argb: 'FF16A34A' } };
      } else if (statusKey === 'MAJOR_NC' || statusKey === 'CRITICAL_NC') {
        stCell.font = { bold: true, size: 10, color: { argb: 'FFDC2626' } };
      } else if (statusKey === 'MINOR_NC') {
        stCell.font = { bold: true, size: 10, color: { argb: 'FFCA8A04' } };
      }

      // Confidence & applicable centered
      excelRow.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
      excelRow.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
      excelRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

      dr += 1;
    }

    // ── Freeze + auto-filter ─────────────────────────────────────
    if (rows.length) {
      ws.autoFilter = { from: { row: hdrRow, column: 1 }, to: { row: hdrRow, column: COL_COUNT } };
      ws.views = [{ state: 'frozen', ySplit: hdrRow }];
    }

    ws.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, orientation: 'landscape' };

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf as ArrayBuffer);
  }

  private async exportPdfWith(bundle: EvaluationExportBundle): Promise<Buffer> {
    const { ev, lookup, reportRef, reportPack } = bundle;
    const companyNamePdf =
      reportPack.company.companyName && reportPack.company.companyName !== '-'
        ? reportPack.company.companyName
        : 'Company';
    const w = await createBrandedPdfWriter({
      companyName: companyNamePdf,
      reportTitle: 'Conformity report',
    });

    const drawBlock = (text: string, size: number, bold: boolean, lineGap = 3) => {
      brandedDrawBlock(w, text, size, bold, lineGap);
    };
    const bar = (label: string) => brandedSectionBar(w, label);
    const ySpacer = (n: number) => { w.y -= n; };

    drawBlock(reportPack.standard.reference, 12, true, 4);
    drawBlock(reportPack.standard.title, 11, false, 3);
    ySpacer(8);

    const preparedByPdf = this.formatPreparedBy(ev, reportPack);

    bar('Report information');
    drawBlock(`Report reference: ${reportRef}`, 10, false);
    drawBlock(`Company: ${companyNamePdf}`, 10, false);
    drawBlock(`Company ID: ${ev.companyId}`, 10, false);
    drawBlock(`Prepared by: ${preparedByPdf}`, 10, false);
    drawBlock(`Status: ${ev.status}`, 10, false);
    drawBlock(
      `Date of issue: ${(ev.completedAt ?? ev.createdAt) ? new Date(ev.completedAt ?? ev.createdAt).toLocaleDateString() : '-'}`,
      10,
      false,
    );
    drawBlock(`Assessment score: ${ev.conformityScore != null ? `${ev.conformityScore.toFixed(1)}%` : 'Withheld - review required'}`, 10, false);
    ySpacer(4);

    bar('Standards');
    drawBlock(`Reference: ${reportPack.standard.reference}`, 10, false);
    drawBlock(`Title: ${reportPack.standard.title}`, 10, false);
    drawBlock(`Version: ${reportPack.standard.version}`, 10, false);
    drawBlock(`Effective date: ${reportPack.standard.effectiveDate}`, 10, false);
    ySpacer(4);

    bar('Product');
    drawBlock(`Name: ${reportPack.product.name}`, 10, false);
    drawBlock(`Category: ${reportPack.product.category}`, 10, false);
    drawBlock(`Product file added: ${this.formatProductFileAddedDisplay(reportPack)}`, 10, false);
    ySpacer(8);

    drawBlock('Executive summary', 13, true, 4);
    drawBlock(ev.summary || '-', 10, false);
    ySpacer(10);

    const stdLine = `${reportPack.standard.reference}: ${reportPack.standard.title}`;
    bar('Clauses / Requirements');
    drawBlock(stdLine, 10, true, 3);

    const rows = this.normalizeResults(ev.results as any[]);
    for (const r of rows) {
      const enh = this.pickClauseEnhancement(lookup, r.clauseReference);
      const structural = this.isStructuralClauseRow(r, enh);
      const eff = this.effectiveVerdict(r);
      const reqText = [enh.title, enh.summary, r.clauseTextExcerpt].filter((x) => this.str(x)).join('\n\n');
      ySpacer(4);
      drawBlock(`Clause ${r.clauseReference} · Result: ${this.displayStatus(r, structural)}`, 11, true, 3);
      drawBlock(`Requirement / Test:\n${reqText || '-'}`, 10, false, 2);
      drawBlock(`Result / Remark:\n${this.buildJustification(r, structural)}`, 10, false, 2);
    }

    return finalizeBrandedPdf(w);
  }

  async exportExcel(id: string, companyId: string): Promise<Buffer> {
    return this.exportExcelWith(await this.loadEvaluationExportBundle(id, companyId));
  }

  async exportPdf(id: string, companyId: string): Promise<Buffer> {
    return this.exportPdfWith(await this.loadEvaluationExportBundle(id, companyId));
  }

  private async exportCsvWith(bundle: EvaluationExportBundle): Promise<Buffer> {
    const { ev, lookup, reportPack } = bundle;
    const rows = this.normalizeResults(ev.results as any[]);

    const csvEscape = (text: string): string => {
      const t = (text || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (t.includes(',') || t.includes('"') || t.includes('\n')) {
        return `"${t.replace(/"/g, '""')}"`;
      }
      return t;
    };

    const stdRef = reportPack.standard.reference && reportPack.standard.reference !== '-'
      ? reportPack.standard.reference : ev.isoStandard;
    const prodName = reportPack.product.name && reportPack.product.name !== '-'
      ? reportPack.product.name : '-';
    const dateStr = (ev.completedAt ?? ev.createdAt)
      ? new Date(ev.completedAt ?? ev.createdAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const header = [
      'Evaluation ID',
      'Report Reference',
      'Standard',
      'Product',
      'Company',
      'Date',
      'Overall Score (%)',
      'Executive Summary',
    ];
    const metaRow = [
      csvEscape(ev.id),
      csvEscape(`${stdRef} -- ${prodName} -- ${dateStr}`),
      csvEscape(stdRef),
      csvEscape(prodName),
      csvEscape(reportPack.company.companyName || '-'),
      csvEscape(dateStr),
      csvEscape(String(ev.conformityScore != null ? ev.conformityScore.toFixed(1) : '-')),
      csvEscape(ev.summary || '-'),
    ];

    const detailHeaders = [
      'Clause #',
      'Clause Title',
      'Clause Summary',
      'Applicable',
      'Result',
      'Result explanation',
      'Confidence (%)',
      'Justification',
      'Evidence Found',
      'Gaps',
      'Recommendations',
      'Override Verdict',
      'Override Reason',
      'Override Date',
      'Reasoning',
      'Requirement Elements',
      'Evidence Assessment',
      'Product-Standard-Regulation Comparison',
      'Inconclusive Reason',
    ];

    const lines: string[] = [];
    lines.push(header.map(csvEscape).join(','));
    lines.push(metaRow.join(','));
    lines.push('');
    lines.push(detailHeaders.map(csvEscape).join(','));

    for (const r of rows) {
      const u = this.effectiveStatus(r).toUpperCase();

      let statusKey = 'N/A';
      if (u === 'PASS') statusKey = 'CONFORMANT';
      else if (u === 'FAIL') statusKey = 'FAIL';
      else if (u === 'MISSING_INFO') statusKey = 'MISSING_INFO';
      else if (u === 'INCONCLUSIVE') statusKey = 'INCONCLUSIVE';
      else if (u === 'N/A') statusKey = 'N/A';

      const enh = this.pickClauseEnhancement(lookup, r.clauseReference);
      const structural = this.isStructuralClauseRow(r, enh);
      const statusLabel = this.displayStatus(r, structural);

      let conf = typeof r.confidence === 'number' ? r.confidence : parseFloat(String(r.confidence)) || 0;
      if (conf > 1) conf /= 100;

      const applicable = this.applicabilityLabel(r, lookup);

      const allEvChunks = this.deduplicateEvidence(r.supportingEvidence || []);
      const firstEv = allEvChunks[0];
      const evidenceFound = firstEv
        ? this.cleanEvidenceText(firstEv.excerpt || '').split('\n')[0].slice(0, 200)
        : '';

      const evidenceBullets = allEvChunks.map(
        (x, i) => {
          const src = x.sourceLabel ? `[${x.sourceLabel}]` : '';
          const txt = this.cleanEvidenceText(x.excerpt || '');
          const firstLine = txt.split('\n')[0].trim().slice(0, 200);
          if (!firstLine) return null;
          return `${i + 1}. ${src ? `${src} ` : ''}${firstLine}`;
        },
      ).filter(Boolean);
      const allEvidenceText = evidenceBullets.join(' | ');

      const gapsText = [
        ...(Array.isArray((r as any).missingInformation) ? (r as any).missingInformation : []),
        ...(Array.isArray(r.gaps) ? r.gaps.map((gap) => this.str(gap).replace(/^\s*(?:PASS|FAIL|N\/?A|MISSING[_ ]INFO|INCONCLUSIVE)\s*:\s*/i, '')) : []),
      ].filter(Boolean).join('; ');
      const suggestionsText = [this.displayRecommendedAction(r), ...(Array.isArray(r.suggestions) ? r.suggestions : [])].filter(Boolean).join('; ');
      const justification = this.buildJustification(r, structural) || '-';

      const reqElements = (r as any).requirementElements || (r as any).requirement_elements;
      const reqElementsText = Array.isArray(reqElements) && reqElements.length
        ? reqElements.map((e: any) => `${e.element || ''}: ${e.status || ''}`).join('; ')
        : '';
      const evidenceAssessment = (r as any).evidenceAssessment || (r as any).evidence_assessment;
      const evidenceAssessText = Array.isArray(evidenceAssessment) && evidenceAssessment.length
        ? evidenceAssessment.map((e: any) => `#${e.chunk_id || ''} ${e.relevance || ''} ${e.supports ? 'supports' : 'gaps'}`).join('; ')
        : '';
      const reasoning = (r as any).reasoning || '';

      const overrideVerdict = r.override?.verdict ? r.override.verdict.replace(/_/g, ' ') : '';
      const overrideReason = r.override?.reason || '';
      const overrideDate = r.override?.at ? new Date(r.override.at).toISOString().slice(0, 10) : '';

      const detailRow = [
        csvEscape(r.clauseReference || ''),
        csvEscape(r.clauseTitle || ''),
        csvEscape(r.clauseSummary || ''),
        csvEscape(applicable),
        csvEscape(statusLabel),
        csvEscape(this.displayExplanation(r, structural)),
        csvEscape(statusKey !== 'N/A' ? `${conf.toFixed(0)}` : '-'),
        csvEscape(justification),
        csvEscape(evidenceFound),
        csvEscape(gapsText),
        csvEscape(suggestionsText),
        csvEscape(overrideVerdict || '-'),
        csvEscape(overrideReason || '-'),
        csvEscape(overrideDate || '-'),
        csvEscape(reasoning),
        csvEscape(reqElementsText),
        csvEscape(evidenceAssessText),
        csvEscape(JSON.stringify(this.clientFacingComparison((r as any).productStandardComparison || (r as any).product_standard_comparison || {}, r, structural))),
        csvEscape((r as any).inconclusiveReason || (r as any).inconclusive_reason || ''),
      ];
      lines.push(detailRow.join(','));
    }

    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  async export(id: string, companyId: string, format: string): Promise<{ body: Buffer; contentType: string; filename: string }> {
    const bundle = await this.loadEvaluationExportBundle(id, companyId);
    const f = (format || 'xlsx').toLowerCase();
    if (f === 'pdf' || f === 'application/pdf') {
      const body = await this.exportPdfWith(bundle);
      return {
        body,
        contentType: 'application/pdf',
        filename: `${bundle.filenameBase}.pdf`,
      };
    }
    if (f === 'csv') {
      const body = await this.exportCsvWith(bundle);
      return {
        body,
        contentType: 'text/csv; charset=utf-8',
        filename: `${bundle.filenameBase}.csv`,
      };
    }
    const body = await this.exportExcelWith(bundle);
    return {
      body,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${bundle.filenameBase}.xlsx`,
    };
  }

  /**
   * Permanently remove an evaluation. Linked NCs keep their record but are detached from this evaluation.
   */
  async remove(id: string, companyId: string, userId: string): Promise<void> {
    const ev = await this.evalRepo.findOne({ where: { id, companyId } });
    if (!ev) throw new NotFoundException('Evaluation not found');
    await this.companyActivity.log(
      companyId,
      userId,
      'warning',
      `Evaluation · Permanently deleted: ${ev.isoStandard}`,
      { evaluationId: id },
    );
    await this.ncRepo
      .createQueryBuilder()
      .update(NonConformity)
      .set({ evaluationId: null })
      .where('company_id = :companyId', { companyId })
      .andWhere('evaluation_id = :id', { id })
      .execute();
    await this.evalRepo.delete({ id, companyId });
  }
}
