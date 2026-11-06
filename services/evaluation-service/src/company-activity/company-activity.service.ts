import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Brackets } from 'typeorm';
import { CompanyActivityEvent } from '../database/entities/company-activity-event.entity';
import { AuditChangeLog, Audit } from '../database/entities/audit.entity';
import { Evaluation, EvaluationStatus } from '../database/entities/evaluation.entity';
import { NonConformity, CapaAction } from '../database/entities/non-conformity.entity';

export type CompanyActivityStatus = 'success' | 'warning' | 'info' | 'error';

export interface CompanyActivityRow {
  at: number;
  actorUserId: string | null;
  event: string;
  status: CompanyActivityStatus;
}

@Injectable()
export class CompanyActivityService {
  constructor(
    @InjectRepository(CompanyActivityEvent) private readonly eventRepo: Repository<CompanyActivityEvent>,
    @InjectRepository(AuditChangeLog) private readonly changeLogRepo: Repository<AuditChangeLog>,
    @InjectRepository(Evaluation) private readonly evalRepo: Repository<Evaluation>,
    @InjectRepository(NonConformity) private readonly ncRepo: Repository<NonConformity>,
    @InjectRepository(CapaAction) private readonly capaRepo: Repository<CapaAction>,
  ) {}

  async log(
    companyId: string,
    actorUserId: string | null,
    status: CompanyActivityStatus,
    summary: string,
    metadata?: Record<string, unknown> | null,
  ): Promise<void> {
    await this.eventRepo.save(
      this.eventRepo.create({
        companyId,
        actorUserId,
        status,
        summary,
        metadata: metadata ?? null,
      }),
    );
  }

  private formatAuditAction(action: string, auditTitle: string, detail: Record<string, unknown> | null): string {
    const title = (auditTitle || 'Audit').trim() || 'Audit';
    const d = detail ?? {};
    switch (action) {
      case 'AUDIT_CREATED':
        return `Audit · Created: ${title} (${d.type ?? '-'})`;
      case 'CHECKLIST_GENERATED':
        return `Audit · Checklist generated: ${title} (${d.count ?? '?'} rows)`;
      case 'CHECKLIST_REPLACED':
        return `Audit · Checklist replaced: ${title} (${d.count ?? '?'} rows)`;
      case 'AUDIT_STARTED':
        return `Audit · Started: ${title}`;
      case 'FINDING_ADDED':
        return `Audit · Finding added: ${title} (${d.type ?? '-'})`;
      case 'NC_CREATED_FROM_CHECKLIST':
        return `Audit · NC created from checklist: ${title}`;
      case 'CHECKLIST_UPDATED':
        return `Audit · Checklist updated: ${title}`;
      case 'AUDIT_COMPLETED':
        return `Audit · Completed: ${title}`;
      default:
        return `Audit · ${action}: ${title}`;
    }
  }

  private auditStatus(action: string): CompanyActivityStatus {
    if (action === 'AUDIT_COMPLETED') return 'success';
    if (action === 'FINDING_ADDED' || action === 'NC_CREATED_FROM_CHECKLIST') return 'warning';
    if (action === 'AUDIT_STARTED' || action === 'CHECKLIST_UPDATED' || action === 'CHECKLIST_REPLACED') return 'info';
    return 'info';
  }

  private evalProductLabel(ev: Evaluation): string {
    const snap = (ev.requestSnapshot ?? {}) as Record<string, unknown>;
    const meta = (snap.evaluationMetadata as Record<string, unknown> | undefined) ?? {};
    const name =
      (typeof snap.productName === 'string' && snap.productName.trim()) ||
      (typeof meta.productName === 'string' && meta.productName.trim()) ||
      null;
    if (name && name.length < 80 && !/^[0-9a-f-]{36}$/i.test(name)) return name;
    return ev.isoStandard || 'Evaluation';
  }

