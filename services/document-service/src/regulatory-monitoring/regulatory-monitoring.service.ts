import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosResponse } from 'axios';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Product } from '../database/entities/document.entity';
import { ProductRegulatoryAssessment } from '../database/entities/product-regulatory-assessment.entity';
import { RegulatoryChangeEvent } from '../database/entities/regulatory-change-event.entity';
import { RegulatoryChangeEventReview } from '../database/entities/regulatory-change-event-review.entity';
import { RegulatoryMonitorSource } from '../database/entities/regulatory-monitor-source.entity';
import { RegulatorySourceCheck } from '../database/entities/regulatory-source-check.entity';
import sourceRegistry from './source-registry.json';

const DEFAULT_INTERVAL_HOURS = 168; // Seven days, as requested.
const TICK_MS = 60_000;
const requestedBatch = Number(process.env.REGULATORY_MONITOR_BATCH_SIZE || 10);
const requestedWorkers = Number(process.env.REGULATORY_MONITOR_CONCURRENCY || 4);
const MAX_PER_TICK = Number.isFinite(requestedBatch) ? Math.max(1, Math.min(50, requestedBatch)) : 10;
const WORKERS = Number.isFinite(requestedWorkers) ? Math.max(1, Math.min(5, requestedWorkers)) : 4;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_SNAPSHOT_CHARS = 220_000;
const MAX_LINKS = 500;

interface RegistrySource {
  sourceId: string; regionGroup: string; jurisdiction: string; regulatoryDomain: string;
  sourceName: string; officialUrl: string; publisherType: string; sourceClass: string;
  contentToMonitor: string; preferredDetectionMethod: string; suggestedCheckCadence: string;
  priority: string; automationNotes: string; accessLicensingNotes: string;
  recommendedAiUse: string; verificationStatus: string; defaultCheckIntervalHours?: number;
}

interface LinkRecord { url: string; text: string }
interface Snapshot {
  body: Buffer;
  contentType: string;
  finalUrl: string;
  httpStatus: number;
  etag?: string;
  lastModified?: string;
  notModified: boolean;
}
interface CanonicalContent { snapshot: string; links: LinkRecord[]; changeTypes: string[]; hash: string; excerpt: string }

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Math.min(0x10ffff, Number(code) || 32)));
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ')).replace(/[\t\r\n ]+/g, ' ').trim();
}

function getTag(chunk: string, tags: string[]): string {
  for (const tag of tags) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = chunk.match(re);
    if (match) return stripTags(match[1]).slice(0, 600);
  }
  return '';
}

function extractFeedEntries(body: string): { text: string; links: LinkRecord[] } | null {
  const blocks = body.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi);
  if (!blocks?.length) return null;
  const rows: string[] = [];
  const links: LinkRecord[] = [];
  for (const block of blocks.slice(0, 3000)) {
    const title = getTag(block, ['title']);
    const date = getTag(block, ['pubDate', 'published', 'updated', 'date', 'dc:date']);
    const id = getTag(block, ['guid', 'id']);
    const linkText = getTag(block, ['link']);
    const linkAttr = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] || '';
    const link = (linkAttr || linkText || id).trim();
    const summary = getTag(block, ['description', 'summary', 'content:encoded', 'content']);
    if (link && /^https?:\/\//i.test(link)) links.push({ url: link.slice(0, 2048), text: title || link });
    rows.push([title, date, id, link, summary].filter(Boolean).join(' | '));
  }
  return { text: rows.join('\n'), links: links.slice(0, MAX_LINKS) };
}

function extractHtmlLinks(html: string, baseUrl: string): LinkRecord[] {
  const links: LinkRecord[] = [];
  const regex = /<a\b([^>]*?)>([\s\S]*?)<\/a\s*>/gi;
  let match: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((match = regex.exec(html)) && links.length < MAX_LINKS) {
    const href = match[1].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2]?.trim();
    if (!href || /^(?:#|mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    try {
      const absolute = new URL(href, baseUrl);
      if (!['https:', 'http:'].includes(absolute.protocol)) continue;
      absolute.hash = '';
      const url = absolute.toString();
      if (seen.has(url)) continue;
      seen.add(url);
      links.push({ url, text: stripTags(match[2]).slice(0, 200) || url });
    } catch { /* Ignore malformed links in public-source markup. */ }
  }
  return links.sort((a, b) => a.url.localeCompare(b.url)).slice(0, MAX_LINKS);
}

