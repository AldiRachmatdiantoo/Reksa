import type { EmailMessage, IEmailService } from '../../src/config/email.js';

/** Menampung email di memori supaya test bisa membaca tautan verifikasi/reset tanpa SMTP. */
export class MemoryEmailService implements IEmailService {
  sent: EmailMessage[] = [];
  failNext = false;

  async send(message: EmailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('smtp down');
    }
    this.sent.push(message);
  }

  clear(): void {
    this.sent = [];
  }

  /** Email terakhir ke alamat itu. */
  lastTo(to: string): EmailMessage | undefined {
    return this.sent.filter((m) => m.to === to).at(-1);
  }

  /** Token dari tautan di email terakhir ke alamat itu. */
  tokenFor(to: string, path: 'verifikasi-email' | 'atur-ulang-password'): string {
    const text = this.lastTo(to)?.text ?? '';
    const match = new RegExp(`/${path}\\?token=([A-Za-z0-9_-]+)`).exec(text);
    if (!match?.[1]) throw new Error(`Tidak ada tautan ${path} untuk ${to}`);
    return match[1];
  }
}
