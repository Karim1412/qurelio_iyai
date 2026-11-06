import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../database/entities/document.entity';
import { ProductRegulatoryAssessment } from '../database/entities/product-regulatory-assessment.entity';
import { RegulatoryMonitoringService } from '../regulatory-monitoring/regulatory-monitoring.service';
import { matchProductToRegulatoryCandidates } from '../regulatory-monitoring/applicability-candidate-engine';

export type ApplicabilityDecision = 'APPLICABLE' | 'CONDITIONAL' | 'NOT_APPLICABLE' | 'NEEDS_REVIEW';

export interface CreateApplicabilityAssessmentDto {
  regulationId?: string;
  reference: string;
  title?: string;
  decision: ApplicabilityDecision;
  rationale: string;
  conditions?: string;
  evidenceReferences?: string[];
  sourceUrl?: string;
  sourceVersion?: string;
  monitoredSourceId?: string;
}

const DECISIONS = new Set<ApplicabilityDecision>([
  'APPLICABLE', 'CONDITIONAL', 'NOT_APPLICABLE', 'NEEDS_REVIEW',
]);

function requiredText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new BadRequestException(`${label} is required`);
  const normalized = value.trim();
  if (!normalized) throw new BadRequestException(`${label} is required`);
  if (normalized.length > max) throw new BadRequestException(`${label} must be ${max} characters or fewer`);
  return normalized;
}

function optionalText(value: unknown, label: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`${label} must be text`);
  const normalized = value.trim();
  if (normalized.length > max) throw new BadRequestException(`${label} must be ${max} characters or fewer`);
  return normalized || undefined;
}

function normalizeSourceUrl(value: unknown): string | undefined {
  const candidate = optionalText(value, 'Source URL', 2048);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') throw new Error('HTTPS required');
    return url.toString();
  } catch {
    throw new BadRequestException('Source URL must be a valid HTTPS URL');
  }
}

function normalizeEvidence(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new BadRequestException('Evidence references must be a list of strings');
  if (value.length > 30) throw new BadRequestException('Provide no more than 30 evidence references');
  return value.map((item, index) => {
    if (typeof item !== 'string') throw new BadRequestException(`Evidence reference ${index + 1} must be text`);
    const normalized = item.trim();
    if (!normalized) throw new BadRequestException(`Evidence reference ${index + 1} cannot be empty`);
    if (normalized.length > 500) throw new BadRequestException(`Evidence reference ${index + 1} must be 500 characters or fewer`);
    return normalized;
  });
}

@Injectable()
export class ProductApplicabilityService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductRegulatoryAssessment) private readonly assessments: Repository<ProductRegulatoryAssessment>,
    private readonly monitoring: RegulatoryMonitoringService,
  ) {}

  private async assertProductInCompany(productId: string, companyId: string): Promise<Product> {
    if (!productId || !companyId) throw new BadRequestException('Product and company are required');
    const product = await this.products.findOne({ where: { id: productId, companyId } });
    // Return the same response for unknown and cross-tenant product IDs.
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async list(productId: string, companyId: string) {
    await this.assertProductInCompany(productId, companyId);
    const records = await this.assessments.find({
      where: { productId, companyId },
      order: { reviewedAt: 'DESC' },
    });
    return this.monitoring.freshnessForAssessments(records);
  }

  /**
   * Return traceable regulatory reference candidates for this tenant's product.
   * This is conservative candidate discovery, not an automatic legal decision.
   */
  async candidates(productId: string, companyId: string) {
    const product = await this.assertProductInCompany(productId, companyId);
    return matchProductToRegulatoryCandidates(product as any);
  }

  async create(
    productId: string,
    companyId: string,
    reviewerId: string,
    reviewerRole: string,
    body: CreateApplicabilityAssessmentDto,
  ) {
    await this.assertProductInCompany(productId, companyId);

    const reference = requiredText(body?.reference, 'Reference', 500);
    const title = optionalText(body?.title, 'Title', 1000);
    const decision = body?.decision as ApplicabilityDecision | undefined;
    if (!decision || !DECISIONS.has(decision)) {
      throw new BadRequestException(`Decision must be one of: ${Array.from(DECISIONS).join(', ')}`);
    }
    const rationale = requiredText(body?.rationale, 'Rationale', 5000);
    if (rationale.length < 20) {
      throw new BadRequestException('Rationale must contain at least 20 characters so the decision is traceable');
    }
    const conditions = optionalText(body?.conditions, 'Conditions', 5000);
    if (decision === 'CONDITIONAL' && !conditions) {
      throw new BadRequestException('Conditions are required for a conditional decision');
    }
    const regulationId = optionalText(body?.regulationId, 'Regulation ID', 150);
    const sourceVersion = optionalText(body?.sourceVersion, 'Source version', 200);
    const sourceUrl = normalizeSourceUrl(body?.sourceUrl);
    const monitoredSourceId = optionalText(body?.monitoredSourceId, 'Monitored source ID', 32);
    const evidenceReferences = normalizeEvidence(body?.evidenceReferences);
    const sourceSnapshot = await this.monitoring.resolveSourceSnapshot(sourceUrl, monitoredSourceId);
    const savedSourceUrl = sourceUrl || sourceSnapshot.sourceUrl;

    const assessment = this.assessments.create({
      companyId,
      productId,
      regulationId,
      reference,
      title,
      decision,
      rationale,
      conditions,
      evidenceReferences,
      sourceUrl: savedSourceUrl,
      sourceVersion,
      monitoredSourceId: sourceSnapshot.sourceId,
      sourceSnapshotHashAtReview: sourceSnapshot.snapshotHash,
      reviewerId,
      reviewerRole,
    });
    return this.assessments.save(assessment);
  }
}