function canonicalize(body: Buffer, contentType: string, finalUrl: string): CanonicalContent {
  const isPdf = /application\/pdf/i.test(contentType) || /\.pdf(?:$|[?#])/i.test(finalUrl);
  if (isPdf) {
    const snapshot = `BINARY_DOCUMENT\ncontent-type=${contentType}\nbytes=${body.length}\nsha256=${sha256(body)}`;
    return {
      snapshot,
      links: [],
      changeTypes: ['BINARY_DOCUMENT_CONTENT'],
      hash: sha256(snapshot),
      excerpt: 'The bytes of a linked/source document changed. The monitor does not claim to understand the legal meaning of the document.',
    };
  }

  const raw = body.toString('utf8').slice(0, 3_000_000);
  const feed = extractFeedEntries(raw);
  let visibleText: string;
  let links: LinkRecord[];
  const changeTypes: string[] = [];

  if (feed) {
    visibleText = feed.text;
    links = feed.links;
    changeTypes.push('FEED_ENTRIES_CHANGED');
  } else if (/html/i.test(contentType) || /<html|<!doctype html/i.test(raw.slice(0, 1000))) {
    const html = raw
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|canvas|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<(nav|footer|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
    visibleText = stripTags(html).slice(0, MAX_SNAPSHOT_CHARS);
    links = extractHtmlLinks(raw, finalUrl);
    changeTypes.push('PAGE_CONTENT_CHANGED');
  } else {
    visibleText = stripTags(raw).slice(0, MAX_SNAPSHOT_CHARS);
    links = [];
    changeTypes.push('DOCUMENT_CONTENT_CHANGED');
  }

  const normalizedText = visibleText.replace(/[\u200b\u200c\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_SNAPSHOT_CHARS);
  const linkFingerprint = links.map((link) => `${link.url}\t${link.text}`).join('\n');
  const snapshot = `${normalizedText}\n---LINK-INVENTORY---\n${linkFingerprint}`.slice(0, MAX_SNAPSHOT_CHARS + 120_000);
  if (links.length) changeTypes.push('LINK_INVENTORY_TRACKED');
  return {
    snapshot,
    links,
    changeTypes,
    hash: sha256(snapshot),
    excerpt: normalizedText.slice(0, 1800) || 'The monitored source content or link inventory changed; inspect the official source to determine its regulatory significance.',
  };
}

function isPrivateAddress(address: string): boolean {
  const ipVersion = isIP(address);
  if (ipVersion === 4) {
    const p = address.split('.').map(Number);
    if (p.length !== 4 || p.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    // Conservative global-unicast allow-list by excluding private, special-use,
    // documentation, benchmarking, multicast and reserved IPv4 ranges.
    return p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && (p[1] === 168 || p[1] === 0 || (p[1] === 88 && p[2] === 99))) ||
      (p[0] === 198 && (p[1] === 18 || p[1] === 19 || (p[1] === 51 && p[2] === 100))) ||
      (p[0] === 203 && p[1] === 0 && p[2] === 113) ||
      (p[0] === 192 && p[1] === 0 && p[2] === 2);
  }
  if (ipVersion === 6) {
    const normalized = address.toLowerCase().split('%')[0];
    // Only allow global-unicast 2000::/3. This safely rejects loopback,
    // unspecified, IPv4-mapped, ULA, link-local, multicast and other special
    // ranges, including mapped IPv4 forms that bypass dotted-address checks.
    if (!/^[23]/.test(normalized)) return true;
    // Documentation and benchmarking ranges must not be treated as public targets.
    if (normalized.startsWith('2001:db8:') || normalized.startsWith('2001:10:') || normalized.startsWith('2002:')) return true;
    return false;
  }
  return true;
}

async function assertSafePublicUrl(value: string): Promise<URL> {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('Invalid source URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('Source URL must be public HTTPS without embedded credentials');
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Private or local source hosts are not allowed');
  }
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error('Private source IPs are not allowed');
  } else {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
      throw new Error('Source host does not resolve exclusively to public addresses');
    }
  }
  return parsed;
}

@Injectable()
export class RegulatoryMonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RegulatoryMonitoringService.name);
  private timer?: ReturnType<typeof setInterval>;
  private workerRunning = false;

  constructor(
    @InjectRepository(RegulatoryMonitorSource) private readonly sources: Repository<RegulatoryMonitorSource>,
    @InjectRepository(RegulatorySourceCheck) private readonly checks: Repository<RegulatorySourceCheck>,
    @InjectRepository(RegulatoryChangeEvent) private readonly events: Repository<RegulatoryChangeEvent>,
    @InjectRepository(RegulatoryChangeEventReview) private readonly eventReviews: Repository<RegulatoryChangeEventReview>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductRegulatoryAssessment) private readonly assessments: Repository<ProductRegulatoryAssessment>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      await this.seedRegistry();
      // Recover locks left behind if a previous process stopped mid-request.
      await this.recoverStuckChecks();
      const configuredTickMs = Number(this.config.get('REGULATORY_MONITOR_TICK_MS') || TICK_MS);
      const tickMs = Number.isFinite(configuredTickMs) ? Math.max(15_000, configuredTickMs) : TICK_MS;
      this.timer = setInterval(() => { void this.processDueSources(); }, tickMs);
      // First baseline starts automatically; it is batched to avoid hammering 181 authorities at once.
      void this.processDueSources();
      this.logger.log(`Regulatory source monitor initialized with ${((sourceRegistry as any).sources || []).length} registry entries`);
    } catch (error: any) {
      this.logger.error(`Could not initialize regulatory source monitor: ${error?.message || error}`);
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async seedRegistry() {
    const registrySources = ((sourceRegistry as any).sources || []) as RegistrySource[];
    const payload = registrySources.map((row) => ({
      sourceId: row.sourceId,
      regionGroup: row.regionGroup,
      jurisdiction: row.jurisdiction,
      regulatoryDomain: row.regulatoryDomain,
      sourceName: row.sourceName,
      officialUrl: row.officialUrl,
      publisherType: row.publisherType,
      sourceClass: row.sourceClass,
      contentToMonitor: row.contentToMonitor,
      preferredDetectionMethod: row.preferredDetectionMethod,
      suggestedCheckCadence: row.suggestedCheckCadence,
      priority: row.priority,
      automationNotes: row.automationNotes,
      accessLicensingNotes: row.accessLicensingNotes,
      recommendedAiUse: row.recommendedAiUse,
      verificationStatus: row.verificationStatus,
    }));
    if (!payload.length) return;
    const existing = await this.sources.find();
    const existingById = new Map(existing.map((source) => [source.sourceId, source]));
    const endpointChanged = new Set<string>();
    for (const row of payload) {
      const prior = existingById.get(row.sourceId);
      if (prior && prior.officialUrl !== row.officialUrl) {
        endpointChanged.add(row.sourceId);
        await this.sources.update({ sourceId: row.sourceId }, {
          lastContentHash: null,
          lastContentSnapshot: null,
          lastLinkInventory: [],
          lastEtag: null,
          lastModifiedHeader: null,
          lastCheckedAt: null,
          lastAttemptAt: null,
          lastHttpStatus: null,
          lastError: null,
          lastFailureCount: 0,
          checkStatus: 'NEVER_CHECKED',
          nextCheckAt: new Date(),
        });
        this.logger.warn(`Monitoring endpoint changed for ${row.sourceId}; its baseline was reset and must be recaptured.`);
      }
    }
    await this.sources.upsert(payload, ['sourceId']);

    // The workbook's suggested cadence is the default, bounded to at most weekly
    // monitoring. Feed-driven/hourly sources are checked faster where our worker's
    // minimum granularity permits. Explicit admin overrides survive restarts.
    for (const row of payload) {
      const prior = existingById.get(row.sourceId);
      if (prior?.checkIntervalManuallyConfigured) continue;
      const recommendedHours = this.recommendedIntervalHours(row.suggestedCheckCadence);
      const intervalChanged = !prior || prior.checkIntervalHours !== recommendedHours || endpointChanged.has(row.sourceId);
      if (!intervalChanged) continue;
      const lastCheckedAt = endpointChanged.has(row.sourceId) ? null : prior?.lastCheckedAt || null;
      const nextCheckAt = lastCheckedAt
        ? new Date(new Date(lastCheckedAt).getTime() + recommendedHours * 3_600_000)
        : new Date();
      await this.sources.update({ sourceId: row.sourceId }, {
        checkIntervalHours: recommendedHours,
        nextCheckAt,
      });
    }
  }

  private async recoverStuckChecks() {
    const expired = new Date(Date.now() - 30 * 60_000);
    await this.sources.createQueryBuilder()
      .update(RegulatoryMonitorSource)
      .set({
        checkStatus: 'ERROR',
        lastError: 'The previous monitoring process stopped during a check; the source was released for retry.',
        nextCheckAt: new Date(),
      })
      .where('check_status = :status AND last_attempt_at < :expired', { status: 'CHECKING', expired })
      .execute();
  }

  private priorityRank(priority: string): number {
    return priority === 'P0' ? 0 : priority === 'P1' ? 1 : priority === 'P2' ? 2 : 3;
  }

  private async processDueSources() {
    if (this.workerRunning) return;
    this.workerRunning = true;
    try {
      const now = new Date();
      const due = await this.sources.createQueryBuilder('source')
        .where('source.enabled = true')
        .andWhere('(source.next_check_at IS NULL OR source.next_check_at <= :now)', { now })
        .andWhere('source.check_status <> :checking', { checking: 'CHECKING' })
        .orderBy("CASE source.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END", 'ASC')
        .addOrderBy('source.next_check_at', 'ASC', 'NULLS FIRST')
        .take(Math.max(1, Math.min(50, MAX_PER_TICK)))
        .getMany();
      if (!due.length) return;

      const claimed: RegulatoryMonitorSource[] = [];
      for (const source of due) {
        const result = await this.sources.createQueryBuilder()
          .update(RegulatoryMonitorSource)
          .set({ checkStatus: 'CHECKING', lastAttemptAt: new Date(), lastError: null })
          .where('source_id = :id AND check_status <> :checking AND enabled = true', { id: source.sourceId, checking: 'CHECKING' })
          .andWhere('(next_check_at IS NULL OR next_check_at <= :now)', { now })
          .execute();
        if (result.affected) claimed.push({ ...source, checkStatus: 'CHECKING', lastAttemptAt: now });
      }
      let next = 0;
      const workers = Array.from({ length: Math.min(WORKERS, claimed.length) }, async () => {
        while (next < claimed.length) {
          const index = next++;
          await this.checkOne(claimed[index]);
        }
      });
      await Promise.all(workers);
    } catch (error: any) {
      this.logger.error(`Regulatory source polling cycle failed: ${error?.message || error}`);
    } finally {
      this.workerRunning = false;
    }
  }

  private pickSourceMatch(sourceUrl: string, candidates: RegulatoryMonitorSource[]): RegulatoryMonitorSource | null {
    let parsed: URL;
    try { parsed = new URL(sourceUrl); } catch { return null; }
    if (parsed.protocol !== 'https:') return null;
    const matches: Array<{ source: RegulatoryMonitorSource; pathLength: number }> = [];
    for (const source of candidates) {
      try {
        const candidate = new URL(source.officialUrl);
        if (candidate.protocol !== 'https:' || candidate.hostname.toLowerCase() !== parsed.hostname.toLowerCase()) continue;
        const sourcePath = candidate.pathname.replace(/\/$/, '') || '/';
        const requestPath = parsed.pathname;
        const prefixMatch = sourcePath === '/' || requestPath === sourcePath || requestPath.startsWith(`${sourcePath}/`);
        if (prefixMatch) matches.push({ source, pathLength: sourcePath === '/' ? 0 : sourcePath.length });
      } catch { /* Ignore malformed source registry URLs. */ }
    }
    matches.sort((a, b) => b.pathLength - a.pathLength);
    return matches[0]?.source || null;
  }

  private async sourceMatchesUrl(sourceUrl: string): Promise<RegulatoryMonitorSource | null> {
    const candidates = await this.sources.createQueryBuilder('source')
      .select(['source.sourceId', 'source.officialUrl', 'source.lastContentHash', 'source.lastCheckedAt', 'source.lastAttemptAt', 'source.checkStatus', 'source.checkIntervalHours'])
      .getMany();
    return this.pickSourceMatch(sourceUrl, candidates);
  }

  private async relevantSourceIdsForCompany(companyId: string): Promise<string[]> {
    if (!companyId) return [];
    const records = await this.assessments.find({
      where: { companyId, sourceUrl: Not(IsNull()) },
      order: { reviewedAt: 'DESC' },
    });
    const sourceIds = new Set<string>();
    const legacyUrlRecords: ProductRegulatoryAssessment[] = [];
    for (const record of records) {
      if (record.monitoredSourceId) sourceIds.add(record.monitoredSourceId);
      else if (record.sourceUrl) legacyUrlRecords.push(record);
    }
    if (legacyUrlRecords.length) {
      // Resolve all legacy URLs against one source-list query, avoiding an N+1 database pattern.
      const candidates = await this.sources.createQueryBuilder('source')
        .select(['source.sourceId', 'source.officialUrl'])
        .getMany();
      for (const record of legacyUrlRecords) {
        if (!record.sourceUrl) continue;
        const match = this.pickSourceMatch(record.sourceUrl, candidates);
        if (match) sourceIds.add(match.sourceId);
      }
    }
    return Array.from(sourceIds);
  }

  private async latestCompanyReviews(companyId: string, eventIds: string[]): Promise<Map<string, RegulatoryChangeEventReview>> {
    if (!companyId || !eventIds.length) return new Map();
    const reviews = await this.eventReviews.find({
      where: { companyId, eventId: In(eventIds) },
      order: { reviewedAt: 'DESC' },
    });
    const latest = new Map<string, RegulatoryChangeEventReview>();
    for (const review of reviews) {
      if (!latest.has(review.eventId)) latest.set(review.eventId, review);
    }
    return latest;
  }

  private presentEventForCompany(event: RegulatoryChangeEvent, review?: RegulatoryChangeEventReview | null) {
    // The source-change event is global; reviewer notes and impact decisions are company-scoped.
    // Do not return legacy global reviewedBy/reviewNote fields, which could expose another tenant's data.
    const {
      reviewedBy: _legacyReviewedBy,
      reviewedAt: _legacyReviewedAt,
      reviewNote: _legacyReviewNote,
      ...safeEvent
    } = event;
    return {
      ...safeEvent,
      state: review?.state || 'NEEDS_REVIEW',
      sourceChangeState: 'POTENTIAL_CHANGE',
      reviewedBy: review ? `${review.reviewedBy} (${review.reviewerRole})` : null,
      reviewedAt: review?.reviewedAt ?? null,
      reviewNote: review?.reviewNote ?? null,
    };
  }

  async summary(companyId: string) {
    const now = new Date();
    const [totalSources, enabledSources, sourcesWithErrors, dueSources] = await Promise.all([
      this.sources.count(),
      this.sources.count({ where: { enabled: true } }),
      this.sources.count({ where: { checkStatus: 'ERROR', enabled: true } }),
      this.sources.createQueryBuilder('source').where('source.enabled = true')
        .andWhere('(source.next_check_at IS NULL OR source.next_check_at <= :now)', { now })
        .andWhere('source.check_status <> :checking', { checking: 'CHECKING' }).getCount(),
    ]);
    const lastCheck = await this.checks.createQueryBuilder('check')
      .select('MAX(check.completed_at)', 'lastCheckedAt')
      .where('check.status <> :error', { error: 'ERROR' })
      .getRawOne();

    const sourceIds = await this.relevantSourceIdsForCompany(companyId);
    let changeEventsNeedingReview = 0;
    let actionRequiredReviews = 0;
    if (sourceIds.length) {
      const companyEvents = await this.events.find({ where: { sourceId: In(sourceIds) }, order: { detectedAt: 'DESC' } });
      const reviewMap = await this.latestCompanyReviews(companyId, companyEvents.map((event) => event.id));
      for (const event of companyEvents) {
        const review = reviewMap.get(event.id);
        if (!review) changeEventsNeedingReview += 1;
        else if (review.state === 'ACTION_REQUIRED') actionRequiredReviews += 1;
      }
    }
    return {
      totalSources, enabledSources, sourcesWithErrors, changeEventsNeedingReview, actionRequiredReviews,
      dueSources, lastCheckedAt: lastCheck?.lastCheckedAt ?? null, defaultIntervalHours: DEFAULT_INTERVAL_HOURS,
    };
  }

  async listSources(
    query: { search?: string; jurisdiction?: string; priority?: string; status?: string; limit?: string; offset?: string },
    companyId?: string,
  ) {
    const limit = Math.max(1, Math.min(250, Number(query.limit || 100)));
    const offset = Math.max(0, Number(query.offset || 0));
    const qb = this.sources.createQueryBuilder('source');
    if (query.search?.trim()) {
      const term = `%${query.search.trim().replace(/[%_]/g, '\\$&')}%`;
      qb.andWhere('(source.source_name ILIKE :term OR source.official_url ILIKE :term OR source.regulatory_domain ILIKE :term OR source.source_id ILIKE :term OR source.jurisdiction ILIKE :term)', { term });
    }
    if (query.jurisdiction) qb.andWhere('source.jurisdiction = :jurisdiction', { jurisdiction: query.jurisdiction });
    if (query.priority) qb.andWhere('source.priority = :priority', { priority: query.priority });
    if (query.status === 'ERROR') qb.andWhere('source.check_status = :status', { status: 'ERROR' });
    else if (query.status === 'CHANGED') qb.andWhere('source.check_status = :status', { status: 'CHANGE_DETECTED' });
    else if (query.status === 'UNCHECKED') qb.andWhere('source.last_checked_at IS NULL');
    else if (query.status === 'DISABLED') qb.andWhere('source.enabled = false');
    else if (query.status === 'DUE') qb.andWhere('source.enabled = true AND (source.next_check_at IS NULL OR source.next_check_at <= :now)', { now: new Date() });
    const [data, total] = await qb.orderBy("CASE source.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END", 'ASC')
      .addOrderBy('source.source_name', 'ASC').skip(offset).take(limit).getManyAndCount();
    const allUrlRows = await this.sources.createQueryBuilder('source').select(['source.sourceId', 'source.officialUrl']).getMany();
    const urlCounts = new Map<string, number>();
    for (const row of allUrlRows) {
      const key = this.normalizeEndpointUrl(row.officialUrl);
      urlCounts.set(key, (urlCounts.get(key) || 0) + 1);
    }
    const linkedSourceIds = new Set(companyId ? await this.relevantSourceIdsForCompany(companyId) : []);
    return {
      data: data.map((source) => this.publicSource(source, {
        linkedToCompany: linkedSourceIds.has(source.sourceId),
        exactDuplicateEndpointCount: urlCounts.get(this.normalizeEndpointUrl(source.officialUrl)) || 1,
      })),
      total, limit, offset,
    };
  }

  private publicSource(source: RegulatoryMonitorSource, extras: Record<string, unknown> = {}) {
    const {
      lastContentHash, lastContentSnapshot, lastLinkInventory, lastEtag, lastModifiedHeader,
      ...safe
    } = source;
    return {
      ...safe,
      isDue: source.enabled && (!source.nextCheckAt || new Date(source.nextCheckAt).getTime() <= Date.now()),
      lastSuccessfulCheckAt: source.lastCheckedAt ?? null,
      cadenceWarning: this.isFasterCadenceRecommended(source),
      ...extras,
    };
  }

  /**
   * Convert workbook guidance to scheduler hours. The UI/DB currently support
   * hour granularity; 15-30 minute feeds therefore run hourly until minute-level
   * scheduling is introduced. Monthly recommendations are capped at weekly to
   * satisfy the product requirement that every registered source be checked at
   * least once per seven days.
   */
  private recommendedIntervalHours(cadence: string): number {
    const c = (cadence || '').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
    if (/15\s*-\s*30\s*minutes?|15\s*-\s*60\s*minutes?|every\s*15\s*minutes?/.test(c)) return 1;
    if (/every\s*1\s*-\s*4\s*hours?/.test(c)) return 4;
    if (/every\s*4\s*-\s*12\s*hours?/.test(c)) return 12;
    if (/every\s*4\s*hours?/.test(c)) return 4;
    if (/hourly|every\s*1\s*hour|as rss updates arrive|feed-driven|as published|as delivered/.test(c)) return 1;
    if (/daily|every\s*day/.test(c)) return 24;
    if (/weekly|monthly/.test(c)) return DEFAULT_INTERVAL_HOURS;
    // Provider-defined, ambiguous, and unspecified cadences use the safe weekly baseline.
    return DEFAULT_INTERVAL_HOURS;
  }

  private isFasterCadenceRecommended(source: Pick<RegulatoryMonitorSource, 'suggestedCheckCadence' | 'checkIntervalHours'>): boolean {
    return source.checkIntervalHours > this.recommendedIntervalHours(source.suggestedCheckCadence);
  }

  private normalizeEndpointUrl(value: string): string {
    try {
      const url = new URL(value);
      url.hash = '';
      url.hostname = url.hostname.toLowerCase();
      if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
      return url.toString();
    } catch {
      return value.trim();
    }
  }

  async listEvents(companyId: string, query: { state?: string; limit?: string; offset?: string }) {
    const limit = Math.max(1, Math.min(200, Number(query.limit || 50)));
    const offset = Math.max(0, Number(query.offset || 0));
    const sourceIds = await this.relevantSourceIdsForCompany(companyId);
    if (!sourceIds.length) return { data: [], total: 0, limit, offset };

    // Source detection events are shared, but relevance and review outcome are per tenant.
    const allEvents = await this.events.find({ where: { sourceId: In(sourceIds) }, order: { detectedAt: 'DESC' } });
    const reviewMap = await this.latestCompanyReviews(companyId, allEvents.map((event) => event.id));
    let scoped = allEvents.map((event) => this.presentEventForCompany(event, reviewMap.get(event.id)));
    if (query.state && ['NEEDS_REVIEW', 'ACTION_REQUIRED', 'NO_PRODUCT_IMPACT'].includes(query.state)) {
      scoped = scoped.filter((event: any) => event.state === query.state);
    }
    return { data: scoped.slice(offset, offset + limit), total: scoped.length, limit, offset };
  }

  async sourceHistory(sourceId: string, companyId: string, limit = 20) {
    const source = await this.sources.findOne({ where: { sourceId } });
    if (!source) throw new NotFoundException('Regulatory source not found');
    const checks = await this.checks.find({ where: { sourceId }, order: { startedAt: 'DESC' }, take: Math.max(1, Math.min(100, limit)) });
    const events = await this.events.find({ where: { sourceId }, order: { detectedAt: 'DESC' }, take: 20 });
    const reviewMap = await this.latestCompanyReviews(companyId, events.map((event) => event.id));
    return { source: this.publicSource(source), checks, events: events.map((event) => this.presentEventForCompany(event, reviewMap.get(event.id))) };
  }

  async queueChecks(sourceIds: string[] | undefined, companyId: string | undefined, role: string) {
    const isPlatformAdmin = role === 'SUPER_ADMIN';
    let selectedIds: string[] | undefined;
    if (sourceIds?.length) {
      selectedIds = Array.from(new Set(sourceIds.map((value) => String(value).trim()).filter(Boolean)));
      if (!selectedIds.length) throw new BadRequestException('Provide at least one valid source ID');
      if (selectedIds.length > (isPlatformAdmin ? 500 : 20)) {
        throw new BadRequestException(`A single request can queue at most ${isPlatformAdmin ? 500 : 20} source checks`);
      }
    }
    if (!isPlatformAdmin) {
      if (!companyId) throw new BadRequestException('Company context is required to queue a source check');
      if (!selectedIds?.length) {
        throw new BadRequestException('Company users may queue checks only for sources linked to their saved Applicability reviews');
      }
      const linkedIds = new Set(await this.relevantSourceIdsForCompany(companyId));
      if (selectedIds.some((id) => !linkedIds.has(id))) {
        throw new NotFoundException('One or more requested sources are not linked to an Applicability review in your company');
      }
      const requestedRows = await this.sources.find({ where: { sourceId: In(selectedIds), enabled: true } });
      if (requestedRows.length !== selectedIds.length) {
        throw new NotFoundException('One or more requested sources are missing or disabled');
      }
      const cutoff = Date.now() - 15 * 60_000;
      if (requestedRows.some((source) => source.checkStatus === 'CHECKING' || (source.lastAttemptAt && new Date(source.lastAttemptAt).getTime() > cutoff))) {
        throw new BadRequestException('One or more requested sources were checked recently or are already checking. Please wait before trying again.');
      }
    }

    let result;
    if (selectedIds?.length) {
      result = await this.sources.createQueryBuilder().update(RegulatoryMonitorSource)
        .set({ nextCheckAt: new Date() }).where({ sourceId: In(selectedIds), enabled: true }).execute();
    } else if (isPlatformAdmin) {
      result = await this.sources.createQueryBuilder().update(RegulatoryMonitorSource)
        .set({ nextCheckAt: new Date() }).where('enabled = true').execute();
    } else {
      throw new BadRequestException('Select one or more product-linked sources to check');
    }
    // The background worker picks queued sources in priority order; the HTTP response is immediate.
    void this.processDueSources();
    return { queuedSources: result.affected || 0, message: 'Sources queued for checking. Results will appear as each source finishes.' };
  }

  async updateSource(sourceId: string, body: { enabled?: boolean; checkIntervalHours?: number; useRecommendedCadence?: boolean }) {
    const source = await this.sources.findOne({ where: { sourceId } });
    if (!source) throw new NotFoundException('Regulatory source not found');
    const patch: Partial<RegulatoryMonitorSource> = {};
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') throw new BadRequestException('enabled must be boolean');
      patch.enabled = body.enabled;
      if (body.enabled && !source.enabled) patch.nextCheckAt = new Date();
    }
    if (body.useRecommendedCadence === true) {
      if (body.checkIntervalHours !== undefined) {
        throw new BadRequestException('Do not send checkIntervalHours when using the workbook-recommended cadence');
      }
      patch.checkIntervalHours = this.recommendedIntervalHours(source.suggestedCheckCadence);
      patch.checkIntervalManuallyConfigured = false;
      patch.nextCheckAt = new Date();
    } else if (body.checkIntervalHours !== undefined) {
      const hours = Number(body.checkIntervalHours);
      if (!Number.isInteger(hours) || hours < 1 || hours > DEFAULT_INTERVAL_HOURS) {
        throw new BadRequestException('checkIntervalHours must be an integer between 1 and 168 (maximum 7 days)');
      }
      patch.checkIntervalHours = hours;
      patch.checkIntervalManuallyConfigured = true;
      patch.nextCheckAt = new Date();
    }
    if (!Object.keys(patch).length) throw new BadRequestException('Provide enabled, checkIntervalHours, or useRecommendedCadence');
    await this.sources.update({ sourceId }, patch);
    const refreshed = await this.sources.findOne({ where: { sourceId } });
    if (!refreshed) throw new NotFoundException('Regulatory source not found');
    return this.publicSource(refreshed);
  }

  async reviewEvent(eventId: string, companyId: string, reviewerId: string, reviewerRole: string, body: { impactState: string; reviewNote: string }) {
    if (!companyId) throw new BadRequestException('Company context is required to record an impact review');
    const event = await this.events.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Regulatory change event not found');
    if (!['ACTION_REQUIRED', 'NO_PRODUCT_IMPACT'].includes(body?.impactState)) {
      throw new BadRequestException('impactState must be ACTION_REQUIRED or NO_PRODUCT_IMPACT');
    }
    const note = String(body?.reviewNote || '').trim();
    if (note.length < 10) throw new BadRequestException('Provide a review note of at least 10 characters');
    const relevantSourceIds = await this.relevantSourceIdsForCompany(companyId);
    if (!relevantSourceIds.includes(event.sourceId)) {
      // Do not let one company edit the global source-change signal for another tenant.
      throw new NotFoundException('This source change is not linked to an applicability review in your company');
    }
    const review = this.eventReviews.create({
      eventId: event.id,
      companyId,
      state: body.impactState as RegulatoryChangeEventReview['state'],
      reviewedBy: reviewerId,
      reviewerRole,
      reviewNote: note.slice(0, 5000),
    });
    // Append a new row for each review so previous company decisions remain auditable.
    return this.eventReviews.save(review);
  }

  private async checkOne(source: RegulatoryMonitorSource) {
    const startedAt = new Date();
    const previousHash = source.lastContentHash || null;
    let check: RegulatorySourceCheck | undefined;
    try {
      const snapshot = await this.fetchSnapshot(source);
      const completedAt = new Date();
      let canonical: CanonicalContent;
      if (snapshot.notModified && source.lastContentHash) {
        canonical = {
          snapshot: source.lastContentSnapshot || '',
          links: source.lastLinkInventory || [],
          changeTypes: ['HTTP_NOT_MODIFIED'],
          hash: source.lastContentHash,
          excerpt: 'The publisher confirmed that the resource has not changed using HTTP validators.',
        };
      } else {
        canonical = canonicalize(snapshot.body, snapshot.contentType, snapshot.finalUrl);
      }
      const baseline = !previousHash;
      const changed = !baseline && previousHash !== canonical.hash;
      const status: RegulatorySourceCheck['status'] = baseline ? 'BASELINE_CAPTURED' : changed ? 'POTENTIAL_CHANGE' : 'UNCHANGED';
      const changeTypes = changed ? this.classifyChanges(source, canonical, source.lastContentSnapshot || '') : [];
      check = await this.checks.save(this.checks.create({
        sourceId: source.sourceId, status, startedAt, completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        httpStatus: snapshot.httpStatus, finalUrl: snapshot.finalUrl,
        previousHash, currentHash: canonical.hash, changeTypes,
        summary: baseline
          ? 'Initial baseline captured. Changes can be detected only after a successful baseline exists.'
          : changed
            ? 'The normalized page/document content or link inventory changed. This is a potential update, not confirmation of a regulatory amendment.'
            : 'No difference detected in the normalized content and tracked link inventory.',
      }));

      await this.sources.update({ sourceId: source.sourceId }, {
        checkStatus: changed ? 'CHANGE_DETECTED' : 'OK',
        lastAttemptAt: completedAt,
        lastCheckedAt: completedAt,
        nextCheckAt: new Date(completedAt.getTime() + Math.max(1, source.checkIntervalHours || DEFAULT_INTERVAL_HOURS) * 3_600_000),
        lastHttpStatus: snapshot.httpStatus,
        lastError: null,
        lastEtag: snapshot.etag || source.lastEtag || null,
        lastModifiedHeader: snapshot.lastModified || source.lastModifiedHeader || null,
        lastContentHash: canonical.hash,
        lastContentSnapshot: canonical.snapshot,
        lastLinkInventory: canonical.links,
        lastFailureCount: 0,
        ...(changed ? { lastChangeDetectedAt: completedAt } : {}),
      });

      if (changed && check) {
        const event = await this.events.save(this.events.create({
          sourceId: source.sourceId, checkId: check.id, sourceName: source.sourceName,
          sourceUrl: snapshot.finalUrl, priority: source.priority, detectedAt: completedAt,
          title: `Potential update detected: ${source.sourceName}`,
          summary: `The monitored source changed since the previous successful check. This may be an editorial change, navigation update, new publication, or regulatory update. A human must inspect the official source before treating it as a regulatory change.`,
          changeTypes,
          beforeHash: previousHash,
          afterHash: canonical.hash,
          changeExcerpt: this.buildDiffExcerpt(source.lastContentSnapshot || '', canonical.snapshot, canonical.excerpt),
          state: 'NEEDS_REVIEW',
          notificationsCreated: 0,
        }));
        const notificationsCreated = await this.notifyAffectedReviewedProducts(source, canonical.hash, event);
        if (notificationsCreated) {
          event.notificationsCreated = notificationsCreated;
          await this.events.update({ id: event.id }, { notificationsCreated });
        }
      }
    } catch (error: any) {
      const completedAt = new Date();
      const message = this.safeErrorMessage(error);
      const failed = this.checks.create({
        sourceId: source.sourceId, status: 'ERROR', startedAt, completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        httpStatus: error?.response?.status || null,
        finalUrl: source.officialUrl, previousHash, currentHash: null,
        changeTypes: [], summary: 'The source check failed. No conclusion about regulatory change or absence of change can be drawn.',
        errorMessage: message,
      });
      await this.checks.save(failed);
      await this.sources.update({ sourceId: source.sourceId }, {
        checkStatus: 'ERROR', lastAttemptAt: completedAt, lastError: message,
        lastHttpStatus: error?.response?.status || null,
        lastFailureCount: (source.lastFailureCount || 0) + 1,
        // Retry failed sources within 24h rather than leaving an unreachable source unchecked for a full week.
        nextCheckAt: new Date(completedAt.getTime() + Math.min(24, Math.max(1, source.checkIntervalHours || DEFAULT_INTERVAL_HOURS)) * 3_600_000),
      });
      this.logger.warn(`Source check failed for ${source.sourceId} (${source.sourceName}): ${message}`);
    }
  }

  private safeErrorMessage(error: any): string {
    const status = Number(error?.response?.status);
    if (status) return `HTTP ${status}: source could not be read successfully`;
    const message = String(error?.message || 'Unknown monitoring error');
    return message.slice(0, 500);
  }

  private classifyChanges(_source: RegulatoryMonitorSource, current: CanonicalContent, previous: string): string[] {
    const types = ['CONTENT_HASH_CHANGED'];
    if (!previous) return types;
    const beforeLinks = previous.split('---LINK-INVENTORY---')[1] || '';
    const afterLinks = current.snapshot.split('---LINK-INVENTORY---')[1] || '';
    if (beforeLinks !== afterLinks) types.push('LINK_INVENTORY_CHANGED');
    const changedExcerpt = this.buildDiffExcerpt(previous, current.snapshot, current.excerpt).toLowerCase();
    // This is only a triage hint: keyword presence is not a legal classification.
    if (/amendment|amended|repeal|repealed|effective date|new regulation|revised|revision|updated guidance|corrigendum|modificatif|modification|abrogation|تعديل|تنقيح|إلغاء/.test(changedExcerpt)) {
      types.push('REGULATORY_KEYWORD_PRESENT_REQUIRES_REVIEW');
    }
    return Array.from(new Set(types));
  }

  private buildDiffExcerpt(previous: string, current: string, fallback: string): string {
    if (!previous) return fallback;
    let index = 0;
    const limit = Math.min(previous.length, current.length);
    while (index < limit && previous[index] === current[index]) index += 1;
    if (index === limit && previous.length === current.length) return fallback;
    const before = previous.slice(Math.max(0, index - 420), Math.min(previous.length, index + 820)).trim();
    const after = current.slice(Math.max(0, index - 420), Math.min(current.length, index + 820)).trim();
    return `First normalized difference near character ${index}.\n\nPREVIOUS SNAPSHOT:\n${before || '(empty)'}\n\nCURRENT SNAPSHOT:\n${after || '(empty)'}`.slice(0, 3200);
  }

  private async fetchSnapshot(source: RegulatoryMonitorSource): Promise<Snapshot> {
    let currentUrl = source.officialUrl;
    let response: AxiosResponse<ArrayBuffer> | null = null;
    for (let redirect = 0; redirect <= 4; redirect += 1) {
      const parsed = await assertSafePublicUrl(currentUrl);
      const headers: Record<string, string> = {
        'User-Agent': 'Qurelio-RegulatoryMonitor/1.0 (+source-change detection; contact administrator)',
        Accept: 'text/html,application/xhtml+xml,application/atom+xml,application/rss+xml,application/xml,text/xml,application/pdf,*/*;q=0.5',
      };
      if (redirect === 0 && source.lastEtag) headers['If-None-Match'] = source.lastEtag;
      if (redirect === 0 && source.lastModifiedHeader) headers['If-Modified-Since'] = source.lastModifiedHeader;
      response = await axios.get(currentUrl, {
        headers, responseType: 'arraybuffer', timeout: REQUEST_TIMEOUT_MS, maxRedirects: 0,
        maxContentLength: MAX_RESPONSE_BYTES, maxBodyLength: MAX_RESPONSE_BYTES,
        validateStatus: () => true,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.location;
        if (!location) throw new Error(`HTTP ${response.status} redirect did not include a Location header`);
        if (redirect === 4) throw new Error('Source exceeded the maximum number of redirects');
        currentUrl = new URL(location, parsed).toString();
        continue;
      }
      break;
    }
    if (!response) throw new Error('Source returned no response');
    const completedUrl = currentUrl;
    if (response.status === 304) {
      return {
        body: Buffer.alloc(0), contentType: String(response.headers['content-type'] || ''), finalUrl: completedUrl,
        httpStatus: 304, etag: String(response.headers.etag || source.lastEtag || ''),
        lastModified: String(response.headers['last-modified'] || source.lastModifiedHeader || ''), notModified: true,
      };
    }
    if (response.status < 200 || response.status >= 300) throw Object.assign(new Error(`HTTP ${response.status}`), { response });
    const rawBody = Buffer.from(response.data as any);
    if (rawBody.byteLength > MAX_RESPONSE_BYTES) throw new Error(`Source response exceeded ${MAX_RESPONSE_BYTES} bytes`);
    return {
      body: rawBody,
      contentType: String(response.headers['content-type'] || ''),
      finalUrl: completedUrl,
      httpStatus: response.status,
      etag: String(response.headers.etag || ''),
      lastModified: String(response.headers['last-modified'] || ''),
      notModified: false,
    };
  }

  private async notifyAffectedReviewedProducts(source: RegulatoryMonitorSource, newHash: string, event: RegulatoryChangeEvent): Promise<number> {
    const base = (this.config.get<string>('NOTIFICATION_SERVICE_URL') || '').replace(/\/$/, '');
    const token = this.config.get<string>('NOTIFICATION_INTERNAL_TOKEN')?.trim();
    if (!base || !token) return 0;

    try {
      // Only notify reviewers whose persisted decision cites this source (by stable source ID or matching host).
      // The alert requests impact review; it never claims that a legal amendment has been confirmed.
      const all = await this.assessments.find({ where: { sourceUrl: Not(IsNull()) }, order: { reviewedAt: 'DESC' } });
      const latest = new Map<string, ProductRegulatoryAssessment>();
      const seenAssessmentKeys = new Set<string>();
      for (const assessment of all) {
        let sameSource = assessment.monitoredSourceId === source.sourceId;
        if (!sameSource && assessment.sourceUrl) {
          // Legacy source URLs are associated only when the registered path contains the cited path.
          const match = this.pickSourceMatch(assessment.sourceUrl, [source]);
          sameSource = match?.sourceId === source.sourceId;
        }
        if (!sameSource) continue;
        const key = `${assessment.companyId}:${assessment.productId}:${assessment.regulationId || assessment.reference}:${source.sourceId}`;
        if (seenAssessmentKeys.has(key)) continue;
        seenAssessmentKeys.add(key);
        // Any detected change after the review must be surfaced, even if the source later reverts
        // to the same content hash that the reviewer saw. Suppress only when the review was
        // recorded after this event and explicitly captured the event's current hash.
        const reviewedAfterEvent = new Date(assessment.reviewedAt).getTime() >= new Date(event.detectedAt).getTime();
        const reviewMatchesCurrentHash = assessment.sourceSnapshotHashAtReview === newHash;
        if (!(reviewedAfterEvent && reviewMatchesCurrentHash)) latest.set(key, assessment);
      }
      const productCache = new Map<string, Product | null>();
      const notifications = new Set<string>();
      let created = 0;
      for (const assessment of latest.values()) {
        const dedupeKey = `${assessment.companyId}:${assessment.reviewerId}:${assessment.productId}:${assessment.reference}`;
        if (notifications.has(dedupeKey)) continue;
        notifications.add(dedupeKey);
        let product = productCache.get(assessment.productId);
        if (product === undefined) {
          product = await this.products.findOne({ where: { id: assessment.productId, companyId: assessment.companyId } });
          productCache.set(assessment.productId, product);
        }
        try {
          await axios.post(`${base}/api/notifications/internal/create`, {
            companyId: assessment.companyId,
            userId: assessment.reviewerId,
            type: 'ALERT',
            title: 'Regulatory source update needs review',
            message: `A monitored source changed after your Applicability review for ${product?.name || 'a product'} (${assessment.reference}). Please inspect the source and update the regulatory review if needed. This is a detected source change, not yet a confirmed regulatory amendment.`,
            metadata: {
              regulatoryEventId: event.id, sourceId: source.sourceId, sourceUrl: source.officialUrl,
              productId: assessment.productId, assessmentId: assessment.id, reference: assessment.reference,
              requiresApplicabilityReview: true,
            },
          }, { headers: { 'X-Internal-Token': token }, timeout: 6000 });
          created += 1;
        } catch (error: any) {
          this.logger.warn(`Could not notify reviewer ${assessment.reviewerId} for source ${source.sourceId}: ${error?.message || error}`);
        }
      }
      return created;
    } catch (error: any) {
      this.logger.warn(`Impact-notification preparation failed for ${source.sourceId}: ${error?.message || error}`);
      return 0;
    }
  }

  /**
   * Bind a human-reviewed Applicability decision to a registered source. Prefer the
   * stable source ID selected from the registry; URL matching remains as a legacy
   * fallback. This makes change events and later stale-decision checks deterministic.
   */
  async resolveSourceSnapshot(sourceUrl?: string, explicitSourceId?: string): Promise<{ sourceId?: string; sourceUrl?: string; snapshotHash?: string; freshness: string }> {
    if (explicitSourceId) {
      const source = await this.sources.findOne({ where: { sourceId: explicitSourceId } });
      if (!source) throw new BadRequestException('The selected monitored source does not exist');
      if (!source.enabled) throw new BadRequestException('The selected monitored source is disabled. Enable it before linking a review.');
      if (sourceUrl && this.normalizeEndpointUrl(sourceUrl) !== this.normalizeEndpointUrl(source.officialUrl)) {
        // The snapshot hash belongs to the registered endpoint. Do not bind that hash to a
        // different nested URL merely because it is on the same host/path tree.
        throw new BadRequestException('When a registry source is selected, the source URL must match its registered monitoring endpoint');
      }
      return {
        sourceId: source.sourceId,
        sourceUrl: source.officialUrl,
        snapshotHash: source.lastContentHash || undefined,
        freshness: !source.lastContentHash || !source.lastCheckedAt
          ? 'UNVERIFIED'
          : source.checkStatus === 'ERROR' && source.lastAttemptAt && (!source.lastCheckedAt || source.lastAttemptAt > source.lastCheckedAt)
            ? 'CHECK_UNAVAILABLE'
            : 'CURRENT',
      };
    }
    if (!sourceUrl) return { freshness: 'NOT_LINKED' };
    const source = await this.sourceMatchesUrl(sourceUrl);
    if (!source) return { freshness: 'NOT_LINKED' };
    if (!source.enabled) return { sourceId: source.sourceId, sourceUrl: source.officialUrl, freshness: 'MONITORING_DISABLED' };
    if (!source.lastContentHash || !source.lastCheckedAt) return { sourceId: source.sourceId, sourceUrl: source.officialUrl, freshness: 'UNVERIFIED' };
    if (source.checkStatus === 'ERROR' && source.lastAttemptAt && (!source.lastCheckedAt || source.lastAttemptAt > source.lastCheckedAt)) {
      return { sourceId: source.sourceId, sourceUrl: source.officialUrl, snapshotHash: source.lastContentHash, freshness: 'CHECK_UNAVAILABLE' };
    }
    return { sourceId: source.sourceId, sourceUrl: source.officialUrl, snapshotHash: source.lastContentHash, freshness: 'CURRENT' };
  }

  async freshnessForAssessments(records: ProductRegulatoryAssessment[]) {
    const sourceIds = Array.from(new Set(records.map((record) => record.monitoredSourceId).filter(Boolean))) as string[];
    const sourceRows = sourceIds.length ? await this.sources.find({ where: { sourceId: In(sourceIds) } }) : [];
    const byId = new Map(sourceRows.map((source) => [source.sourceId, source]));
    return records.map((record) => {
      if (!record.monitoredSourceId) return { ...record, sourceFreshness: 'NOT_LINKED' };
      const source = byId.get(record.monitoredSourceId);
      if (!source) return { ...record, sourceFreshness: 'UNVERIFIED' };
      const reviewedAtMs = new Date(record.reviewedAt).getTime();
      const changeDetectedAtMs = source.lastChangeDetectedAt ? new Date(source.lastChangeDetectedAt).getTime() : 0;
      // Prefer event history over hash equality: a source can change and later revert to an
      // older hash. A review predating that change still needs reassessment.
      if (record.sourceSnapshotHashAtReview && changeDetectedAtMs > reviewedAtMs) {
        return { ...record, sourceFreshness: 'SOURCE_CHANGED' };
      }
      if (record.sourceSnapshotHashAtReview && source.lastContentHash && record.sourceSnapshotHashAtReview !== source.lastContentHash) {
        return { ...record, sourceFreshness: 'SOURCE_CHANGED' };
      }
      if (source.checkStatus === 'ERROR' && source.lastAttemptAt && (!source.lastCheckedAt || source.lastAttemptAt > source.lastCheckedAt)) {
        return { ...record, sourceFreshness: 'CHECK_UNAVAILABLE' };
      }
      if (!source.enabled) return { ...record, sourceFreshness: 'MONITORING_DISABLED' };
      if (!record.sourceSnapshotHashAtReview || !source.lastContentHash) return { ...record, sourceFreshness: 'UNVERIFIED' };
      const isOverdue = !source.lastCheckedAt || Date.now() - new Date(source.lastCheckedAt).getTime() > Math.max(1, source.checkIntervalHours || DEFAULT_INTERVAL_HOURS) * 3_600_000;
      return { ...record, sourceFreshness: isOverdue ? 'CHECK_OVERDUE' : 'CURRENT' };
    });
  }
}
