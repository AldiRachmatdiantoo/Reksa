import { withUserContext, type PrismaClient, type TxClient } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { SessionStatus, SessionValidity } from './sessions.schema.js';

export type SessionRecord = {
  id: string;
  userId: string;
  materialId: string;
  materialTitle: string | null;
  classId: string | null;
  sessionType: 'INITIAL_BLURTING' | 'SPACED_REVIEW';
  plannedDurationSec: number;
  actualDurationSec: number | null;
  predictedJolScore: number | null;
  status: SessionStatus;
  validity: SessionValidity | null;
  startedAt: Date;
  focusEndedAt: Date | null;
  completedAt: Date | null;
  hasSubmission: boolean;
  submissionId: string | null;
  /** Status audit foto (FR-05), null bila foto belum diunggah. */
  submissionAuditStatus: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | null;
};

export type CreateSessionData = {
  userId: string;
  materialId: string;
  classId: string | null;
  plannedDurationSec: number;
  startedAt: Date;
};

export type EndFocusData = {
  actualDurationSec: number;
  validity: SessionValidity;
  predictedJolScore: number;
  focusEndedAt: Date;
};

/**
 * Dipanggil di dalam transaksi pembuatan sesi untuk setiap sesi aktif lama. Service yang memutuskan
 * (aturan kedaluwarsa ada di service); `true` berarti sesi itu sudah basi dan boleh di-EXPIRED-kan.
 */
export type IsStale = (session: SessionRecord) => boolean;

export type CreateSessionResult = { created: SessionRecord } | { activeSessionId: string };

/** Status yang dihitung sebagai "sesi aktif" (FR-02): satu pelajar hanya boleh punya satu. */
const ACTIVE_STATUSES: SessionStatus[] = ['FOCUS_ACTIVE', 'AWAITING_SCAN'];

/**
 * Semua query study_sessions berjalan di dalam withUserContext (RLS aktif) DAN memfilter userId
 * secara eksplisit (CLAUDE.md §4.3). Sesi milik orang lain tidak pernah dikembalikan.
 */
export interface SessionsRepository {
  /** Pengunggah, guru kelas materi, atau anggota kelas materi (sama dengan aturan baca `materials`). */
  isMaterialAccessible(userId: string, materialId: string): Promise<boolean>;
  isClassMember(userId: string, classId: string): Promise<boolean>;
  /**
   * Dalam satu transaksi: kunci baris user (FOR UPDATE), EXPIRED-kan sesi aktif lama yang basi,
   * lalu buat sesi baru bila tidak ada lagi yang aktif. Dua permintaan paralel diserialkan oleh kunci itu.
   */
  createIfNoActive(data: CreateSessionData, isStale: IsStale): Promise<CreateSessionResult>;
  findOwned(userId: string, sessionId: string): Promise<SessionRecord | null>;
  findActive(userId: string): Promise<SessionRecord | null>;
  /** Hanya mengubah sesi yang masih berstatus `from`; mengembalikan sesi terbaru, atau null bila bukan miliknya. */
  expire(userId: string, sessionId: string, from: SessionStatus[]): Promise<SessionRecord | null>;
  /** FOCUS_ACTIVE → AWAITING_SCAN. null bila sesi bukan milik user atau statusnya sudah berubah. */
  endFocus(userId: string, sessionId: string, data: EndFocusData): Promise<SessionRecord | null>;
}

const sessionSelect = {
  id: true,
  userId: true,
  materialId: true,
  classId: true,
  sessionType: true,
  plannedDurationSec: true,
  actualDurationSec: true,
  predictedJolScore: true,
  status: true,
  validity: true,
  startedAt: true,
  focusEndedAt: true,
  completedAt: true,
  submission: { select: { id: true, auditStatus: true } },
} as const;

type SessionRow = Prisma.StudySessionGetPayload<{ select: typeof sessionSelect }>;

