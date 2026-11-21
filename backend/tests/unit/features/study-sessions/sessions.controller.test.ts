import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../../../src/common/errors/AppError.js';
import { SessionsController } from '../../../../src/features/study-sessions/sessions.controller.js';
import type { SessionsService } from '../../../../src/features/study-sessions/sessions.service.js';

// SSE QR bridge untuk layar laptop (FR-04): urutan event, ping, dan putus koneksi.

const USER = randomUUID();
const SESSION = randomUUID();

function sse(wait: (signal: AbortSignal) => Promise<string | null>, get: () => Promise<unknown> = async () => ({})) {
  const service = {
    get: vi.fn(get),
    waitForQrUpload: vi.fn((_u: string, _s: string, signal: AbortSignal) => wait(signal)),
  } as unknown as SessionsService;
  const req = new EventEmitter() as unknown as Request;
  const written: string[] = [];
  const res = {
    locals: { validated: { params: { id: SESSION } }, auth: { userId: USER } },
    writeHead: vi.fn(),
    write: vi.fn((chunk: string) => written.push(chunk)),
    end: vi.fn(),
  } as unknown as Response;
  const run = () => new SessionsController(service).qrBridgeEvents(req, res);
  return { service, req, res, written, run };
}

afterEach(() => vi.useRealTimers());

describe('SessionsController.qrBridgeEvents', () => {
  it('sends SSE headers, ready, then uploaded with the submission id, and closes', async () => {
    const t = sse(async () => 'sub-1');
    await t.run();

    expect(t.res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no' }),
    );
    expect(t.written).toEqual([
      'retry: 5000\n\n',
      `event: ready\ndata: {"sessionId":"${SESSION}"}\n\n`,
      'event: uploaded\ndata: {"submissionId":"sub-1"}\n\n',
    ]);
    expect(t.res.end).toHaveBeenCalledTimes(1);
    expect(t.service.waitForQrUpload).toHaveBeenCalledWith(USER, SESSION, expect.any(AbortSignal));
  });

  it('sends timeout when no photo arrived in time', async () => {
    const t = sse(async () => null);
    await t.run();
    expect(t.written.at(-1)).toBe('event: timeout\ndata: {}\n\n');
    expect(t.res.end).toHaveBeenCalled();
  });

  it('sends a generic error event (no internals) when waiting fails, e.g. Redis down', async () => {
    const t = sse(async () => {
      throw new Error('ECONNREFUSED 10.0.0.5:6379');
    });
    await t.run();
    expect(t.written.at(-1)).toBe('event: error\ndata: {"code":"QR_BRIDGE_UNAVAILABLE"}\n\n');
    expect(t.written.join('')).not.toContain('ECONNREFUSED');
    expect(t.res.end).toHaveBeenCalled();
  });

  it('stops quietly when the browser disconnects: wait is aborted and nothing more is written', async () => {
    let seenSignal: AbortSignal | undefined;
    const t = sse(
      (signal) =>
        new Promise((resolve) => {
          seenSignal = signal;
          signal.addEventListener('abort', () => resolve(null));
        }),
    );
    const running = t.run();
    await vi.waitFor(() => expect(seenSignal).toBeDefined());
    (t.req as unknown as EventEmitter).emit('close');
    await running;

    expect(seenSignal!.aborted).toBe(true);
    expect(t.written).toHaveLength(2); // retry + ready, tanpa timeout/uploaded setelah putus
    expect(t.res.end).toHaveBeenCalled();
  });

  it('does not write an error event after a disconnect even if waiting then fails', async () => {
    const t = sse(
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const running = t.run();
    await vi.waitFor(() => expect(t.written).toHaveLength(2));
    (t.req as unknown as EventEmitter).emit('close');
    await running;
    expect(t.written).toHaveLength(2);
  });

  it('pings every 15 seconds to keep proxies open, and stops pinging after closing', async () => {
    vi.useFakeTimers();
    let finish!: (v: string | null) => void;
    const t = sse(() => new Promise((resolve) => (finish = resolve)));
    const running = t.run();
    await vi.waitFor(() => expect(t.written).toHaveLength(2));

    await vi.advanceTimersByTimeAsync(31_000);
    expect(t.written.filter((w) => w === ': ping\n\n')).toHaveLength(2);

    finish('sub-2');
    await running;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.written.filter((w) => w === ': ping\n\n')).toHaveLength(2);
  });

  it('checks ownership before opening the stream, so a 404 stays plain JSON', async () => {
    const t = sse(async () => 'never', async () => {
      throw new NotFoundError('Sesi belajar tidak ditemukan');
    });
    await expect(t.run()).rejects.toMatchObject({ statusCode: 404 });
    expect(t.res.writeHead).not.toHaveBeenCalled();
    expect(t.service.waitForQrUpload).not.toHaveBeenCalled();
  });
});
