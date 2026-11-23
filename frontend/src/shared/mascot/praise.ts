import type { MascotMood, MascotName } from './Mascot';

export type Celebration = {
  mascot: MascotName;
  mood: MascotMood;
  title: string;
  text: string;
};

/**
 * Pujian setelah catatan selesai dicek. Selalu berdasarkan angka asli dari hasil cek, bukan pujian kosong:
 * banyak konsep terlewat dapat semangat, bukan "hebat".
 */
export function resultPraise(input: { score: number; missed: number; guess: number; review: boolean }): Celebration {
  const { score, missed, guess, review } = input;
  const accurate = Math.abs(guess - score) <= 10;
  const guessNote = accurate ? ' Tebakanmu juga tepat, kamu kenal betul kemampuanmu sendiri.' : '';
  const mascot: MascotName = review ? 'rasi' : 'risa';

  if (missed === 0) {
    return {
      mascot,
      mood: 'cheer',
      title: review ? 'Sesi ulang tuntas!' : 'Semua konsep tercakup!',
      text: `Nilai catatanmu ${score}, tanpa konsep yang terlewat.${guessNote}`,
    };
  }
  if (score >= 70) {
    return {
      mascot,
      mood: 'happy',
      title: review ? 'Ingatanmu makin kuat' : 'Kerja bagus!',
      text: `Nilai catatanmu ${score}. Tinggal ${missed} konsep lagi yang perlu dibaca ulang.${guessNote}`,
    };
  }
  return {
    mascot,
    mood: 'idle',
    title: 'Langkah pertama sudah jalan',
    text: `Ada ${missed} konsep yang terlewat. Baca lagi bagian itu, nanti di sesi ulang pasti lebih banyak yang nempel.${guessNote}`,
  };
}

export function focusDonePraise(minutes: number): Celebration {
  return {
    mascot: 'rasi',
    mood: 'cheer',
    title: `Fokus ${minutes} menit selesai!`,
    text: 'Kerja bagus. Kalau catatanmu sudah selesai, lanjut tebak nilai.',
  };
}

export function materialAddedPraise(title: string): Celebration {
  return {
    mascot: 'risu',
    mood: 'happy',
    title: 'Materi tersimpan',
    text: `Konsep kunci "${title}" sudah kubaca. Cek rubriknya, lalu mulai belajar.`,
  };
}
