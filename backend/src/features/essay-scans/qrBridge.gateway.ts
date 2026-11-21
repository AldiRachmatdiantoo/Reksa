import { createHash, randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { QrBridgeResponseSchema, QrTokenSchema } from './scans.schema.js';

/** PRD FR-04: token QR berlaku 5 menit dan sekali pakai. */
export const QR_BRIDGE_TTL_SEC = 300;
/** Laptop menunggu sedikit lebih lama dari TTL, supaya unggahan yang dimulai tepat sebelum token habis tetap terlihat. */
export const QR_BRIDGE_WAIT_MS = (QR_BRIDGE_TTL_SEC + 30) * 1000;
/** Penanda "foto masuk" disimpan cukup lama untuk laptop yang tersambung ulang. */
const DONE_TTL_SEC = 10 * 60;

export type QrTicket = { userId: string; sessionId: string };
export type QrBridgeIssued = z.infer<typeof QrBridgeResponseSchema>;
export type WaitOptions = { signal: AbortSignal; timeoutMs?: number; pollMs?: number };

/**
 * Jembatan laptop ↔ HP (FR-04 skenario B).
 * - Laptop (login) meminta token; token ditampilkan sebagai QR.
 * - HP (tanpa login) mengunggah foto dengan token itu; `consume` memakainya sekali.
 * - Unggahan menandai sesi selesai (`notifyUploaded`), laptop yang menunggu lewat SSE (`waitForUpload`) diberi tahu.
 */
export interface QrBridge {
  issue(ticket: QrTicket): Promise<QrBridgeIssued>;
  /** Membaca tiket tanpa memakainya (validasi awal sebelum memproses foto). */
  resolve(token: string): Promise<QrTicket | null>;
  /** Memakai token secara atomik; panggilan kedua untuk token yang sama mendapat null. */
  consume(token: string): Promise<QrTicket | null>;
  notifyUploaded(sessionId: string, submissionId: string): Promise<void>;
  /** submissionId begitu foto masuk, atau null bila waktu habis / koneksi ditutup. */
  waitForUpload(sessionId: string, options: WaitOptions): Promise<string | null>;
}

const TicketSchema = z.object({ userId: z.uuid(), sessionId: z.uuid() }).strict();

const tokenKey = (hash: string) => `qr:v1:token:${hash}`;
const sessionKey = (sessionId: string) => `qr:v1:session:${sessionId}`;
const doneKey = (sessionId: string) => `qr:v1:done:${sessionId}`;

/** Yang disimpan hanya SHA-256 token: isi Redis saja tidak cukup untuk mengunggah atas nama pelajar. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseTicket(raw: string | null): QrTicket | null {
  if (!raw) return null;
  try {
    const parsed = TicketSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

export class RedisQrBridge implements QrBridge {
  constructor(private readonly redis: Redis) {}

  async issue(ticket: QrTicket): Promise<QrBridgeIssued> {
    const qrToken = randomBytes(32).toString('base64url');
    const hash = hashToken(qrToken);
    await this.redis.set(tokenKey(hash), JSON.stringify(ticket), 'EX', QR_BRIDGE_TTL_SEC);
    // SET ... GET menukar penunjuk token sesi secara atomik; token lama langsung tidak berlaku.
    const previous = await this.redis.set(sessionKey(ticket.sessionId), hash, 'EX', QR_BRIDGE_TTL_SEC, 'GET');
    const stale = [doneKey(ticket.sessionId), ...(previous && previous !== hash ? [tokenKey(previous)] : [])];
    await this.redis.del(...stale);
    return QrBridgeResponseSchema.parse({ qrToken, expiresInSec: QR_BRIDGE_TTL_SEC });
  }

  async resolve(token: string): Promise<QrTicket | null> {
    if (!QrTokenSchema.safeParse(token).success) return null;
    return parseTicket(await this.redis.get(tokenKey(hashToken(token))));
  }

  async consume(token: string): Promise<QrTicket | null> {
    if (!QrTokenSchema.safeParse(token).success) return null;
    const hash = hashToken(token);
    const ticket = parseTicket(await this.redis.getdel(tokenKey(hash)));
    if (ticket) {
      // Hapus penunjuk sesi hanya bila masih menunjuk token ini (bukan token yang lebih baru).
      const current = await this.redis.get(sessionKey(ticket.sessionId));
      if (current === hash) await this.redis.del(sessionKey(ticket.sessionId));
    }
    return ticket;
  }

  async notifyUploaded(sessionId: string, submissionId: string): Promise<void> {
    await this.redis.set(doneKey(sessionId), submissionId, 'EX', DONE_TTL_SEC);
  }

  /**
   * Polling Redis tiap detik, bukan pub/sub: tidak butuh koneksi subscriber terpisah per instance,
   * tetap benar walau backend berjalan di beberapa instance, dan cukup ringan untuk antrean 5 menit.
   */
  async waitForUpload(sessionId: string, options: WaitOptions): Promise<string | null> {
    const deadline = Date.now() + (options.timeoutMs ?? QR_BRIDGE_WAIT_MS);
    const pollMs = options.pollMs ?? 1000;
    while (!options.signal.aborted) {
      const submissionId = await this.redis.get(doneKey(sessionId));
      if (submissionId) return submissionId;
      const left = deadline - Date.now();
      if (left <= 0) return null;
      await sleep(Math.min(pollMs, left), options.signal);
    }
    return null;
  }
}
