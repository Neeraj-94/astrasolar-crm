import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface WelcomeEmailInput {
  to: string;
  name: string;
  password: string;
}

/**
 * Thin SMTP mailer (nodemailer). Configuration comes from env:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM
 *
 * If SMTP isn't configured the service degrades gracefully: it logs a warning
 * and `send` returns false instead of throwing, so user creation is never
 * blocked by mail being unavailable (e.g. in local dev).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private warnedMissingConfig = false;

  private get from(): string {
    return process.env.MAIL_FROM || 'AstraSolar CRM <no-reply@astrasolar.com.au>';
  }

  private getTransporter(): nodemailer.Transporter | null {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      if (!this.warnedMissingConfig) {
        this.logger.warn(
          'SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing). ' +
            'Outbound emails will be skipped.',
        );
        this.warnedMissingConfig = true;
      }
      return null;
    }

    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        // SMTP_SECURE=true → implicit TLS (port 465). Otherwise STARTTLS.
        secure:
          String(process.env.SMTP_SECURE).toLowerCase() === 'true' ||
          port === 465,
        auth: { user, pass },
      });
    }
    return this.transporter;
  }

  /** Generic send. Returns true on success, false if skipped/failed. */
  async send(opts: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<boolean> {
    const transporter = this.getTransporter();
    if (!transporter) return false;
    try {
      await transporter.sendMail({
        from: this.from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      });
      return true;
    } catch (e) {
      this.logger.error(
        `Failed to send email to ${opts.to}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return false;
    }
  }

  /** Welcome email with the account's initial password. */
  async sendWelcomeEmail(input: WelcomeEmailInput): Promise<boolean> {
    const loginUrl = `${process.env.WEB_ORIGIN || 'http://localhost:3000'}/login`;
    const subject = 'Your AstraSolar CRM account';

    const text = [
      `Hi ${input.name},`,
      '',
      'An account has been created for you on the AstraSolar CRM.',
      '',
      `Email:    ${input.to}`,
      `Password: ${input.password}`,
      '',
      `Sign in here: ${loginUrl}`,
      '',
      'For your security, please change your password after your first sign-in.',
      '',
      '— AstraSolar CRM',
    ].join('\n');

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
        <h2 style="margin:0 0 16px">Welcome to AstraSolar CRM</h2>
        <p>Hi ${escapeHtml(input.name)},</p>
        <p>An account has been created for you. Use the credentials below to sign in:</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:6px 12px;color:#64748b">Email</td><td style="padding:6px 12px;font-family:ui-monospace,monospace">${escapeHtml(
            input.to,
          )}</td></tr>
          <tr><td style="padding:6px 12px;color:#64748b">Password</td><td style="padding:6px 12px;font-family:ui-monospace,monospace">${escapeHtml(
            input.password,
          )}</td></tr>
        </table>
        <p style="margin:16px 0">
          <a href="${loginUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Sign in</a>
        </p>
        <p style="color:#64748b;font-size:13px">For your security, please change your password after your first sign-in.</p>
        <p style="color:#94a3b8;font-size:12px">— AstraSolar CRM</p>
      </div>
    `;

    return this.send({ to: input.to, subject, text, html });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
