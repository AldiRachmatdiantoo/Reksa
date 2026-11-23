import type { MaterialQuota } from '@/features/materials/materialsApi';
import type { SessionStatus } from '@/features/studio/sessionsApi';

export type StudyCard = { to: string; title: string; text: string; action: string };

/**
 * Kartu Belajar mengikuti sesi yang sedang berjalan, supaya pelajar yang kembali ke Beranda di tengah sesi
 * langsung diarahkan ke langkah berikutnya, bukan ke ruang belajar kosong.
 */
export function studyCard(session: { status: SessionStatus | null; submissionId: string | null } | null): StudyCard {
  if (session?.submissionId) {
    return {
      to: '/belajar/hasil',
      title: 'Lihat hasil catatanmu',
      text: 'Catatan terakhirmu sudah terkirim. Buka hasil ceknya di sini.',
      action: 'Lihat hasil',
    };
  }
  if (session?.status === 'AWAITING_SCAN') {
    return {
      to: '/belajar/foto',
      title: 'Lanjut foto catatan',
      text: 'Tebakan nilaimu sudah tersimpan. Tinggal foto tulisanmu untuk dicek.',
      action: 'Foto sekarang',
    };
  }
  if (session?.status === 'FOCUS_ACTIVE' || session?.status === 'AWAITING_JOL') {
    return {
      to: '/belajar',
      title: 'Lanjutkan sesimu',
      text: 'Sesi fokusmu masih berjalan. Kembali ke sana dan selesaikan dulu.',
      action: 'Lanjutkan',
    };
  }
  return {
    to: '/belajar',
    title: 'Mulai sesi belajar',
    text: 'Pilih materi, fokus dengan timer, lalu tulis ulang yang kamu ingat di kertas tanpa melihat bacaannya.',
    action: 'Pilih materi',
  };
}

/** Keterangan kecil di kartu Ulang. `null` = belum dimuat atau gagal, pakai keterangan umum. */
export function reviewHint(dueCount: number | null): string {
  if (dueCount === null) return 'Latihan hari ke-3 dan ke-7 dari hasil cekmu';
  if (dueCount === 0) return 'Belum ada yang waktunya hari ini';
  return `${dueCount} latihan sudah waktunya`;
}

/** Keterangan kecil di kartu Materi. `null` = belum dimuat atau gagal. */
export function materialHint(quota: Pick<MaterialQuota, 'remaining' | 'stored'> | null): string {
  if (quota === null) return 'Unggah PDF atau tempel teks bacaan';
  if (quota.stored === 0) return 'Belum ada materi, tambah yang pertama';
  if (quota.remaining === 0) return `${quota.stored} materi tersimpan, kuota baru habis hari ini`;
  return `${quota.stored} materi tersimpan, sisa ${quota.remaining} baru hari ini`;
}
