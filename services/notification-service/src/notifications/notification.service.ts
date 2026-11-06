import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository }       from 'typeorm';
import { ConfigService }    from '@nestjs/config';
import { Notification, NotificationType } from '../database/entities/notification.entity';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);
  private transporter: Transporter;
  private senderEmail: string;
  private senderName: string;

  constructor(
    @InjectRepository(Notification) private repo: Repository<Notification>,
    private cfg: ConfigService,
  ) {}

  onModuleInit() {
    this.senderEmail = this.cfg.get<string>('SMTP_SENDER_EMAIL')?.trim() ?? '';
    this.senderName  = this.cfg.get<string>('SMTP_SENDER_NAME')?.trim() || 'Qurelio';

    const host = this.cfg.get<string>('SMTP_HOST')?.trim();
    const port = Number(this.cfg.get<string>('SMTP_PORT') ?? '587');
    const user = this.cfg.get<string>('SMTP_USER')?.trim();
    const pass = this.cfg.get<string>('SMTP_PASSWORD')?.trim();
    const secure = (this.cfg.get<string>('SMTP_SECURE') ?? 'false').toLowerCase() === 'true';

    if (!host || !this.senderEmail) {
      this.logger.error('SMTP_HOST or SMTP_SENDER_EMAIL missing in Notification Service, emails will fail');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
      tls: { rejectUnauthorized: false },
    });
    this.logger.log(`SMTP transport initialized for Notifications (host=${host}, port=${port})`);
  }

  /** Low-level send. */
  private async sendMail(opts: {
    to:      string;
    subject: string;
    html:    string;
  }): Promise<void> {
    if (!this.transporter) return;
    try {
      await this.transporter.sendMail({
        from:    { name: this.senderName, address: this.senderEmail },
        to:      opts.to,
        subject: opts.subject,
        html:    opts.html,
      });
    } catch (e: any) {
      this.logger.error(`SMTP error for ${opts.to}: ${e?.message ?? e}`);
    }
  }

  async create(dto: {
    companyId: string; userId: string; type: NotificationType;
    title: string; message: string; metadata?: any;
  }) {
    const n = this.repo.create(dto);
    return this.repo.save(n);
  }

  async listForUser(userId: string, onlyUnread = false, archivedOnly = false) {
    if (archivedOnly) {
      return this.repo.find({
        where: { userId, isArchived: true },
        order: { createdAt: 'DESC' },
        take:  100,
      });
    }
    return this.repo.find({
      where: {
        userId,
        isArchived: false,
        ...(onlyUnread ? { isRead: false } : {}),
      },
      order: { createdAt: 'DESC' },
      take:  100,
    });
  }

  async markRead(id: string, userId: string) {
    const n = await this.repo.findOne({ where: { id, userId } });
    if (!n) throw new NotFoundException('Notification not found');
    await this.repo.update(id, { isRead: true });
    return { message: 'Marked as read' };
  }

  async markAllRead(userId: string) {
    await this.repo.update({ userId, isRead: false, isArchived: false }, { isRead: true });
    return { message: 'All marked as read' };
  }

  async archive(id: string, userId: string) {
    const n = await this.repo.findOne({ where: { id, userId } });
    if (!n) throw new NotFoundException('Notification not found');
    await this.repo.update(id, { isArchived: true });
    return { message: 'Archived' };
  }

  async unarchive(id: string, userId: string) {
    const n = await this.repo.findOne({ where: { id, userId } });
    if (!n) throw new NotFoundException('Notification not found');
    await this.repo.update(id, { isArchived: false });
    return { message: 'Restored' };
  }

  async remove(id: string, userId: string) {
    const res = await this.repo.delete({ id, userId });
    if (!res.affected) throw new NotFoundException('Notification not found');
    return { message: 'Deleted' };
  }

  /** `count` is unread in inbox (backward compatible); includes totals for tabs */
  async unreadCount(userId: string) {
    const [unread, activeTotal, archived] = await Promise.all([
      this.repo.count({ where: { userId, isArchived: false, isRead: false } }),
      this.repo.count({ where: { userId, isArchived: false } }),
      this.repo.count({ where: { userId, isArchived: true } }),
    ]);
    return { count: unread, unread, activeTotal, archived };
  }

  async notifyEvaluationComplete(dto: {
    companyId: string; userId: string; userEmail?: string | null;
    evaluationId: string; score: number | null; isoStandard: string;
  }) {
    const scoreLabel = typeof dto.score === 'number' && Number.isFinite(dto.score)
      ? `${dto.score.toFixed(1)}%` : 'Review required';
    await this.create({
      companyId: dto.companyId, userId: dto.userId,
      type:    NotificationType.EVALUATION_COMPLETE,
      title:   'Evaluation Complete',
      message: `Your ${dto.isoStandard} evaluation is done. ${scoreLabel === 'Review required' ? 'Some results need review.' : `Score: ${scoreLabel}`}`,
      metadata: { evaluationId: dto.evaluationId, score: dto.score },
    });

    if (!dto.userEmail?.trim()) {
      this.logger.warn('notifyEvaluationComplete: no userEmail, skipping email');
      return;
    }

    const color = dto.score == null ? '#ad6800' : dto.score >= 90 ? '#36b37e' : dto.score >= 70 ? '#ffab00' : '#ff5630';
    await this.sendMail({
      to:      dto.userEmail,
      subject: `Evaluation complete: ${scoreLabel}`,
      html:    `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;">
                  <h2 style="color:#1565c0;">Evaluation Complete</h2>
                  <p>Your <strong>${dto.isoStandard}</strong> conformity evaluation has finished.</p>
                  <div style="text-align:center;padding:24px;background:#f4f6f8;border-radius:12px;margin:24px 0;">
                    <p style="margin:0;font-size:13px;color:#637381;letter-spacing:1px;text-transform:uppercase;">Conformity Score</p>
                    <p style="margin:8px 0 0;font-size:32px;font-weight:900;color:${color}">${scoreLabel}</p>
                  </div>
                  <a href="${this.cfg.get('FRONTEND_URL')}/evaluations/${dto.evaluationId}"
                     style="display:inline-block;background:linear-gradient(135deg,#1565c0,#0097a7);color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;">
                    View Full Report
                  </a>
                </div>`,
    });
  }

  async notifyEvaluationFailed(dto: {
    companyId: string; userId: string; userEmail?: string | null;
    evaluationId: string; isoStandard: string; error: string;
  }) {
    await this.create({
      companyId: dto.companyId, userId: dto.userId,
      type: NotificationType.ALERT,
      title: 'Evaluation Failed',
      message: `Your ${dto.isoStandard} evaluation could not complete: ${dto.error.slice(0, 200)}`,
      metadata: { evaluationId: dto.evaluationId, error: dto.error },
    });

    if (!dto.userEmail?.trim()) {
      this.logger.warn('notifyEvaluationFailed: no userEmail, skipping email');
      return;
    }

    await this.sendMail({
      to: dto.userEmail,
      subject: `Evaluation failed: ${dto.isoStandard}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;">
               <h2 style="color:#c62828;">Evaluation Failed</h2>
               <p>Your <strong>${dto.isoStandard}</strong> compliance evaluation did not complete.</p>
               <p style="color:#637381;font-size:14px;">${dto.error.replace(/</g, '&lt;')}</p>
               <a href="${this.cfg.get('FRONTEND_URL')}/evaluations/${dto.evaluationId}"
                  style="display:inline-block;background:#1565c0;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;">
                 View evaluation
               </a>
             </div>`,
    });
  }

  async notifyDocumentExtractionComplete(dto: {
    companyId: string; userId: string;
    documentId: string; documentName: string; success: boolean; isStandard?: boolean;
  }) {
    const safeName = dto.documentName?.trim() || 'Document';
    await this.create({
      companyId: dto.companyId,
      userId: dto.userId,
      type: NotificationType.DOCUMENT_EXTRACTION_COMPLETE,
      title: dto.success ? 'Document extraction complete' : 'Document extraction failed',
      message: dto.success
        ? dto.isStandard
          ? `${safeName} finished processing. Review the details, then activate the standard when ready.`
          : `${safeName} finished processing and is ready to review.`
        : `${safeName} could not finish extraction. Please review the document and try again.`,
      metadata: { documentId: dto.documentId, success: dto.success, name: safeName },
    });
  }

  async notifyCapaAssigned(dto: {
    companyId: string; userId: string; userEmail?: string | null;
    ncId: string; capaId: string; ncTitle: string; capaTitle: string; dueDate: string;
  }) {
    const due = new Date(dto.dueDate);
    const dueStr = due.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    await this.create({
      companyId: dto.companyId,
      userId: dto.userId,
      type: NotificationType.CAPA_ASSIGNED,
      title: 'CAPA action assigned to you',
      message: `${dto.capaTitle} (NC: ${dto.ncTitle}). Due ${dueStr}.`,
      metadata: { ncId: dto.ncId, capaId: dto.capaId, dueDate: dto.dueDate },
    });

    if (!dto.userEmail?.trim()) {
      this.logger.warn('notifyCapaAssigned: no userEmail, skipping email');
      return;
    }
    const fe = this.cfg.get('FRONTEND_URL', 'http://localhost:3001').replace(/\/$/, '');
    await this.sendMail({
      to: dto.userEmail,
      subject: `CAPA assigned: ${dto.capaTitle}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;">
               <h2 style="color:#1565c0;">CAPA assigned</h2>
               <p>You have been assigned: <strong>${dto.capaTitle.replace(/</g, '&lt;')}</strong></p>
               <p>Non-conformance: <strong>${dto.ncTitle.replace(/</g, '&lt;')}</strong></p>
               <p style="color:#637381;">Due: ${dueStr}</p>
               <a href="${fe}/nc" style="display:inline-block;background:#1565c0;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Open NC workspace</a>
             </div>`,
    });
  }

  async notifyCapaDueSoon(dto: {
    companyId: string; userId: string; userEmail?: string | null;
    ncId: string; capaId: string; ncTitle: string; capaTitle: string; dueDate: string;
  }) {
    const due = new Date(dto.dueDate);
    const dueStr = due.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    await this.create({
      companyId: dto.companyId,
      userId: dto.userId,
      type: NotificationType.CAPA_DUE_SOON,
      title: 'CAPA due in 48 hours',
      message: `${dto.capaTitle} (NC: ${dto.ncTitle}) is due ${dueStr}. Please complete or update the owner.`,
      metadata: { ncId: dto.ncId, capaId: dto.capaId, dueDate: dto.dueDate },
    });

    if (!dto.userEmail?.trim()) {
      this.logger.warn('notifyCapaDueSoon: no userEmail, skipping email');
      return;
    }
    const fe = this.cfg.get('FRONTEND_URL', 'http://localhost:3001').replace(/\/$/, '');
    await this.sendMail({
      to: dto.userEmail,
      subject: `Reminder: CAPA ${dto.capaTitle} is due soon`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;">
               <h2 style="color:#b76e00;">Due within 48 hours</h2>
               <p><strong>${dto.capaTitle.replace(/</g, '&lt;')}</strong> for NC <strong>${dto.ncTitle.replace(/</g, '&lt;')}</strong> is approaching its due date (${dueStr}).</p>
               <a href="${fe}/nc" style="display:inline-block;background:#1565c0;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Open NC workspace</a>
             </div>`,
    });
  }
}
