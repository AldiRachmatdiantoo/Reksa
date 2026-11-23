import { describe, expect, it } from 'vitest';
import { firstName, guideFor } from '@/features/onboarding/guideSteps';

describe('firstName', () => {
  it('mengambil kata pertama dan mengabaikan spasi', () => {
    expect(firstName('  Aldi Rachmatdianto ')).toBe('Aldi');
    expect(firstName('')).toBe('');
  });
});

describe('guideFor', () => {
  it('pelajar disapa dengan nama dan perannya, lalu diarahkan ke Materi', () => {
    const guide = guideFor('STUDENT', 'Aldi Rachmatdianto');
    expect(guide.steps[0]!.title).toBe('Halo, Aldi! Aku Risa.');
    expect(guide.steps[0]!.text).toContain('sebagai pelajar');
    expect(guide.finish).toEqual({ label: 'Tambah materi pertama', to: '/belajar/materi' });
  });

  it('menyebut batas foto gratis yang sama dengan halaman Akun', () => {
    const text = guideFor('STUDENT', 'A')
      .steps.map((s) => s.text)
      .join(' ');
    expect(text).toContain('3 foto per hari');
  });

  it('guru dan admin mendapat panduan portal masing-masing', () => {
    expect(guideFor('EDUCATOR', 'Bu Sari').steps[0]!.text).toContain('sebagai guru');
    expect(guideFor('INSTITUTION_ADMIN', 'Pak Budi').steps[0]!.text).toContain('sebagai admin institusi');
    expect(guideFor('EDUCATOR', 'x').finish.to).toBeNull();
  });

  it('nama kosong tetap menyapa dengan sopan', () => {
    expect(guideFor('STUDENT', ' ').steps[0]!.title).toBe('Halo! Aku Risa.');
  });

  it('teks panduan tanpa em dash', () => {
    for (const role of ['STUDENT', 'EDUCATOR', 'INSTITUTION_ADMIN'] as const) {
      for (const s of guideFor(role, 'Uji').steps) expect(`${s.title} ${s.text}`).not.toContain('—');
    }
  });
});
