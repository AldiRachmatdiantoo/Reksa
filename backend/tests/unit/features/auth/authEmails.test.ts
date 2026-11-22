import { describe, expect, it } from 'vitest';
import {
  confirmEmailChangeMessage,
  emailChangeRequestedNotice,
  emailTakenNotice,
  maskEmail,
} from '../../../../src/features/auth/authEmails.js';

describe('maskEmail', () => {
  it('keeps the first letter and the domain only', () => {
    expect(maskEmail('dimas.baru@reksa.id')).toBe('d***@reksa.id');
    expect(maskEmail('a@b.co')).toBe('a***@b.co');
    expect(maskEmail('rusak')).toBe('***');
    expect(maskEmail('@reksa.id')).toBe('***');
  });
});

describe('email change messages (F1)', () => {
  const link = 'https://app.reksa.test/konfirmasi-email?token=abc';

  it('escapes the name in HTML and puts the link in both parts', () => {
    const msg = confirmEmailChangeMessage('baru@reksa.id', '<b>Dimas</b>', link);
    expect(msg.to).toBe('baru@reksa.id');
    expect(msg.html).not.toContain('<b>Dimas</b>');
    expect(msg.html).toContain('&#60;b&#62;Dimas');
    expect(msg.text).toContain(link);
    expect(msg.html).toContain(link);
  });

  it('the notice to the old address names only the masked address and how to cancel', () => {
    const msg = emailChangeRequestedNotice('lama@reksa.id', 'Dimas', 'b***@reksa.id', 'https://app.reksa.test/akun');
    expect(msg.text).toContain('b***@reksa.id');
    expect(msg.text).toMatch(/ganti kata sandi/i);
    expect(msg.text).not.toContain('konfirmasi-email');
  });

  it('the taken notice carries no confirm link', () => {
    const msg = emailTakenNotice('pemilik@reksa.id', 'https://app.reksa.test/masuk');
    expect(msg.text).not.toContain('konfirmasi-email');
    expect(msg.text).toContain('https://app.reksa.test/masuk');
  });
});
