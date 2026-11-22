import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { AuditWorker, RedisAuditQueue } from '../../../../src/features/essay-scans/audit.queue.js';
import type { AuditJob } from '../../../../src/features/essay-scans/audit.service.js';

/** Cukup untuk LPUSH/RPOP/LLEN pada satu daftar. */
function fakeRedis() {
  const lists = new Map<string, string[]>();
  const list = (key: string) => lists.get(key) ?? (lists.set(key, []), lists.get(key)!);
  const redis = {
    lpush: vi.fn(async (key: string, value: string) => list(key).unshift(value)),
    rpop: vi.fn(async (key: string) => list(key).pop() ?? null),
    llen: vi.fn(async (key: string) => list(key).length),
  };
  return { redis: redis as unknown as Redis, lists };
}

const job = (): AuditJob => ({ submissionId: randomUUID(), userId: randomUUID() });

/** Antrean di memori untuk AuditWorker. */
class MemoryQueue {
  jobs: AuditJob[] = [];
  dequeue = vi.fn(async () => this.jobs.shift() ?? null);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** Menunggu sampai kondisi benar (loop worker berjalan di latar). */
async function until(condition: () => boolean, timeoutMs = 1000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('kondisi tidak tercapai');
    await new Promise((r) => setTimeout(r, 2));
  }
}

describe('RedisAuditQueue', () => {
  it('is FIFO and validates jobs on the way in', async () => {
    const { redis } = fakeRedis();
    const queue = new RedisAuditQueue(redis);
    const [a, b] = [job(), job()];

    await queue.enqueue(a);
    await queue.enqueue(b);
    expect(await queue.length()).toBe(2);
    expect(await queue.dequeue()).toEqual(a);
    expect(await queue.dequeue()).toEqual(b);
    expect(await queue.dequeue()).toBeNull();

    await expect(queue.enqueue({ submissionId: 'bukan-uuid', userId: randomUUID() })).rejects.toThrow();
    await expect(queue.enqueue({ ...a, extra: 'x' } as AuditJob)).rejects.toThrow();
    expect(await queue.length()).toBe(0);
  });

  it('drops corrupted or foreign entries instead of crashing the worker', async () => {
    const { redis, lists } = fakeRedis();
    const queue = new RedisAuditQueue(redis);
    lists.set('audit:v1:queue', [
      JSON.stringify(job()),
      JSON.stringify({ submissionId: randomUUID(), userId: randomUUID(), admin: true }),
      JSON.stringify({ submissionId: "' OR 1=1 --", userId: randomUUID() }),
      '{tidak json',
    ]);
    // RPOP mengambil dari ujung kanan: tiga entri rusak dulu, lalu yang valid.
    expect(await queue.dequeue()).toBeNull();
    expect(await queue.dequeue()).toBeNull();
    expect(await queue.dequeue()).toBeNull();
    expect(await queue.dequeue()).toMatchObject({ submissionId: expect.any(String) });
  });
});

describe('AuditWorker background loop', () => {
  it('processes queued jobs and never runs more than `concurrency` at once', async () => {
    const queue = new MemoryQueue();
    queue.jobs = Array.from({ length: 6 }, job);
    let running = 0;
    let peak = 0;
    const done: AuditJob[] = [];
    const worker = new AuditWorker({
      queue,
      concurrency: 2,
      idleMs: 5,
      handle: async (j) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 10));
        running--;
        done.push(j);
      },
    });

    worker.start();
    await until(() => done.length === 6);
    await worker.stop();

    expect(peak).toBe(2);
    expect(new Set(done.map((j) => j.submissionId)).size).toBe(6);
  });

  it('keeps polling while idle and picks up jobs that arrive later', async () => {
    const queue = new MemoryQueue();
    const handled: AuditJob[] = [];
    const worker = new AuditWorker({ queue, concurrency: 1, idleMs: 5, handle: async (j) => void handled.push(j) });

    worker.start();
    await until(() => queue.dequeue.mock.calls.length >= 3);
    const late = job();
    queue.jobs.push(late);
    await until(() => handled.length === 1);
    await worker.stop();

    expect(handled).toEqual([late]);
  });

  it('reports a failing job with the job and keeps going', async () => {
    const queue = new MemoryQueue();
    const [bad, good] = [job(), job()];
    queue.jobs = [bad, good];
    const onError = vi.fn();
    const handled: AuditJob[] = [];
    const worker = new AuditWorker({
      queue,
      concurrency: 1,
      idleMs: 5,
      onError,
      handle: async (j) => {
        if (j === bad) throw new Error('audit meledak');
        handled.push(j);
      },
    });

    worker.start();
    await until(() => handled.length === 1);
    await worker.stop();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'audit meledak' }), bad);
    expect(handled).toEqual([good]);
  });

  it('reports queue outages (e.g. Redis down) without a job and retries after the idle delay', async () => {
    const queue = new MemoryQueue();
    const j = job();
    queue.dequeue.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockImplementation(async () => queue.jobs.shift() ?? null);
    queue.jobs = [j];
    const onError = vi.fn();
    const handled: AuditJob[] = [];
    const worker = new AuditWorker({ queue, concurrency: 1, idleMs: 5, onError, handle: async (x) => void handled.push(x) });

    worker.start();
    await until(() => handled.length === 1);
    await worker.stop();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'ECONNREFUSED' }), null);
    expect(handled).toEqual([j]);
  });

  it('stop() waits for the running job and takes no new job afterwards', async () => {
    const queue = new MemoryQueue();
    const [first, second] = [job(), job()];
    queue.jobs = [first, second];
    const gate = deferred();
    const finished: AuditJob[] = [];
    const worker = new AuditWorker({
      queue,
      concurrency: 1,
      idleMs: 5,
      handle: async (j) => {
        await gate.promise;
        finished.push(j);
      },
    });

    worker.start();
    await until(() => queue.dequeue.mock.calls.length === 1);
    let stopped = false;
    const stopping = worker.stop().then(() => (stopped = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(stopped).toBe(false); // masih menunggu job pertama

    gate.resolve();
    await stopping;
    expect(finished).toEqual([first]);
    expect(queue.jobs).toEqual([second]); // tetap di antrean untuk proses berikutnya
  });

  it('start() twice does not double the loops; it can be restarted after stop()', async () => {
    const queue = new MemoryQueue();
    queue.jobs = Array.from({ length: 4 }, job);
    let running = 0;
    let peak = 0;
    let count = 0;
    const worker = new AuditWorker({
      queue,
      concurrency: 1,
      idleMs: 5,
      handle: async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        count++;
      },
    });

    worker.start();
    worker.start();
    await until(() => count === 2);
    await worker.stop();
    worker.start();
    await until(() => count === 4);
    await worker.stop();

    expect(peak).toBe(1);
  });

  it('drain() runs every queued job in order, reports errors, and returns when empty', async () => {
    const queue = new MemoryQueue();
    const jobs = Array.from({ length: 3 }, job);
    queue.jobs = [...jobs];
    const order: AuditJob[] = [];
    const onError = vi.fn();
    const worker = new AuditWorker({
      queue,
      onError,
      handle: async (j) => {
        order.push(j);
        if (j === jobs[1]) throw new Error('gagal');
      },
    });

    await worker.drain();

    expect(order).toEqual(jobs);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(queue.jobs).toHaveLength(0);
  });
});
