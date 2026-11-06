import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/** Matches apps/frontend globals.css: Qurel+i blue, o gold */
const BRAND_PRIMARY = '#4d92c4';
const BRAND_ACCENT = '#ffc107';
const BRAND_SLOGAN = '#6ba8d4';
const BRAND_DARK = '#1c252e';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter;
  private senderEmail: string;
  private senderName: string;

  constructor(private config: ConfigService) {}

  /** Wordmark: Qurel + i (primary blue), o (gold): same split as QurelioLogo */
  private wordmarkHtml(sizePx: number): string {
    return `<span style="font-family:'Public Sans','Segoe UI',sans-serif;font-size:${sizePx}px;font-weight:700;letter-spacing:0.02em;"><span style="color:${BRAND_PRIMARY};">Qurel</span><span style="color:${BRAND_PRIMARY};">i</span><span style="color:${BRAND_ACCENT};">o</span></span>`;
  }

  onModuleInit() {
    this.senderEmail = this.config.get<string>('SMTP_SENDER_EMAIL')?.trim() ?? '';
    this.senderName  = this.config.get<string>('SMTP_SENDER_NAME')?.trim() || 'Qurelio';

    if (!this.senderEmail) {
      this.logger.error(
        'SMTP_SENDER_EMAIL is missing: set it to a verified sender address on your SMTP server',
      );
      return;
    }

    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const port = Number(this.config.get<string>('SMTP_PORT') ?? '587');
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASSWORD')?.trim();
    const secure = (this.config.get<string>('SMTP_SECURE') ?? 'false').toLowerCase() === 'true';

    if (!host) {
      this.logger.error('SMTP_HOST is missing: email sending will fail');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
      tls: { rejectUnauthorized: false },
    });

    this.logger.log(
      `SMTP transport ready (host=${host}, port=${port}, secure=${secure}, user=${user ? 'yes' : 'no'})`,
    );
    this.logger.log(`SMTP sender: ${this.senderName} <${this.senderEmail}>`);
  }

  /** Low-level send used by all template-based emails. */
  private async sendMail(opts: {
    to:      string;
    subject: string;
    html:    string;
    replyTo?: string;
  }): Promise<void> {
    if (!this.transporter) {
      throw new ServiceUnavailableException(
        'Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and SMTP_SENDER_EMAIL.',
      );
    }
    try {
      const info = await this.transporter.sendMail({
        from:    { name: this.senderName, address: this.senderEmail },
        to:      opts.to,
        subject: opts.subject,
        html:    opts.html,
        replyTo: opts.replyTo,
      });
      this.logger.log(
        info?.messageId
          ? `Email accepted by SMTP for ${opts.to} (message id: ${info.messageId})`
          : `Email accepted by SMTP for ${opts.to}`,
      );
    } catch (err: any) {
      this.logger.error(`SMTP error for ${opts.to}: ${err?.message ?? err}`);
      throw new ServiceUnavailableException(
        'Could not send email. Check SMTP_HOST / SMTP_USER / SMTP_PASSWORD and try again.',
      );
    }
  }

  // ─── Send OTP via Custom HTML Template ────────────────────────────────────

  async sendOtp(params: {
    to:      string;
    name:    string;
    code:    string;
    purpose: 'verification' | 'password-reset';
  }): Promise<void> {
    const { to, code, purpose } = params;

    const subject =
      purpose === 'verification'
        ? 'Verify your Qurelio account'
        : 'Reset your Qurelio password';

    try {
      await this.sendMail({
        to,
        subject,
        html: this.getHtmlTemplate(code, purpose),
      });

      /** Local / staging only: set `LOG_OTP_TO_CONSOLE=true` in env, never in production. */
      if (this.config.get<string>('LOG_OTP_TO_CONSOLE')?.toLowerCase() === 'true') {
        this.logger.warn(
          `LOG_OTP_TO_CONSOLE: OTP for ${to} is ${code}: turn this off outside trusted dev machines`,
        );
      }
    } catch (err) {
      throw err;
    }
  }

  // ─── Account activated (company) ──────────────────────────────────────────
  async sendActivation(params: { to: string; name: string }): Promise<void> {
    await this.sendAccountActivatedNotice({ ...params, kind: 'company' });
  }

  /** After super admin or company owner activates an account, user or company director login. */
  async sendAccountActivatedNotice(params: { to: string; name: string; kind: 'company' | 'user' }): Promise<void> {
    const { to, name, kind } = params;
    const loginUrl   = `${this.config.get('FRONTEND_URL')}/auth/login`;
    const headline   = kind === 'company' ? 'Your Company Account is <span>Active</span>' : 'Your Account is <span>Active</span>';
    const bodyText   = kind === 'company'
      ? 'Great news! Your company account on Qurelio has been reviewed and activated by our team. You can now log in and start managing your quality processes.'
      : 'Great news! Your account has been activated by your company administrator. You can now log in and access your workspace.';
    const badgeText  = kind === 'company' ? 'Company Account' : 'Team Member Account';

    try {
      await this.sendMail({
        to,
        subject: 'Your Qurelio account is now active 🎉',
        html: `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Account Activated | Qurelio</title>
  <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600;700&family=Sora:wght@300;400;600;700&display=swap" rel="stylesheet">
  <style>
    body { background-color:#f4f8ff; font-family:'Sora',sans-serif; color:#0d1b2a; margin:0; padding:0; }
    .wrapper { max-width:600px; margin:0 auto; background:#ffffff; }
    .top-bar { background:${BRAND_DARK}; padding:22px 36px; border-bottom:1px solid rgba(77,146,196,.25); text-align:center; }
    .hero { background:linear-gradient(160deg,#1c252e 0%,#152838 100%); padding:44px 28px; text-align:center; }
    .hero h1 { font-size:34px; font-weight:700; color:#e8f1ff; margin:0 0 16px; line-height:1.25; }
    .hero h1 span { color:${BRAND_ACCENT}; }
    .hero-sub { font-size:15px; color:rgba(200,220,255,.65); line-height:1.75; max-width:440px; margin:0 auto; }
    .body-section { padding:40px 36px; }
    .badge { display:inline-block; background:rgba(77,146,196,.12); border:1px solid rgba(77,146,196,.35); border-radius:50px; padding:5px 20px; font-size:12px; font-weight:600; color:${BRAND_PRIMARY}; letter-spacing:.5px; text-transform:uppercase; margin-bottom:28px; }
    .greeting { font-size:17px; font-weight:600; color:#1c252e; margin:0 0 12px; }
    .message { font-size:15px; color:#546e8a; line-height:1.8; margin:0 0 32px; }
    .cta-wrap { text-align:center; margin:8px 0 36px; }
    .cta-btn { display:inline-block; background:${BRAND_PRIMARY}; color:#fff; padding:15px 42px; border-radius:8px; text-decoration:none; font-weight:700; font-size:15px; letter-spacing:.3px; }
    .divider { border:none; border-top:1px solid #e3eeff; margin:0 0 28px; }
    .note { font-size:13px; color:#90a4ae; line-height:1.7; }
    .footer { background:${BRAND_DARK}; padding:20px; text-align:center; color:rgba(200,220,255,.35); font-size:11px; }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="top-bar">
    ${this.wordmarkHtml(26)}
    <p style="margin:10px 0 0;font-size:11px;color:${BRAND_SLOGAN};font-family:'Public Sans','Segoe UI',sans-serif;letter-spacing:0.02em;line-height:1.4;">Empowering tomorrow&apos;s systems, today.</p>
  </div>
  <div class="hero">
    <div style="font-size:10px;letter-spacing:4px;text-transform:uppercase;color:${BRAND_PRIMARY};font-weight:600;margin-bottom:14px;">QURELIO PLATFORM</div>
    <h1>${headline}</h1>
    <p class="hero-sub">Welcome aboard. Your access to the platform is ready.</p>
  </div>
  <div class="body-section">
    <div style="text-align:center;"><span class="badge">${badgeText}</span></div>
    <p class="greeting">Hi ${name},</p>
    <p class="message">${bodyText}</p>
    <div class="cta-wrap">
      <a href="${loginUrl}" class="cta-btn">Log In to Qurelio</a>
    </div>
    <hr class="divider">
    <p class="note">
      If you have any questions or need help getting started, don't hesitate to reach out to our support team.<br>
      If you did not expect this email, please ignore it.
    </p>
  </div>
  <div class="footer">
    <p>© 2026 Pura Solutions. All rights reserved. · Qurelio</p>
  </div>
</div>
</body>
</html>`,
      });
      this.logger.log(`Account-activated email sent to ${to}`);
    } catch (err: any) {
      this.logger.error(`Activation email error: ${err?.message ?? err}`);
    }
  }

  // ─── Invite: set password email ────────────────────────────────────────────
  async sendSetPasswordEmail(params: { to: string; name: string; setupLink: string }): Promise<void> {
    const { to, name, setupLink } = params;
    try {
      await this.sendMail({
        to,
        subject: 'You have been invited to Qurelio: set your password',
        html: `
<!DOCTYPE html><html><head><meta charset="utf-8"><title>You're invited to Qurelio</title>
<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body style="background:#f4f8ff;font-family:'Sora','Segoe UI',sans-serif;color:#0d1b2a;margin:0;padding:0;">
<div style="max-width:580px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(28,37,46,.12);">
  <div style="background:linear-gradient(160deg,${BRAND_DARK} 0%,#152838 100%);padding:28px 36px;text-align:center;border-bottom:1px solid rgba(77,146,196,.2);">
    ${this.wordmarkHtml(26)}
    <p style="margin:10px 0 0;font-size:11px;color:${BRAND_SLOGAN};font-family:'Public Sans','Segoe UI',sans-serif;">Empowering tomorrow&apos;s systems, today.</p>
  </div>
  <div style="padding:40px 36px;">
    <h2 style="color:${BRAND_DARK};margin-top:0;">Welcome to Qurelio, ${name}!</h2>
    <p style="color:#546e8a;line-height:1.7;">Your account has been created. Click the button below to set your password and activate your account. This link expires in <strong>24 hours</strong>.</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${setupLink}" style="background:${BRAND_PRIMARY};color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;">
        Set My Password
      </a>
    </div>
    <p style="color:#90a4ae;font-size:13px;">If you did not expect this email, you can ignore it.</p>
  </div>
  <div style="background:${BRAND_DARK};padding:16px;text-align:center;color:rgba(200,220,255,.35);font-size:11px;">
    © 2026 Qurelio. All rights reserved.
  </div>
</div>
</body></html>`,
      });
      this.logger.log(`Setup-password email sent to ${to}`);
    } catch (err: any) {
      this.logger.error(`Setup-password email error for ${to}: ${err?.message ?? err}`);
      throw new ServiceUnavailableException('Could not send invitation email. Please try again.');
    }
  }

  // ─── Contact form ─────────────────────────────────────────────────────────
  async sendContactMessage(params: {
    firstName: string;
    lastName:  string;
    email:     string;
    subject:   string;
    message:   string;
  }): Promise<void> {
    const { firstName, lastName, email, subject, message } = params;
    const displayName = `${firstName} ${lastName}`.trim();
    try {
      await this.sendMail({
        to:      'eyadhouib2926@gmail.com',
        subject: subject ? `[Qurelio Contact] ${subject}` : `[Qurelio Contact] Message from ${displayName}`,
        replyTo: email,
        html: `
<div style="font-family:'Segoe UI',sans-serif;color:#0d1b2a;max-width:600px;margin:0 auto;">
  <div style="background:linear-gradient(160deg,${BRAND_DARK} 0%,#152838 100%);padding:22px 32px;border-radius:12px 12px 0 0;border-bottom:1px solid rgba(77,146,196,.2);">
    ${this.wordmarkHtml(22)}
    <h2 style="color:#e8f1ff;margin:14px 0 0;font-size:18px;font-weight:600;font-family:'Public Sans','Segoe UI',sans-serif;">New contact message</h2>
  </div>
  <div style="background:#f4f8ff;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid rgba(77,146,196,.2);">
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:6px 0;color:#546e8a;width:110px;">Name</td><td style="padding:6px 0;font-weight:600;">${displayName}</td></tr>
      <tr><td style="padding:6px 0;color:#546e8a;">Email</td><td style="padding:6px 0;"><a href="mailto:${email}" style="color:${BRAND_PRIMARY};">${email}</a></td></tr>
      ${subject ? `<tr><td style="padding:6px 0;color:#546e8a;">Subject</td><td style="padding:6px 0;font-weight:600;">${subject}</td></tr>` : ''}
    </table>
    <div style="background:#fff;border:1px solid #cce0ff;border-radius:8px;padding:20px;white-space:pre-wrap;line-height:1.7;">
${message}
    </div>
  </div>
</div>`,
      });
      this.logger.log(`Contact message from ${email} forwarded`);
    } catch (err: any) {
      this.logger.error(`Contact email error: ${err?.message ?? err}`);
      throw new ServiceUnavailableException('Could not send your message. Please try again.');
    }
  }

  // ─── Welcome new user ──────────────────────────────────────────────────────
  /** Director / company email when team size crosses 80% of plan band. */
  async sendTeamCapacityNotice(params: {
    to: string;
    companyName: string;
    seatsUsed: number;
    seatsMax: number;
  }): Promise<void> {
    const { to, companyName, seatsUsed, seatsMax } = params;
    if (!this.transporter) return;
    try {
      await this.sendMail({
        to,
        subject: `${companyName}: almost at your team size limit (${seatsUsed}/${seatsMax})`,
        html: `
<div style="font-family:'Segoe UI',sans-serif;color:#0d1b2a;max-width:560px;margin:0 auto;padding:24px;">
  <p style="margin:0 0 12px;font-size:16px;font-weight:600;">Hi ${companyName},</p>
  <p style="margin:0 0 16px;line-height:1.6;color:#546e8a;">
    Your workspace is using <strong>${seatsUsed}</strong> of <strong>${seatsMax}</strong> seats on your current plan
    (including you as company owner).
  </p>
  <p style="margin:0 0 16px;line-height:1.6;color:#546e8a;">
    To add more people, remove inactive users in <strong>User Management</strong> or contact support to update your company size.
  </p>
  <p style="margin:0;">
    <a href="${this.config.get('FRONTEND_URL')}/company/users" style="color:${BRAND_PRIMARY};font-weight:600;">Open User Management</a>
  </p>
</div>`,
      });
      this.logger.log(`Team capacity notice sent to ${to}`);
    } catch (err: unknown) {
      this.logger.warn(`Team capacity email: ${err instanceof Error ? err.message : err}`);
    }
  }

  async sendWelcome(params: { to: string; name: string; role: string }): Promise<void> {
    const { to, name, role } = params;
    try {
      await this.sendMail({
        to,
        subject: `Welcome to Qurelio, ${name}!`,
        html: `<p>Hi <strong>${name}</strong>,</p>
               <p>Your <strong>${role.replace('_', ' ')}</strong> account is ready.</p>
               <a href="${this.config.get('FRONTEND_URL')}/auth/login">Go to Dashboard</a>`,
      });
    } catch (err: any) {
      this.logger.error(`Welcome email error: ${err?.message ?? err}`);
    }
  }

  // ─── Demo bookings ─────────────────────────────────────────────────────────

  /** Slot time rendered in a neutral, unambiguous form (emails have no locale). */
  private formatSlot(startsAt: Date, durationMinutes?: number): string {
    const when = startsAt.toUTCString().replace(' GMT', ' UTC');
    return durationMinutes ? `${when} · ${durationMinutes} min` : when;
  }

  /**
   * Branded shell shared by every demo email: client and admin alike.
   *
   * Mirrors the account-activation template (top bar with wordmark + slogan,
   * gradient hero, white body, dark footer) so a visitor booking a demo gets the
   * same Qurelio-looking email as someone activating an account. Styles are
   * inline rather than in a <style> block: several clients (Gmail on mobile,
   * Outlook web) drop embedded stylesheets, which would strip the whole design.
   */
  /** Public booking calendar, used by demo email CTAs. */
  private bookingUrl(): string {
    const configured = this.config.get<string>('DEMO_BOOKING_URL')?.trim();
    if (configured) return configured;
    const base = this.config.get<string>('FRONTEND_URL')?.trim().replace(/\/$/, '') ?? '';
    return `${base}/demo`;
  }

  private demoShell(
    heading: string,
    bodyHtml: string,
    opts: { eyebrow?: string; heroSub?: string; cta?: { label: string; url: string } } = {},
  ): string {
    const { eyebrow = 'QURELIO PLATFORM', heroSub, cta } = opts;
    const font = "'Sora','Public Sans','Segoe UI',Helvetica,Arial,sans-serif";
    return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${heading} | Qurelio</title>
</head>
<body style="background-color:#f4f8ff;font-family:${font};color:#0d1b2a;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">

    <div style="background:${BRAND_DARK};padding:22px 36px;border-bottom:1px solid rgba(77,146,196,.25);text-align:center;">
      ${this.wordmarkHtml(26)}
      <p style="margin:10px 0 0;font-size:11px;color:${BRAND_SLOGAN};font-family:'Public Sans','Segoe UI',sans-serif;letter-spacing:0.02em;line-height:1.4;">Empowering tomorrow&apos;s systems, today.</p>
    </div>

    <div style="background:linear-gradient(160deg,#1c252e 0%,#152838 100%);padding:40px 28px;text-align:center;">
      <div style="font-size:10px;letter-spacing:4px;text-transform:uppercase;color:${BRAND_PRIMARY};font-weight:600;margin-bottom:14px;">${eyebrow}</div>
      <h1 style="font-size:30px;font-weight:700;color:#e8f1ff;margin:0;line-height:1.25;">${heading}</h1>
      ${heroSub ? `<p style="font-size:15px;color:rgba(200,220,255,.65);line-height:1.75;max-width:440px;margin:16px auto 0;">${heroSub}</p>` : ''}
    </div>

    <div style="padding:36px 36px 28px;font-size:15px;color:#546e8a;line-height:1.8;">
${bodyHtml}
      ${
        cta
          ? `<div style="text-align:center;margin:32px 0 8px;">
               <a href="${cta.url}" style="display:inline-block;background:${BRAND_PRIMARY};color:#fff;padding:15px 42px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:.3px;">${cta.label}</a>
             </div>`
          : ''
      }
    </div>

    <div style="background:${BRAND_DARK};padding:20px;text-align:center;color:rgba(200,220,255,.35);font-size:11px;">
      <p style="margin:0;">© 2026 Pura Solutions. All rights reserved. · Qurelio</p>
    </div>
  </div>
</body>
</html>`;
  }

  /** Sent to the visitor as soon as the request is stored. */
  async sendDemoBookingReceived(params: {
    to: string;
    companyName: string;
    startsAt: Date;
    durationMinutes: number;
    responseHours: number;
  }): Promise<void> {
    const { to, companyName, startsAt, durationMinutes, responseHours } = params;
    await this.sendMail({
      to,
      subject: 'We received your Qurelio demo request',
      html: this.demoShell(
        'Demo request received',
        `<p style="font-size:17px;font-weight:600;color:#1c252e;margin:0 0 12px;">Hi ${companyName},</p>
         <p style="margin:0 0 20px;">Thank you for your interest in Qurelio. We have your request for this slot:</p>
         <div style="background:#f4f8ff;border:1px solid #cce0ff;border-radius:8px;padding:18px 22px;margin:0 0 20px;font-weight:700;color:#1c252e;font-size:16px;">
           ${this.formatSlot(startsAt, durationMinutes)}
         </div>
         <p style="margin:0 0 20px;">Our team will confirm within <strong>${responseHours} hours</strong>. The slot is held for you until then.</p>
         <hr style="border:none;border-top:1px solid #e3eeff;margin:0 0 20px;">
         <p style="font-size:13px;color:#90a4ae;line-height:1.7;margin:0;">
           Nothing to prepare in the meantime. The demo will be built on what you told us.<br>
           If you need to change anything, simply reply to this email.
         </p>`,
        { eyebrow: 'DEMO REQUEST', heroSub: 'We have your slot on hold. Here is what happens next.' },
      ),
    });
  }

  /** Sent to the platform team so a pending request is not missed. */
  async sendDemoBookingAdminAlert(params: {
    to: string;
    booking: {
      fullName?: string | null; companyName: string; field: string; email: string;
      phone?: string | null; role?: string | null; roleOther?: string | null;
      consultingScope?: string | null; companyCapacity: string;
      marketsActive?: string[] | null; marketsTargeting?: string[] | null;
      certifications?: string[] | null; certificationsOther?: string | null;
      productCount?: string | null; complianceToday?: string | null; qmsName?: string | null;
      challenges?: string[] | null; challengesOther?: string | null; timeline?: string | null;
      decisionRole?: string | null; pilotInterest?: string | null;
      description?: string | null; preferredLanguage?: string | null; consentMarketing?: boolean;
    };
    startsAt: Date;
    responseHours: number;
  }): Promise<void> {
    const { to, booking: b, startsAt, responseHours } = params;
    const row = (label: string, value?: string | null) =>
      value ? `<tr><td style="padding:5px 0;color:#546e8a;width:180px;vertical-align:top;">${label}</td><td style="padding:5px 0;font-weight:600;">${value}</td></tr>` : '';
    const list = (items?: string[] | null) => (items && items.length ? items.join('<br>') : '');
    const withOther = (items?: string[] | null, other?: string | null) =>
      other?.trim() ? [...(items ?? []).filter((x) => x !== 'Other'), other] : items ?? [];

    await this.sendMail({
      to,
      replyTo: b.email,
      subject: `[Qurelio Demo] ${b.companyName}: ${this.formatSlot(startsAt)}`,
      html: this.demoShell(
        'New demo request',
        `<table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:14px;">
           ${row('Requested slot', this.formatSlot(startsAt))}
           ${row('Name', b.fullName)}
           ${row('Email', `<a href="mailto:${b.email}" style="color:${BRAND_PRIMARY};">${b.email}</a>`)}
           ${row('Company', b.companyName)}
           ${row('Role', b.roleOther?.trim() ? `${b.role}: ${b.roleOther}` : b.role)}
           ${row('Phone', b.phone)}
           ${row('Industry', b.field)}
           ${row('Consulting for', b.consultingScope)}
           ${row('Company size', b.companyCapacity)}
           ${row('Active markets', list(b.marketsActive))}
           ${row('Targeting', list(b.marketsTargeting))}
           ${row('Certifications', list(withOther(b.certifications, b.certificationsOther)))}
           ${row('Products managed', b.productCount)}
           ${row('Compliance today', b.qmsName?.trim() ? `${b.complianceToday}: ${b.qmsName}` : b.complianceToday)}
           ${row('Main challenges', list(withOther(b.challenges, b.challengesOther)))}
           ${row('Timeline', b.timeline)}
           ${row('Decision role', b.decisionRole)}
           ${row('Pilot programme', b.pilotInterest)}
           ${row('Demo language', b.preferredLanguage)}
           ${row('Marketing opt-in', b.consentMarketing ? 'Yes' : 'No')}
         </table>
         ${
           b.description?.trim()
             ? `<p style="color:#546e8a;margin-bottom:6px;font-size:13px;">Wants to see in the demo</p>
                <div style="background:#fff;border:1px solid #cce0ff;border-radius:8px;padding:18px;white-space:pre-wrap;">${b.description}</div>`
             : ''
         }
         <hr style="border:none;border-top:1px solid #e3eeff;margin:22px 0 18px;">
         <p style="font-size:13px;color:#90a4ae;line-height:1.7;margin:0;">Answer within ${responseHours} hours from the admin dashboard.</p>`,
        { eyebrow: 'ADMIN NOTIFICATION', heroSub: `${b.companyName} asked for a demo. Full answers below.` },
      ),
    });
  }

  /** Sent when the admin confirms or declines. */
  async sendDemoBookingDecision(params: {
    to: string;
    companyName: string;
    startsAt: Date;
    durationMinutes: number;
    confirmed: boolean;
    note?: string | null;
    meetingLink?: string | null;
  }): Promise<void> {
    const { to, companyName, startsAt, durationMinutes, confirmed, note, meetingLink } = params;
    await this.sendMail({
      to,
      subject: confirmed
        ? 'Your Qurelio demo is confirmed'
        : 'About your Qurelio demo request',
      html: this.demoShell(
        confirmed ? 'Demo confirmed' : 'Demo request update',
        `<p style="font-size:17px;font-weight:600;color:#1c252e;margin:0 0 12px;">Hi ${companyName},</p>
         ${
           confirmed
             ? `<p style="margin:0 0 20px;">Your demo is confirmed for:</p>
                <div style="background:#f4f8ff;border:1px solid #cce0ff;border-radius:8px;padding:18px 22px;margin:0 0 20px;font-weight:700;color:#1c252e;font-size:16px;">
                  ${this.formatSlot(startsAt, durationMinutes)}
                </div>
                ${
                  meetingLink
                    ? `<p style="margin:0 0 8px;">Join the demo with this link:</p>
                       <p style="margin:0 0 20px;word-break:break-all;"><a href="${meetingLink}" style="color:${BRAND_PRIMARY};font-weight:600;">${meetingLink}</a></p>`
                    : ''
                }
                <p style="margin:0;">We look forward to speaking with you.</p>`
             : `<p style="margin:0;">Unfortunately we cannot hold the slot on ${this.formatSlot(startsAt)}. The time has been released, and you are welcome to book another.</p>`
         }
         ${
           note
             ? `<div style="background:#f4f8ff;border:1px solid #cce0ff;border-radius:8px;padding:18px 22px;margin-top:20px;white-space:pre-wrap;color:#1c252e;">${note}</div>`
             : ''
         }`,
        {
          eyebrow: confirmed ? 'DEMO CONFIRMED' : 'DEMO REQUEST',
          heroSub: confirmed
            ? 'Your slot is booked. Everything you need is below.'
            : 'That time is no longer available. You can pick another whenever you like.',
          cta: confirmed
            ? (meetingLink ? { label: 'Join the demo', url: meetingLink } : undefined)
            : { label: 'Choose another slot', url: this.bookingUrl() },
        },
      ),
    });
  }

  /**
   * YOUR CUSTOM HTML TEMPLATE
   */
  private getHtmlTemplate(otpCode: string, purpose: string): string {
    const title = purpose === 'verification' ? 'Verify Your <span>Identity</span>' : 'Reset Your <span>Password</span>';
    const subText = purpose === 'verification' 
      ? 'Thank you for registering! 🎉 To complete your Qurelio registration, please use the one-time verification code below.'
      : 'We received a request to reset your password. Please use the code below to complete the process.';

    return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Your Verification Code | Qurelio</title>
  <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600;700&family=Sora:wght@300;400;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    body { background-color: #f4f8ff; font-family: 'Sora', sans-serif; color: #0d1b2a; margin:0; padding:0; }
    .email-wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .top-bar { background: ${BRAND_DARK}; padding: 22px 36px; border-bottom: 1px solid rgba(77,146,196,.25); text-align:center; }
    .hero { background: linear-gradient(160deg, #1c252e 0%, #152838 100%); padding: 40px 25px; text-align:center; }
    .hero h1 { font-size: 38px; font-weight: 700; color: #e8f1ff; margin-bottom: 18px; }
    .hero h1 span { color: ${BRAND_ACCENT}; }
    .hero-sub { font-size: 15px; color: rgba(200,220,255,.6); line-height: 1.75; }
    .code-section { background: #f8fbff; padding: 40px 20px; text-align:center; }
    .code-box { background: #ffffff; border: 1px solid rgba(77,146,196,.25); border-radius: 16px; padding: 25px; box-shadow: 0 2px 24px rgba(28,37,46,.06); display:inline-block; min-width:80%; }
    .code-digits { font-family: 'JetBrains Mono', monospace; font-size: 52px; font-weight: 700; letter-spacing: 12px; color: ${BRAND_PRIMARY}; }
    .timer-badge { display: inline-flex; align-items: center; background: rgba(77,146,196,.08); border: 1px solid rgba(77,146,196,.22); border-radius: 50px; padding: 5px 18px; margin-top: 26px; font-size: 13px; color: #546e8a; }
    .timer-badge strong { color: ${BRAND_PRIMARY}; }
    .support-section { background: #f8fbff; padding: 30px 10px; text-align: center; border-top: 1px solid rgba(77,146,196,.2); }
    .support-btn { display: inline-block; border: 1.5px solid rgba(77,146,196,.45); color: ${BRAND_PRIMARY}; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight:600; text-transform:uppercase; font-size:12px; }
    .footer { background: ${BRAND_DARK}; padding: 20px; text-align: center; color: rgba(200,220,255,.35); font-size: 11px; }
  </style>
</head>
<body>
<div class="email-wrapper">
  <div class="top-bar">
    ${this.wordmarkHtml(26)}
    <p style="margin:10px 0 0;font-size:11px;color:${BRAND_SLOGAN};font-family:'Public Sans','Segoe UI',sans-serif;letter-spacing:0.02em;line-height:1.4;">Empowering tomorrow&apos;s systems, today.</p>
  </div>
  <div class="hero">
    <div style="font-size: 10px; letter-spacing: 4px; text-transform: uppercase; color: ${BRAND_PRIMARY}; font-weight: 600; margin-bottom: 16px;">QURELIO SECURITY</div>
    <h1>${title}</h1>
    <p class="hero-sub">${subText}</p>
  </div>
  <div class="code-section">
    <div class="code-box">
      <span class="code-digits">${otpCode}</span>
    
    </div>
    <div>
      <div class="timer-badge">This code expires in <strong style="margin-left:4px;">10 minutes</strong></div>
    </div>
  </div>
  <div class="support-section">
    <p style="font-size: 14px; color: #546e8a; margin-bottom: 20px;">Need help? The Qurelio support team is ready to assist you.</p>
    <a href="tel:+21629263403" class="support-btn">Call Support</a>
    
  </div>
  <div class="footer">
    <p>© 2026 Pura Solutions. All rights reserved. · Qurelio</p>
  </div>
</div>
</body>
</html>`;
  }
}
