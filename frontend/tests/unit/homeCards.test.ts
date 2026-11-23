import { describe, expect, it } from 'vitest';
import { homePathFor } from '@/features/auth/authApi';
import { attentionItems, nextStep } from '@/features/home/homeCards';
import { guideFor } from '@/features/onboarding/guideSteps';

const NOW = new Date('2026-11-23T10:00:00Z').getTime();
const HOUR = 60 * 60 * 1000;

describe('nextStep', () => {
  it('sesi yang sedang berjalan selalu didahulukan', () => {
    expect(nextStep({ status: 'FOCUS_ACTIVE', submissionId: null }, 3, 0)).toMatchObject({ to: '/belajar', action: 'Lanjutkan sesi' });
    expect(nextStep({ status: 'AWAITING_JOL', submissionId: null }, 3, 0).to).toBe('/belajar');
    expect(nextStep({ status: 'AWAITING_SCAN', submissionId: null }, 3, 0).to).toBe('/belajar/foto');
    expect(nextStep({ status: 'AWAITING_SCAN', submissionId: 'sub-1' }, 3, 0).to).toBe('/belajar/hasil');
  });

  it('lalu latihan ulang yang sudah waktunya, lalu materi pertama, lalu sesi baru', () => {
    expect(nextStep(null, 2, 0)).toMatchObject({ to: '/belajar/ulang', title: '2 latihan ulang menunggu' });
    expect(nextStep({ status: 'EXPIRED', submissionId: null }, 0, 0)).toMatchObject({ to: '/belajar/materi' });
    expect(nextStep(null, 0, 4)).toMatchObject({ to: '/belajar', title: 'Mulai sesi belajar' });
  });

  it('data yang gagal dimuat tidak menghentikan Beranda', () => {
    expect(nextStep(null, null, null)).toMatchObject({ to: '/belajar', title: 'Mulai sesi belajar' });
  });
});

describe('attentionItems', () => {
  const quota = { remaining: 2, stored: 3, resetAt: '2026-11-23T17:00:00Z' };
  const latest = {
    submissionId: 'sub-1',
    auditStatus: 'DONE',
    actualScore: 72,
    materialTitle: 'Homeostasis',
    createdAt: new Date(NOW - 2 * HOUR).toISOString(),
  };

  it('kosong kalau tidak ada yang perlu diketahui', () => {
    expect(attentionItems(quota, null, NOW)).toEqual([]);
    expect(attentionItems(null, { ...latest, createdAt: new Date(NOW - 30 * HOUR).toISOString() }, NOW)).toEqual([]);
  });

  it('hasil cek baru (24 jam terakhir) tampil dengan nilainya dan tautan ke hasilnya', () => {
    const [item] = attentionItems(quota, latest, NOW);
    expect(item).toMatchObject({ key: 'result', link: { to: '/belajar/riwayat/sub-1' } });
    expect(item!.text).toContain('Homeostasis');
    expect(item!.text).toContain('72%');
  });

  it('catatan yang masih dicek dan kuota materi yang habis ikut tampil', () => {
    const items = attentionItems({ ...quota, remaining: 0 }, { ...latest, auditStatus: 'PROCESSING', actualScore: null }, NOW);
    expect(items.map((i) => i.key)).toEqual(['checking', 'quota']);
    expect(items[1]!.text).toContain('00.00 WIB');
  });

  it('akun tanpa materi tidak diberi tahu soal kuota, langkah berikutnya sudah mengajak tambah materi', () => {
    expect(attentionItems({ ...quota, stored: 0, remaining: 0 }, null, NOW)).toEqual([]);
  });

  it('teks tanpa em dash', () => {
    const texts = [
      ...attentionItems({ ...quota, remaining: 0 }, { ...latest, auditStatus: 'PENDING' }, NOW).map((i) => i.text),
      ...[null, { status: 'AWAITING_SCAN' as const, submissionId: null }].map((s) => nextStep(s, 1, 1).text),
    ];
    for (const t of texts) expect(t).not.toContain('—');
  });
});

describe('Beranda pelajar', () => {
  it('pelajar masuk ke Beranda, guru dan admin tetap ke portal guru', () => {
    expect(homePathFor('STUDENT')).toBe('/belajar/beranda');
    expect(homePathFor('EDUCATOR')).toBe('/guru');
  });

  it('panduan pelajar menyorot menu Beranda', () => {
    const targets = guideFor('STUDENT', 'Uji').steps.map((s) => s.target);
    expect(targets).toContain('nav[aria-label="Menu pelajar"] a[href="/belajar/beranda"]');
  });
});
