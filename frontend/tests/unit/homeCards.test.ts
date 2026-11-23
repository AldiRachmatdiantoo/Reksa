import { describe, expect, it } from 'vitest';
import { homePathFor } from '@/features/auth/authApi';
import { materialHint, reviewHint, studyCard } from '@/features/home/homeCards';
import { guideFor } from '@/features/onboarding/guideSteps';

describe('studyCard', () => {
  it('tanpa sesi berjalan mengajak mulai sesi baru', () => {
    expect(studyCard(null)).toMatchObject({ to: '/belajar', action: 'Pilih materi' });
    expect(studyCard({ status: 'EXPIRED', submissionId: null }).to).toBe('/belajar');
    expect(studyCard({ status: null, submissionId: null }).title).toBe('Mulai sesi belajar');
  });

  it('di tengah sesi mengarah ke langkah berikutnya', () => {
    expect(studyCard({ status: 'FOCUS_ACTIVE', submissionId: null })).toMatchObject({ to: '/belajar', title: 'Lanjutkan sesimu' });
    expect(studyCard({ status: 'AWAITING_JOL', submissionId: null }).title).toBe('Lanjutkan sesimu');
    expect(studyCard({ status: 'AWAITING_SCAN', submissionId: null }).to).toBe('/belajar/foto');
    expect(studyCard({ status: 'AWAITING_SCAN', submissionId: 'sub-1' }).to).toBe('/belajar/hasil');
  });
});

describe('keterangan kartu kecil', () => {
  it('kartu Ulang menyebut jumlah yang sudah waktunya', () => {
    expect(reviewHint(null)).toBe('Latihan hari ke-3 dan ke-7 dari hasil cekmu');
    expect(reviewHint(0)).toBe('Belum ada yang waktunya hari ini');
    expect(reviewHint(2)).toBe('2 latihan sudah waktunya');
  });

  it('kartu Materi menyebut simpanan dan sisa kuota hari ini', () => {
    expect(materialHint(null)).toBe('Unggah PDF atau tempel teks bacaan');
    expect(materialHint({ stored: 0, remaining: 3 })).toBe('Belum ada materi, tambah yang pertama');
    expect(materialHint({ stored: 4, remaining: 1 })).toBe('4 materi tersimpan, sisa 1 baru hari ini');
    expect(materialHint({ stored: 4, remaining: 0 })).toBe('4 materi tersimpan, kuota baru habis hari ini');
  });

  it('teks kartu tanpa em dash', () => {
    const texts = [
      reviewHint(null),
      reviewHint(0),
      materialHint(null),
      ...[null, { status: 'AWAITING_SCAN' as const, submissionId: null }].map((s) => studyCard(s).text),
    ];
    for (const t of texts) expect(t).not.toContain('—');
  });
});

describe('Beranda pelajar', () => {
  it('pelajar masuk ke Beranda, guru dan admin tetap ke portal guru', () => {
    expect(homePathFor('STUDENT')).toBe('/belajar/beranda');
    expect(homePathFor('EDUCATOR')).toBe('/guru');
    expect(homePathFor('INSTITUTION_ADMIN')).toBe('/guru');
  });

  it('panduan pelajar menyorot menu Beranda', () => {
    const targets = guideFor('STUDENT', 'Uji').steps.map((s) => s.target);
    expect(targets).toContain('nav[aria-label="Menu pelajar"] a[href="/belajar/beranda"]');
  });
});
