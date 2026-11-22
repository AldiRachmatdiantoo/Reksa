import { ApiError } from '@/core/apiClient';
import { uploadErrorMessage } from '@/features/scanner/scansApi';
import type { OutboxItem, OutboxStore } from '@/shared/offline/outbox';
import { sessionErrorMessage, type ServerSession } from './sessionsApi';

/**
 * Kiriman yang lebih lama dari ini dibuang tanpa dikirim. Server sendiri menolak tebakan yang datang lebih dari
 * 30 menit setelah waktu fokus habis dan foto yang datang lebih dari 2 jam setelah tebakan (FR-02), jadi foto
 * tidak perlu tertinggal lama di perangkat.
 */
export const OUTBOX_MAX_AGE_MS = 6 * 60 * 60_000;

export type FlushApi = {
  submitJol: (sessionId: string, score: number) => Promise<ServerSession>;
  upload: (photo: File, sessionId: string) => Promise<{ submissionId: string }>;
};

export type FlushEvent =
  | { kind: 'jol-sent'; sessionId: string; session: ServerSession }
  | { kind: 'photo-sent'; sessionId: string; submissionId: string }
  /** Server menolak karena keadaan sesi sudah berubah (misalnya kiriman sebelumnya ternyata sampai). Ambil ulang sesinya. */
  | { kind: 'stale'; sessionId: string; what: OutboxItem['kind'] }
  /** Ditolak permanen. Tebakan yang ditolak ikut membuang foto sesi itu (pasti ditolak juga). */
  | { kind: 'dropped'; sessionId: string; what: OutboxItem['kind']; message: string };

export type FlushResult = {
  events: FlushEvent[];
  /** true bila berhenti karena koneksi atau server belum siap; sisa antrean dicoba lagi nanti. */
  pending: boolean;
};

const TOO_OLD = 'Kiriman ini tersimpan di perangkat lebih dari 6 jam, jadi tidak dikirim lagi. Mulai sesi baru, ya.';

/** Koneksi putus, server sibuk, atau sesi login perlu diperbarui: simpan dan coba lagi nanti. */
export function isRetryable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status === 0 || err.status === 401 || err.status === 408 || err.status === 429 || err.status >= 500;
}

/** Tebakan selalu dikirim sebelum foto sesi yang sama: server baru menerima foto setelah tebakan tersimpan. */
function sendOrder(a: OutboxItem, b: OutboxItem): number {
  if (a.sessionId === b.sessionId && a.kind !== b.kind) return a.kind === 'jol' ? -1 : 1;
  return a.savedAt - b.savedAt;
}

/** Mengirim antrean milik `userId` secara berurutan. Kiriman milik akun lain di perangkat yang sama tidak disentuh. */
export async function flushOutbox(store: OutboxStore, api: FlushApi, userId: string, now = Date.now()): Promise<FlushResult> {
  const items = (await store.list()).filter((item) => item.userId === userId).sort(sendOrder);
  const events: FlushEvent[] = [];
  // Tebakan ditolak permanen (misalnya sesi kedaluwarsa): foto sesi itu pasti ditolak juga.
  const deadSessions = new Map<string, string>();

  for (const item of items) {
    const dead = deadSessions.get(item.sessionId);
    if (dead !== undefined || now - item.savedAt > OUTBOX_MAX_AGE_MS) {
      await store.remove(item.id);
      if (dead === undefined) {
        if (item.kind === 'jol') deadSessions.set(item.sessionId, TOO_OLD);
        events.push({ kind: 'dropped', sessionId: item.sessionId, what: item.kind, message: TOO_OLD });
      }
      continue;
    }
    try {
      if (item.kind === 'jol') {
        const session = await api.submitJol(item.sessionId, item.score);
        await store.remove(item.id);
        events.push({ kind: 'jol-sent', sessionId: item.sessionId, session });
      } else {
        const photo = new File([item.bytes], item.name, { type: item.type });
        const { submissionId } = await api.upload(photo, item.sessionId);
        await store.remove(item.id);
        events.push({ kind: 'photo-sent', sessionId: item.sessionId, submissionId });
      }
    } catch (err) {
      if (isRetryable(err)) return { events, pending: true };
      await store.remove(item.id);
      if (err instanceof ApiError && err.code === 'INVALID_SESSION_STATE') {
        events.push({ kind: 'stale', sessionId: item.sessionId, what: item.kind });
        continue;
      }
      const message = item.kind === 'jol' ? sessionErrorMessage(err) : uploadErrorMessage(err);
      if (item.kind === 'jol') deadSessions.set(item.sessionId, message);
      events.push({ kind: 'dropped', sessionId: item.sessionId, what: item.kind, message });
    }
  }
  return { events, pending: false };
}
