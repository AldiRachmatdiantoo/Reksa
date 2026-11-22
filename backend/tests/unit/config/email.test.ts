import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { createEmailService, LogEmailService, SmtpEmailService } from '../../../src/config/email.js';

const MESSAGE = { to: 'ani@reksa.test', subject: 'Verifikasi email', text: 'Buka tautan ini', html: '<p>Buka tautan ini</p>' };

function fakeLogger() {
  const info = vi.fn();
  return { logger: { info } as unknown as Logger, info };
}

describe('createEmailService', () => {
  it('uses SMTP when SMTP_URL is set and only logs when it is empty', () => {
    const { logger } = fakeLogger();
    expect(createEmailService({ SMTP_URL: 'smtp://mailpit:1025', EMAIL_FROM: 'REKSA <no-reply@reksa.test>' }, logger)).toBeInstanceOf(
      SmtpEmailService,
    );
    expect(createEmailService({ SMTP_URL: undefined, EMAIL_FROM: 'REKSA <no-reply@reksa.test>' }, logger)).toBeInstanceOf(LogEmailService);
  });
});

describe('SmtpEmailService', () => {
  it('sends the message from the configured sender', async () => {
    // jsonTransport: nodemailer menyusun email lengkap tanpa membuka koneksi jaringan.
    const service = new SmtpEmailService('smtp://localhost?jsonTransport=true', 'REKSA <no-reply@reksa.test>');
    const transporter = (service as unknown as { transporter: { sendMail: (m: object) => Promise<{ message: string }> } }).transporter;
    const sendMail = vi.spyOn(transporter, 'sendMail');

    await service.send(MESSAGE);

    expect(sendMail).toHaveBeenCalledWith({ from: 'REKSA <no-reply@reksa.test>', ...MESSAGE });
    const sent = JSON.parse((await sendMail.mock.results[0]!.value).message);
    expect(sent.from).toEqual({ address: 'no-reply@reksa.test', name: 'REKSA' });
    expect(sent.to).toEqual([{ address: 'ani@reksa.test', name: '' }]);
    expect(sent.subject).toBe('Verifikasi email');
  });
});

describe('LogEmailService', () => {
  it('logs the recipient, subject, and text (with the link) instead of sending', async () => {
    const { logger, info } = fakeLogger();
    await new LogEmailService(logger).send(MESSAGE);
    expect(info).toHaveBeenCalledWith(
      { to: 'ani@reksa.test', subject: 'Verifikasi email', text: 'Buka tautan ini' },
      'Email tidak dikirim (SMTP_URL kosong)',
    );
  });
});
