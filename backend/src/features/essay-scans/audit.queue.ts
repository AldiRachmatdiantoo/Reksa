import type { Redis } from 'ioredis';
import { z } from 'zod';
import type { AuditJob } from './audit.service.js';

/** Antrean audit (PRD FR-05). Unggah dan audit ulang hanya memasukkan job; worker yang menjalankannya. */
export interface AuditQueue {
  enqueue(job: AuditJob): Promise<void>;
}

const QUEUE_KEY = 'audit:v1:queue';
const JobSchema = z.object({ submissionId: z.uuid(), userId: z.uuid() }).strict();

/**
 * Daftar Redis sederhana (LPUSH/RPOP): tanpa dependency baru dan tanpa koneksi blocking terpisah.
 * Job yang hilang karena proses mati di tengah jalan tidak membuat data macet: GET /scans/:id
 * menyatakan audit yang tertahan sebagai FAILED (AUDIT_STALLED) dan mengembalikan kuota.
 */
export class RedisAuditQueue implements AuditQueue {
  constructor(private readonly redis: Redis) {}

  async enqueue(job: AuditJob): Promise<void> {
    await this.redis.lpush(QUEUE_KEY, JSON.stringify(JobSchema.parse(job)));
  }

  async dequeue(): Promise<AuditJob | null> {
    const raw = await this.redis.rpop(QUEUE_KEY);
    if (!raw) return null;
    try {
      const parsed = JobSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  length(): Promise<number> {
    return this.redis.llen(QUEUE_KEY);
  }
}

export type AuditWorkerOptions = {
  queue: Pick<RedisAuditQueue, 'dequeue'>;
  handle: (job: AuditJob) => Promise<unknown>;
  /** Batas audit yang berjalan bersamaan per proses (PRD FR-05). */
  concurrency?: number;
  /** Jeda polling saat antrean kosong. */
  idleMs?: number;
  onError?: (err: unknown, job: AuditJob | null) => void;
};

/** Menjalankan job dari antrean dengan batas konkurensi. `stop()` menunggu job yang sedang berjalan. */
export class AuditWorker {
  private running = false;
  private readonly loops: Promise<void>[] = [];
  private readonly concurrency: number;
  private readonly idleMs: number;

  constructor(private readonly options: AuditWorkerOptions) {
    this.concurrency = options.concurrency ?? 2;
    this.idleMs = options.idleMs ?? 500;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    for (let i = 0; i < this.concurrency; i++) this.loops.push(this.loop());
  }

  async stop(): Promise<void> {
    this.running = false;
    await Promise.allSettled(this.loops.splice(0));
  }

  /** Untuk test: jalankan semua job yang ada sampai antrean kosong, tanpa memulai loop latar. */
  async drain(): Promise<void> {
    for (;;) {
      const job = await this.options.queue.dequeue();
      if (!job) return;
      await this.process(job);
    }
  }

  private async loop(): Promise<void> {
    while (this.running) {
      let job: AuditJob | null = null;
      try {
        job = await this.options.queue.dequeue();
      } catch (err) {
        this.options.onError?.(err, null);
      }
      if (!job) {
        await new Promise((resolve) => setTimeout(resolve, this.idleMs));
        continue;
      }
      await this.process(job);
    }
  }

  private async process(job: AuditJob): Promise<void> {
    try {
      await this.options.handle(job);
    } catch (err) {
      this.options.onError?.(err, job);
    }
  }
}
