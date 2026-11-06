import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { ReportTemplate, ReportTemplateVersion, TemplateSection } from '../database/entities/report-template.entity';
import { ReportType } from '../database/entities/report.entity';

export interface CreateTemplateDto {
  name: string;
  description?: string;
  reportType: ReportType;
  sections: TemplateSection[];
  statuses?: string[];
  workflow?: Record<string, string[]>;
  approvalRoles?: string[];
  pdfTemplate?: string;
  enableCollaboration?: boolean;
  requireSignatures?: boolean;
}

export interface UpdateTemplateDto {
  name?: string;
  description?: string;
  sections?: TemplateSection[];
  statuses?: string[];
  workflow?: Record<string, string[]>;
  approvalRoles?: string[];
  pdfTemplate?: string;
  enableCollaboration?: boolean;
  requireSignatures?: boolean;
  changeDescription?: string;
}

@Injectable()
export class ReportTemplateService {
  constructor(
    @InjectRepository(ReportTemplate)
    private templateRepository: Repository<ReportTemplate>,
    @InjectRepository(ReportTemplateVersion)
    private versionRepository: Repository<ReportTemplateVersion>,
  ) {}

  /**
   * Create a new report template
   */
  async createTemplate(
    companyId: string,
    userId: string,
    dto: CreateTemplateDto,
  ): Promise<ReportTemplate> {
    const template = this.templateRepository.create({
      companyId,
      name: dto.name,
      description: dto.description,
      reportType: dto.reportType,
      sections: dto.sections,
      statuses: dto.statuses || [
        'DRAFT',
        'SUBMITTED',
        'UNDER_REVIEW',
        'APPROVED',
        'REJECTED',
        'CLOSED',
      ],
      workflow: dto.workflow,
      approvalRoles: dto.approvalRoles || ['QUALITY_MANAGER', 'ADMIN'],
      pdfTemplate: dto.pdfTemplate,
      enableCollaboration: dto.enableCollaboration ?? true,
      requireSignatures: dto.requireSignatures ?? false,
      createdByUserId: userId,
    });

    const saved = await this.templateRepository.save(template);

    // Create version history (save plain object: same pattern as ReportVersion in report.service)
    await this.versionRepository.save({
      templateId: saved.id,
      versionNumber: 1,
      snapshot: {
        sections: template.sections,
        statuses: template.statuses,
        workflow: template.workflow ?? undefined,
        approvalRoles: template.approvalRoles,
        pdfTemplate: template.pdfTemplate ?? undefined,
      },
      changeDescription: 'Initial template version',
      createdByUserId: userId,
    });

    return saved;
  }

  /**
   * Get template by ID
   */
  async getTemplateById(companyId: string, templateId: string): Promise<ReportTemplate> {
    const template = await this.templateRepository.findOne({
      where: { id: templateId, companyId },
      relations: ['versions'],
    });

    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    return template;
  }

  /**
   * List templates
   */
  async listTemplates(
    companyId: string,
    filters: {
      reportType?: ReportType;
      isActive?: boolean;
      skip?: number;
      take?: number;
    },
  ): Promise<{ data: ReportTemplate[]; total: number }> {
    const take = filters.take || 20;
    const skip = filters.skip || 0;

    const where: FindOptionsWhere<ReportTemplate> = { companyId };
    if (filters.reportType) where.reportType = filters.reportType;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;

    const [data, total] = await this.templateRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take,
      skip,
    });

    return { data, total };
  }

  /**
   * Update template
   */
  async updateTemplate(
    companyId: string,
    templateId: string,
    userId: string,
    dto: UpdateTemplateDto,
  ): Promise<ReportTemplate> {
    const template = await this.getTemplateById(companyId, templateId);

    if (!template.isActive) {
      throw new BadRequestException('Cannot edit archived templates');
    }

    // Create version snapshot before updating
    const oldVersion = template.version;
    template.version += 1;

    template.name = dto.name ?? template.name;
    template.description = dto.description ?? template.description;
    template.sections = dto.sections ?? template.sections;
    template.statuses = dto.statuses ?? template.statuses;
    template.workflow = dto.workflow ?? template.workflow;
    template.approvalRoles = dto.approvalRoles ?? template.approvalRoles;
    template.pdfTemplate = dto.pdfTemplate ?? template.pdfTemplate;
    template.enableCollaboration = dto.enableCollaboration ?? template.enableCollaboration;
    template.requireSignatures = dto.requireSignatures ?? template.requireSignatures;
    template.updatedByUserId = userId;

    const updated = await this.templateRepository.save(template);

    // Create version history
    await this.versionRepository.save({
      templateId: template.id,
      versionNumber: template.version,
      snapshot: {
        sections: template.sections,
        statuses: template.statuses,
        workflow: template.workflow ?? undefined,
        approvalRoles: template.approvalRoles,
        pdfTemplate: template.pdfTemplate ?? undefined,
      },
      changeDescription: dto.changeDescription || `Updated to version ${template.version}`,
      createdByUserId: userId,
    });

    return updated;
  }

  /**
   * Archive template
   */
  async archiveTemplate(companyId: string, templateId: string): Promise<ReportTemplate> {
    const template = await this.getTemplateById(companyId, templateId);
    template.isActive = false;
    return this.templateRepository.save(template);
  }

  /**
   * Activate template
   */
  async activateTemplate(companyId: string, templateId: string): Promise<ReportTemplate> {
    const template = await this.getTemplateById(companyId, templateId);
    template.isActive = true;
    return this.templateRepository.save(template);
  }

  /**
   * Get template versions
   */
  async getVersions(companyId: string, templateId: string): Promise<ReportTemplateVersion[]> {
    await this.getTemplateById(companyId, templateId); // Validate access

    return this.versionRepository.find({
      where: { templateId },
      order: { versionNumber: 'ASC' },
    });
  }

  /**
   * Duplicate template
   */
  async duplicateTemplate(
    companyId: string,
    templateId: string,
    userId: string,
    newName: string,
  ): Promise<ReportTemplate> {
    const original = await this.getTemplateById(companyId, templateId);

    const duplicate = this.templateRepository.create({
      companyId,
      name: newName,
      description: original.description,
      reportType: original.reportType,
      sections: original.sections,
      statuses: original.statuses,
      workflow: original.workflow,
      approvalRoles: original.approvalRoles,
      pdfTemplate: original.pdfTemplate,
      enableCollaboration: original.enableCollaboration,
      requireSignatures: original.requireSignatures,
      parentTemplateId: original.id,
      createdByUserId: userId,
    });

    return this.templateRepository.save(duplicate);
  }

  /**
   * Delete template
   */
  async deleteTemplate(companyId: string, templateId: string): Promise<void> {
    const template = await this.getTemplateById(companyId, templateId);
    await this.templateRepository.remove(template);
  }
}
