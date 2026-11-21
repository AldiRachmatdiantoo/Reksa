import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_COOKIE } from '../../src/common/utils/authCookies.js';
import { PrismaQuotaRepository } from '../../src/features/essay-scans/quota.repository.js';
import { QuotaExceededError, QuotaService } from '../../src/features/essay-scans/quota.service.js';
import { cookieHeader, createTestContext, parseSetCookies, VALID_PASSWORD } from '../support/testContext.js';

const ctx = createTestContext();

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

async function register(email: string, role: 'STUDENT' | 'EDUCATOR' = 'STUDENT') {
  const res = await request(ctx.app).post('/api/v1/auth/register').send({ email, password: VALID_PASSWORD, fullName: 'Uji', role });
  expect(res.status).toBe(201);
  const cookie = cookieHeader({ [ACCESS_COOKIE]: parseSetCookies(res.headers['set-cookie'])[ACCESS_COOKIE]?.value ?? '' });
  return { cookie, userId: res.body.user.id as string };
}

describe('GET /me/quota', () => {
  it('returns the Free quota of a new student', async () => {
    const siswa = await register('siswa@reksa.id');
    const res = await request(ctx.app).get('/api/v1/me/quota').set('Cookie', siswa.cookie);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.quota).toMatchObject({ tier: 'FREE', used: 0, limit: 3, remaining: 3 });
    expect(new Date(res.body.quota.resetAt).getUTCHours()).toBe(17); // 00.00 WIB
  });

  it("reflects today's scans and ignores yesterday's", async () => {
    const siswa = await register('siswa@reksa.id');
    await ctx.owner.user.update({ where: { id: siswa.userId }, data: { dailyScanCount: 2, lastScanResetAt: new Date() } });
    const today = await request(ctx.app).get('/api/v1/me/quota').set('Cookie', siswa.cookie);
    expect(today.body.quota).toMatchObject({ used: 2, remaining: 1 });

    await ctx.owner.user.update({
      where: { id: siswa.userId },
      data: { dailyScanCount: 3, lastScanResetAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    const later = await request(ctx.app).get('/api/v1/me/quota').set('Cookie', siswa.cookie);
    expect(later.body.quota).toMatchObject({ used: 0, remaining: 3 });
  });

  it('shows Pro as unlimited', async () => {
    const siswa = await register('siswa@reksa.id');
    await ctx.owner.user.update({ where: { id: siswa.userId }, data: { tier: 'PRO' } });
    const res = await request(ctx.app).get('/api/v1/me/quota').set('Cookie', siswa.cookie);
    expect(res.body.quota).toMatchObject({ tier: 'PRO', limit: null, remaining: null });
  });

  it('is for students only and needs login', async () => {
    const guru = await register('guru@reksa.id', 'EDUCATOR');
    expect((await request(ctx.app).get('/api/v1/me/quota').set('Cookie', guru.cookie)).status).toBe(403);
    expect((await request(ctx.app).get('/api/v1/me/quota')).status).toBe(401);
  });

  it('does not break the existing /me routes', async () => {
    const siswa = await register('siswa@reksa.id');
    const res = await request(ctx.app).patch('/api/v1/me').set('Cookie', siswa.cookie).send({ fullName: 'Nama Baru' });
    expect(res.status).toBe(200);
  });
});

describe('QuotaService against PostgreSQL', () => {
  it('lets exactly 3 of 8 parallel scans through for a Free student (SELECT ... FOR UPDATE)', async () => {
    const siswa = await register('siswa@reksa.id');
    const service = new QuotaService({ repo: new PrismaQuotaRepository(ctx.prisma) });

    const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.consume(siswa.userId)));

    const ok = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(3);
    expect(refused).toHaveLength(5);
    for (const r of refused) expect((r as PromiseRejectedResult).reason).toBeInstanceOf(QuotaExceededError);
    const row = await ctx.owner.user.findUniqueOrThrow({ where: { id: siswa.userId } });
    expect(row.dailyScanCount).toBe(3);
  });

  it('refund after a failed audit frees one scan; only the owner row changes', async () => {
    const a = await register('a@reksa.id');
    const b = await register('b@reksa.id');
    const service = new QuotaService({ repo: new PrismaQuotaRepository(ctx.prisma) });
    for (let i = 0; i < 3; i++) await service.consume(a.userId);
    await service.consume(b.userId);

    const consumedAt = new Date();
    await service.refund(a.userId, consumedAt);

    const [rowA, rowB] = await Promise.all([
      ctx.owner.user.findUniqueOrThrow({ where: { id: a.userId } }),
      ctx.owner.user.findUniqueOrThrow({ where: { id: b.userId } }),
    ]);
    expect(rowA.dailyScanCount).toBe(2);
    expect(rowB.dailyScanCount).toBe(1);
    await expect(service.consume(a.userId)).resolves.toMatchObject({ remaining: 0 });
  });
});
