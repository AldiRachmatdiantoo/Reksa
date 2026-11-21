import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../../../src/config/prisma.js';
import { PrismaSessionsRepository } from '../../../../src/features/study-sessions/sessions.repository.js';
import { Prisma } from '../../../../src/generated/prisma/client.js';

// Jalur penjaga terakhir createIfNoActive: kunci FOR UPDATE pada baris users biasanya sudah mencegah dua
// sesi aktif, jadi bentrok idx_sessions_one_active (P2002) hampir mustahil dipicu lewat DB sungguhan.
// Di sini Prisma dipalsukan supaya perilaku pemulihannya tetap teruji.

const USER = randomUUID();
const ACTIVE_ID = randomUUID();

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed on idx_sessions_one_active', {
    code: 'P2002',
    clientVersion: 'test',
  });

const activeRow = {
  id: ACTIVE_ID,
  userId: USER,
  materialId: randomUUID(),
  classId: null,
  sessionType: 'INITIAL_BLURTING',
  plannedDurationSec: 1500,
  actualDurationSec: null,
  predictedJolScore: null,
  status: 'FOCUS_ACTIVE',
  validity: null,
  startedAt: new Date(),
  focusEndedAt: null,
  completedAt: null,
  submission: null,
};

/**
 * Transaksi pertama (createIfNoActive) melempar `firstError`; transaksi berikutnya (findActive)
 * berjalan dengan tx palsu yang mengembalikan `activeAfter`.
 */
function fakePrisma(firstError: unknown, activeAfter: typeof activeRow | null) {
  const tx = {
    $queryRaw: vi.fn(async () => []),
    studySession: { findFirst: vi.fn(async () => activeAfter) },
    studyMaterial: { findMany: vi.fn(async () => [{ id: activeRow.materialId, title: 'Homeostasis' }]) },
  };
  let calls = 0;
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      calls++;
      if (calls === 1) throw firstError;
      return fn(tx);
    }),
  };
  return { prisma: prisma as unknown as PrismaClient, tx };
}

const data = { userId: USER, materialId: randomUUID(), classId: null, plannedDurationSec: 1500, startedAt: new Date() };

describe('PrismaSessionsRepository.createIfNoActive: unique-index fallback', () => {
  it('turns a P2002 race into the id of the session that won', async () => {
    const { prisma } = fakePrisma(uniqueViolation(), activeRow);
    const repo = new PrismaSessionsRepository(prisma);
    await expect(repo.createIfNoActive(data, () => false)).resolves.toEqual({ activeSessionId: ACTIVE_ID });
  });

  it('rethrows P2002 when no active session can be found afterwards', async () => {
    const { prisma } = fakePrisma(uniqueViolation(), null);
    const repo = new PrismaSessionsRepository(prisma);
    await expect(repo.createIfNoActive(data, () => false)).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rethrows any other error without looking for an active session', async () => {
    const boom = new Error('connection lost');
    const { prisma, tx } = fakePrisma(boom, activeRow);
    const repo = new PrismaSessionsRepository(prisma);
    await expect(repo.createIfNoActive(data, () => false)).rejects.toBe(boom);
    expect(tx.studySession.findFirst).not.toHaveBeenCalled();
  });
});
