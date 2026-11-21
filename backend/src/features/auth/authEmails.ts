import type { EmailMessage } from '../../config/email.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function layout(paragraphs: string[], link: string, buttonLabel: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join('');
  return `<!doctype html><html lang="id"><body style="margin:0;padding:24px;background:#f6f4ef;font-family:Arial,sans-serif;color:#1f2a2a;font-size:16px;line-height:1.5">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<p style="margin:0 0 20px;font-weight:bold;color:#0f6b66">REKSA</p>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0f6b66;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:bold">${buttonLabel}</a></p>
<p style="margin:0;font-size:13px;color:#5b6666">Kalau tombol tidak bisa diklik, salin tautan ini ke browser:<br>${escapeHtml(link)}</p>
</div></body></html>`;
}

export function verifyEmailMessage(to: string, fullName: string, link: string): EmailMessage {
  const name = fullName.trim() || 'kamu';
  return {
    to,
    subject: 'Verifikasi email akun REKSA',
    text: [
      `Halo ${name},`,
      '',
      'Klik tautan di bawah untuk memverifikasi email akun REKSA-mu. Tautan berlaku 24 jam.',
      link,
      '',
      'Kalau kamu tidak merasa mendaftar di REKSA, abaikan email ini.',
    ].join('\n'),
    html: layout(
      [
        `Halo ${escapeHtml(name)},`,
        'Klik tombol di bawah untuk memverifikasi email akun REKSA-mu. Tautan berlaku 24 jam.',
        'Kalau kamu tidak merasa mendaftar di REKSA, abaikan email ini.',
      ],
      link,
      'Verifikasi email',
    ),
  };
}

export function resetPasswordMessage(to: string, fullName: string, link: string): EmailMessage {
  const name = fullName.trim() || 'kamu';
  return {
    to,
    subject: 'Atur ulang kata sandi REKSA',
    text: [
      `Halo ${name},`,
      '',
      'Ada permintaan untuk mengatur ulang kata sandi akun REKSA-mu. Tautan berlaku 30 menit dan hanya bisa dipakai sekali.',
      link,
      '',
      'Kalau kamu tidak memintanya, abaikan email ini. Kata sandi lamamu tetap berlaku.',
    ].join('\n'),
    html: layout(
      [
        `Halo ${escapeHtml(name)},`,
        'Ada permintaan untuk mengatur ulang kata sandi akun REKSA-mu. Tautan berlaku 30 menit dan hanya bisa dipakai sekali.',
        'Kalau kamu tidak memintanya, abaikan email ini. Kata sandi lamamu tetap berlaku.',
      ],
      link,
      'Atur ulang kata sandi',
    ),
  };
}
