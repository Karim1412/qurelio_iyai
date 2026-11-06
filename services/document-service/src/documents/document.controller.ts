import {
  Controller, Post, Get, Patch, Delete, Put, Param, Body, Query,
  UseGuards, UseInterceptors, UploadedFile, UploadedFiles, Req, HttpCode, HttpStatus,
  BadRequestException,
  ForbiddenException,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { ProductApplicabilityService, type CreateApplicabilityAssessmentDto } from './product-applicability.service';
import { JwtGuard, Roles, Public } from '../common/jwt.guard';
import { InternalTokenGuard } from '../common/internal-token.guard';
import { DocumentApprovalStatus, DocumentType } from '../database/entities/document.entity';
import { memoryStorage } from 'multer';

@Controller('documents')
@UseGuards(JwtGuard)
export class DocumentController {
  constructor(
    private readonly svc: DocumentService,
    private readonly applicabilitySvc: ProductApplicabilityService,
  ) {}

  @Post('products')
  async createProduct(
    @Body() body: { name: string; description?: string; sku?: string; reference?: string; revision?: string; categoryTags?: string[]; draft?: boolean },
    @Req() req: any,
  ): Promise<any> {
    return this.svc.createProduct(req.user.companyId, body);
  }

  @Get('products')
  async listProducts(@Req() req: any, @Query('archived') archived?: string): Promise<any> {
    const archivedOnly = archived === '1' || archived === 'true';
    return this.svc.listProducts(req.user.companyId, archivedOnly ? { archivedOnly: true } : {});
  }

  @Get('products/:productId')
  async getProduct(@Param('productId') productId: string, @Req() req: any): Promise<any> {
    return this.svc.getProduct(productId, req.user.companyId);
  }

  /**
   * Bounded, flat "AI Extraction" view — universal + category-specific
   * fields with values/status/grounding, missing/conflicted/needs-review
   * lists, and AI-invented extras. The same shape embedded in getProduct's
   * `aiExtraction`, exposed on its own for callers (e.g. the compliance
   * engine) that only need this, not the whole product + documents.
   */
  @Get('products/:productId/ai-extraction')
  async getProductAiExtraction(@Param('productId') productId: string, @Req() req: any): Promise<any> {
    return this.svc.getProductAiExtraction(productId, req.user.companyId);
  }

  /**
   * Tenant-scoped, explainable candidate discovery based on the saved product profile.
   * It does not determine legal applicability or compliance.
   */
  @Get('products/:productId/applicability-candidates')
  async findProductApplicabilityCandidates(@Param('productId') productId: string, @Req() req: any): Promise<any> {
    return this.applicabilitySvc.candidates(productId, req.user.companyId);
  }

  /** Tenant-scoped, immutable human review history for this product's regulatory references. */
  @Get('products/:productId/applicability-assessments')
  async listProductApplicabilityAssessments(@Param('productId') productId: string, @Req() req: any): Promise<any> {
    return this.applicabilitySvc.list(productId, req.user.companyId);
  }

  /**
   * Record a decision reviewed by a Quality Manager or Director. This is a human
   * decision workflow—not an automated legal applicability calculation. Each save
   * creates a new immutable history row.
   */
  @Post('products/:productId/applicability-assessments')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  @HttpCode(HttpStatus.CREATED)
  async createProductApplicabilityAssessment(
    @Param('productId') productId: string,
    @Req() req: any,
    @Body() body: CreateApplicabilityAssessmentDto,
  ): Promise<any> {
    return this.applicabilitySvc.create(
      productId,
      req.user.companyId,
      req.user.id,
      req.user.role,
      body,
    );
  }

  /**
   * Let a user resolve a field conflict (two documents disagreed on a value)
   * by picking which candidate value should become authoritative in
   * mergedProfile.
   */
  @Patch('products/:productId/resolve-conflict')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  @HttpCode(HttpStatus.OK)
  async resolveProductFieldConflict(
    @Param('productId') productId: string,
    @Req() req: any,
    @Body() body: { fieldPath: string; documentId: string; value: string },
  ): Promise<any> {
    return this.svc.resolveProductFieldConflict(
      productId,
      req.user.companyId,
      body.fieldPath,
      body.documentId,
      body.value,
      req.user.id,
    );
  }

  @Patch('products/:productId/archive')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  @HttpCode(HttpStatus.OK)
  async archiveProduct(@Param('productId') productId: string, @Req() req: any): Promise<any> {
    return this.svc.archiveProduct(productId, req.user.companyId, req.user.id, req.user.role);
  }

  @Patch('products/:productId/restore')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  @HttpCode(HttpStatus.OK)
  async restoreProduct(@Param('productId') productId: string, @Req() req: any): Promise<any> {
    return this.svc.restoreProduct(productId, req.user.companyId, req.user.id, req.user.role);
  }

  @Delete('products/:productId')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  async deleteProduct(@Param('productId') productId: string, @Req() req: any): Promise<any> {
    return this.svc.deleteProduct(productId, req.user.companyId, req.user.id);
  }

  // ── Product Profile (Onboarding Wizard) ───────────────────────────────

  @Put('products/:productId/profile')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  @HttpCode(HttpStatus.OK)
  async updateProductProfile(
    @Param('productId') productId: string,
    @Body() body: Record<string, any>,
    @Req() req: any,
  ): Promise<any> {
    return this.svc.updateProductProfile(productId, req.user.companyId, body);
  }

  @Post('products/:productId/complete')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  @HttpCode(HttpStatus.OK)
  async completeProductOnboarding(
    @Param('productId') productId: string,
    @Req() req: any,
  ): Promise<any> {
    return this.svc.completeProductOnboarding(productId, req.user.companyId);
  }

  // ── File Manager: nestable folder tree ──────────────────────

  @Get('folders')
  async listFolders(@Req() req: any): Promise<any> {
    return this.svc.listFolders(req.user.companyId);
  }

  @Post('folders')
  async createFolder(
    @Body() body: { name: string; parentId?: string | null },
    @Req() req: any,
  ): Promise<any> {
    return this.svc.createFolder(req.user.companyId, body?.name, body?.parentId ?? null);
  }

  @Patch('folders/:id')
  async updateFolder(
    @Param('id') id: string,
    @Body() body: { name?: string; parentId?: string | null },
    @Req() req: any,
  ): Promise<any> {
    return this.svc.updateFolder(req.user.companyId, id, body ?? {});
  }

  @Delete('folders/:id')
  async deleteFolder(@Param('id') id: string, @Req() req: any): Promise<any> {
    return this.svc.deleteFolder(req.user.companyId, id);
  }

  @Patch(':id/folder')
  @HttpCode(HttpStatus.OK)
  async moveDocumentToFolder(
    @Param('id') id: string,
    @Body() body: { folderId: string | null },
    @Req() req: any,
  ): Promise<any> {
    return this.svc.moveDocumentToFolder(
      req.user.companyId,
      id,
      body?.folderId ?? null,
      req.user.id,
    );
  }

  /**
   * Move a document to a different product, or detach it entirely
   * (productId: null). Rebuilds both the old and new product's merged AI
   * extraction data so a misattached document can be corrected without
   * deleting the file.
   */
  @Patch(':id/product')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  @HttpCode(HttpStatus.OK)
  async reassignDocumentProduct(
    @Param('id') id: string,
    @Body() body: { productId: string | null },
    @Req() req: any,
  ): Promise<any> {
    return this.svc.reassignDocumentProduct(id, req.user.companyId, body?.productId ?? null, req.user.id);
  }

  @Post('upload')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'files', maxCount: 40 },
      ],
      {
        storage: memoryStorage(),
        limits: {
          fileSize: 50 * 1024 * 1024, // 50 MB per file
          files: 41,                   // max 1 + 40
          fieldSize: 1 * 1024 * 1024, // 1 MB for non-file fields
        },
      },
    ),
  )
  async upload(
    @UploadedFiles() uploadFiles: { file?: Express.Multer.File[]; files?: Express.Multer.File[] },
    @Body() body: any,
    @Req() req: any,
  ): Promise<any> {
    const raw = [...(uploadFiles?.file ?? []), ...(uploadFiles?.files ?? [])];
    // Deduplicate by originalname so a race-condition double-submission
    // cannot create two identical records in the same request.
    const seen = new Set<string>();
    const list = raw.filter((f) => {
      if (seen.has(f.originalname)) return false;
      seen.add(f.originalname);
      return true;
    });
    if (!list.length) throw new BadRequestException('No file uploaded');

    const role = String(req.user?.role ?? '');
    if (role === 'SUPER_ADMIN')
      throw new ForbiddenException('Super admin cannot upload tenant documents via this API');

    const t = body?.type as DocumentType | undefined;
    if (t === DocumentType.ISO_NORM) {
      if (!['QUALITY_MANAGER', 'DIRECTOR'].includes(role))
        throw new ForbiddenException('Only Quality Manager or Company Admin can upload standard documents (PDF)');
    }
    if (t === DocumentType.PROCEDURE) {
      if (!['DIRECTOR', 'QUALITY_MANAGER'].includes(role))
        throw new ForbiddenException('Only Company Admin and Quality Manager can upload procedures');
    }

    return this.svc.upload(list, body, req.user.companyId, req.user.id);
  }

  @Patch('internal/extraction/:documentId')
  @Public()
  @UseGuards(InternalTokenGuard)
  async internalExtraction(
    @Param('documentId') documentId: string,
    @Body()
    body: {
      company_id: string;
      status: string;
      extracted_text?: string | null;
      extracted_structured?: Record<string, unknown> | null;
      processing_error?: string | null;
      /** Copyright content scan result from the RAG pipeline. */
      copyright_finding?: string | null;
      extraction_progress?: Record<string, unknown> | null;
    },
  ): Promise<any> {
    return this.svc.applyExtractionFromRag(documentId, body);
  }

  @Get('internal/eval-check/:documentId')
  @Public()
  @UseGuards(InternalTokenGuard)
  async internalEvalCheck(
    @Param('documentId') documentId: string,
    @Query('company_id') companyId: string,
  ): Promise<any> {
    return this.svc.evalCheckIsoForEvaluation(documentId, companyId);
  }

  /** Validate the full assessment input using the initiating user's document ACLs. */
  @Post('internal/evaluation-evidence/validate')
  @Public()
  @UseGuards(InternalTokenGuard)
  validateEvaluationEvidence(@Body() body: {
    company_id: string; standard_document_id: string; product_document_id: string;
    evidence_document_ids?: string[];
    actor: { id: string; role: string; department?: string };
  }): Promise<any> {
    return this.svc.validateEvaluationEvidence(body);
  }

  /** evaluation-service exports: clause titles/summaries from stored structured extraction */
    @Get('internal/products/:productId/evidence')
  @Public()
  @UseGuards(InternalTokenGuard)
  async internalProductEvidence(
    @Param('productId') productId: string,
    @Query('company_id') companyId: string,
  ): Promise<any> {
    return this.svc.getProductEvidenceForEvaluation(productId, companyId);
  }

