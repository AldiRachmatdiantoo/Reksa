import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withUserContext } from '../../src/config/prisma.js';
import { createTestContext } from '../support/testContext.js';

// PostgreSQL RLS & least privilege (PRD §9.1): the second line of defense when a
// repository forgets its ownership filter. All queries below run as
// app_service_user, exactly like the app.

const ctx = createTestContext();

const studentA = randomUUID();
const studentB = randomUUID();
const educator = randomUUID();
const classId = randomUUID();
const materialA = randomUUID();
const sessionA = randomUUID();
const submissionA = randomUUID();

async function seed() {
  await ctx.owner.user.createMany({
    data: [
      { id: studentA, email: 'a@reksa.id', passwordHash: 'x', fullName: 'A' },
      { id: studentB, email: 'b@reksa.id', passwordHash: 'x', fullName: 'B' },
      { id: educator, email: 'guru@reksa.id', passwordHash: 'x', fullName: 'Guru', role: 'EDUCATOR' },
    ],
  });
  await ctx.owner.class.create({ data: { id: classId, educatorId: educator, classCode: 'BIO-01', name: 'Biologi' } });

  await withUserContext(ctx.prisma, studentA, async (tx) => {
    await tx.studyMaterial.create({
      data: { id: materialA, uploaderId: studentA, title: 'Materi A', contentHash: 'a'.repeat(64) },
    });
    await tx.studySession.create({
      data: {
        id: sessionA,
        userId: studentA,
        materialId: materialA,
        classId,
        sessionType: 'INITIAL_BLURTING',
        plannedDurationSec: 1500,
      },
    });
    await tx.essaySubmission.create({
      data: {
        id: submissionA,
        sessionId: sessionA,
        userId: studentA,
        imageStorageKey: 'k',
        predictedJolScore: 80,
        actualAiScore: 62,
        accurateConceptsJson: [],
        blindSpotsJson: [],
        logicCorrectionsJson: [],
        ledgerHash: 'c'.repeat(64),
      },
    });
  });
}

async function visibleCounts(userId: string | null) {
  const count = async (tx: typeof ctx.prisma | Parameters<Parameters<typeof withUserContext>[2]>[0]) => ({
    materials: await tx.studyMaterial.count(),
    sessions: await tx.studySession.count(),
    submissions: await tx.essaySubmission.count(),
  });
  return userId ? withUserContext(ctx.prisma, userId, count) : count(ctx.prisma);
}

beforeEach(async () => {
  await ctx.reset();
  await seed();
});
afterAll(() => ctx.close());

describe('Row-Level Security', () => {
  it('the owner sees their own rows', async () => {
    expect(await visibleCounts(studentA)).toEqual({ materials: 1, sessions: 1, submissions: 1 });
  });

  it("another student sees none of them (IDOR/BOLA at the database layer)", async () => {
    expect(await visibleCounts(studentB)).toEqual({ materials: 0, sessions: 0, submissions: 0 });
  });

  it('a query without user context sees nothing', async () => {
    expect(await visibleCounts(null)).toEqual({ materials: 0, sessions: 0, submissions: 0 });
  });

  it('student B cannot update student A rows even by exact id', async () => {
    const result = await withUserContext(ctx.prisma, studentB, (tx) =>
      tx.studySession.updateMany({ where: { id: sessionA }, data: { status: 'EXPIRED' } }),
    );
    expect(result.count).toBe(0);
  });

  it('a student cannot insert a row owned by someone else', async () => {
    await expect(
      withUserContext(ctx.prisma, studentB, (tx) =>
        tx.studyMaterial.create({ data: { uploaderId: studentA, title: 'spoof', contentHash: 'b'.repeat(64) } }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('an educator sees nothing until the student is a member of their class', async () => {
    expect(await visibleCounts(educator)).toMatchObject({ sessions: 0, submissions: 0 });

    await ctx.owner.classMember.create({ data: { classId, studentId: studentA } });

    expect(await visibleCounts(educator)).toMatchObject({ sessions: 1, submissions: 1 });
  });

  it('an educator cannot modify a student session', async () => {
    await ctx.owner.classMember.create({ data: { classId, studentId: studentA } });
    const result = await withUserContext(ctx.prisma, educator, (tx) =>
      tx.studySession.updateMany({ where: { id: sessionA }, data: { status: 'EXPIRED' } }),
    );
    expect(result.count).toBe(0);
  });

  it('user context does not leak to the next transaction on the pool', async () => {
    await visibleCounts(studentA);
    expect(await visibleCounts(null)).toEqual({ materials: 0, sessions: 0, submissions: 0 });
  });
});

describe('Proof of Understanding Ledger is append-only', () => {
  it('the owner cannot update a submission', async () => {
    await expect(
      withUserContext(ctx.prisma, studentA, (tx) =>
        tx.essaySubmission.update({ where: { id: submissionA }, data: { actualAiScore: 100 } }),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('the owner cannot delete a submission', async () => {
    await expect(
      withUserContext(ctx.prisma, studentA, (tx) => tx.essaySubmission.delete({ where: { id: submissionA } })),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('Least privilege (app_service_user)', () => {
  it('cannot run DDL', async () => {
    await expect(ctx.prisma.$executeRaw`CREATE TABLE hack (id int)`).rejects.toThrow(/permission denied/i);
    await expect(ctx.prisma.$executeRaw`DROP TABLE users`).rejects.toThrow(/must be owner/i);
  });

  it('cannot read migration history', async () => {
    await expect(ctx.prisma.$queryRaw`SELECT count(*) FROM _prisma_migrations`).rejects.toThrow(/permission denied/i);
  });

  it('cannot bypass RLS', async () => {
    const [role] = await ctx.prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });
});

describe('CHECK constraints', () => {
  it('rejects a JOL score outside 0..100', async () => {
    await expect(
      withUserContext(ctx.prisma, studentA, (tx) =>
        tx.studySession.update({ where: { id: sessionA }, data: { predictedJolScore: 101 } }),
      ),
    ).rejects.toThrow(/chk_sessions_jol/);
  });

  it('rejects a non-lowercase email', async () => {
    await expect(
      ctx.prisma.user.create({ data: { email: 'UPPER@reksa.id', passwordHash: 'x', fullName: 'U' } }),
    ).rejects.toThrow(/chk_users_email_lowercase/);
  });
});
