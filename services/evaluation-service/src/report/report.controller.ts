import {
  Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, Req, Res, UseGuards, HttpCode, HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportService, CreateReportDto, UpdateReportDto } from './report.service';
import { ReportTemplateService, CreateTemplateDto, UpdateTemplateDto } from './report-template.service';
import { JwtGuard, Roles } from '../common/jwt.guard';
import { Report, ReportStatus, ReportType } from '../database/entities/report.entity';
import { ReportTemplate } from '../database/entities/report-template.entity';

function attachmentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').slice(0, 200);
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

@Controller('reports')
@UseGuards(JwtGuard)
export class ReportController {
  constructor(
    private reportService: ReportService,
    private templateService: ReportTemplateService,
  ) {}

  // ──────────────────── Reports ────────────────────────

  /**
   * Create a new report
   */
  @Post()
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  async createReport(@Body() dto: CreateReportDto, @Req() req: any): Promise<Report> {
    return this.reportService.createReport(req.user.companyId, req.user.id, dto);
  }

  /**
   * List reports with filtering
   */
  @Get()
  async listReports(
    @Query('type') type?: ReportType,
    @Query('status') status?: ReportStatus,
    @Query('search') search?: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('createdBy') createdBy?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Req() req?: any,
  ): Promise<{ data: Report[]; total: number }> {
    return this.reportService.listReports(req.user.companyId, {
      type,
      status,
      search,
      assignedToUserId: assignedTo,
      createdByUserId: createdBy,
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 20,
    });
  }

  /**
   * Get report by ID
   */
  @Get(':id')
  async getReport(@Param('id') id: string, @Req() req: any): Promise<Report> {
    return this.reportService.getReportById(req.user.companyId, id);
  }

  /**
   * Export report as PDF
   */
  @Get(':id/export')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  async exportReport(
    @Param('id') id: string,
    @Query('format') format: string,
    @Req() req: any,
    @Res() res: Response,
  ): Promise<void> {
    const { body, contentType, filename } = await this.reportService.export(
      req.user.companyId,
      id,
      format || 'pdf',
    );
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': attachmentDisposition(filename),
    });
    res.end(body);
  }

  /**
   * Update report data
   */
  @Put(':id')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  async updateReport(
    @Param('id') id: string,
    @Body() dto: UpdateReportDto,
    @Req() req: any,
  ): Promise<Report> {
    return this.reportService.updateReport(req.user.companyId, id, req.user.id, dto);
  }

  /**
   * Change report status
   */
  @Patch(':id/status')
  @Roles('DIRECTOR', 'QUALITY_MANAGER', 'AUDITOR', 'OPERATOR')
  async changeStatus(
    @Param('id') id: string,
    @Body() body: { status: ReportStatus; comment?: string },
    @Req() req: any,
  ): Promise<Report> {
    return this.reportService.changeStatus(
      req.user.companyId,
      id,
      req.user.id,
      body.status,
      body.comment,
    );
  }

  /**
   * Get report modification history
   */
  @Get(':id/modifications')
  async getModifications(@Param('id') id: string, @Req() req: any) {
    return this.reportService.getModifications(req.user.companyId, id);
  }

  /**
   * Get report approval history
   */
  @Get(':id/approvals')
  async getApprovals(@Param('id') id: string, @Req() req: any) {
    return this.reportService.getApprovals(req.user.companyId, id);
  }

  /**
   * Get report version history
   */
  @Get(':id/versions')
  async getVersions(@Param('id') id: string, @Req() req: any) {
    return this.reportService.getVersions(req.user.companyId, id);
  }

  /**
   * Delete report (only draft/archived)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  async deleteReport(@Param('id') id: string, @Req() req: any): Promise<void> {
    await this.reportService.deleteReport(req.user.companyId, id);
  }

  // ──────────────────── Templates ────────────────────────

  /**
   * Create a new template
   */
  @Post('templates/create')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  async createTemplate(@Body() dto: CreateTemplateDto, @Req() req: any): Promise<ReportTemplate> {
    return this.templateService.createTemplate(req.user.companyId, req.user.id, dto);
  }

  /**
   * List templates
   */
  @Get('templates/list')
  async listTemplates(
    @Query('type') type?: ReportType,
    @Query('isActive') isActive?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Req() req?: any,
  ): Promise<{ data: ReportTemplate[]; total: number }> {
    return this.templateService.listTemplates(req.user.companyId, {
      reportType: type,
      isActive: isActive === 'true',
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 20,
    });
  }

  /**
   * Get template by ID
   */
  @Get('templates/:id')
  async getTemplate(@Param('id') id: string, @Req() req: any): Promise<ReportTemplate> {
    return this.templateService.getTemplateById(req.user.companyId, id);
  }

  /**
   * Update template
   */
  @Put('templates/:id')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @Req() req: any,
  ): Promise<ReportTemplate> {
    return this.templateService.updateTemplate(req.user.companyId, id, req.user.id, dto);
  }

  /**
   * Archive template
   */
  @Patch('templates/:id/archive')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  async archiveTemplate(@Param('id') id: string, @Req() req: any): Promise<ReportTemplate> {
    return this.templateService.archiveTemplate(req.user.companyId, id);
  }

  /**
   * Activate template
   */
  @Patch('templates/:id/activate')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  async activateTemplate(@Param('id') id: string, @Req() req: any): Promise<ReportTemplate> {
    return this.templateService.activateTemplate(req.user.companyId, id);
  }

  /**
   * Get template versions
   */
  @Get('templates/:id/versions')
  async getTemplateVersions(@Param('id') id: string, @Req() req: any) {
    return this.templateService.getVersions(req.user.companyId, id);
  }

  /**
   * Duplicate template
   */
  @Post('templates/:id/duplicate')
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  async duplicateTemplate(
    @Param('id') id: string,
    @Body() body: { newName: string },
    @Req() req: any,
  ): Promise<ReportTemplate> {
    return this.templateService.duplicateTemplate(req.user.companyId, id, req.user.id, body.newName);
  }

  /**
   * Delete template
   */
  @Delete('templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('DIRECTOR', 'QUALITY_MANAGER')
  async deleteTemplate(@Param('id') id: string, @Req() req: any): Promise<void> {
    await this.templateService.deleteTemplate(req.user.companyId, id);
  }
}
