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

/** "nama@contoh.com" → "n***@contoh.com". Dipakai di email ke alamat lama supaya alamat baru tidak tertulis utuh. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

/** F1: dikirim ke alamat BARU. Email akun baru berganti setelah tautan ini dibuka. */
export function confirmEmailChangeMessage(to: string, fullName: string, link: string): EmailMessage {
  const name = fullName.trim() || 'kamu';
  const lines = [
    'Ada permintaan memakai alamat ini sebagai email akun REKSA-mu. Klik tautan di bawah untuk mengonfirmasi. Tautan berlaku 24 jam dan hanya bisa dipakai sekali.',
    'Setelah dikonfirmasi, masuk ke REKSA memakai alamat ini.',
    'Kalau kamu tidak memintanya, abaikan email ini. Tidak ada yang berubah.',
  ];
  return {
    to,
    subject: 'Konfirmasi email baru akun REKSA',
    text: [`Halo ${name},`, '', lines[0], link, '', lines[1], lines[2]].join('\n'),
    html: layout([`Halo ${escapeHtml(name)},`, ...lines], link, 'Konfirmasi email baru'),
  };
}

/** F1: dikirim ke alamat LAMA saat ada permintaan ganti email. `maskedNewEmail` dari maskEmail. */
export function emailChangeRequestedNotice(to: string, fullName: string, maskedNewEmail: string, accountLink: string): EmailMessage {
  const name = fullName.trim() || 'kamu';
  const lines = [
    `Ada permintaan mengganti email akun REKSA-mu ke ${maskedNewEmail}. Email akunmu belum berubah sampai tautan yang kami kirim ke alamat baru itu dibuka.`,
    'Kalau itu kamu, tidak perlu melakukan apa-apa di sini.',
    'Kalau bukan kamu, ganti kata sandi sekarang dari halaman Akun. Mengganti kata sandi membatalkan permintaan ini dan mengeluarkan perangkat lain dari akunmu.',
  ];
  return {
    to,
    subject: 'Permintaan ganti email akun REKSA',
    text: [`Halo ${name},`, '', ...lines, '', accountLink].join('\n'),
    html: layout([`Halo ${escapeHtml(name)},`, ...lines.map(escapeHtml)], accountLink, 'Buka halaman Akun'),
  };
}

/**
 * F1: dikirim ke alamat baru yang ternyata sudah terdaftar. Peminta tidak diberi tahu (jawaban API sama),
 * jadi penjelasannya sampai ke pemilik alamat saja.
 */
export function emailTakenNotice(to: string, loginLink: string): EmailMessage {
  const lines = [
    'Ada permintaan memakai alamat ini sebagai email akun REKSA, tapi alamat ini sudah dipakai akun REKSA lain, jadi permintaan itu tidak diproses.',
    'Kalau kamu yang meminta, masuk ke akun yang memakai alamat ini, atau pakai alamat lain. Lupa kata sandinya? Pilih "Lupa kata sandi" di halaman masuk.',
    'Kalau bukan kamu, abaikan email ini. Akunmu aman dan tidak ada yang berubah.',
  ];
  return {
    to,
    subject: 'Alamat ini sudah dipakai akun REKSA',
    text: ['Halo,', '', ...lines, '', loginLink].join('\n'),
    html: layout(['Halo,', ...lines.map(escapeHtml)], loginLink, 'Masuk ke REKSA'),
  };
}
