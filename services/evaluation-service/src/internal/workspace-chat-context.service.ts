import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In, MoreThanOrEqual } from 'typeorm';
import {
  NonConformity,
  CapaAction,
  NCStatus,
  CapaActionStatus,
} from '../database/entities/non-conformity.entity';
import { Audit, AuditStatus } from '../database/entities/audit.entity';

const CLOSED_NC_STATUSES = [NCStatus.CLOSED, NCStatus.REJECTED];
const OPEN_CAPA_STATUSES = [CapaActionStatus.PLANNED, CapaActionStatus.IN_PROGRESS];

@Injectable()
export class WorkspaceChatContextService {
  constructor(
    @InjectRepository(NonConformity) private readonly ncRepo: Repository<NonConformity>,
    @InjectRepository(CapaAction) private readonly capaRepo: Repository<CapaAction>,
    @InjectRepository(Audit) private readonly auditRepo: Repository<Audit>,
  ) {}

  async buildForCompany(companyId: string): Promise<{ summary: string }> {
    const now = new Date();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const openNcs = await this.ncRepo.find({
      where: { companyId, status: Not(In(CLOSED_NC_STATUSES)) },
      order: { updatedAt: 'DESC' },
      take: 40,
    });

    const capaDueSoon = await this.capaRepo.find({
      where: {
        companyId,
        actionStatus: In(OPEN_CAPA_STATUSES),
        dueDate: MoreThanOrEqual(now),
      },
      order: { dueDate: 'ASC' },
      take: 20,
      relations: ['nonConformity'],
    });

    const capaDueThisMonth = capaDueSoon.filter((c) => c.dueDate <= monthEnd);

    const audits = await this.auditRepo.find({
      where: {
        companyId,
        status: In([AuditStatus.PLANNED, AuditStatus.IN_PROGRESS]),
      },
      order: { scheduledAt: 'ASC' },
      take: 15,
    });

    const lines: string[] = [];

    if (openNcs.length) {
      lines.push('Open non-conformities (tenant database):');
      for (const nc of openNcs) {
        const clause = nc.isoClause ? ` clause ${nc.isoClause}` : '';
        lines.push(
          `- [${nc.status}] ${nc.title}${clause} (${nc.classification}), id ${nc.id}`,
        );
      }
    } else {
      lines.push('Open non-conformities: none.');
    }

    const byClause = new Map<string, string[]>();
    for (const nc of openNcs) {
      const ref = (nc.isoClause || 'unspecified').trim();
      if (!byClause.has(ref)) byClause.set(ref, []);
      byClause.get(ref)!.push(nc.title);
    }
    if (byClause.size) {
      lines.push('Open NCs grouped by ISO clause:');
      for (const [clause, titles] of byClause) {
        lines.push(`- ${clause}: ${titles.join('; ')}`);
      }
    }

    if (capaDueThisMonth.length) {
      lines.push('Corrective actions due this calendar month:');
      for (const c of capaDueThisMonth) {
        const ncTitle = c.nonConformity?.title ? ` (NC: ${c.nonConformity.title})` : '';
        lines.push(
          `- ${c.title}, due ${c.dueDate.toISOString().slice(0, 10)} [${c.actionStatus}]${ncTitle}`,
        );
      }
    }

    const upcoming = audits.filter(
      (a) => a.scheduledAt && a.scheduledAt >= now,
    );
    const inProgress = audits.filter((a) => a.status === AuditStatus.IN_PROGRESS);
    const nextAudit = upcoming[0] ?? inProgress[0] ?? audits[0];

    if (nextAudit) {
      const when = nextAudit.scheduledAt
        ? nextAudit.scheduledAt.toISOString()
        : 'date not set';
      lines.push(
        `Next / current audit: "${nextAudit.title}" [${nextAudit.status}] scheduled ${when} (type ${nextAudit.type}, lead ${nextAudit.leadAuditor}).`,
      );
    } else {
      lines.push('Scheduled audits: none in PLANNED or IN_PROGRESS status.');
    }

    if (audits.length > 1) {
      lines.push('Other planned or in-progress audits:');
      for (const a of audits.slice(0, 8)) {
        if (a.id === nextAudit?.id) continue;
        const when = a.scheduledAt ? a.scheduledAt.toISOString().slice(0, 10) : 'TBD';
        lines.push(`- ${a.title} [${a.status}] ${when}`);
      }
    }

    return { summary: lines.join('\n') };
  }
}
