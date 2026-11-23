import { formatResetTime, type MaterialQuota } from '@/features/materials/materialsApi';
import type { HistoryItem } from '@/features/history/historyApi';
import type { SessionStatus } from '@/features/studio/sessionsApi';

export type NextStep = { to: string; title: string; text: string; action: string };

type SessionLike = { status: SessionStatus | null; submissionId: string | null } | null;

/**
 * Satu langkah berikutnya untuk Beranda, dari keadaan akun. Urutannya: sesi yang sedang berjalan dulu (fotonya
 * bisa kedaluwarsa), lalu latihan ulang yang sudah waktunya, lalu materi pertama, baru sesi baru.
 * `dueCount` dan `storedMaterials` null = gagal dimuat, dianggap tidak ada supaya Beranda tetap memberi arah.
 */
export function nextStep(session: SessionLike, dueCount: number | null, storedMaterials: number | null): NextStep {
  if (session?.submissionId) {
    return {
      to: '/belajar/hasil',
      title: 'Lihat hasil catatanmu',
      text: 'Catatan terakhirmu sudah terkirim. Buka hasil ceknya, lalu lihat konsep mana yang terlewat.',
      action: 'Lihat hasil',
    };
  }
  if (session?.status === 'AWAITING_SCAN') {
    return {
      to: '/belajar/foto',
      title: 'Tinggal foto catatanmu',
      text: 'Tebakan nilaimu sudah tersimpan. Foto tulisanmu sebelum batas waktunya lewat supaya bisa dicek.',
      action: 'Foto sekarang',
    };
  }
  if (session?.status === 'FOCUS_ACTIVE' || session?.status === 'AWAITING_JOL') {
    return {
      to: '/belajar',
      title: 'Sesi fokusmu masih berjalan',
      text: 'Kembali ke ruang belajar dan selesaikan dulu sesi yang tadi kamu mulai.',
      action: 'Lanjutkan sesi',
    };
  }
  if (dueCount !== null && dueCount > 0) {
    return {
      to: '/belajar/ulang',
      title: `${dueCount} latihan ulang menunggu`,
      text: 'Konsep yang kemarin terlewat sudah waktunya dilatih lagi. Cuma 5 menit dan tidak memotong jatah foto harianmu.',
      action: 'Mulai latihan ulang',
    };
  }
  if (storedMaterials === 0) {
    return {
      to: '/belajar/materi',
      title: 'Tambah materi pertamamu',
      text: 'Unggah PDF atau tempel teks bacaanmu. Konsep kuncinya disusun otomatis, jadi catatanmu nanti bisa dicek.',
      action: 'Tambah materi',
    };
  }
  return {
    to: '/belajar',
    title: 'Mulai sesi belajar',
    text: 'Pilih materi, fokus dengan timer, lalu tulis ulang yang kamu ingat di kertas tanpa melihat bacaannya.',
    action: 'Pilih materi',
  };
}

export type Attention = { key: string; icon: string; text: string; link?: { to: string; label: string } };

const RECENT_RESULT_MS = 24 * 60 * 60 * 1000;

/**
 * Hal yang perlu diketahui sekarang. Kosong = tidak ada apa-apa, dan bagiannya tidak tampil.
 * `latest` = catatan terbaru dari Riwayat (null bila belum ada atau gagal dimuat).
 */
export function attentionItems(
  quota: Pick<MaterialQuota, 'remaining' | 'stored' | 'resetAt'> | null,
  latest: Pick<HistoryItem, 'submissionId' | 'auditStatus' | 'actualScore' | 'materialTitle' | 'createdAt'> | null,
  now = Date.now(),
): Attention[] {
  const items: Attention[] = [];
  if (latest && (latest.auditStatus === 'PENDING' || latest.auditStatus === 'PROCESSING')) {
    items.push({
      key: 'checking',
      icon: 'hourglass_top',
      text: `Catatan ${latest.materialTitle ?? 'terakhirmu'} sedang dicek. Hasilnya muncul di Riwayat begitu selesai.`,
      link: { to: '/belajar/riwayat', label: 'Buka Riwayat' },
    });
  } else if (
    latest &&
    latest.auditStatus === 'DONE' &&
    latest.actualScore !== null &&
    now - new Date(latest.createdAt).getTime() < RECENT_RESULT_MS
  ) {
    items.push({
      key: 'result',
      icon: 'task_alt',
      text: `Hasil cek ${latest.materialTitle ?? 'catatan terakhirmu'} sudah keluar: nilai ${latest.actualScore}%.`,
      link: { to: `/belajar/riwayat/${latest.submissionId}`, label: 'Lihat hasilnya' },
    });
  }
  if (quota && quota.stored > 0 && quota.remaining === 0) {
    items.push({
      key: 'quota',
      icon: 'block',
      text: `Kuota materi baru hari ini sudah habis, terisi lagi pukul ${formatResetTime(quota.resetAt)}. Materi yang sudah tersimpan tetap bisa dipakai.`,
    });
  }
  return items;
}
