import {
  Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, Req, Res, UseGuards, HttpCode, HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { EvaluationService } from './evaluation/evaluation.service';
import { CompanyActivityService } from './company-activity/company-activity.service';
import { NCService } from './nc/nc.service';
import { AuditService } from './audit/audit.service';
import { JwtGuard, Roles } from './common/jwt.guard';
import { Evaluation } from './database/entities/evaluation.entity';
import { NonConformity } from './database/entities/non-conformity.entity';
import { Audit } from './database/entities/audit.entity';
import { CapaAction } from './database/entities/non-conformity.entity';
import { AuditFinding } from './database/entities/audit.entity';

/** RFC 5987 filename* so non-ASCII report names download correctly in browsers. */
function attachmentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').slice(0, 200);
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// ── Evaluations ───────────────────────────────────────────────────────────────
@Controller('evaluations')
@UseGuards(JwtGuard)
export class EvaluationController {
  constructor(
    private svc: EvaluationService,
    private activity: CompanyActivityService,
  ) {}

  /** Unified company activity (audits, evaluations, NCs, CAPA, explicit events) for the activity log UI. */
  @Get('activity')
  listActivity(@Query('from') from: string, @Query('to') to: string, @Req() req: any) {
    const now = Date.now();
    const fromMs = from ? parseInt(from, 10) : now - 90 * 24 * 60 * 60 * 1000;
    const toMs = to ? parseInt(to, 10) : now;
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) throw new BadRequestException('Invalid from/to');
    return this.activity.listMerged(req.user.companyId, fromMs, toMs);
  }

  @Post()
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  create(@Body() dto: any, @Req() req: any): Promise<{ job_id: string; evaluationId: string; status: string; message: string }> {
    return this.svc.create(req.user.companyId, req.user.id, req.user.email, dto,
      { id: req.user.id, role: req.user.role, department: req.user.department });
  }

  /**
   * Preferred retry entrypoint: JSON body avoids proxy/path quirks on `POST …/:id/retry`.
   */
  @Post('retry')
  @HttpCode(HttpStatus.OK)
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  retryPost(@Body() body: { evaluationId?: string }, @Req() req: any) {
    const evaluationId = body?.evaluationId?.trim();
    if (!evaluationId) throw new BadRequestException('evaluationId is required');
    return this.svc.retry(evaluationId, req.user.companyId, req.user.id,
      { id: req.user.id, role: req.user.role, department: req.user.department });
  }

  @Get()
  list(@Req() req: any) {
    return this.svc.list(req.user.companyId);
  }

  @Get(':id/export')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  async export(
    @Param('id') id: string,
    @Query('format') format: string,
    @Req() req: any,
    @Res() res: Response,
  ): Promise<void> {
    const { body, contentType, filename } = await this.svc.export(id, req.user.companyId, format);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': attachmentDisposition(filename),
    });
    res.end(body);
  }

  /**
   * SSE feed of live agent-activity events from the RAG engine.
   * Tenant ownership is enforced; clients open it while status is QUEUED/PROCESSING and
   * close it on `done`/`failed`/`closed` events (or on navigation away).
   */
  @Get(':id/stream')
  async stream(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ): Promise<void> {
    const upstream = await this.svc.openLiveStream(id, req.user.companyId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    (res as any).flushHeaders?.();

    upstream.pipe(res);
    const cleanup = () => {
      try { upstream.destroy(); } catch { /* ignore */ }
    };
    req.on('close', cleanup);
    upstream.on('error', () => {
      try { res.end(); } catch { /* ignore */ }
    });
    upstream.on('end', () => {
      try { res.end(); } catch { /* ignore */ }
    });
  }

  @Patch(':id/clauses/:clauseRef')
  @Roles('QUALITY_MANAGER', 'AUDITOR')
  patchClause(
    @Param('id') id: string,
    @Param('clauseRef') clauseRef: string,
    @Body() body: { verdict: string; reason: string },
    @Req() req: any,
  ): Promise<Evaluation> {
    return this.svc.patchClauseVerdict(id, req.user.companyId, req.user.id, clauseRef, body);
  }

  @Post(':id/confirm-nc-drafts')
  @HttpCode(HttpStatus.OK)
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  confirmNcDrafts(@Param('id') id: string, @Req() req: any): Promise<{ message: string; evaluationId: string }> {
    return this.svc.confirmNcDrafts(id, req.user.companyId, req.user.id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  retry(@Param('id') id: string, @Req() req: any): Promise<{ job_id: string; evaluationId?: string; status: string; message: string }> {
    return this.svc.retry(id, req.user.companyId, req.user.id,
      { id: req.user.id, role: req.user.role, department: req.user.department });
  }

  /** Prefer this over DELETE where proxies or HTTP stacks block DELETE (Express 5 + Nest edge cases). */
  @Post(':id/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  removeByPost(@Param('id') id: string, @Req() req: any): Promise<void> {
    return this.svc.remove(id, req.user.companyId, req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  remove(@Param('id') id: string, @Req() req: any): Promise<void> {
    return this.svc.remove(id, req.user.companyId, req.user.id);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @Req() req: any): Promise<Evaluation> {
    return this.svc.getOne(id, req.user.companyId);
  }
}

// ── Non-Conformities ──────────────────────────────────────────────────────────
@Controller('nc')
@UseGuards(JwtGuard)
export class NCController {
  constructor(private svc: NCService) {}

  /** Register collection + KPI routes before any `:id` handler so `/nc/kpis` is never captured as an id. */
  @Get()
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  list(@Req() req: any, @Query() q: any): Promise<NonConformity[]> {
    return this.svc.list(req.user.companyId, q);
  }

  @Get('kpis')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  kpis(@Req() req: any): Promise<{ total: number; byStatus: any[]; byClassification: any[]; overdueCAPAs: number }> {
    return this.svc.kpis(req.user.companyId);
  }

  @Post()
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  create(@Body() dto: any, @Req() req: any): Promise<NonConformity> {
    return this.svc.create(req.user.companyId, req.user.id, dto);
  }

  /** Static paths before :id so "capa" is not captured as an NC id. */
  @Patch('capa/:capaId/complete')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  completeCapa(@Param('capaId') id: string, @Req() req: any): Promise<{ message: string }> {
    return this.svc.completeCapa(id, req.user.companyId, req.user.id);
  }

  @Patch('capa/:capaId')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  patchCapa(@Param('capaId') id: string, @Body() body: any, @Req() req: any): Promise<CapaAction> {
    return this.svc.patchCapa(id, req.user.companyId, req.user.id, body);
  }

  /** Multi-segment :id/* routes must stay before bare @Get(':id') / @Patch(':id'). */
  @Post(':id/ai/root-causes')
  @HttpCode(HttpStatus.OK)
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  aiRootCauses(@Param('id') id: string, @Req() req: any) {
    return this.svc.aiRootCauses(id, req.user.companyId);
  }

  @Post(':id/ai/ishikawa')
  @HttpCode(HttpStatus.OK)
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  aiIshikawa(@Param('id') id: string, @Req() req: any) {
    return this.svc.aiIshikawaBranches(id, req.user.companyId);
  }

  @Get(':id/why-analysis')
  whyAnalysis(@Param('id') id: string, @Req() req: any): Promise<{ ncId: string; suggestions: { why1: string; why2: string; why3: string; why4: string; why5: string; rootCauseSuggestion: string } }> {
    return this.svc.whyAnalysis(id, req.user.companyId);
  }

  /**
   * RCA save: use separate handlers for PATCH and POST.
   * Nest only wires one HTTP verb per handler when stacking decorators, which led to “Cannot PATCH …/rca”.
   */
  @Patch(':id/rca')
  @HttpCode(HttpStatus.OK)
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  saveRcaPatch(@Param('id') id: string, @Body() body: any, @Req() req: any): Promise<NonConformity> {
    return this.svc.saveRca(id, req.user.companyId, req.user.id, body);
  }

  @Post(':id/rca')
  @HttpCode(HttpStatus.OK)
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  saveRcaPost(@Param('id') id: string, @Body() body: any, @Req() req: any): Promise<NonConformity> {
    return this.svc.saveRca(id, req.user.companyId, req.user.id, body);
  }

  @Post(':id/start-rca')
  @HttpCode(HttpStatus.OK)
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  startRca(@Param('id') id: string, @Req() req: any): Promise<NonConformity> {
    return this.svc.startRca(id, req.user.companyId, req.user.id);
  }

  @Post(':id/capa')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  addCapa(@Param('id') id: string, @Body() dto: any, @Req() req: any): Promise<CapaAction> {
    return this.svc.addCapa(id, req.user.companyId, req.user.id, dto);
  }

  @Post(':id/start-capa')
  @HttpCode(HttpStatus.OK)
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  startCapa(@Param('id') id: string, @Req() req: any): Promise<NonConformity> {
    return this.svc.startCapaExecution(id, req.user.companyId, req.user.id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  rejectNc(@Param('id') id: string, @Body() body: { reason?: string }, @Req() req: any): Promise<{ message: string }> {
    return this.svc.rejectNc(id, req.user.companyId, req.user.id, body);
  }

  @Post(':id/verify')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  verify(@Param('id') id: string, @Body() dto: any, @Req() req: any): Promise<{ message: string }> {
    return this.svc.verify(id, req.user.companyId, dto);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @Req() req: any): Promise<NonConformity> {
    return this.svc.getOne(id, req.user.companyId);
  }

  /**
   * General NC patch, or RCA save when called as `PATCH /nc/:id?rca=1` (body = why1…rootCause).
   * The query form avoids sub-path routing issues (`/nc/:id/rca` 404 on some proxies / older images).
   */
  @Patch(':id')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  update(
    @Param('id') id: string,
    @Query('rca') saveRcaFlag: string | undefined,
    @Body() dto: any,
    @Req() req: any,
  ): Promise<NonConformity> {
    if (saveRcaFlag === '1' || String(saveRcaFlag ?? '').toLowerCase() === 'true') {
      return this.svc.saveRca(id, req.user.companyId, req.user.id, dto);
    }
    return this.svc.update(id, req.user.companyId, req.user.id, dto);
  }
}

// ── Audits ────────────────────────────────────────────────────────────────────
@Controller('audits')
@UseGuards(JwtGuard)
export class AuditController {
  constructor(private svc: AuditService) {}

  @Get('kpis')
  kpis(@Req() req: any): Promise<{ total: number; byStatus: any[]; byType: any[] }> {
    return this.svc.kpis(req.user.companyId);
  }

  @Get()
  list(@Req() req: any, @Query('status') status?: any) {
    return this.svc.list(req.user.companyId, status);
  }

  /** AUD-009: AI-style suggested questions (edit client-side, then PUT …/checklists). */
  @Post('checklist-suggestions')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  suggestChecklist(@Body() body: { isoStandard: string; scopeClauseRefs?: string[] }) {
    return this.svc.suggestChecklist(body.isoStandard, body.scopeClauseRefs);
  }

  @Post()
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  create(@Body() dto: any, @Req() req: any): Promise<Audit> {
    return this.svc.create(req.user.companyId, req.user.id, dto);
  }

  @Get(':id/change-log')
  getChangeLog(@Param('id') id: string, @Req() req: any) {
    return this.svc.getChangeLog(id, req.user.companyId);
  }

  @Get(':id/export')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  async export(
    @Param('id') id: string,
    @Query('format') format: string,
    @Req() req: any,
    @Res() res: Response,
  ): Promise<void> {
    const { body, contentType, filename } = await this.svc.export(id, req.user.companyId, format);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': attachmentDisposition(filename),
    });
    res.end(body);
  }

  @Put(':id/checklists')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  replaceChecklists(
    @Param('id') id: string,
    @Body() body: { items: { isoClause: string; question: string; hierarchyLevel?: number | null }[] },
    @Req() req: any,
  ): Promise<Audit> {
    return this.svc.applySuggestedChecklist(id, req.user.companyId, req.user.id, body.items);
  }

  @Patch(':id/start')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  start(@Param('id') id: string, @Req() req: any): Promise<{ message: string }> {
    return this.svc.start(id, req.user.companyId, req.user.id);
  }

  @Patch(':id/cancel')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  cancel(@Param('id') id: string, @Req() req: any): Promise<{ message: string }> {
    return this.svc.cancel(id, req.user.companyId, req.user.id);
  }

  @Patch(':id')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  update(@Param('id') id: string, @Body() dto: any, @Req() req: any): Promise<Audit> {
    return this.svc.update(id, req.user.companyId, req.user.id, dto);
  }

  @Post(':id/findings')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  addFinding(@Param('id') id: string, @Body() dto: any, @Req() req: any): Promise<AuditFinding> {
    return this.svc.addFinding(id, req.user.companyId, req.user.id, dto);
  }

  /** Suggest % score for one checklist row (criteria / leaf only; forwards to RAG when configured). */
  @Post('checklist/:cid/ai-score')
  @HttpCode(HttpStatus.OK)
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  suggestChecklistAiScore(@Param('cid') cid: string, @Req() req: any) {
    return this.svc.suggestChecklistAiScore(cid, req.user.companyId);
  }

  /** AI-generated evidence checklist lines for one criterion (clause-aware); replaces prior AI lines only. */
  @Post('checklist/:cid/ai-evidence-items')
  @HttpCode(HttpStatus.OK)
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  generateAiEvidenceItems(@Param('cid') cid: string, @Req() req: any) {
    return this.svc.generateAiEvidenceChecklistItems(cid, req.user.companyId, req.user.id);
  }

  @Patch('checklist/:cid')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  updateChecklist(@Param('cid') id: string, @Body() dto: any, @Req() req: any): Promise<{ message: string }> {
    return this.svc.updateChecklist(id, req.user.companyId, req.user.id, dto);
  }

  @Post(':id/complete')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  complete(@Param('id') id: string, @Body('conclusion') c: string, @Req() req: any): Promise<{ message: string }> {
    return this.svc.complete(id, req.user.companyId, req.user.id, c);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  remove(@Param('id') id: string, @Req() req: any): Promise<{ message: string }> {
    return this.svc.remove(id, req.user.companyId);
  }

  /** AI evaluation + score for each leaf checklist row that still has no evaluation (batch, capped). */
  @Post(':id/ai-fill-empty-criteria')
  @HttpCode(HttpStatus.OK)
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR')
  bulkAiFillEmptyCriteria(@Param('id') id: string, @Req() req: any) {
    return this.svc.bulkAiFillEmptyChecklistCriteria(id, req.user.companyId, req.user.id);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @Req() req: any): Promise<Audit> {
    return this.svc.getOne(id, req.user.companyId);
  }
}
