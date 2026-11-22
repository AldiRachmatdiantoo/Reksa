import { ApiError, apiRequest } from '@/core/apiClient';
import type { EssayAudit } from '@/features/audit-result/sampleAudit';

// Sama dengan backend/src/features/essay-scans/scans.schema.ts dan quota.policy.ts.
// HEIC tidak diterima backend (sharp tanpa dekoder HEVC); Safari iOS otomatis mengirim JPEG
// bila input file hanya meminta tipe di bawah ini.
export const SCAN_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const SCAN_MAX_BYTES = 5 * 1024 * 1024;
/** Ditampilkan sebelum memotret: seluruh isi foto ikut dikirim untuk dinilai, jadi identitas tidak perlu ada di kertas. */
export const PHOTO_PRIVACY_TIP = 'Tidak perlu menulis nama atau NIM di kertas. Usahakan wajah dan barang pribadi juga tidak ikut terfoto.';

export type Quota = { tier: 'FREE' | 'PRO'; used: number; limit: number | null; remaining: number | null; resetAt: string };

export type AuditStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

export type Scan = {
  id: string;
  sessionId: string;
  auditStatus: AuditStatus;
  auditAttempts: number;
  retriesLeft: number;
  errorCode: string | null;
  predictedJolScore: number;
  imageUrl: string;
  createdAt: string;
  auditedAt: string | null;
  ledgerHash: string | null;
  result: (EssayAudit & { jolDelta: number }) | null;
};

export type UploadResult = { submissionId: string; auditStatus: 'PENDING'; quota: Quota };

export const scansApi = {
  upload: (photo: File, target: { sessionId: string } | { qrToken: string }) => {
    const form = new FormData();
    if ('sessionId' in target) form.append('sessionId', target.sessionId);
    else form.append('qrToken', target.qrToken);
    form.append('image', photo);
    return apiRequest<UploadResult>('/scans/upload', { method: 'POST', body: form });
  },
  get: (id: string, signal?: AbortSignal) => apiRequest<{ scan: Scan }>(`/scans/${encodeURIComponent(id)}`, { signal }).then((r) => r.scan),
  retry: (id: string) => apiRequest<UploadResult>(`/scans/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
  quota: (signal?: AbortSignal) => apiRequest<{ quota: Quota }>('/me/quota', { signal }).then((r) => r.quota),
};

/** Pemeriksaan awal di browser; backend tetap memeriksa isi file (magic bytes). null = boleh. */
export function photoProblem(file: Pick<File, 'type' | 'size'>): string | null {
  if (!(SCAN_ACCEPT as readonly string[]).includes(file.type)) return 'Pilih foto berformat JPG, PNG, atau WebP.';
  if (file.size > SCAN_MAX_BYTES) {
    return `Ukuran foto ${(file.size / 1024 / 1024).toFixed(1)} MB. Maksimal 5 MB, coba foto ulang dengan resolusi lebih kecil.`;
  }
  return null;
}

export function formatResetTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
}

export function quotaText(q: Quota): string {
  if (q.limit === null) return 'Pro: cek catatan tanpa batas.';
  return `Sisa ${q.remaining} dari ${q.limit} cek hari ini.`;
}

export function uploadErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Foto gagal dikirim. Coba lagi.';
  switch (err.code) {
    case 'QUOTA_EXCEEDED': {
      const resetAt = (err.details as { resetAt?: unknown } | undefined)?.resetAt;
      return typeof resetAt === 'string'
        ? `Jatah cek catatan hari ini sudah habis. Terisi lagi ${formatResetTime(resetAt)} WIB.`
        : 'Jatah cek catatan hari ini sudah habis. Terisi lagi pukul 00.00 WIB.';
    }
    case 'QR_TOKEN_INVALID':
      return 'Kode QR sudah tidak berlaku. Minta kode baru dari layar laptop.';
    case 'SESSION_EXPIRED':
      return 'Sesi ini sudah kedaluwarsa karena foto tidak diunggah dalam 2 jam. Mulai sesi baru, ya.';
    case 'INVALID_SESSION_STATE':
      return err.message;
  }
  switch (err.status) {
    case 0:
      return 'Server REKSA tidak bisa dihubungi. Periksa koneksimu lalu coba lagi.';
    case 413:
      return 'Ukuran foto lebih dari 5 MB. Foto ulang dengan resolusi lebih kecil.';
    case 415:
    case 422:
      return err.message;
    case 429:
      return 'Terlalu banyak foto dikirim dalam satu jam. Coba lagi nanti.';
    default:
      return err.status >= 500 ? 'Server sedang bermasalah. Coba lagi sebentar lagi.' : err.message;
  }
}

/** Penjelasan kode gagal audit (backend AuditErrorCode). */
export function auditFailureText(code: string | null): string {
  switch (code) {
    case 'AI_QUOTA_EXHAUSTED':
      return 'Jatah pemeriksa otomatis untuk hari ini sudah habis. Jatah cekmu dikembalikan, coba cek ulang besok.';
    case 'AI_INVALID_OUTPUT':
      return 'Pemeriksa otomatis memberi jawaban yang tidak bisa dipakai.';
    case 'MATERIAL_UNAVAILABLE':
      return 'Materi untuk sesi ini tidak bisa dibaca lagi, misalnya karena kamu sudah keluar dari kelasnya.';
    case 'STORAGE_UNAVAILABLE':
      return 'Foto catatanmu gagal dibaca dari penyimpanan.';
    case 'AUDIT_STALLED':
      return 'Pengecekan terlalu lama dan dihentikan.';
    default:
      return 'Pemeriksa otomatis sedang penuh atau tidak tersedia. Tunggu sekitar satu menit, lalu cek ulang.';
  }
}
