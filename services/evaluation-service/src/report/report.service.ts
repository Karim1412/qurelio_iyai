import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Report, ReportStatus, ReportType, ReportSeverity } from '../database/entities/report.entity';
import { ReportVersion } from '../database/entities/report.entity';
import { ReportModification } from '../database/entities/report.entity';
import { ReportApproval } from '../database/entities/report.entity';
import { ReportTemplate, TemplateField, TemplateSection } from '../database/entities/report-template.entity';
import { fetchCompanyDisplayName } from '../common/company-display-name';
import {
  createBrandedPdfWriter,
  brandedDrawBlock,
  brandedSectionBar,
  finalizeBrandedPdf,
  stripHtmlForPdf,
} from '../common/pdf-brand-layout';
import { brandedDrawLabeledField } from '../common/pdf-html-renderer';

export interface CreateReportDto {
  type: ReportType;
  title: string;
  description?: string;
  severity?: ReportSeverity;
  templateVersionId?: string;
  data?: Record<string, unknown>;
  dueDate?: Date;
  assignedToUserId?: string;
}

export interface UpdateReportDto {
  title?: string;
  description?: string;
  severity?: ReportSeverity;
  data?: Record<string, unknown>;
  dueDate?: Date;
  assignedToUserId?: string;
  reason?: string;
}

