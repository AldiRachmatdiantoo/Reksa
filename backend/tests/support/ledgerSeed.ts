import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { buildObjectKey } from '../../src/config/storage.js';
import { computeLedgerHash } from '../../src/features/essay-scans/ledgerHash.js';
import type { TestContext } from './testContext.js';

const CODE_A = 'MNPQRSTUVW';
const CODE_B = 'XYZ23456789';

/** Data ledger dibuat langsung sebagai pemilik skema; alur unggah dan audit asli diuji di scans.test.ts. */
export function createLedgerSeeds(ctx: TestContext) {
  let seq = 0;

  async function createClass(educatorId: string, studentIds: string[]) {
    seq += 1;
    const cls = await ctx.owner.class.create({
      data: { educatorId, name: `Kelas ${seq}`, classCode: `ABCDE${CODE_A[seq % 10]}${CODE_B[Math.floor(seq / 10) % 10]}Z` },
    });
    for (const studentId of studentIds) await ctx.owner.classMember.create({ data: { classId: cls.id, studentId } });
    return cls;
  }

  /** Sesi selesai + submission DONE dengan ledger_hash asli, seperti hasil audit.service. */
  async function seedSubmission(opts: {
    userId: string;
    classId: string | null;
    materialOwner: string;
    materialClassId?: string | null;
    minutesAgo?: number;
    title?: string;
    /** Foto WebP sungguhan (dibutuhkan ekspor PDF); default byte palsu. */
    realPhoto?: boolean;
    /** Pakai materi yang sudah ada (peta bagian sulit butuh beberapa siswa di satu materi). */
    materialId?: string;
    /** Isi blind_spots_json; default dua konsep. */
    blindSpots?: unknown[];
  }) {
    seq += 1;
    const material = opts.materialId
      ? { id: opts.materialId }
      : await ctx.owner.studyMaterial.create({
          data: {
            uploaderId: opts.materialOwner,
            classId: opts.materialClassId ?? opts.classId,
            title: opts.title ?? 'Homeostasis',
            contentHash: seq.toString(16).padStart(64, 'c'),
          },
        });
    const ago = (opts.minutesAgo ?? 0) * 60_000;
    const startedAt = new Date(Date.now() - ago - 30 * 60_000);
    const focusEndedAt = new Date(Date.now() - ago - 6 * 60_000);
    const session = await ctx.owner.studySession.create({
      data: {
        userId: opts.userId,
        materialId: material.id,
        classId: opts.classId,
        sessionType: 'INITIAL_BLURTING',
        plannedDurationSec: 1500,
        actualDurationSec: 1440,
        validity: 'VALID',
        startedAt,
        focusEndedAt,
        predictedJolScore: 80,
        status: 'COMPLETED',
        completedAt: new Date(Date.now() - ago),
      },
    });
    const key = buildObjectKey('scans', opts.userId, 'webp');
    const body = opts.realPhoto
      ? await sharp({ create: { width: 300, height: 400, channels: 3, background: { r: 240, g: 236, b: 220 } } }).webp().toBuffer()
      : Buffer.from('foto');
    await ctx.storage.putObject({ key, body, contentType: 'image/webp' });
    const createdAt = new Date(Date.now() - ago - 5 * 60_000);
    const auditedAt = new Date(Date.now() - ago - 4 * 60_000);
    const submissionId = randomUUID();
    const ledgerHash = computeLedgerHash({
      submissionId,
      sessionId: session.id,
      userId: opts.userId,
      materialId: material.id,
      startedAt,
      focusEndedAt,
      actualDurationSec: 1440,
      validity: 'VALID',
      predictedJolScore: 80,
      actualScore: 65,
      imageStorageKey: key,
      submittedAt: createdAt,
      auditedAt,
    });
    await ctx.owner.essaySubmission.create({
      data: {
        id: submissionId,
        sessionId: session.id,
        userId: opts.userId,
        imageStorageKey: key,
        predictedJolScore: 80,
        actualAiScore: 65,
        accurateConceptsJson: [{ concept: 'Reseptor', evidenceFromHandwriting: 'ditulis' }],
        blindSpotsJson: (opts.blindSpots ?? [
          { concept: 'Umpan balik negatif', importanceLevel: 'HIGH', explanation: 'Belum dijelaskan → perlu contoh.' },
          { concept: 'Efektor', importanceLevel: 'LOW', explanation: 'Disebut tanpa fungsi.' },
        ]) as object[],
        logicCorrectionsJson: [],
        encouragingSummary: 'Bagus.',
        ledgerHash,
        auditStatus: 'DONE',
        auditedAt,
        createdAt,
      },
    });
    return { submissionId, sessionId: session.id, materialId: material.id, ledgerHash, startedAt, createdAt };
  }

  return { createClass, seedSubmission };
}
