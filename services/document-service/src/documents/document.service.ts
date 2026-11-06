import {
  Injectable, NotFoundException, BadRequestException, Logger, ConflictException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import axios from 'axios';
import { createHash } from 'crypto';
import {
  Document, DocumentVersion, DocumentType, DocumentStatus, DocumentApprovalStatus, StandardLibraryStatus, Product, FileFolder,
} from '../database/entities/document.entity';
import { DocumentAccessRule } from '../database/entities/document-access-rule.entity';
import { StorageService } from '../storage/storage.service';
import { IngestService } from '../ingest/ingest.service';
import { DocumentAuditService } from './document-audit.service';
import { DocumentAclService } from './document-acl.service';
import { canApproveDocuments, canManageStandards } from './document-permissions';
import type { ExtractedStructure, ProductProfile } from '../ocr/extracted-structure';
import type { Readable } from 'stream';
import { mergeProductProfileFields, mergeCustomFields, mergeProductFacts, ProductFactRecord, FieldProvenanceMap, FieldConflictMap } from './product-merge.util';
import { computeProductExtractionQuality, computeRequirementCoverage, generateReadinessSummary } from './product-quality.util';
import { buildAiExtractionView } from './ai-extraction-view.util';
import { selectEvaluationEvidence } from './evaluation-evidence-selection';
import { markStandardExtractionForReview } from './standard-edit-policy';

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/csv',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream', // browsers send this for .csv/.txt/.zip, gated by extension below
  'image/jpeg', 'image/png', 'image/tiff', 'image/gif', 'image/webp', 'image/svg+xml',
]);
/**
 * Extensions accepted at upload. Browsers frequently send an empty or
 * `application/octet-stream` mimetype for .csv/.txt/.zip, so we also gate on
 * the file extension to keep legitimate uploads working.
 */
const ALLOWED_EXTS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'csv', 'json', 'log', 'md',
  'zip',
  'jpg', 'jpeg', 'png', 'tif', 'tiff', 'gif', 'webp', 'svg',
]);
import { detectLicensedStandard, licensedStandardWarning } from './licensed-standards';

const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Onboarding wizard folder that the user has not activated yet. Such a product is
 * invisible everywhere (library, archive, pickers) and is deleted if the wizard is
 * cancelled: only "Save & activate" turns it into a real product.
 */
export const PRODUCT_DRAFT_STATUS = 'DRAFT';

function fileExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export type ListFilter = {
  type?: string;
  search?: string;
  isoStandard?: string;
  productId?: string;
  uploadedBy?: string;
  tag?: string;
  approvalStatus?: string;
  libraryStatus?: string;
  status?: string;
  includeArchived?: boolean | string;
  /** When true, only rows with archivedAt set (use with includeArchived for archived library views). */
  archivedOnly?: boolean | string;
  /** Exclude this document type (e.g. ISO_NORM for archived product files). */
  excludeType?: string;
  /** Only documents linked to a product (DOC-007 archived product library). */
  hasProduct?: boolean | string;
  /** File Manager: exact folder id, or 'none' for documents not in any folder. */
  folderId?: string;
  fromDate?: string;
  toDate?: string;
};

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    @InjectRepository(Document) private readonly docRepo: Repository<Document>,
    @InjectRepository(DocumentVersion) private readonly versionRepo: Repository<DocumentVersion>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(FileFolder) private readonly folderRepo: Repository<FileFolder>,
    @InjectRepository(DocumentAccessRule) private readonly accessRuleRepo: Repository<DocumentAccessRule>,
    private readonly storage: StorageService,
    private readonly ingest: IngestService,
    private readonly audit: DocumentAuditService,
    private readonly acl: DocumentAclService,
  ) {}

  // ────────────────────────────────────────────────────────────
  // PRODUCT MANAGEMENT
  // ────────────────────────────────────────────────────────────

  async createProduct(companyId: string, dto: {
    name: string; description?: string; sku?: string; reference?: string; revision?: string;
    categoryTags?: string[]; draft?: boolean;
  }) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Product name is required');

    const existing = await this.findProductByNormalizedName(companyId, name);
    if (existing) throw new ConflictException('Product with this name already exists');

    const product = this.productRepo.create({
      companyId,
      name,
      description: dto.description,
      sku: dto.sku,
      reference: dto.reference,
      revision: dto.revision,
      categoryTags: dto.categoryTags ?? [],
      /**
       * The onboarding wizard must create the folder up front so uploaded files have
       * somewhere to land and can be AI-read. Until the user activates, the product is
       * a DRAFT: hidden from the library, the archive and every product picker, and
       * discarded if the wizard is cancelled.
       */
      onboardingStatus: dto.draft ? PRODUCT_DRAFT_STATUS : undefined,
    });
    await this.productRepo.save(product);
    this.logger.log(`Product created: ${product.id} (${name})${dto.draft ? ' [draft]' : ''}`);
    return { id: product.id, name: product.name, sku: product.sku, createdAt: product.createdAt };
  }

  async listProducts(
    companyId: string,
    opts: { includeArchived?: boolean; archivedOnly?: boolean } = {},
  ) {
    const qb = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.documents', 'd')
      .where('p.companyId = :companyId', { companyId })
      // Wizard drafts are not products yet: they appear nowhere until activated.
      .andWhere('(p.onboardingStatus IS NULL OR p.onboardingStatus != :draft)', {
        draft: PRODUCT_DRAFT_STATUS,
      })
      .orderBy('p.createdAt', 'DESC');
    // archivedOnly → the Archived list; default → active library only (archivedAt IS NULL).
    if (opts.archivedOnly) qb.andWhere('p.archivedAt IS NOT NULL');
    else if (!opts.includeArchived) qb.andWhere('p.archivedAt IS NULL');
    return qb.getMany();
  }

  async getProduct(productId: string, companyId: string) {
    const product = await this.productRepo.findOne({
      where: { id: productId, companyId },
      relations: ['documents'],
    });
    if (!product) throw new NotFoundException('Product not found');
    return { ...product, aiExtraction: buildAiExtractionView(product) };
  }

  /**
   * Dedicated, minimal-payload accessor for the bounded AI Extraction view —
   * the same computation `getProduct` embeds, exposed on its own so callers
   * that only need this (the results UI's "AI Extraction" tab, and later the
   * compliance engine) don't have to fetch/parse the full product + its
   * documents relation just to read it.
   */
  async getProductAiExtraction(productId: string, companyId: string) {
    const product = await this.productRepo.findOne({ where: { id: productId, companyId } });
    if (!product) throw new NotFoundException('Product not found');
    return buildAiExtractionView(product);
  }

  async deleteProduct(productId: string, companyId: string, actorId?: string) {
    const product = await this.productRepo.findOne({
      where: { id: productId, companyId },
    });
    if (!product) throw new NotFoundException('Product not found');

    /** Hard-delete: physical storage + versions + ACL + DB rows for every doc in the folder, then the product row.
     *  Done in one shot whether or not the product was archived first, caller has already confirmed via destructive UI.
     */
    const docs = await this.docRepo.find({ where: { productId } });
    for (const doc of docs) {
      try { await this.storage.delete(doc.storageKey); } catch {}
      const versions = await this.versionRepo.find({ where: { document: { id: doc.id } } });
      for (const v of versions) {
        try { await this.storage.delete(v.storageKey); } catch {}
      }
      await this.accessRuleRepo.delete({ documentId: doc.id });
      if (actorId) {
        await this.audit.log(companyId, doc.id, actorId, 'DELETE_HARD', {
          reason: 'product_folder_delete',
          productId,
        });
      }
      await this.docRepo.delete(doc.id);
      this.ingest.onDocumentDeleted(doc.id, companyId);
    }

    await this.productRepo.delete(productId);
    this.logger.log(`Product deleted: ${productId} (${docs.length} doc(s))`);
    return { message: 'Product deleted' };
  }

  /** Update product profile fields (onboarding wizard step save). */
  async updateProductProfile(productId: string, companyId: string, data: Record<string, any>) {
    const product = await this.productRepo.findOne({ where: { id: productId, companyId } });
    if (!product) throw new NotFoundException('Product not found');

    const allowed = [
      'name', 'description', 'sku', 'reference', 'brandName', 'productFamily',
      'productType', 'productStatus', 'intendedUse', 'targetUsers', 'keyMaterials',
      'physicalForm', 'hsTariffCode', 'countryOfOrigin', 'targetMarkets',
      'requiredCertifications', 'applicableRegulations', 'industryLabels',
      'productionSites', 'productionProcesses', 'criticalSuppliers',
      'productCertifications', 'currentStep', 'onboardingStatus',
    ];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        (product as any)[key] = data[key];
      }
    }

    if (!product.onboardingStatus || product.onboardingStatus === 'NOT_STARTED') {
      product.onboardingStatus = 'IN_PROGRESS';
    }

    await this.productRepo.save(product);
    this.logger.log(`Product profile updated: ${productId}`);
    return product;
  }

  /** Mark product onboarding as completed. */
  async completeProductOnboarding(productId: string, companyId: string) {
    const product = await this.productRepo.findOne({ where: { id: productId, companyId } });
    if (!product) throw new NotFoundException('Product not found');

    product.onboardingStatus = 'COMPLETED';
    await this.productRepo.save(product);
    this.logger.log(`Product onboarding completed: ${productId}`);
    return { message: 'Product onboarding completed' };
  }

  /** Archive entire product folder: marks product + all files; active library hides the folder. */
  async archiveProduct(productId: string, companyId: string, actorId: string, actorRole: string) {
    if (!['DIRECTOR', 'QUALITY_MANAGER'].includes(actorRole)) {
      throw new ForbiddenException('Only Company Admin or Quality Manager can archive a product');
    }
    const product = await this.productRepo.findOne({ where: { id: productId, companyId } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.archivedAt) throw new BadRequestException('Product is already archived');

    const now = new Date();
    await this.productRepo.update(productId, { archivedAt: now });

    const docs = await this.docRepo.find({ where: { productId } });
    for (const doc of docs) {
      if (doc.archivedAt) continue;
      await this.docRepo.update(doc.id, {
        archivedAt: now,
        libraryStatus: doc.type === DocumentType.ISO_NORM ? StandardLibraryStatus.ARCHIVED : doc.libraryStatus,
      });
      this.ingest.onDocumentDeleted(doc.id, companyId);
      await this.audit.log(companyId, doc.id, actorId, 'ARCHIVE', { reason: 'product_folder', productId });
    }
    return { ok: true };
  }

  async restoreProduct(productId: string, companyId: string, actorId: string, actorRole: string) {
    if (!['DIRECTOR', 'QUALITY_MANAGER'].includes(actorRole)) {
      throw new ForbiddenException('Only Company Admin or Quality Manager can restore a product');
    }
    const product = await this.productRepo.findOne({ where: { id: productId, companyId } });
    if (!product) throw new NotFoundException('Product not found');
    if (!product.archivedAt) throw new BadRequestException('Product is not archived');

    const docs = await this.docRepo.find({ where: { productId } });
    for (const doc of docs) {
      if (doc.archivedAt) {
        await this.restore(doc.id, companyId, actorId, actorRole);
      }
    }
    await this.productRepo.update(productId, { archivedAt: null });
    return { ok: true };
  }

  // ────────────────────────────────────────────────────────────
  // FILE MANAGER: nestable folder tree
  // ────────────────────────────────────────────────────────────

  async listFolders(companyId: string) {
    const folders = await this.folderRepo.find({
      where: { companyId },
      order: { name: 'ASC' },
    });
    // Per-folder document count + total size (only non-archived docs, direct children).
    const agg = await this.docRepo
      .createQueryBuilder('d')
      .select('d.folderId', 'fid')
      .addSelect('COUNT(*)', 'c')
      .addSelect('COALESCE(SUM(d.sizeBytes), 0)', 'sz')
      .where('d.companyId = :companyId', { companyId })
      .andWhere('d.folderId IS NOT NULL')
      .andWhere('d.archivedAt IS NULL')
      .groupBy('d.folderId')
      .getRawMany<{ fid: string; c: string; sz: string }>();
    const countMap = new Map(agg.map((r) => [r.fid, Number(r.c)]));
    const sizeMap = new Map(agg.map((r) => [r.fid, Number(r.sz)]));
    return folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId ?? null,
      fileCount: countMap.get(f.id) ?? 0,
      sizeBytes: sizeMap.get(f.id) ?? 0,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));
  }

  async createFolder(companyId: string, name: string, parentId?: string | null) {
    const clean = (name ?? '').trim();
    if (!clean) throw new BadRequestException('Folder name is required');
    if (clean.length > 120) throw new BadRequestException('Folder name too long');
    if (parentId) {
      const parent = await this.folderRepo.findOne({ where: { id: parentId, companyId } });
      if (!parent) throw new NotFoundException('Parent folder not found');
    }
    const dup = await this.folderRepo.findOne({
      where: { companyId, name: clean, parentId: parentId ?? IsNull() },
    });
    if (dup) throw new ConflictException('A folder with this name already exists here');
    const folder = this.folderRepo.create({ companyId, name: clean, parentId: parentId ?? null });
    await this.folderRepo.save(folder);
    return { id: folder.id, name: folder.name, parentId: folder.parentId ?? null };
  }

  /** Collect a folder + all its descendant folder ids. */
  private async folderSubtreeIds(companyId: string, rootId: string): Promise<string[]> {
    const all = await this.folderRepo.find({ where: { companyId } });
    const childrenOf = new Map<string | null, string[]>();
    for (const f of all) {
      const p = f.parentId ?? null;
      if (!childrenOf.has(p)) childrenOf.set(p, []);
      childrenOf.get(p)!.push(f.id);
    }
    const out: string[] = [];
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop()!;
      out.push(id);
      for (const c of childrenOf.get(id) ?? []) stack.push(c);
    }
    return out;
  }

  async updateFolder(
    companyId: string,
    id: string,
    patch: { name?: string; parentId?: string | null },
  ) {
    const folder = await this.folderRepo.findOne({ where: { id, companyId } });
    if (!folder) throw new NotFoundException('Folder not found');

    if (patch.name !== undefined) {
      const clean = patch.name.trim();
      if (!clean) throw new BadRequestException('Folder name is required');
      folder.name = clean;
    }
    if (patch.parentId !== undefined) {
      const newParent = patch.parentId || null;
      if (newParent === folder.id)
        throw new BadRequestException('A folder cannot be its own parent');
      if (newParent) {
        const parent = await this.folderRepo.findOne({ where: { id: newParent, companyId } });
        if (!parent) throw new NotFoundException('Target folder not found');
        // Prevent moving a folder into one of its own descendants (cycle).
        const subtree = await this.folderSubtreeIds(companyId, folder.id);
        if (subtree.includes(newParent))
          throw new BadRequestException('Cannot move a folder into itself');
      }
      folder.parentId = newParent;
    }
    await this.folderRepo.save(folder);
    return { id: folder.id, name: folder.name, parentId: folder.parentId ?? null };
  }

  /** Delete a folder and its subtree. Documents are detached (folderId → null), not deleted. */
  async deleteFolder(companyId: string, id: string) {
    const folder = await this.folderRepo.findOne({ where: { id, companyId } });
    if (!folder) throw new NotFoundException('Folder not found');
    const ids = await this.folderSubtreeIds(companyId, id);
    await this.docRepo
      .createQueryBuilder()
      .update(Document)
      .set({ folderId: null })
      .where('companyId = :companyId', { companyId })
      .andWhere('folderId IN (:...ids)', { ids })
      .execute();
    await this.folderRepo.delete(ids);
    return { ok: true, removed: ids.length };
  }

  /** Move/assign a document into a folder (or detach when folderId is null). */
  async moveDocumentToFolder(
    companyId: string,
    documentId: string,
    folderId: string | null,
    actorId: string,
  ) {
    const doc = await this.docRepo.findOne({ where: { id: documentId, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (folderId) {
      const folder = await this.folderRepo.findOne({ where: { id: folderId, companyId } });
      if (!folder) throw new NotFoundException('Folder not found');
    }
    await this.docRepo.update(doc.id, { folderId: folderId ?? null });
    await this.audit.log(companyId, doc.id, actorId, 'UPDATE', {
      action: 'move_to_folder',
      folderId: folderId ?? null,
    });
    return { ok: true };
  }

  // ────────────────────────────────────────────────────────────
  // DOCUMENT UPLOAD
  // ────────────────────────────────────────────────────────────

  async upload(
    fileList: Express.Multer.File[],
    dto: any,
    companyId: string,
    userId: string,
  ) {
    if (!fileList?.length) throw new BadRequestException('No file uploaded');
    const out = [];
    for (const file of fileList) {
      out.push(await this.uploadOne(file, dto, companyId, userId));
    }
    return out.length === 1 ? out[0] : out;
  }

  private async uploadOne(file: Express.Multer.File, dto: any, companyId: string, userId: string) {
    const t = dto.type as DocumentType;
    if (!Object.values(DocumentType).includes(t)) {
      throw new BadRequestException('Document type is required');
    }
    const ext = fileExt(file.originalname);
    if (!ALLOWED_MIMES.has(file.mimetype) && !ALLOWED_EXTS.has(ext))
      throw new BadRequestException(`File type not allowed: ${file.originalname}`);
    if (file.size > MAX_BYTES)
      throw new BadRequestException('File exceeds 50 MB limit');
    if (t === DocumentType.ISO_NORM && file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Standard documents must be PDF (STD-001).');
    }

    const titleRaw = dto.title != null ? String(dto.title).trim() : '';
    const referenceRaw =
      dto.reference != null ? String(dto.reference).trim() : dto.isoStandard != null ? String(dto.isoStandard).trim() : '';
    const standardCategoryRaw = dto.standardCategory != null ? String(dto.standardCategory).trim() : '';
    const productReferenceRaw = dto.productReference != null ? String(dto.productReference).trim() : '';
    const productCategoryRaw = dto.productCategory != null ? String(dto.productCategory).trim() : '';
    const computedProductCategory = productCategoryRaw || 'GENERAL';
    const computedStandardRef =
      referenceRaw || this.autoReference(titleRaw || file.originalname, standardCategoryRaw || 'STD');
    const computedProductRef =
      productReferenceRaw || (dto.productName?.trim() ? this.autoReference(dto.productName.trim(), 'PRD') : '');

    /**
     * Copyright guardrail: Qurelio only accepts freely usable, publicly published
     * documents. A title that names a licensed standards body is refused unless
     * the uploader explicitly accepts responsibility, the acknowledgement is then
     * stored on the row as evidence that the warning was shown.
     */
    const copyrightAck =
      dto.copyrightAck === true || String(dto.copyrightAck ?? '').toLowerCase() === 'true';
    let copyrightFlag: string | null = null;

    if (t === DocumentType.ISO_NORM) {
      if (!titleRaw) throw new BadRequestException('Standard title is required');
      if (!standardCategoryRaw) throw new BadRequestException('Standard category is required');
      if (!['ISO_NORM', 'EN'].includes(standardCategoryRaw)) {
        throw new BadRequestException('Standard category must be ISO_NORM or EN');
      }

      const finding = detectLicensedStandard(titleRaw, file.originalname, referenceRaw);
      if (finding) {
        if (!copyrightAck) {
          throw new BadRequestException(licensedStandardWarning(finding));
        }
        copyrightFlag = `${finding.body}: ${finding.evidence}`;
        this.logger.warn(
          `Licensed-standard upload accepted under user responsibility (${copyrightFlag}) by ${userId}`,
        );
      }
    }
    /** Onboarding wizard uploads into an already-created folder by id; name lookup stays for every other caller. */
    const productIdRaw = dto.productId != null ? String(dto.productId).trim() : '';

    if (t === DocumentType.PRODUCT_DOC) {
      if (!productIdRaw && !dto.productName?.trim()) throw new BadRequestException('Product title is required');
    }

    let productId: string | undefined;
    let productName: string | undefined;
    if (productIdRaw) {
      const product = await this.productRepo.findOne({ where: { id: productIdRaw, companyId } });
      if (!product) throw new NotFoundException('Product not found');
      if (product.archivedAt) {
        throw new ConflictException('This product is archived. Restore it before uploading files.');
      }
      const patch: Partial<Product> = {};
      if (!product.reference) patch.reference = this.autoReference(product.name, 'PRD');
      if (productCategoryRaw) {
        const tags = new Set([...(product.categoryTags ?? [])]);
        tags.add(productCategoryRaw);
        patch.categoryTags = [...tags];
      }
      if (Object.keys(patch).length) {
        await this.productRepo.update(product.id, patch);
      }
      productId = product.id;
      productName = product.name;
    } else if (dto.productName?.trim()) {
      const name = dto.productName.trim();
      let product = await this.findProductByNormalizedName(companyId, name);
      if (!product) {
        product = this.productRepo.create({
          companyId,
          name,
          description: dto.description,
          reference: computedProductRef || undefined,
          categoryTags: [computedProductCategory],
        });
        await this.productRepo.save(product);
        this.logger.log(`Product auto-created: ${product.id} (${name})`);
      } else if (product.archivedAt) {
        throw new ConflictException('A product with this name is archived. Restore it or choose another product name.');
      } else {
        const patch: Partial<Product> = {};
        if (computedProductRef && !product.reference) patch.reference = computedProductRef;
        if (computedProductCategory) {
          const tags = new Set([...(product.categoryTags ?? [])]);
          tags.add(computedProductCategory);
          patch.categoryTags = [...tags];
        }
        if (Object.keys(patch).length) {
          await this.productRepo.update(product.id, patch);
        }
      }
      productId = product.id;
      productName = product.name;
    }

    if (t === DocumentType.WORKSPACE_FILE) {
      const cat = dto.workspaceCategory != null ? String(dto.workspaceCategory).trim() : '';
      if (!cat) throw new BadRequestException('Document category is required for workspace records');
      if (cat.length > 120) throw new BadRequestException('Category is too long (max 120 characters)');
    }

    const displayTitle =
      t === DocumentType.ISO_NORM
        ? titleRaw
        : file.originalname;

    await this.assertUniqueDocumentName(companyId, t, displayTitle, productId);

    const key = this.storage.buildKey(companyId, dto.type, file.originalname, productName, productId);

    const skipExtraction = t === DocumentType.WORKSPACE_FILE;
    const approval =
      t === DocumentType.ISO_NORM ? null : DocumentApprovalStatus.DRAFT;
    const library =
      t === DocumentType.ISO_NORM ? StandardLibraryStatus.PROCESSING : null;

    const wsCat =
      t === DocumentType.WORKSPACE_FILE && dto.workspaceCategory != null
        ? String(dto.workspaceCategory).trim().slice(0, 120)
        : null;
    const workspaceRef =
      t === DocumentType.WORKSPACE_FILE
        ? this.autoReference(file.originalname, 'CAP')
        : undefined;
    const uploadEffectiveDate = dto.effectiveDate
      ? new Date(dto.effectiveDate)
      : t === DocumentType.ISO_NORM || t === DocumentType.WORKSPACE_FILE
        ? new Date()
        : undefined;

    const doc = this.docRepo.create({
      name: displayTitle,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      type: t,
      status: skipExtraction ? DocumentStatus.READY : DocumentStatus.PROCESSING,
      approvalStatus: approval,
      libraryStatus: library,
      storageKey: key,
      companyId,
      productId,
      folderId: dto.folderId?.trim() ? dto.folderId.trim() : null,
      uploadedBy: userId,
      description: dto.description,
      isoStandard:
        t === DocumentType.ISO_NORM
          ? computedStandardRef
          : t === DocumentType.WORKSPACE_FILE
            ? workspaceRef
            : dto.isoStandard,
      tags:
        t === DocumentType.ISO_NORM
          ? [standardCategoryRaw]
          : t === DocumentType.PRODUCT_DOC
            ? [computedProductCategory]
            : t === DocumentType.WORKSPACE_FILE && wsCat
              ? [wsCat]
              : dto.tags || [],
      effectiveDate: uploadEffectiveDate,
      copyrightAcknowledged: !!copyrightFlag,
      copyrightFlag,
      ...(t === DocumentType.WORKSPACE_FILE
        ? {
            workspaceActive: false,
            workspaceCategory: wsCat,
          }
        : {}),
    });
    await this.docRepo.save(doc);
    this.logger.log(`Document uploaded: ${doc.id} (${file.originalname})`);
    await this.audit.log(companyId, doc.id, userId, 'UPLOAD', { name: doc.name, type: doc.type });
    if (copyrightFlag) {
      // Separate entry so the acknowledgement is auditable on its own.
      await this.audit.log(companyId, doc.id, userId, 'COPYRIGHT_ACK', {
        matched: copyrightFlag,
        name: doc.name,
      });
    }
    // The MinIO PUT is the only step left that scales with file size (a 150-page
    // standard can be tens of MB). Doing it before responding is what tripped the
    // client's 300s upload timeout on large standards even though extraction
    // itself was already async — the multipart body was fully received, but the
    // HTTP response was still waiting on the object-storage write. Deferring it
    // here lets the client get its document id back immediately; extraction is
    // queued only once the file actually lands in storage.
    void this.storeAndQueueExtraction(doc.id, key, file.buffer, file.mimetype, skipExtraction);
    return { id: doc.id, name: doc.name, type: doc.type, status: doc.status, productId, createdAt: doc.createdAt };
  }

  private async storeAndQueueExtraction(
    documentId: string,
    key: string,
    buffer: Buffer,
    mimeType: string,
    skipExtraction: boolean,
  ): Promise<void> {
    try {
      await this.storage.upload(key, buffer, mimeType);
    } catch (e: any) {
      const msg = `Storage write failed: ${(e?.message ?? String(e)).slice(0, 2000)}`;
      this.logger.error(`Object storage upload failed for ${documentId}: ${msg}`);
      await this.docRepo.update(documentId, { status: DocumentStatus.FAILED, processingError: msg });
      return;
    }
    if (!skipExtraction) await this.queueRagExtraction(documentId);
  }

  private async queueRagExtraction(documentId: string): Promise<void> {
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) return;
    try {
      await this.ingest.postIngestJob(doc);
    } catch (e: any) {
      const msg = (e?.message ?? String(e)).slice(0, 2000);
      this.logger.warn(`RAG pipeline request failed for ${documentId}: ${msg}`);
      await this.docRepo.update(documentId, {
        status: DocumentStatus.FAILED,
        processingError: msg,
        libraryStatus: doc.type === DocumentType.ISO_NORM ? StandardLibraryStatus.PROCESSING : doc.libraryStatus,
      });
    }
  }

  private normalizeName(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private autoReference(seed: string, prefix = 'REF'): string {
    const cleaned = seed
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '');
    const base = cleaned.slice(0, 6) || prefix;
    const suffix = Date.now().toString().slice(-6);
    return `${base}${suffix}`;
  }

  private async findProductByNormalizedName(companyId: string, name: string): Promise<Product | null> {
    return this.productRepo
      .createQueryBuilder('p')
      .where('p.companyId = :companyId', { companyId })
      .andWhere("LOWER(REGEXP_REPLACE(TRIM(p.name), '[[:space:]]+', ' ', 'g')) = :name", {
        name: this.normalizeName(name),
      })
      .getOne();
  }

  private async assertUniqueDocumentName(
    companyId: string,
    type: DocumentType,
    originalName: string,
    productId?: string,
    excludeDocumentId?: string,
  ): Promise<void> {
    const name = originalName?.trim();
    if (!name) throw new BadRequestException('File name is required');

    const qb = this.docRepo
      .createQueryBuilder('d')
      .where('d.companyId = :companyId', { companyId })
      .andWhere('d.type = :type', { type })
      .andWhere('d.archivedAt IS NULL')
      .andWhere("LOWER(REGEXP_REPLACE(TRIM(d.name), '[[:space:]]+', ' ', 'g')) = :name", {
        name: this.normalizeName(name),
      });

    if (productId) {
      qb.andWhere('d.productId = :productId', { productId });
    } else {
      qb.andWhere('d.productId IS NULL');
    }
    if (excludeDocumentId) {
      qb.andWhere('d.id != :excludeDocumentId', { excludeDocumentId });
    }

    const existing = await qb.getOne();
    if (!existing) return;

    throw new ConflictException(
      productId
        ? 'A file with this name already exists in this product. Upload it as a new version or rename the file.'
        : 'A file with this name already exists in this library. Upload it as a new version or rename the file.',
    );
  }

  async applyExtractionFromRag(
    documentId: string,
    body: {
      company_id: string;
      status: string;
      extracted_text?: string | null;
      extracted_structured?: Record<string, unknown> | null;
      processing_error?: string | null;
      /** Set by the RAG copyright scan when the text looks like a licensed standard. */
      copyright_finding?: string | null;
      extraction_progress?: Record<string, unknown> | null;
    },
  ) {
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.companyId !== body.company_id) throw new ForbiddenException('Company mismatch');
    if (doc.type === DocumentType.WORKSPACE_FILE) {
      this.logger.warn(`Ignoring RAG extraction callback for workspace file ${documentId}`);
      return { ok: true, ignored: true };
    }

    if (body.status === 'PROCESSING' && body.extraction_progress) {
      if (doc.status !== DocumentStatus.PROCESSING && doc.status !== DocumentStatus.UPLOADED) return { ok: true, ignored: true };
      await this.docRepo.update(documentId, {
        status: DocumentStatus.PROCESSING,
        extractedStructured: {
          ...((doc.extractedStructured as any) ?? {}),
          standardExtractionProgress: body.extraction_progress,
        } as any,
      });
      return { ok: true };
    }

    const ok = body.status === 'READY';
    const structured = (body.extracted_structured ?? null) as unknown as ExtractedStructure | null;

    const quarantine = (body.copyright_finding ?? '').trim();

    const patch: Partial<Document> = {
      status: ok ? DocumentStatus.READY : DocumentStatus.FAILED,
      // A failed retry should not erase the previous partial extraction.
      extractedText: ok ? (body.extracted_text ?? null) : (body.extracted_text ?? doc.extractedText),
      extractedStructured: (ok ? structured : (structured ?? doc.extractedStructured)) as any,
      processingError: body.processing_error ?? null,
    };

    /**
     * Copyright guardrail: the content scan found publisher boilerplate. The
     * document stays stored but is held back: no vectors were written, and
     * activation is refused: until a Quality Manager accepts responsibility.
     * An acknowledgement already given at upload is not overridden.
     */
    if (quarantine && !doc.copyrightAcknowledged) {
      patch.copyrightFlag = quarantine.slice(0, 500);
      patch.copyrightQuarantined = true;
      this.logger.warn(`Document ${documentId} quarantined by copyright scan: ${quarantine.slice(0, 160)}`);
    }

    if (ok && doc.type === DocumentType.ISO_NORM) {
      /** STD-002 / STD-004: extraction complete → Processing until QM activates (vectors indexed on activation). */
      patch.libraryStatus = StandardLibraryStatus.PROCESSING;
      const meta = structured?.standardMetadata;
      if (meta?.reference) patch.isoStandard = meta.reference.slice(0, 512);
      if (meta?.categories?.length) patch.tags = meta.categories;
      if (meta?.effectiveDate) {
        const d = new Date(meta.effectiveDate);
        if (!Number.isNaN(d.getTime())) patch.effectiveDate = d;
      }
    }

    await this.docRepo.update(documentId, patch);

    const updated = await this.docRepo.findOne({ where: { id: documentId } });

    if (ok && doc.productId && (structured?.productProfile || (structured?.productFacts?.length ?? 0) > 0)) {
      await this.mergeProductProfile(
        doc.productId,
        structured?.productProfile ?? ({} as any),
        doc.id,
        doc.name,
        (structured as any)?.fieldSources ?? {},
        (structured as any)?.fieldEvidence ?? {},
        (structured as any)?.customFields ?? [],
        (structured as any)?.extractionQuality?.groundedFields ?? [],
        (structured as any)?.productFacts ?? [],
      );
    }

    if (updated) {
      void this.notifyUserExtractionComplete(updated, ok);
    }

    try {
      await this.audit.log(doc.companyId, documentId, doc.uploadedBy, 'PROCESSING_COMPLETE', {
        status: body.status,
      });
      if (quarantine && !doc.copyrightAcknowledged) {
        await this.audit.log(doc.companyId, documentId, doc.uploadedBy, 'COPYRIGHT_QUARANTINE', {
          reason: quarantine.slice(0, 500),
        });
      }
    } catch (e: any) {
      this.logger.warn(`Audit log after extraction failed: ${e?.message ?? e}`);
    }

    return { ok: true };
  }

  /**
   * Quality Manager accepts responsibility for a quarantined document.
   *
   * This lifts the hold so the standard can be activated and indexed. The
   * decision is recorded: who, when, and what the scan matched, because it is
   * the evidence that the warning was shown and accepted.
   */
  async acknowledgeCopyright(
    id: string,
    companyId: string,
    actorId: string,
    actorRole: string,
  ) {
    if (!['DIRECTOR', 'QUALITY_MANAGER'].includes(actorRole)) {
      throw new ForbiddenException(
        'Only Company Admin or Quality Manager can accept responsibility for a licensed document',
      );
    }
    const doc = await this.docRepo.findOne({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (!doc.copyrightQuarantined && doc.copyrightAcknowledged) {
      return { ok: true, alreadyAcknowledged: true };
    }

    await this.docRepo.update(id, {
      copyrightAcknowledged: true,
      copyrightQuarantined: false,
    });
    await this.audit.log(companyId, id, actorId, 'COPYRIGHT_ACK', {
      matched: doc.copyrightFlag ?? null,
      via: 'quarantine-release',
    });
    this.logger.warn(
      `Copyright quarantine released for ${id} by ${actorId} (${doc.copyrightFlag ?? 'no flag'})`,
    );
    return { ok: true };
  }

  private canEditExtractedContent(
    actorId: string,
    user: { id: string; role: string; department?: string },
    doc: Document,
    rules: DocumentAccessRule[],
  ): boolean {
    if (doc.archivedAt) return false;
    if (!this.acl.isAllowed(doc, user, rules)) return false;
    if (['DIRECTOR', 'QUALITY_MANAGER'].includes(user.role)) return true;
    return doc.uploadedBy === actorId;
  }

  private canArchiveDocument(actorId: string, actorRole: string, doc: Document): boolean {
    if (doc.uploadedBy === actorId) return true;
    return ['DIRECTOR', 'QUALITY_MANAGER'].includes(actorRole);
  }

  private async mergeProductProfile(
    productId: string,
    profile: ProductProfile,
    documentId: string,
    documentName: string,
    fieldSources: Record<string, string>,
    fieldEvidence: Record<string, string>,
    customFieldsIncoming: { label: string; value: string; category?: string | null; importance?: string | null }[] = [],
    groundedFields: string[] = [],
    productFactsIncoming: Array<{
      category?: string | null;
      label?: string | null;
      value?: string | null;
      unit?: string | null;
      importance?: ProductFactRecord['importance'];
      grounded?: boolean | null;
      sourceHint?: string | null;
      evidence?: string | null;
    }> = [],
  ): Promise<void> {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) return;

    const contributingCount = await this.docRepo.count({
      where: { productId, status: DocumentStatus.READY },
    });

    const { merged, provenance, conflicts } = mergeProductProfileFields(
      product.mergedProfile,
      JSON.parse(JSON.stringify(profile)),
      documentId,
      documentName,
      fieldSources,
      fieldEvidence,
      (product.fieldProvenance as FieldProvenanceMap) ?? null,
      (product.fieldConflicts as FieldConflictMap) ?? null,
      groundedFields,
    );
    const customFields = mergeCustomFields(product.customFields as any, customFieldsIncoming);
    const productFacts = mergeProductFacts(product.productFacts as any, productFactsIncoming, documentId, documentName);

    const quality = computeProductExtractionQuality(merged, contributingCount || 1, provenance, productFacts);
    const coverage = computeRequirementCoverage(product.requiredCertifications, merged);
    const conflictCount = Object.keys(conflicts).length;
    const summary = generateReadinessSummary(quality, coverage, conflictCount, customFields.length);

    const basic = (merged as any).basicInformation ?? {};
    const upd: Partial<Product> = {
      mergedProfile: merged,
      customFields: customFields as any,
      productFacts: productFacts as any,
      fieldProvenance: provenance,
      fieldConflicts: conflicts,
      extractionQuality: quality as unknown as Record<string, unknown>,
      requirementCoverage: coverage as unknown as Record<string, unknown> | null,
      readinessSummary: summary,
    };
    if (basic.reference) upd.reference = basic.reference;
    if (basic.revision) upd.revision = basic.revision;
    if (basic.category) {
      const tags = new Set([...(product.categoryTags ?? [])]);
      tags.add(basic.category);
      upd.categoryTags = [...tags];
    }
    await this.productRepo.update(productId, upd);
  }

  /**
   * Fully rebuild a product's mergedProfile / fieldProvenance / fieldConflicts
   * / extractionQuality / requirementCoverage / readinessSummary / customFields
   * from scratch, replaying every currently-attached READY document's
   * extraction in upload order. Used after a document is detached/reassigned
   * from a product, so the product's data never keeps a "ghost" contribution
   * from a document that no longer belongs to it. Full replay is used instead
   * of trying to "subtract" a document's contribution because the merge is
   * additive-only by design — subtracting precisely would be a much easier
   * source of subtle bugs than recomputing from the remaining documents.
   */
  private async rebuildProductMergedProfile(productId: string): Promise<void> {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) return;

    const docs = await this.docRepo.find({
      where: { productId, status: DocumentStatus.READY },
      order: { createdAt: 'ASC' },
    });

    let merged: Record<string, unknown> = {};
    let provenance: FieldProvenanceMap = {};
    let conflicts: FieldConflictMap = {};
    let customFields: { label: string; value: string; category?: string | null }[] = [];
    let productFacts: ProductFactRecord[] = [];

    for (const d of docs) {
      const profile = d.extractedStructured?.productProfile ?? {};
      const fieldSources = ((d.extractedStructured as any)?.fieldSources ?? {}) as Record<string, string>;
      const fieldEvidence = ((d.extractedStructured as any)?.fieldEvidence ?? {}) as Record<string, string>;
      const groundedFields = ((d.extractedStructured as any)?.extractionQuality?.groundedFields ?? []) as string[];
      const result = mergeProductProfileFields(
        merged,
        JSON.parse(JSON.stringify(profile)),
        d.id,
        d.name,
        fieldSources,
        fieldEvidence,
        provenance,
        conflicts,
        groundedFields,
      );
      merged = result.merged;
      provenance = result.provenance;
      conflicts = result.conflicts;
      customFields = mergeCustomFields(customFields, (d.extractedStructured as any)?.customFields ?? []);
      productFacts = mergeProductFacts(productFacts, (d.extractedStructured as any)?.productFacts ?? [], d.id, d.name);
    }

    const quality = computeProductExtractionQuality(merged, docs.length || 0, provenance, productFacts);
    const coverage = computeRequirementCoverage(product.requiredCertifications, merged);
    const summary = generateReadinessSummary(quality, coverage, Object.keys(conflicts).length, customFields.length);

    const basic = (merged as any).basicInformation ?? {};
    const upd: Partial<Product> = {
      mergedProfile: Object.keys(merged).length ? merged : null,
      fieldProvenance: Object.keys(provenance).length ? provenance : null,
      fieldConflicts: Object.keys(conflicts).length ? conflicts : null,
      extractionQuality: quality as unknown as Record<string, unknown>,
      requirementCoverage: coverage as unknown as Record<string, unknown> | null,
      readinessSummary: summary,
      customFields: customFields.length ? (customFields as any) : null,
      productFacts: productFacts.length ? (productFacts as any) : null,
    };
    if (basic.reference) upd.reference = basic.reference;
    if (basic.revision) upd.revision = basic.revision;
    await this.productRepo.update(productId, upd);
  }

  /**
   * Move a document to a different product (or detach it entirely by passing
   * null), then rebuild BOTH the old and new product's merged profiles so
   * neither one keeps a stale contribution from this document, nor misses
   * the one it should now have.
   */
  async reassignDocumentProduct(
    documentId: string,
    companyId: string,
    newProductId: string | null,
    userId: string,
  ): Promise<{ ok: true }> {
    const doc = await this.docRepo.findOne({ where: { id: documentId, companyId } });
    if (!doc) throw new NotFoundException('Document not found');

    if (newProductId) {
      const target = await this.productRepo.findOne({ where: { id: newProductId, companyId } });
      if (!target) throw new NotFoundException('Target product not found');
    }

    const oldProductId = doc.productId ?? null;
    if (oldProductId === newProductId) return { ok: true };

    await this.docRepo.update(documentId, { productId: newProductId ?? undefined } as any);

    if (oldProductId) await this.rebuildProductMergedProfile(oldProductId);
    if (newProductId) await this.rebuildProductMergedProfile(newProductId);

    try {
      await this.audit.log(companyId, documentId, userId, 'DOCUMENT_PRODUCT_REASSIGNED', {
        fromProductId: oldProductId,
        toProductId: newProductId,
      });
    } catch (e: any) {
      this.logger.warn(`Audit log for document reassignment failed: ${e?.message ?? e}`);
    }

    return { ok: true };
  }

  /**
   * Let a user resolve a field conflict (two documents disagreed on a value)
   * by picking which candidate value should become authoritative in
   * mergedProfile.
   */
  async resolveProductFieldConflict(
    productId: string,
    companyId: string,
    fieldPath: string,
    chosenDocumentId: string,
    chosenValue: string,
    resolvedBy: string,
  ): Promise<Product> {
    const product = await this.productRepo.findOne({ where: { id: productId, companyId } });
    if (!product) throw new NotFoundException('Product not found');

    const merged = JSON.parse(JSON.stringify(product.mergedProfile ?? {}));
    const parts = fieldPath.split('.');
    let node: any = merged;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = chosenValue;

    const chosenDoc = await this.docRepo.findOne({ where: { id: chosenDocumentId } });
    const provenance = { ...((product.fieldProvenance as any) ?? {}) };
    provenance[fieldPath] = {
      value: chosenValue,
      documentId: chosenDocumentId,
      documentName: chosenDoc?.name ?? 'unknown document',
      updatedAt: new Date().toISOString(),
      resolvedManuallyBy: resolvedBy,
      // A human explicitly picked this value, so it no longer needs an AI
      // grounding flag — treat it as confirmed.
      grounded: true,
    };

    const conflicts = { ...((product.fieldConflicts as any) ?? {}) };
    delete conflicts[fieldPath];

    const contributingCount = await this.docRepo.count({ where: { productId, status: DocumentStatus.READY } });
    const quality = computeProductExtractionQuality(merged, contributingCount || 1, provenance, (product.productFacts as any) ?? []);
    const coverage = computeRequirementCoverage(product.requiredCertifications, merged);
    const summary = generateReadinessSummary(quality, coverage, Object.keys(conflicts).length, (product.customFields ?? []).length);

    await this.productRepo.update(productId, {
      mergedProfile: merged,
      fieldProvenance: provenance,
      fieldConflicts: conflicts,
      extractionQuality: quality as unknown as Record<string, unknown>,
      requirementCoverage: coverage as unknown as Record<string, unknown> | null,
      readinessSummary: summary,
    });

    try {
      await this.audit.log(companyId, productId, resolvedBy, 'PRODUCT_FIELD_CONFLICT_RESOLVED', {
        fieldPath,
        chosenValue,
        chosenDocumentId,
      });
    } catch (e: any) {
      this.logger.warn(`Audit log for conflict resolution failed: ${e?.message ?? e}`);
    }

    return (await this.productRepo.findOne({ where: { id: productId } }))!;
  }

  /** In-app notification + optional legacy webhook (DOC-002). */
  private async notifyUserExtractionComplete(doc: Document, success: boolean): Promise<void> {
    const base = process.env.NOTIFICATION_SERVICE_URL?.trim();
    const token = (process.env.NOTIFICATION_INTERNAL_TOKEN || process.env.DOCUMENT_INTERNAL_TOKEN || '').trim();
    if (base) {
      try {
        await axios.post(
          `${base.replace(/\/$/, '')}/api/notifications/internal/document-extraction-complete`,
          {
            companyId: doc.companyId,
            userId: doc.uploadedBy,
            documentId: doc.id,
            documentName: doc.name,
            success,
            isStandard: doc.type === DocumentType.ISO_NORM,
          },
          {
            timeout: 12_000,
            headers: token ? { 'X-Internal-Token': token } : {},
          },
        );
      } catch (e: any) {
        this.logger.warn(`Notification service: ${e?.message ?? e}`);
      }
    }
    const webhook = process.env.INGESTION_WEBHOOK_URL?.trim();
    if (webhook && success) {
      try {
        await axios.post(
          webhook,
          { event: 'document.ingestion.complete', documentId: doc.id, companyId: doc.companyId },
          { timeout: 5000 },
        );
      } catch (e: any) {
        this.logger.warn(`Ingestion webhook failed: ${e?.message ?? e}`);
      }
    }
  }

  async addVersion(
    id: string,
    companyId: string,
    userId: string,
    actorRole: string,
    file: Express.Multer.File,
    changeNote?: string,
  ) {
    const doc = await this.docRepo.findOne({ where: { id, companyId }, relations: ['product'] });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.archivedAt) throw new BadRequestException('Document is archived');
    if (doc.type === DocumentType.ISO_NORM && !canManageStandards(actorRole)) {
      throw new ForbiddenException(
        'Only Company Admin or Quality Manager can upload a new version of a standard document',
      );
    }
    if (doc.type === DocumentType.ISO_NORM && file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Standard document versions must be PDF (STD-001).');
    }
    if (!ALLOWED_MIMES.has(file.mimetype) && !ALLOWED_EXTS.has(fileExt(file.originalname)))
      throw new BadRequestException(`File type not allowed: ${file.originalname}`);
    if (file.size > MAX_BYTES)
      throw new BadRequestException('File exceeds 50 MB limit');
    await this.assertUniqueDocumentName(companyId, doc.type, file.originalname, doc.productId, id);

    /** STD-005 / STD-006: drop old vectors until the new version is extracted and activated again. */
    if (doc.type === DocumentType.ISO_NORM) {
      this.ingest.onDocumentDeleted(id, companyId);
    }

    await this.versionRepo
      .createQueryBuilder()
      .update(DocumentVersion)
      .set({ archived: true })
      .where('document_id = :id', { id })
      .execute();

    const newVersionNumber = (doc.version || 1) + 1;
    const key = this.storage.buildKey(companyId, doc.type, file.originalname, doc.product?.name, doc.productId);

    const version = this.versionRepo.create({
      version: newVersionNumber,
      storageKey: key,
      sizeBytes: file.size,
      uploadedBy: userId,
      changeNote: changeNote ?? null,
      archived: false,
      document: doc,
    });
    await this.versionRepo.save(version);

    const lib =
      doc.type === DocumentType.ISO_NORM ? StandardLibraryStatus.PROCESSING : doc.libraryStatus;
    const skipExtraction = doc.type === DocumentType.WORKSPACE_FILE;

    await this.docRepo.update(id, {
      storageKey: key,
      name: file.originalname,
      version: newVersionNumber,
      sizeBytes: file.size,
      mimeType: file.mimetype,
      status: skipExtraction ? DocumentStatus.READY : DocumentStatus.PROCESSING,
      extractedText: null,
      extractedStructured: null,
      processingError: null,
      manualTextOverride: null,
      libraryStatus: lib,
      ...(doc.type !== DocumentType.ISO_NORM
        ? { approvalStatus: DocumentApprovalStatus.DRAFT }
        : {}),
    });

    this.logger.log(`New version v${newVersionNumber} added to doc ${id}`);
    await this.audit.log(companyId, id, userId, 'VERSION', { version: newVersionNumber });
    // Same reasoning as uploadOne: defer the MinIO write past the response so a
    // large new version cannot hold the version-upload request open long enough
    // to trip the client's upload timeout.
    void this.storeAndQueueExtraction(id, key, file.buffer, file.mimetype, skipExtraction);
    return this.getOneInternal(id, companyId, userId, true, undefined);
  }

  async retryExtraction(
    id: string,
    companyId: string,
    actorId: string,
    user: { id: string; role: string; department?: string },
  ) {
    const doc = await this.docRepo.findOne({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.archivedAt) throw new BadRequestException('Document is archived');
    if (doc.type === DocumentType.WORKSPACE_FILE) {
      throw new BadRequestException('This document type is not processed by extraction');
    }
    const incompleteStandard = doc.type === DocumentType.ISO_NORM &&
      doc.status === DocumentStatus.READY &&
      (doc.extractedStructured as any)?.standardExtractionQuality?.processingComplete === false;
    if (doc.status !== DocumentStatus.FAILED && !incompleteStandard) {
      throw new BadRequestException('Only failed or incomplete extractions can be retried');
    }

    const rules = await this.accessRuleRepo.find({ where: { documentId: id } });
    if (!this.canEditExtractedContent(actorId, user, doc, rules)) {
      throw new ForbiddenException('You cannot retry extraction for this document');
    }

    await this.docRepo.update(id, {
      status: DocumentStatus.PROCESSING,
      processingError: null,
      libraryStatus: doc.type === DocumentType.ISO_NORM ? StandardLibraryStatus.PROCESSING : doc.libraryStatus,
    });

    await this.audit.log(companyId, id, actorId, 'RETRY_EXTRACTION', {});
    void this.queueRagExtraction(id);
    return this.getOneInternal(id, companyId, actorId, true, user);
  }

  async list(companyId: string, filter: ListFilter, user: { id: string; role: string; department?: string }) {
    const qb = this.docRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.product', 'product')
      .where('d.companyId = :companyId', { companyId });

    /**
     * Files uploaded into an unactivated onboarding draft are not part of the library
     * yet: the product itself does not exist as far as the user is concerned. Applied
     * unconditionally so they stay out of the trash view too.
     */
    qb.andWhere(
      '(d.productId IS NULL OR product.onboardingStatus IS NULL OR product.onboardingStatus != :draftStatus)',
      { draftStatus: PRODUCT_DRAFT_STATUS },
    );

    const incArchived = filter.includeArchived === true || filter.includeArchived === 'true';
    if (!incArchived) {
      qb.andWhere('d.archivedAt IS NULL');
      /** Hide files under an archived product folder (DOC-007). */
      qb.andWhere('(d.productId IS NULL OR product.archivedAt IS NULL)');
    }

    const archivedOnly = filter.archivedOnly === true || filter.archivedOnly === 'true';
    if (archivedOnly) qb.andWhere('d.archivedAt IS NOT NULL');

    if (filter.type) qb.andWhere('d.type = :type', { type: filter.type });
    if (filter.excludeType) qb.andWhere('d.type != :ext', { ext: filter.excludeType });
    const hasProduct = filter.hasProduct === true || filter.hasProduct === 'true';
    if (hasProduct) qb.andWhere('d.productId IS NOT NULL');
    if (filter.isoStandard) qb.andWhere('d.isoStandard ILIKE :iso', { iso: `%${filter.isoStandard}%` });
    if (filter.search) {
      qb.andWhere(
        '(d.name ILIKE :s OR d.description ILIKE :s OR COALESCE(array_to_string(d.tags, \' \'), \'\') ILIKE :s OR COALESCE(d.extractedText, \'\') ILIKE :s OR COALESCE(d.isoStandard, \'\') ILIKE :s)',
        { s: `%${filter.search}%` },
      );
    }
    if (filter.tag) qb.andWhere(':tg = ANY(d.tags)', { tg: filter.tag });
    if (filter.folderId === 'none') qb.andWhere('d.folderId IS NULL');
    else if (filter.folderId) qb.andWhere('d.folderId = :fid', { fid: filter.folderId });
    if (filter.productId) qb.andWhere('d.productId = :pid', { pid: filter.productId });
    if (filter.uploadedBy) qb.andWhere('d.uploadedBy = :uid', { uid: filter.uploadedBy });
    if (filter.approvalStatus) qb.andWhere('d.approvalStatus = :ap', { ap: filter.approvalStatus });
    if (filter.libraryStatus) qb.andWhere('d.libraryStatus = :ls', { ls: filter.libraryStatus });
    if (filter.status) qb.andWhere('d.status = :st', { st: filter.status });

    if (filter.fromDate && filter.toDate) {
      qb.andWhere('d.createdAt BETWEEN :fd AND :td', {
        fd: new Date(filter.fromDate),
        td: new Date(filter.toDate),
      });
    } else if (filter.fromDate) {
      qb.andWhere('d.createdAt >= :fd', { fd: new Date(filter.fromDate) });
    } else if (filter.toDate) {
      qb.andWhere('d.createdAt <= :td', { td: new Date(filter.toDate) });
    }

    qb.orderBy('d.createdAt', 'DESC');
    let docs = await qb.getMany();

    const ids = docs.map((d) => d.id);
    if (ids.length) {
      const rules = await this.accessRuleRepo.find({ where: { documentId: In(ids) } });
      const byDoc = new Map<string, DocumentAccessRule[]>();
      for (const r of rules) {
        if (!byDoc.has(r.documentId)) byDoc.set(r.documentId, []);
        byDoc.get(r.documentId)!.push(r);
      }
      docs = docs.filter((d) =>
        this.acl.isAllowed(d, user, byDoc.get(d.id) ?? [], { includeArchivedAccess: incArchived }),
      );
    }

    return docs.map((d) => ({ ...d, sizeBytes: Number(d.sizeBytes) }));
  }

  async getOne(id: string, companyId: string, userId: string, user: { id: string; role: string; department?: string }) {
    return this.getOneInternal(id, companyId, userId, false, user);
  }

  /**
   * Bounded, flat requirements view for one ISO_NORM document — the same
   * `requirementsSummary` embedded in the full document payload, exposed on
   * its own so callers that only need this (a future "Requirements" tab, and
   * the compliance engine) aren't forced to fetch every clause's full prose
   * (`sections[].content`) just to read the checkable requirement list.
   */
  async getRequirements(id: string, companyId: string) {
    const doc = await this.docRepo.findOne({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    const structured = doc.extractedStructured as any;
    return {
      documentId: doc.id,
      documentName: doc.name,
      standardMetadata: structured?.standardMetadata ?? null,
      standardExtractionQuality: structured?.standardExtractionQuality ?? null,
      requirementsSummary: structured?.requirementsSummary ?? {
        schemaVersion: 1,
        totalRequirements: 0,
        mandatoryCount: 0,
        recommendedCount: 0,
        informativeCount: 0,
        conditionalCount: 0,
        clausesWithRequirements: 0,
        clausesFlaggedMandatoryButEmpty: [],
        possiblyIncompleteClauses: [],
        ungroundedRequirementCount: 0,
        requirements: [],
      },
    };
  }

  private async getOneInternal(
    id: string,
    companyId: string,
    auditUserId: string,
    skipAudit: boolean,
    user?: { id: string; role: string; department?: string },
  ) {
    const doc = await this.docRepo.findOne({
      where: { id, companyId },
      relations: ['versions', 'product'],
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (user) {
      const rules = await this.accessRuleRepo.find({ where: { documentId: id } });
      if (!this.acl.isAllowed(doc, user, rules, { includeArchivedAccess: !!doc.archivedAt }))
        throw new ForbiddenException('Access denied');
    }
    if (!skipAudit) await this.audit.log(companyId, id, auditUserId, 'VIEW', {});
    /** Use GET /documents/:id/download (proxied through API), avoids MinIO presign host/Docker DNS issues. */
    return { ...doc, sizeBytes: Number(doc.sizeBytes), downloadUrl: null };
  }

  /**
   * Stream file from internal MinIO for GET /documents/:id/download (browser never talks to MinIO directly).
   */
  async getDownloadStream(
    id: string,
    companyId: string,
    userId: string,
    user: { id: string; role: string; department?: string },
  ): Promise<{ stream: Readable; filename: string; mimeType: string }> {
    const doc = await this.docRepo.findOne({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    const rules = await this.accessRuleRepo.find({ where: { documentId: id } });
    if (!this.acl.isAllowed(doc, user, rules, { includeArchivedAccess: !!doc.archivedAt }))
      throw new ForbiddenException('Access denied');
    await this.audit.log(companyId, id, userId, 'DOWNLOAD', {});
    const stream = await this.storage.getObjectStream(doc.storageKey);
    const filename = doc.name?.trim() || 'document';
    /** ISO standards are uploaded as PDF; DB mime can be wrong after pipeline, always serve as PDF. */
    const mimeType =
      doc.type === DocumentType.ISO_NORM
        ? 'application/pdf'
        : doc.mimeType?.trim() || 'application/octet-stream';
    return { stream, filename, mimeType };
  }

  async update(
    id: string,
    companyId: string,
    dto: any,
    actorId: string,
    user: { id: string; role: string; department?: string },
  ) {
    const existing = await this.docRepo.findOne({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Document not found');

    const patch: Partial<Document> = {};
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.tags !== undefined) patch.tags = dto.tags;
    if (dto.isoStandard !== undefined) patch.isoStandard = dto.isoStandard;
    if (dto.effectiveDate !== undefined) {
      patch.effectiveDate = dto.effectiveDate ? new Date(dto.effectiveDate) : undefined;
    }

    if (existing.type === DocumentType.WORKSPACE_FILE) {
      if (dto.workspaceCategory !== undefined) {
        const c = dto.workspaceCategory != null ? String(dto.workspaceCategory).trim() : '';
        if (!c) throw new BadRequestException('Category cannot be empty');
        if (c.length > 120) throw new BadRequestException('Category is too long (max 120 characters)');
        patch.workspaceCategory = c;
      }
      if (dto.workspaceActive !== undefined) {
        patch.workspaceActive = Boolean(dto.workspaceActive);
      }
    }

    if (Object.keys(patch).length) {
      await this.docRepo.update(id, patch);
    }
    await this.audit.log(companyId, id, actorId, 'UPDATE', { fields: Object.keys(dto ?? {}) });
    return this.getOneInternal(id, companyId, actorId, true, user);
  }

  /** Manual structured content edit (STD-003, segmentation) */
  async updateExtractedStructured(
    id: string,
    companyId: string,
    body: { extractedStructured: Record<string, unknown> },
    actorId: string,
    user: { id: string; role: string; department?: string },
  ) {
    if (!body?.extractedStructured || typeof body.extractedStructured !== 'object' || Array.isArray(body.extractedStructured)) {
      throw new BadRequestException('Structured extraction must be an object');
    }
    const doc = await this.docRepo.findOne({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.type === DocumentType.ISO_NORM && !canManageStandards(user.role)) {
      throw new ForbiddenException(
        'Only Company Admin or Quality Manager can edit standard document extraction',
      );
    }
    const rules = await this.accessRuleRepo.find({ where: { documentId: id } });
    if (!this.canEditExtractedContent(actorId, user, doc, rules)) {
      throw new ForbiddenException('You cannot edit extraction for this document');
    }
    /** Editing an active standard invalidates vectors until QM activates again (STD-003 / STD-006). */
    if (doc.type === DocumentType.ISO_NORM && doc.libraryStatus === StandardLibraryStatus.ACTIVE) {
      await this.docRepo.update(id, { libraryStatus: StandardLibraryStatus.PROCESSING });
      this.ingest.onDocumentDeleted(id, companyId);
    }
    const updated = doc.type === DocumentType.ISO_NORM
      ? markStandardExtractionForReview((doc.extractedStructured as any) ?? {}, body.extractedStructured)
      : body.extractedStructured;
    await this.docRepo.update(id, { extractedStructured: updated as any });
    await this.audit.log(companyId, id, actorId, 'EXTRACTION_EDIT', {});
    return this.getOneInternal(id, companyId, actorId, true, user);
  }

  async setManualText(
    id: string,
    companyId: string,
    body: { text: string },
    actorId: string,
    user: { id: string; role: string; department?: string },
  ) {
    const doc = await this.docRepo.findOne({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    const rules = await this.accessRuleRepo.find({ where: { documentId: id } });
    if (!this.canEditExtractedContent(actorId, user, doc, rules)) {
      throw new ForbiddenException('You cannot edit this document text');
    }
    await this.docRepo.update(id, {
      manualTextOverride: body.text,
      extractedText: body.text,
      status: DocumentStatus.READY,
      processingError: null,
    });
    await this.audit.log(companyId, id, actorId, 'MANUAL_TEXT', {});
    return this.getOneInternal(id, companyId, actorId, true, user);
  }

  async transferOwner(
    id: string,
    companyId: string,
    body: { userId: string },
    actorId: string,
    user: { id: string; role: string; department?: string },
  ) {
    const doc = await this.docRepo.findOne({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    await this.docRepo.update(id, { uploadedBy: body.userId });
    await this.audit.log(companyId, id, actorId, 'OWNER_CHANGE', { newOwner: body.userId });
    return this.getOneInternal(id, companyId, actorId, true, user);
  }

  async setApproval(
    id: string,
    companyId: string,
    body: { status: DocumentApprovalStatus },
    actorId: string,
    actorRole: string,
  ) {
    if (
      (body.status === DocumentApprovalStatus.APPROVED || body.status === DocumentApprovalStatus.REJECTED) &&
      !canApproveDocuments(actorRole)
    ) {
      throw new ForbiddenException('Approve Documents permission required (Company Admin or Quality Manager)');
    }
    const doc = await this.docRepo.findOne({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    await this.docRepo.update(id, { approvalStatus: body.status });
    await this.audit.log(companyId, id, actorId, 'APPROVAL', { status: body.status });
    return this.getOneInternal(id, companyId, actorId, true, { id: actorId, role: actorRole });
  }

  async submitForReview(
    id: string,
    companyId: string,
    actorId: string,
    user: { id: string; role: string; department?: string },
  ) {
    const doc = await this.docRepo.findOne({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    await this.docRepo.update(id, { approvalStatus: DocumentApprovalStatus.IN_REVIEW });
    await this.audit.log(companyId, id, actorId, 'SUBMIT_REVIEW', {});
    return this.getOneInternal(id, companyId, actorId, true, user);
  }

  async archive(id: string, companyId: string, actorId: string, actorRole: string) {
    const doc = await this.docRepo.findOne({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.type === DocumentType.ISO_NORM) {
      if (!canManageStandards(actorRole)) {
        throw new ForbiddenException(
          'Only Company Admin or Quality Manager can archive standard documents',
        );
      }
    } else if (doc.productId && doc.type !== DocumentType.WORKSPACE_FILE) {
      /** DOC-007: product-linked files: Company Admin (Director) archives. */
      if (actorRole !== 'DIRECTOR') {
        throw new ForbiddenException('Only Company Admin can archive product documents');
      }
    } else if (!this.canArchiveDocument(actorId, actorRole, doc)) {
      throw new ForbiddenException('You cannot archive this document');
    }
    await this.docRepo.update(id, {
      archivedAt: new Date(),
      libraryStatus: doc.type === DocumentType.ISO_NORM ? StandardLibraryStatus.ARCHIVED : doc.libraryStatus,
    });
    this.ingest.onDocumentDeleted(id, companyId);
    await this.audit.log(companyId, id, actorId, 'ARCHIVE', {});
    return { ok: true };
  }

  async restore(id: string, companyId: string, actorId: string, actorRole?: string) {
    const doc = await this.docRepo.findOne({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.type === DocumentType.ISO_NORM && actorRole && !canManageStandards(actorRole)) {
      throw new ForbiddenException(
        'Only Company Admin or Quality Manager can restore standard documents',
      );
    }
    const patch: Partial<Document> = { archivedAt: null };
    if (doc.type === DocumentType.ISO_NORM) {
      /** Vectors were removed on archive; QM must activate again after restore (STD-004/006). */
      patch.libraryStatus = StandardLibraryStatus.PROCESSING;
    }
    await this.docRepo.update(id, patch);
    if (
      doc.status === DocumentStatus.READY &&
      doc.type !== DocumentType.ISO_NORM &&
      doc.type !== DocumentType.WORKSPACE_FILE
    ) {
      void this.queueRagExtraction(id);
    }
    await this.audit.log(companyId, id, actorId, 'RESTORE', {});
    return { ok: true };
  }

  /** Remove per-document ACL rules so all company members can read (see DocumentAclService when rules.length === 0). */
  async shareWithCompany(id: string, companyId: string, actorId: string) {
    const doc = await this.docRepo.findOne({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.archivedAt) throw new BadRequestException('Document is archived');
    await this.accessRuleRepo.delete({ documentId: id });
    await this.audit.log(companyId, id, actorId, 'SHARE_COMPANY', {});
    return { ok: true, message: 'Document is visible to all company members' };
  }

  /** STD-004 / STD-006: QM activates after review; clause text is indexed for RAG evaluations. */
  async activateStandard(
    id: string,
    companyId: string,
    actorId: string,
    user: { id: string; role: string; department?: string },
  ) {
    if (!canManageStandards(user.role)) {
      throw new ForbiddenException(
        'Only Company Admin or Quality Manager can activate a standard document',
      );
    }
    const doc = await this.docRepo.findOne({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    // Activation is what triggers clause indexing into the vector store, so a
    // quarantined document must not get past this point.
    if (doc.copyrightQuarantined) {
      throw new ForbiddenException(
        doc.copyrightFlag
          ? `${doc.copyrightFlag}. Accept responsibility for this document before activating it, or delete it.`
          : 'This document is held by the copyright guardrail. Accept responsibility before activating it, or delete it.',
      );
    }
    if (doc.type !== DocumentType.ISO_NORM) throw new BadRequestException('Only standard documents can be activated');
    if (doc.archivedAt) throw new BadRequestException('Document is archived');
    if (doc.status !== DocumentStatus.READY) {
      throw new BadRequestException('Standard must finish extraction before activation');
    }
    const quality = (doc.extractedStructured as any)?.standardExtractionQuality;
    if (quality && quality.processingComplete === false) {
      const pending = Array.isArray(quality.pendingSemanticSections) ? quality.pendingSemanticSections.length : 0;
      const unreadable = Array.isArray(quality.unresolvedPages) ? quality.unresolvedPages.length : 0;
      throw new BadRequestException(
        unreadable > 0
          ? `Standard extraction is incomplete: ${unreadable} page(s) could not be read. Review the OCR settings or provide a readable copy.`
          : pending > 0
          ? `Standard extraction is incomplete: ${pending} semantic section(s) still need processing or retry before activation.`
          : 'Standard extraction is incomplete. Check the extraction warnings and retry before activation.',
      );
    }
    if (doc.libraryStatus === StandardLibraryStatus.ARCHIVED) {
      throw new BadRequestException('Archived standards cannot be activated');
    }
    if (doc.libraryStatus === StandardLibraryStatus.ACTIVE) {
      return this.getOneInternal(id, companyId, actorId, true, user);
    }
    const sections = this.getStructuredStandardSections(doc);
    const text = this.buildStandardClauseIndexText(doc);
    if (!text || text.length < 20) {
      throw new BadRequestException('No clause content to index. Edit extraction or wait for processing to complete.');
    }
    /** Persist ACTIVE first so eval-check and UI match immediately; RAG indexing continues in background. */
    await this.docRepo.update(id, { libraryStatus: StandardLibraryStatus.ACTIVE });
    await this.audit.log(companyId, id, actorId, 'STANDARD_ACTIVATED', {});
    this.scheduleStandardClauseIndexing(id, companyId, actorId, {
      documentId: doc.id,
      companyId: doc.companyId,
      text,
      isoStandard: this.resolveIsoNormReference(doc) || undefined,
      docType: doc.type,
      fileName: doc.name,
      version: doc.version,
      sections,
    });
    return this.getOneInternal(id, companyId, actorId, true, user);
  }

  private getStructuredStandardSections(doc: Document): Array<Record<string, any>> | undefined {
    const structured = (doc.extractedStructured as any) || {};
    const sections = Array.isArray(structured.sections) ? structured.sections : [];
    if (!sections.length) return undefined;
    return sections
      .filter((s: any) => s && typeof s === 'object' && (s.content || s.heading || s.clauseNumber))
      .map((s: any) => ({
        clauseNumber: s.clauseNumber ?? null,
        heading: s.heading ?? '',
        content: s.content ?? '',
        pageStart: s.pageStart ?? null,
        pageEnd: s.pageEnd ?? null,
        sourceStart: s.sourceStart ?? null,
        sourceEnd: s.sourceEnd ?? null,
        requirements: Array.isArray(s.requirements) ? s.requirements : [],
      }));
  }

  /**
   * STD-006: index clause text after activation. Failures revert libraryStatus so evaluations
   * do not run against a standard that never received vectors.
   */
  private scheduleStandardClauseIndexing(
    documentId: string,
    companyId: string,
    actorId: string,
    payload: {
      documentId: string;
      companyId: string;
      text: string;
      isoStandard?: string;
      docType: string;
      fileName?: string;
      version?: number;
      sections?: Array<Record<string, any>>;
    },
  ): void {
    void (async () => {
      try {
        await this.ingest.postIndexStandardClauseText(payload);
      } catch (e: any) {
        const detail = e?.response?.data ?? e?.message ?? String(e);
        this.logger.error(`Clause indexing failed for standard ${documentId}: ${detail}`);
        try {
          await this.docRepo.update(documentId, { libraryStatus: StandardLibraryStatus.PROCESSING });
          await this.audit.log(companyId, documentId, actorId, 'STANDARD_INDEXING_FAILED', {
            detail: typeof detail === 'string' ? detail.slice(0, 800) : JSON.stringify(detail).slice(0, 800),
          });
        } catch (revertErr: any) {
          this.logger.error(`Could not revert standard after indexing failure: ${revertErr?.message ?? revertErr}`);
        }
      }
    })();
  }

  /** Internal: evaluation-service checks STD-004 (only Active standards). */
  async evalCheckIsoForEvaluation(documentId: string, companyId: string) {
    const doc = await this.docRepo.findOne({ where: { id: documentId, companyId } });
    if (!doc) return { ok: false, reason: 'NOT_FOUND' };
    if (doc.type !== DocumentType.ISO_NORM) return { ok: false, reason: 'NOT_ISO' };
    if (doc.archivedAt) return { ok: false, reason: 'ARCHIVED' };
    if (doc.status !== DocumentStatus.READY) return { ok: false, reason: 'NOT_READY' };
    if (doc.libraryStatus !== StandardLibraryStatus.ACTIVE) return { ok: false, reason: 'NOT_ACTIVE' };
    const isoStandard = this.resolveIsoNormReference(doc);
    return { ok: true, isoStandard };
  }

  async validateEvaluationEvidence(body: {
    company_id: string; standard_document_id: string; product_document_id: string;
    evidence_document_ids?: string[];
    actor: { id: string; role: string; department?: string };
  }) {
    const companyId = String(body.company_id || '');
    const actor = body.actor;
    if (!companyId || !actor?.id || !actor?.role || !body.standard_document_id || !body.product_document_id) {
      throw new BadRequestException('Evaluation inputs and initiating user are required');
    }
    const [standard, selected] = await Promise.all([
      this.docRepo.findOne({ where: { id: body.standard_document_id, companyId } }),
      this.docRepo.findOne({ where: { id: body.product_document_id, companyId } }),
    ]);
    if (!standard || !selected) throw new BadRequestException('A selected document is unavailable');
    const quality = (standard.extractedStructured as any)?.standardExtractionQuality;
    if (standard.type !== DocumentType.ISO_NORM || standard.archivedAt || standard.status !== DocumentStatus.READY ||
        standard.libraryStatus !== StandardLibraryStatus.ACTIVE || standard.copyrightQuarantined || quality?.processingComplete === false) {
      throw new BadRequestException('The standard must be active, readable and fully extracted before evaluation');
    }
    if (selected.type === DocumentType.ISO_NORM || selected.type === DocumentType.WORKSPACE_FILE ||
        selected.archivedAt || selected.status !== DocumentStatus.READY) {
      throw new BadRequestException('The selected product document must be processed and available');
    }
    const candidates = selected.productId
      ? await this.docRepo.find({ where: { companyId, productId: selected.productId, status: DocumentStatus.READY, archivedAt: IsNull() }, order: { createdAt: 'ASC' } })
      : [selected];
    const usable = candidates.filter((doc) => doc.type !== DocumentType.ISO_NORM && doc.type !== DocumentType.WORKSPACE_FILE);
    const ids = Array.from(new Set([standard.id, selected.id, ...usable.map((doc) => doc.id)]));
    const rules = await this.accessRuleRepo.find({ where: { documentId: In(ids) } });
    const rulesFor = (id: string) => rules.filter((rule) => rule.documentId === id);
    if (!this.acl.isAllowed(standard, actor, rulesFor(standard.id)) || !this.acl.isAllowed(selected, actor, rulesFor(selected.id))) {
      throw new ForbiddenException('You do not have access to the selected standard or product document');
    }
    const allowed = usable.filter((doc) => this.acl.isAllowed(doc, actor, rulesFor(doc.id)));
    const allowedById = new Map(allowed.map((doc) => [doc.id, doc]));
    const requested = Array.isArray(body.evidence_document_ids)
      ? Array.from(new Set(body.evidence_document_ids.filter((id): id is string => typeof id === 'string' && !!id.trim()))) : [];
    let selectedIds: string[];
    try {
      selectedIds = selectEvaluationEvidence(allowed.map((doc) => doc.id), requested, selected.id);
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Evidence selection is not authorized');
    }
    const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
    const describe = (doc: Document) => ({
      id: doc.id, name: doc.name, version: doc.version, approvalStatus: doc.approvalStatus ?? null,
      updatedAt: doc.updatedAt?.toISOString?.() ?? null,
      extractionHash: fingerprint(doc.extractedStructured),
    });
    const product = selected.productId ? await this.productRepo.findOne({ where: { id: selected.productId, companyId } }) : null;
    if (selected.productId && (!product || product.archivedAt)) {
      throw new BadRequestException('The selected product is unavailable or archived');
    }
    return {
      ok: true, productId: selected.productId ?? null,
      standard: describe(standard), evidence: selectedIds.map((id) => describe(allowedById.get(id)!)),
      productSnapshotHash: fingerprint(product ?? null),
      warnings: selectedIds.some((id) => allowedById.get(id)?.approvalStatus !== DocumentApprovalStatus.APPROVED)
        ? ['Some evidence is not approved. Treat the assessment as preliminary until the documents are reviewed and approved.'] : [],
    };
  }

  /**
   * Internal: evaluation-service report/export: structured extraction + product folder merge profile.
   * Used for both ISO standard documents and product files (`fetchStructuredDoc`).
   */
  async getProductEvidenceForEvaluation(productId: string, companyId: string) {
    const product = await this.productRepo.findOne({ where: { id: productId, companyId } });
    if (!product) throw new NotFoundException('Product not found');

    const docs = await this.docRepo.find({
      where: {
        productId,
        companyId,
        status: DocumentStatus.READY,
        archivedAt: IsNull(),
      },
      order: { createdAt: 'ASC' },
    });

    return {
      productId,
      documents: docs.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        status: d.status,
        approvalStatus: d.approvalStatus ?? null,
        extracted: Boolean(d.extractedStructured),
        archivedAt: d.archivedAt ?? null,
        productId: d.productId ?? null,
      })),
    };
  }

  async getIsoStructuredForEvalExport(documentId: string, companyId: string) {
    const doc = await this.docRepo.findOne({ where: { id: documentId, companyId } });
    if (!doc) throw new NotFoundException('Document not found');

    let productFolder: Record<string, unknown> | undefined;
    if (doc.productId) {
      const product = await this.productRepo.findOne({ where: { id: doc.productId, companyId } });
      if (product) {
        productFolder = {
          id: product.id,
          name: product.name,
          reference: product.reference ?? null,
          revision: product.revision ?? null,
          categoryTags: product.categoryTags ?? [],
          mergedProfile: product.mergedProfile ?? null,
          fieldProvenance: product.fieldProvenance ?? null,
          fieldConflicts: product.fieldConflicts ?? null,
          productFacts: product.productFacts ?? [],
          extractionQuality: product.extractionQuality ?? null,
          requirementCoverage: product.requirementCoverage ?? null,
          readinessSummary: product.readinessSummary ?? null,
          customFields: product.customFields ?? null,
          manualProfile: {
            brandName: product.brandName ?? null,
            productFamily: product.productFamily ?? null,
            productType: product.productType ?? null,
            productStatus: product.productStatus ?? null,
            intendedUse: product.intendedUse ?? null,
            targetUsers: product.targetUsers ?? [],
            keyMaterials: product.keyMaterials ?? [],
            physicalForm: product.physicalForm ?? null,
            hsTariffCode: product.hsTariffCode ?? null,
            countryOfOrigin: product.countryOfOrigin ?? null,
            targetMarkets: product.targetMarkets ?? [],
            requiredCertifications: product.requiredCertifications ?? [],
            applicableRegulations: product.applicableRegulations ?? [],
            industryLabels: product.industryLabels ?? [],
            productionSites: product.productionSites ?? [],
            productionProcesses: product.productionProcesses ?? [],
            criticalSuppliers: product.criticalSuppliers ?? [],
            productCertifications: product.productCertifications ?? [],
          },
          createdAt: product.createdAt?.toISOString?.() ?? product.createdAt,
        };
      }
    }

    return {
      name: doc.name,
      isoStandard: doc.isoStandard ?? null,
      extractedStructured: doc.extractedStructured ?? null,
      ...(productFolder ? { productFolder } : {}),
    };
  }

  /** Norm code for RAG/UI (column → structured metadata → file name). */
  private resolveIsoNormReference(doc: Document): string {
    const fromCol = doc.isoStandard?.trim();
    if (fromCol) return fromCol;
    const st = doc.extractedStructured as ExtractedStructure | null | undefined;
    const ref = st?.standardMetadata?.reference?.trim();
    if (ref) return ref;
    return (doc.name || '').trim();
  }

  private buildStandardClauseIndexText(doc: Document): string {
    // The canonical PDF text is the source of truth. Rebuilding the index input
    // from AI-generated section objects can duplicate/truncate prose on large
    // arbitrary standards, so prefer the persisted extractedText and let RAG
    // perform generic clause segmentation again at indexing time.
    const source = (doc.extractedText || '').trim();
    if (source.length >= 40) return source;

    const st = doc.extractedStructured as ExtractedStructure | null | undefined;
    if (st?.sections?.length) {
      const parts: string[] = [];
      for (const s of st.sections) {
        const raw = s as { clauseNumber?: string | null; heading?: string; content?: string; bullets?: string[] };
        const cn = raw.clauseNumber?.trim();
        const h = raw.heading || '';
        const c = raw.content || '';
        const head = [cn, h].filter(Boolean).join(' ').trim();
        if (head) parts.push(head);
        if (c) parts.push(c);
        if (raw.bullets?.length) parts.push(raw.bullets.join('\n'));
      }
      return parts.join('\n\n').trim();
    }
    return '';
  }

  async replaceAccessRules(
    id: string,
    companyId: string,
    rules: Array<{ kind: 'ROLE' | 'DEPARTMENT' | 'USER'; roleRef?: string; department?: string; userId?: string }>,
    actorId: string,
  ) {
    const doc = await this.docRepo.findOne({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    await this.accessRuleRepo.delete({ documentId: id });
    for (const r of rules) {
      await this.accessRuleRepo.save(
        this.accessRuleRepo.create({
          companyId,
          documentId: id,
          kind: r.kind,
          roleRef: r.roleRef,
          department: r.department,
          userId: r.userId,
        }),
      );
    }
    await this.audit.log(companyId, id, actorId, 'ACL_CHANGE', { count: rules.length });
    return { ok: true };
  }

  async getAuditTrail(id: string, companyId: string) {
    const doc = await this.docRepo.findOne({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    return this.audit.listForDocument(companyId, id);
  }

  /** Company-wide document audit events for activity log (time range in epoch ms). */
  async listCompanyActivity(companyId: string, fromMs: number, toMs: number) {
    const from = new Date(fromMs);
    const to = new Date(toMs);
    const events = await this.audit.listCompanyActivity(companyId, from, to);
    const ids = [...new Set(events.map((e) => e.documentId))];
    const docs = ids.length
      ? await this.docRepo.find({
          where: { id: In(ids), companyId },
          select: ['id', 'name', 'type'],
        })
      : [];
    const meta = new Map(docs.map((d) => [d.id, { name: d.name, type: d.type }]));
    return events.map((e) => {
      const m = meta.get(e.documentId);
      return {
        id: e.id,
        at: e.createdAt.getTime(),
        action: e.action,
        documentId: e.documentId,
        documentName: m?.name ?? '(removed document)',
        documentType: m?.type ?? null,
        metadata: e.metadata ?? null,
        actorUserId: e.actorUserId,
      };
    });
  }

  async deleteHard(id: string, companyId: string, actorId: string, actorRole: string) {
    const doc = await this.docRepo.findOne({ where: { id, companyId } });
    if (!doc) throw new NotFoundException('Document not found');
    if (actorRole === 'QUALITY_MANAGER') {
      if (doc.type === DocumentType.WORKSPACE_FILE) {
        /* QM may permanently remove workspace (non-extraction) files */
      } else if (doc.type !== DocumentType.ISO_NORM || !doc.archivedAt) {
        throw new ForbiddenException(
          'Quality Manager can only permanently delete archived standard documents',
        );
      }
    } else if (actorRole !== 'DIRECTOR') {
      throw new ForbiddenException('You cannot permanently delete this document');
    }
    try { await this.storage.delete(doc.storageKey); } catch {}
    const vers = await this.versionRepo.find({ where: { document: { id } } });
    for (const v of vers) {
      try { await this.storage.delete(v.storageKey); } catch {}
    }
    await this.accessRuleRepo.delete({ documentId: id });
    await this.audit.log(companyId, id, actorId, 'DELETE_HARD', {});
    await this.docRepo.delete(id);
    this.ingest.onDocumentDeleted(id, companyId);
    return { message: 'Document permanently deleted' };
  }

  async getIsoNorms(companyId: string) {
    return this.docRepo
      .createQueryBuilder('d')
      .select([
        'd.id',
        'd.name',
        'd.isoStandard',
        'd.extractedStructured',
        'd.version',
        'd.createdAt',
        'd.libraryStatus',
        'd.tags',
        'd.effectiveDate',
      ])
      .where('d.companyId = :companyId', { companyId })
      .andWhere('d.type = :t', { t: DocumentType.ISO_NORM })
      .andWhere('d.status = :st', { st: DocumentStatus.READY })
      .andWhere('d.archivedAt IS NULL')
      .andWhere('d.libraryStatus = :ls', { ls: StandardLibraryStatus.ACTIVE })
      .orderBy('d.createdAt', 'DESC')
      .getMany();
  }
}