@Get('internal/structured/:documentId')
  @Public()
  @UseGuards(InternalTokenGuard)
  async internalStructuredForExport(
    @Param('documentId') documentId: string,
    @Query('company_id') companyId: string,
  ): Promise<any> {
    return this.svc.getIsoStructuredForEvalExport(documentId, companyId);
  }

  @Get()
  async list(@Query() q: any, @Req() req: any): Promise<any> {
    return this.svc.list(req.user.companyId, q, {
      id: req.user.id,
      role: req.user.role,
      department: req.user.department,
    });
  }

  @Get('iso-norms')
  async isoNorms(@Req() req: any): Promise<any> {
    return this.svc.getIsoNorms(req.user.companyId);
  }

  /** Trash bin: every soft-deleted document for the company in one list. */
  @Get('trash')
  async trash(@Req() req: any): Promise<any> {
    return this.svc.list(
      req.user.companyId,
      { archivedOnly: true, includeArchived: true },
      { id: req.user.id, role: req.user.role, department: req.user.department },
    );
  }

  /** Audit trail entries for company activity log (upload, archive, update, …). */
  @Get('activity')
  async companyActivity(@Query('from') from: string, @Query('to') to: string, @Req() req: any): Promise<any> {
    const now = Date.now();
    const fromMs = from ? parseInt(from, 10) : now - 90 * 24 * 60 * 60 * 1000;
    const toMs = to ? parseInt(to, 10) : now;
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) throw new BadRequestException('Invalid from/to');
    return this.svc.listCompanyActivity(req.user.companyId, fromMs, toMs);
  }

  @Delete(':id/purge')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  @HttpCode(HttpStatus.OK)
  async purge(@Param('id') id: string, @Req() req: any): Promise<any> {
    return this.svc.deleteHard(id, req.user.companyId, req.user.id, req.user.role);
  }

  @Get(':id/audit')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  async audit(@Param('id') id: string, @Req() req: any): Promise<any> {
    return this.svc.getAuditTrail(id, req.user.companyId);
  }

  @Patch(':id/owner')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  async owner(
    @Param('id') id: string,
    @Body() body: { userId: string },
    @Req() req: any,
  ): Promise<any> {
    return this.svc.transferOwner(id, req.user.companyId, body, req.user.id, {
      id: req.user.id,
      role: req.user.role,
      department: req.user.department,
    });
  }

  @Patch(':id/approval')
  async approval(
    @Param('id') id: string,
    @Body() body: { status: DocumentApprovalStatus },
    @Req() req: any,
  ): Promise<any> {
    return this.svc.setApproval(id, req.user.companyId, body, req.user.id, req.user.role);
  }

  @Post(':id/submit-review')
  async submitReview(@Param('id') id: string, @Req() req: any): Promise<any> {
    return this.svc.submitForReview(id, req.user.companyId, req.user.id, {
      id: req.user.id,
      role: req.user.role,
      department: req.user.department,
    });
  }

  @Patch(':id/archive')
  async archive(@Param('id') id: string, @Req() req: any): Promise<any> {
    return this.svc.archive(id, req.user.companyId, req.user.id, req.user.role);
  }

  @Patch(':id/restore')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  async restore(@Param('id') id: string, @Req() req: any): Promise<any> {
    return this.svc.restore(id, req.user.companyId, req.user.id, req.user.role);
  }

  @Put(':id/access-rules')
  @Roles('DIRECTOR')
  async accessRules(
    @Param('id') id: string,
    @Body() body: { rules: Array<{ kind: 'ROLE' | 'DEPARTMENT' | 'USER'; roleRef?: string; department?: string; userId?: string }> },
    @Req() req: any,
  ): Promise<any> {
    return this.svc.replaceAccessRules(id, req.user.companyId, body.rules ?? [], req.user.id);
  }

  @Patch(':id/extraction')
  async patchExtraction(
    @Param('id') id: string,
    @Body() body: { extractedStructured: Record<string, unknown> },
    @Req() req: any,
  ): Promise<any> {
    return this.svc.updateExtractedStructured(id, req.user.companyId, body, req.user.id, {
      id: req.user.id,
      role: req.user.role,
      department: req.user.department,
    });
  }

  @Post(':id/retry-extraction')
  @HttpCode(HttpStatus.OK)
  async retryExtraction(@Param('id') id: string, @Req() req: any): Promise<any> {
    return this.svc.retryExtraction(id, req.user.companyId, req.user.id, {
      id: req.user.id,
      role: req.user.role,
      department: req.user.department,
    });
  }

  @Patch(':id/manual-text')
  async manualText(
    @Param('id') id: string,
    @Body() body: { text: string },
    @Req() req: any,
  ): Promise<any> {
    return this.svc.setManualText(id, req.user.companyId, body, req.user.id, {
      id: req.user.id,
      role: req.user.role,
      department: req.user.department,
    });
  }

  /**
   * Bounded requirements view for one ISO_NORM document — see
   * DocumentService.getRequirements. Lighter payload than GET :id for
   * callers that only need the checkable requirement list (e.g. the
   * compliance engine).
   */
  @Get(':id/requirements')
  async getRequirements(@Param('id') id: string, @Req() req: any): Promise<any> {
    return this.svc.getRequirements(id, req.user.companyId);
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: any): Promise<any> {
    return this.svc.getOne(id, req.user.companyId, req.user.id, {
      id: req.user.id,
      role: req.user.role,
      department: req.user.department,
    });
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Req() req: any): Promise<StreamableFile> {
    const { stream, filename, mimeType } = await this.svc.getDownloadStream(
      id,
      req.user.companyId,
      req.user.id,
      {
        id: req.user.id,
        role: req.user.role,
        department: req.user.department,
      },
    );
    const safe = filename.replace(/[\r\n"\\]/g, '_');
    return new StreamableFile(stream, {
      type: mimeType,
      disposition: `attachment; filename="${safe}"`,
    });
  }

  @Post(':id/version')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: {
      fileSize: 50 * 1024 * 1024, // 50 MB
      files: 1,
      fieldSize: 1 * 1024 * 1024,
    },
  }))
  async addVersion(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Req() req: any,
  ): Promise<any> {
    return this.svc.addVersion(id, req.user.companyId, req.user.id, req.user.role, file, body.changeNote);
  }

  /** Clear access rules so every tenant user can read the document (company-wide visibility). */
  @Patch(':id/share')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  async shareWithCompany(@Param('id') id: string, @Req() req: any): Promise<any> {
    return this.svc.shareWithCompany(id, req.user.companyId, req.user.id);
  }

  /** Release a copyright quarantine: the QM accepts responsibility for the document. */
  @Patch(':id/copyright-ack')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  async copyrightAck(@Param('id') id: string, @Req() req: any): Promise<any> {
    return this.svc.acknowledgeCopyright(id, req.user.companyId, req.user.id, req.user.role);
  }

  @Patch(':id/activate')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  async activateStandard(@Param('id') id: string, @Req() req: any): Promise<any> {
    return this.svc.activateStandard(id, req.user.companyId, req.user.id, {
      id: req.user.id,
      role: req.user.role,
      department: req.user.department,
    });
  }

  @Patch(':id')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ): Promise<any> {
    return this.svc.update(id, req.user.companyId, body, req.user.id, {
      id: req.user.id,
      role: req.user.role,
      department: req.user.department,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: string, @Req() req: any): Promise<any> {
    return this.svc.archive(id, req.user.companyId, req.user.id, req.user.role);
  }
}
