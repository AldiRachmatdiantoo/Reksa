import { describe, expect, it } from 'vitest';
import { focusDonePraise, materialAddedPraise, resultPraise } from '@/shared/mascot/praise';

describe('resultPraise', () => {
  it('tanpa poin terlewat: Risa bersorak dan menyebut nilainya', () => {
    const p = resultPraise({ score: 92, missed: 0, guess: 60, review: false });
    expect(p).toMatchObject({ mascot: 'risa', mood: 'cheer', title: 'Semua poin tercakup!' });
    expect(p.text).toContain('92');
    expect(p.text).not.toContain('Tebakanmu juga tepat');
  });

  it('nilai tinggi tapi ada yang terlewat: menyebut jumlah poin yang tersisa', () => {
    const p = resultPraise({ score: 75, missed: 2, guess: 80, review: false });
    expect(p.mood).toBe('happy');
    expect(p.text).toContain('Tinggal 2 poin');
    expect(p.text).toContain('Tebakanmu juga tepat');
  });

  it('banyak yang terlewat: menyemangati, bukan memuji', () => {
    const p = resultPraise({ score: 30, missed: 5, guess: 90, review: false });
    expect(p.mood).toBe('idle');
    expect(p.title).not.toMatch(/bagus|hebat/i);
    expect(p.text).toContain('5 poin');
  });

  it('sesi ulang dipandu Rasi', () => {
    expect(resultPraise({ score: 100, missed: 0, guess: 100, review: true })).toMatchObject({
      mascot: 'rasi',
      title: 'Sesi ulang tuntas!',
    });
  });
});

describe('pujian lain', () => {
  it('timer fokus selesai menyebut lama fokus', () => {
    expect(focusDonePraise(25)).toMatchObject({ mascot: 'rasi', title: 'Fokus 25 menit selesai!' });
  });

  it('materi baru menyebut judulnya', () => {
    expect(materialAddedPraise('Fotosintesis')).toMatchObject({ mascot: 'risu' });
    expect(materialAddedPraise('Fotosintesis').text).toContain('Fotosintesis');
  });
});
