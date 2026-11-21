import nodemailer, { type Transporter } from 'nodemailer';
import type { Logger } from 'pino';
import type { Env } from './env.js';

export type EmailMessage = { to: string; subject: string; text: string; html: string };

/** Layanan email transaksional (FR-14). Service bisnis hanya mengenal antarmuka ini. */
export interface IEmailService {
  send(message: EmailMessage): Promise<void>;
}

/** SMTP: Mailpit di lokal/compose, penyedia email transaksional di produksi. */
export class SmtpEmailService implements IEmailService {
  private readonly transporter: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transporter = nodemailer.createTransport(smtpUrl);
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}

/**
 * Development tanpa SMTP: email hanya dicatat di log (termasuk tautannya), tidak dikirim.
 * env.ts menolak production tanpa SMTP_URL, jadi kelas ini tidak pernah aktif di produksi.
 */
export class LogEmailService implements IEmailService {
  constructor(private readonly logger: Logger) {}

  async send(message: EmailMessage): Promise<void> {
    this.logger.info({ to: message.to, subject: message.subject, text: message.text }, 'Email tidak dikirim (SMTP_URL kosong)');
  }
}

export function createEmailService(env: Pick<Env, 'SMTP_URL' | 'EMAIL_FROM'>, logger: Logger): IEmailService {
  return env.SMTP_URL ? new SmtpEmailService(env.SMTP_URL, env.EMAIL_FROM) : new LogEmailService(logger);
}