export interface ChangeReportStatusDto {
  status: ReportStatus;
  comment?: string;
}

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Report)
    private reportRepository: Repository<Report>,
    @InjectRepository(ReportVersion)
    private versionRepository: Repository<ReportVersion>,
    @InjectRepository(ReportModification)
    private modificationRepository: Repository<ReportModification>,
    @InjectRepository(ReportApproval)
    private approvalRepository: Repository<ReportApproval>,
    @InjectRepository(ReportTemplate)
    private templateRepository: Repository<ReportTemplate>,
    private cfg: ConfigService,
  ) {}

  /**
   * Create a new report
   */
  async createReport(
    companyId: string,
    userId: string,
    dto: CreateReportDto,
  ): Promise<Report> {
    const report = this.reportRepository.create({
      companyId,
      type: dto.type,
      title: dto.title,
      description: dto.description,
      severity: dto.severity,
      templateVersionId: dto.templateVersionId,
      data: dto.data || {},
      dueDate: dto.dueDate,
      assignedToUserId: dto.assignedToUserId,
      createdByUserId: userId,
      status: ReportStatus.DRAFT,
    });

    const saved = await this.reportRepository.save(report);

    // Create initial version
    await this.versionRepository.save({
      reportId: saved.id,
      versionNumber: 1,
      snapshot: {
        title: saved.title,
        description: saved.description,
        data: saved.data,
        status: saved.status,
      },
      createdByUserId: userId,
      reason: 'Initial version',
    });

    return saved;
  }

  /**
   * Get report by ID (optionally with child relations, avoid relations on write paths)
   */
  async getReportById(
    companyId: string,
    reportId: string,
    options?: { withRelations?: boolean },
  ): Promise<Report> {
    const report = await this.reportRepository.findOne({
      where: { id: reportId, companyId },
      relations: options?.withRelations
        ? ['versions', 'modifications', 'approvals']
        : undefined,
    });

    if (!report) {
      throw new NotFoundException(`Report ${reportId} not found`);
    }

    return report;
  }

  /**
   * List reports with filtering
   */
  async listReports(
    companyId: string,
    filters: {
      type?: ReportType;
      status?: ReportStatus;
      search?: string;
      assignedToUserId?: string;
      createdByUserId?: string;
      skip?: number;
      take?: number;
    },
  ): Promise<{ data: Report[]; total: number }> {
    const take = filters.take || 20;
    const skip = filters.skip || 0;

    const where: FindOptionsWhere<Report> = { companyId };

    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.assignedToUserId) where.assignedToUserId = filters.assignedToUserId;
    if (filters.createdByUserId) where.createdByUserId = filters.createdByUserId;

    let query = this.reportRepository.createQueryBuilder('report').where(where);

    if (filters.search) {
      query = query.andWhere(
        '(report.title ILIKE :search OR report.description ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    const [data, total] = await query
      .orderBy('report.created_at', 'DESC')
      .take(take)
      .skip(skip)
      .getManyAndCount();

    return { data, total };
  }

  /**
   * Update report data
   */
  async updateReport(
    companyId: string,
    reportId: string,
    userId: string,
    dto: UpdateReportDto,
  ): Promise<Report> {
    const report = await this.getReportById(companyId, reportId, { withRelations: false });

    if (report.isLocked) {
      throw new BadRequestException('Report is locked and cannot be edited');
    }

    if (report.status === ReportStatus.CLOSED || report.status === ReportStatus.APPROVED) {
      throw new BadRequestException(`Cannot edit report with status ${report.status}`);
    }

    // Track modifications for each changed field
    if (dto.title && dto.title !== report.title) {
      await this.modificationRepository.save({
        reportId,
        fieldName: 'title',
        oldValue: report.title,
        newValue: dto.title,
        modifiedByUserId: userId,
        reason: dto.reason,
      });
    }

    if (dto.severity && dto.severity !== report.severity) {
      await this.modificationRepository.save({
        reportId,
        fieldName: 'severity',
        oldValue: report.severity,
        newValue: dto.severity,
        modifiedByUserId: userId,
        reason: dto.reason,
      });
    }

    if (dto.data) {
      // Track modifications for data fields
      for (const [key, value] of Object.entries(dto.data)) {
        if (JSON.stringify(report.data[key]) !== JSON.stringify(value)) {
          await this.modificationRepository.save({
            reportId,
            fieldName: `data.${key}`,
            oldValue: report.data[key],
            newValue: value,
            modifiedByUserId: userId,
            reason: dto.reason,
          });
        }
      }
    }

    // Update report
    report.title = dto.title ?? report.title;
    report.description = dto.description ?? report.description;
    report.severity = dto.severity ?? report.severity;
    report.dueDate = dto.dueDate ?? report.dueDate;
    report.assignedToUserId = dto.assignedToUserId ?? report.assignedToUserId;
    if (dto.data) {
      report.data = { ...report.data, ...dto.data };
    }
    report.version += 1;

    const updated = await this.reportRepository.save(report);

    // Create version snapshot
    await this.versionRepository.save({
      reportId: report.id,
      versionNumber: report.version,
      snapshot: {
        title: report.title,
        description: report.description,
        data: report.data,
        status: report.status,
      },
      createdByUserId: userId,
      reason: dto.reason || 'Updated report',
    });

    return updated;
  }

  /**
   * Change report status
   */
  async changeStatus(
    companyId: string,
    reportId: string,
    userId: string,
    newStatus: ReportStatus,
    comment?: string,
  ): Promise<Report> {
    const report = await this.getReportById(companyId, reportId, { withRelations: false });

    // Validate status transition
    const validTransitions: Record<ReportStatus, ReportStatus[]> = {
      [ReportStatus.DRAFT]: [ReportStatus.SUBMITTED, ReportStatus.ARCHIVED],
      [ReportStatus.SUBMITTED]: [ReportStatus.UNDER_REVIEW, ReportStatus.DRAFT],
      [ReportStatus.UNDER_REVIEW]: [ReportStatus.APPROVED, ReportStatus.REJECTED, ReportStatus.DRAFT],
      [ReportStatus.APPROVED]: [ReportStatus.CLOSED, ReportStatus.ARCHIVED],
      [ReportStatus.REJECTED]: [ReportStatus.DRAFT, ReportStatus.ARCHIVED],
      [ReportStatus.CLOSED]: [ReportStatus.ARCHIVED],
      [ReportStatus.ARCHIVED]: [ReportStatus.DRAFT],
    };

    if (!validTransitions[report.status]?.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${report.status} to ${newStatus}`,
      );
    }

    const oldStatus = report.status;
    report.status = newStatus;

    // Set timestamps
    if (newStatus === ReportStatus.SUBMITTED) {
      report.submittedAt = new Date();
      report.submittedByUserId = userId;
    } else if (newStatus === ReportStatus.APPROVED || newStatus === ReportStatus.REJECTED) {
      report.approvedAt = new Date();
      report.approvedByUserId = userId;
      report.approvalComment = comment || null;
      report.isLocked = newStatus === ReportStatus.APPROVED;
    } else if (newStatus === ReportStatus.CLOSED) {
      report.closedAt = new Date();
    }

    const updated = await this.reportRepository.save(report);

    // Track status change
    await this.modificationRepository.save({
      reportId,
      fieldName: 'status',
      oldValue: oldStatus,
      newValue: newStatus,
      modifiedByUserId: userId,
      reason: comment,
    });

    // Record approval if status is approved/rejected
    if (newStatus === ReportStatus.APPROVED || newStatus === ReportStatus.REJECTED) {
      await this.approvalRepository.save({
        reportId,
        approverUserId: userId,
        action: newStatus,
        comment: comment || '',
      });
    }

    return updated;
  }

  /**
   * Get modification history
   */
  async getModifications(companyId: string, reportId: string): Promise<ReportModification[]> {
    await this.getReportById(companyId, reportId); // Validate existence and access

    return this.modificationRepository.find({
      where: { reportId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get approval history
   */
  async getApprovals(companyId: string, reportId: string): Promise<ReportApproval[]> {
    await this.getReportById(companyId, reportId); // Validate existence and access

    return this.approvalRepository.find({
      where: { reportId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get version history
   */
  async getVersions(companyId: string, reportId: string): Promise<ReportVersion[]> {
    await this.getReportById(companyId, reportId); // Validate existence and access

    return this.versionRepository.find({
      where: { reportId },
      order: { versionNumber: 'ASC' },
    });
  }

  /**
   * Delete report
   */
  async deleteReport(companyId: string, reportId: string): Promise<void> {
    const report = await this.getReportById(companyId, reportId, { withRelations: false });

    if (report.status !== ReportStatus.DRAFT && report.status !== ReportStatus.ARCHIVED) {
      throw new BadRequestException('Only draft and archived reports can be deleted');
    }

    await this.reportRepository.remove(report);
  }

  /**
   * Export a managed report instance to PDF (branded header/footer, template sections).
   */
  async export(
    companyId: string,
    reportId: string,
    format: string,
  ): Promise<{ body: Buffer; contentType: string; filename: string }> {
    const f = (format || 'pdf').toLowerCase();
    if (f !== 'pdf' && f !== 'application/pdf') {
      throw new BadRequestException('Only PDF export is supported for reports');
    }
    const report = await this.getReportById(companyId, reportId, { withRelations: false });
    const companyName = await fetchCompanyDisplayName(this.cfg, companyId);
    let template: ReportTemplate | null = null;
    if (report.templateVersionId) {
      template = await this.templateRepository.findOne({
        where: { id: report.templateVersionId, companyId },
      });
    }
    const body = await this.exportPdf(report, companyName, template);
    const slug = (report.title || 'report')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'report';
    return {
      body,
      contentType: 'application/pdf',
      filename: `${slug}.pdf`,
    };
  }

  private async exportPdf(
    report: Report,
    companyName: string,
    template: ReportTemplate | null,
  ): Promise<Buffer> {
    const w = await createBrandedPdfWriter({
      companyName,
      reportTitle: report.title || template?.name || `${report.type} report`,
    });
    const line = (text: string, size = 10, bold = false, gap = 3) => {
      brandedDrawBlock(w, text, size, bold, gap);
    };
    const bar = (label: string) => brandedSectionBar(w, label);
    const gap = (n: number) => { w.y -= n; };

    bar('Report information');
    line(`Type: ${report.type}`, 10, false);
    line(`Status: ${(report.status || '').replace(/_/g, ' ')}`, 10, false);
    if (report.severity) line(`Severity: ${report.severity}`, 10, false);
    line(`Version: ${report.version}`, 10, false);
    if (report.description) line(`Description: ${stripHtmlForPdf(report.description)}`, 10, false);
    if (template?.name) line(`Template: ${template.name}`, 10, false);
    if (report.dueDate) {
      line(`Due date: ${new Date(report.dueDate).toLocaleDateString('en-GB')}`, 10, false);
    }
    if (report.createdAt) {
      line(`Created: ${new Date(report.createdAt).toLocaleDateString('en-GB')}`, 10, false);
    }
    gap(8);

    const sections: TemplateSection[] = template?.sections?.length
      ? [...template.sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : [];

    if (sections.length) {
      for (const section of sections) {
        bar(section.title);
        if (section.description) {
          line(section.description, 9, false, 2);
          gap(4);
        }
        const fields = [...(section.fields || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        for (const field of fields) {
          brandedDrawLabeledField(w, field.label, report.data?.[field.name], field);
        }
        gap(6);
      }
    } else if (report.data && Object.keys(report.data).length) {
      bar('Report data');
      for (const [key, value] of Object.entries(report.data)) {
        brandedDrawLabeledField(w, key, value, { type: 'text' });
      }
    }

    return finalizeBrandedPdf(w);
  }
}