  async listMerged(companyId: string, fromMs: number, toMs: number): Promise<CompanyActivityRow[]> {
    const from = new Date(fromMs);
    const to = new Date(toMs);
    const out: CompanyActivityRow[] = [];

    const [customRows, changeLogs, evals, ncs, capas] = await Promise.all([
      this.eventRepo.find({
        where: { companyId, createdAt: Between(from, to) },
        order: { createdAt: 'DESC' },
        take: 400,
      }),
      this.changeLogRepo
        .createQueryBuilder('l')
        .innerJoinAndSelect('l.audit', 'a')
        .where('a.companyId = :companyId', { companyId })
        .andWhere('l.createdAt BETWEEN :from AND :to', { from, to })
        .orderBy('l.createdAt', 'DESC')
        .take(400)
        .getMany(),
      this.evalRepo
        .createQueryBuilder('e')
        .where('e.companyId = :companyId', { companyId })
        .andWhere(
          new Brackets((qb) => {
            qb.where('e.createdAt BETWEEN :from AND :to', { from, to })
              .orWhere('e.startedAt BETWEEN :from AND :to', { from, to })
              .orWhere('e.completedAt BETWEEN :from AND :to', { from, to });
          }),
        )
        .getMany(),
      this.ncRepo.find({
        where: { companyId, createdAt: Between(from, to) },
        order: { createdAt: 'DESC' },
        take: 200,
      }),
      this.capaRepo
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.nonConformity', 'nc')
        .where('c.companyId = :companyId', { companyId })
        .andWhere(
          new Brackets((qb) => {
            qb.where('c.createdAt BETWEEN :from AND :to', { from, to }).orWhere(
              'c.completedAt BETWEEN :from AND :to',
              { from, to },
            );
          }),
        )
        .orderBy('c.createdAt', 'DESC')
        .take(300)
        .getMany(),
    ]);

    for (const row of customRows) {
      out.push({
        at: row.createdAt.getTime(),
        actorUserId: row.actorUserId,
        event: row.summary,
        status: (['success', 'warning', 'info', 'error'].includes(row.status) ? row.status : 'info') as CompanyActivityStatus,
      });
    }

    for (const l of changeLogs) {
      const a = l.audit as Audit | undefined;
      out.push({
        at: l.createdAt.getTime(),
        actorUserId: l.userId,
        event: this.formatAuditAction(l.action, a?.title ?? '', l.detail),
        status: this.auditStatus(l.action),
      });
    }

    for (const ev of evals) {
      const label = this.evalProductLabel(ev);
      const iso = ev.isoStandard || '-';
      if (inRange(ev.createdAt, fromMs, toMs)) {
        out.push({
          at: ev.createdAt.getTime(),
          actorUserId: ev.initiatedBy,
          event: `Evaluation · Queued: ${iso} (${label})`,
          status: 'info',
        });
      }
      if (ev.startedAt && inRange(ev.startedAt, fromMs, toMs)) {
        out.push({
          at: ev.startedAt.getTime(),
          actorUserId: ev.initiatedBy,
          event: `Evaluation · Processing: ${iso} (${label})`,
          status: 'info',
        });
      }
      if (ev.completedAt && inRange(ev.completedAt, fromMs, toMs)) {
        if (ev.status === EvaluationStatus.COMPLETED) {
          const score = ev.conformityScore != null ? `${Math.round(ev.conformityScore)}%` : '-';
          out.push({
            at: ev.completedAt.getTime(),
            actorUserId: ev.initiatedBy,
            event: `Evaluation · Completed: ${iso} (${label}), ${score}`,
            status: 'success',
          });
        } else if (ev.status === EvaluationStatus.FAILED) {
          out.push({
            at: ev.completedAt.getTime(),
            actorUserId: ev.initiatedBy,
            event: `Evaluation · Failed: ${iso} (${label})`,
            status: 'error',
          });
        }
      }
    }

    for (const nc of ncs) {
      out.push({
        at: nc.createdAt.getTime(),
        actorUserId: nc.detectedBy,
        event: `Non-conformity · Created: ${nc.title || 'NC'} (${nc.status})`,
        status: 'warning',
      });
    }

    for (const c of capas) {
      const ncTitle = (c.nonConformity?.title || 'NC').trim();
      if (c.createdAt && inRange(c.createdAt, fromMs, toMs)) {
        const actor = c.createdByUserId ?? c.assignedTo;
        out.push({
          at: c.createdAt.getTime(),
          actorUserId: actor,
          event: `CAPA · Action added: ${c.title} (NC: ${ncTitle})`,
          status: 'info',
        });
      }
      if (c.completedAt && inRange(c.completedAt, fromMs, toMs)) {
        const actor = c.completedByUserId ?? c.assignedTo;
        out.push({
          at: c.completedAt.getTime(),
          actorUserId: actor,
          event: `CAPA · Completed: ${c.title} (NC: ${ncTitle})`,
          status: 'success',
        });
      }
    }

    out.sort((a, b) => b.at - a.at);
    return out.slice(0, 500);
  }
}

function inRange(d: Date | null | undefined, fromMs: number, toMs: number): boolean {
  if (!d) return false;
  const t = d.getTime();
  return t >= fromMs && t <= toMs;
}