function materialAccessibleBy(userId: string): Prisma.StudyMaterialWhereInput {
  return {
    OR: [
      { uploaderId: userId },
      { class: { educatorId: userId } },
      { class: { members: { some: { studentId: userId } } } },
    ],
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export class PrismaSessionsRepository implements SessionsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async isMaterialAccessible(userId: string, materialId: string): Promise<boolean> {
    const found = await withUserContext(this.prisma, userId, (tx) =>
      tx.studyMaterial.findFirst({ where: { id: materialId, ...materialAccessibleBy(userId) }, select: { id: true } }),
    );
    return found !== null;
  }

  async isClassMember(userId: string, classId: string): Promise<boolean> {
    // class_members tanpa RLS: filter studentId eksplisit.
    const found = await this.prisma.classMember.findFirst({ where: { classId, studentId: userId }, select: { id: true } });
    return found !== null;
  }

  async createIfNoActive(data: CreateSessionData, isStale: IsStale): Promise<CreateSessionResult> {
    try {
      return await withUserContext(this.prisma, data.userId, async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${data.userId}::uuid FOR UPDATE`;

        const activeRows = await tx.studySession.findMany({
          where: { userId: data.userId, status: { in: ACTIVE_STATUSES } },
          select: sessionSelect,
        });
        for (const record of await toRecords(tx, data.userId, activeRows)) {
          if (!isStale(record)) return { activeSessionId: record.id };
          await tx.studySession.updateMany({
            where: { id: record.id, userId: data.userId, status: record.status },
            data: { status: 'EXPIRED' },
          });
        }

        const row = await tx.studySession.create({
          data: { ...data, sessionType: 'INITIAL_BLURTING', status: 'FOCUS_ACTIVE' },
          select: sessionSelect,
        });
        const [created] = await toRecords(tx, data.userId, [row]);
        return { created: created! };
      });
    } catch (err) {
      // idx_sessions_one_active: hanya terjadi bila ada jalur lain yang lolos dari kunci di atas.
      if (!isUniqueViolation(err)) throw err;
      const active = await this.findActive(data.userId);
      if (!active) throw err;
      return { activeSessionId: active.id };
    }
  }

  findOwned(userId: string, sessionId: string): Promise<SessionRecord | null> {
    return withUserContext(this.prisma, userId, async (tx) => {
      const row = await tx.studySession.findFirst({ where: { id: sessionId, userId }, select: sessionSelect });
      return row ? ((await toRecords(tx, userId, [row]))[0] ?? null) : null;
    });
  }

  findActive(userId: string): Promise<SessionRecord | null> {
    return withUserContext(this.prisma, userId, async (tx) => {
      const row = await tx.studySession.findFirst({
        where: { userId, status: { in: ACTIVE_STATUSES } },
        orderBy: { startedAt: 'desc' },
        select: sessionSelect,
      });
      return row ? ((await toRecords(tx, userId, [row]))[0] ?? null) : null;
    });
  }

  expire(userId: string, sessionId: string, from: SessionStatus[]): Promise<SessionRecord | null> {
    return withUserContext(this.prisma, userId, async (tx) => {
      await tx.studySession.updateMany({
        where: { id: sessionId, userId, status: { in: from } },
        data: { status: 'EXPIRED' },
      });
      const row = await tx.studySession.findFirst({ where: { id: sessionId, userId }, select: sessionSelect });
      return row ? ((await toRecords(tx, userId, [row]))[0] ?? null) : null;
    });
  }

  endFocus(userId: string, sessionId: string, data: EndFocusData): Promise<SessionRecord | null> {
    return withUserContext(this.prisma, userId, async (tx) => {
      // Bersyarat status: dua PATCH /jol paralel tidak bisa sama-sama berhasil.
      const { count } = await tx.studySession.updateMany({
        where: { id: sessionId, userId, status: 'FOCUS_ACTIVE' },
        data: { ...data, status: 'AWAITING_SCAN' },
      });
      if (count === 0) return null;
      const row = await tx.studySession.findFirst({ where: { id: sessionId, userId }, select: sessionSelect });
      return row ? ((await toRecords(tx, userId, [row]))[0] ?? null) : null;
    });
  }
}

/**
 * Judul materi diambil terpisah, bukan lewat relasi wajib: RLS bisa menyembunyikan materi kelas
 * setelah pelajar keluar dari kelas itu, dan relasi wajib yang kosong membuat Prisma melempar error.
 */
async function toRecords(tx: TxClient, userId: string, rows: SessionRow[]): Promise<SessionRecord[]> {
  if (rows.length === 0) return [];
  const materials = await tx.studyMaterial.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.materialId))] }, ...materialAccessibleBy(userId) },
    select: { id: true, title: true },
  });
  const titles = new Map(materials.map((m) => [m.id, m.title]));
  return rows.map(({ submission, ...row }) => ({
    ...row,
    materialTitle: titles.get(row.materialId) ?? null,
    hasSubmission: submission !== null,
    submissionId: submission?.id ?? null,
    submissionAuditStatus: submission?.auditStatus ?? null,
  }));
}
