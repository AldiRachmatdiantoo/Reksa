import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditWorker, RedisAuditQueue } from '../../src/features/essay-scans/audit.queue.js';
import type { AuditJob } from '../../src/features/essay-scans/audit.service.js';
import { createTestContext } from '../support/testContext.js';

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

async function until(condition: () => boolean, timeoutMs = 3000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('kondisi tidak tercapai');
    await new Promise((r) => setTimeout(r, 10));
  }
}

// Redis gratis yang menghitung perintah (Upstash) hanya muat kalau worker menunggu dengan BRPOP, bukan
// RPOP tiap setengah detik. Di sini dibuktikan dengan Redis asli: job langsung diambil walau worker sedang
// menunggu 30 detik, koneksi utama tetap bebas, dan stop() tidak ikut menunggu 30 detik.
describe('audit queue with BRPOP on real Redis', () => {
  it('picks up a job immediately while blocked, keeps the main connection free, and stops quickly', async () => {
    const blocking = ctx.redis.duplicate();
    const queue = new RedisAuditQueue(ctx.redis, blocking);
    const handled: AuditJob[] = [];
    const errors: unknown[] = [];
    const worker = new AuditWorker({
      queue,
      concurrency: 2,
      waitSeconds: 30,
      handle: async (job) => void handled.push(job),
      onError: (err) => errors.push(err),
    });

    worker.start();
    await new Promise((r) => setTimeout(r, 200)); // kedua loop sudah menunggu di BRPOP

    const pingStart = Date.now();
    expect(await ctx.redis.ping()).toBe('PONG');
    expect(Date.now() - pingStart).toBeLessThan(500);

    const jobs = [
      { submissionId: randomUUID(), userId: randomUUID() },
      { submissionId: randomUUID(), userId: randomUUID() },
    ];
    const enqueuedAt = Date.now();
    for (const job of jobs) await queue.enqueue(job);
    await until(() => handled.length === 2);
    expect(Date.now() - enqueuedAt).toBeLessThan(1000);
    expect(handled).toEqual(expect.arrayContaining(jobs));
    expect(await queue.length()).toBe(0);

    const stopStart = Date.now();
    await worker.stop();
    expect(Date.now() - stopStart).toBeLessThan(2000);
    expect(errors).toEqual([]);
    expect(blocking.status).toBe('end');
  });
});
