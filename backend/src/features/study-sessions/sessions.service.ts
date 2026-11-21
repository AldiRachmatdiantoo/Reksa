import { AppError, NotFoundError } from '../../common/errors/AppError.js';
import type { QrBridge, QrBridgeIssued } from '../essay-scans/qrBridge.gateway.js';
import type { SessionRecord, SessionsRepository } from './sessions.repository.js';
import {
  FOCUS_GRACE_SEC,
  FOCUS_OVERTIME_CAP_SEC,
  POMODORO_PRESETS,
  SCAN_UPLOAD_WINDOW_SEC,
  SHORT_FOCUS_RATIO,
  type PomodoroPreset,
  type SessionStatus,
  type SessionValidity,
  type SessionView,
  type StartSessionInput,
} from './sessions.schema.js';

export type SessionsServiceDeps = {
  repo: SessionsRepository;
  /** Jembatan laptop ↔ HP (FR-04); hanya bagian yang dipakai sesi. */
  qrBridge: Pick<QrBridge, 'issue' | 'waitForUpload'>;
  /** Jam server. Disuntikkan di test; nilai waktu dari klien tidak pernah dipakai (FR-02). */
  now?: () => Date;
};

const SESSION_NOT_FOUND = 'Sesi belajar tidak ditemukan';
const MATERIAL_NOT_FOUND = 'Materi tidak ditemukan';
const CLASS_NOT_FOUND = 'Kelas tidak ditemukan';

/** 409 saat masih ada sesi aktif. Frontend menawarkan membatalkannya lewat POST /sessions/:id/cancel. */
export class ActiveSessionExistsError extends AppError {
  constructor(activeSessionId: string) {
    super(409, 'ACTIVE_SESSION_EXISTS', 'Masih ada sesi belajar yang belum selesai.', { activeSessionId });
  }
}

export class SessionExpiredError extends AppError {
  constructor() {
    super(409, 'SESSION_EXPIRED', 'Sesi ini sudah kedaluwarsa. Mulai sesi baru untuk melanjutkan.');
  }
}

export class InvalidSessionStateError extends AppError {
  constructor(message: string) {
    super(409, 'INVALID_SESSION_STATE', message);
  }
}

const ACTIVE: SessionStatus[] = ['FOCUS_ACTIVE', 'AWAITING_SCAN'];

/**
 * Batas waktu sesi aktif, atau null bila status ini tidak punya batas.
 * FOCUS_ACTIVE: preset + 30 menit sejak mulai. AWAITING_SCAN: 2 jam sejak fokus diakhiri,
 * dan tidak berlaku lagi setelah foto tersimpan (audit gagal tidak membuat sesi kedaluwarsa, FR-05).
 */
export function deadlineOf(s: SessionRecord): Date | null {
  if (s.status === 'FOCUS_ACTIVE') {
    return addSec(s.startedAt, s.plannedDurationSec + FOCUS_GRACE_SEC);
  }
  if (s.status === 'AWAITING_SCAN' && !s.hasSubmission && s.focusEndedAt) {
    return addSec(s.focusEndedAt, SCAN_UPLOAD_WINDOW_SEC);
  }
  return null;
}

export function isStale(s: SessionRecord, now: Date): boolean {
  const deadline = deadlineOf(s);
  return deadline !== null && now.getTime() >= deadline.getTime();
}

/** Durasi fokus aktual dari jam server, dibatasi paling lama preset + 5 menit (FR-02). */
export function actualFocusSec(startedAt: Date, plannedDurationSec: number, now: Date): number {
  const elapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  return Math.min(Math.max(elapsed, 0), plannedDurationSec + FOCUS_OVERTIME_CAP_SEC);
}

export function validityOf(actualSec: number, plannedDurationSec: number): SessionValidity {
  return actualSec < plannedDurationSec * SHORT_FOCUS_RATIO ? 'SHORT_FOCUS' : 'VALID';
}

export class SessionsService {
  private readonly now: () => Date;

  constructor(private readonly deps: SessionsServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async start(userId: string, input: StartSessionInput): Promise<SessionView> {
    if (!(await this.deps.repo.isMaterialAccessible(userId, input.materialId))) {
      throw new NotFoundError(MATERIAL_NOT_FOUND);
    }
    if (input.classId !== undefined && !(await this.deps.repo.isClassMember(userId, input.classId))) {
      throw new NotFoundError(CLASS_NOT_FOUND);
    }

    const now = this.now();
    const result = await this.deps.repo.createIfNoActive(
      {
        userId,
        materialId: input.materialId,
        classId: input.classId ?? null,
        plannedDurationSec: POMODORO_PRESETS[input.preset].focusSec,
        startedAt: now,
      },
      (existing) => isStale(existing, now),
    );
    if ('activeSessionId' in result) throw new ActiveSessionExistsError(result.activeSessionId);
    return toView(result.created);
  }

  async get(userId: string, sessionId: string): Promise<SessionView> {
    return toView(await this.load(userId, sessionId));
  }

  /** Sesi aktif saat ini (untuk memulihkan timer setelah halaman dimuat ulang), atau null. */
  async getActive(userId: string): Promise<SessionView | null> {
    const active = await this.deps.repo.findActive(userId);
    if (!active) return null;
    const fresh = await this.expireIfStale(userId, active);
    return ACTIVE.includes(fresh.status) ? toView(fresh) : null;
  }

  /** Mengakhiri fokus dan menyimpan tebakan JOL (FR-02, FR-03). */
  async submitJol(userId: string, sessionId: string, predictedJolScore: number): Promise<SessionView> {
    const session = await this.load(userId, sessionId);
    if (session.status === 'EXPIRED') throw new SessionExpiredError();
    if (session.status !== 'FOCUS_ACTIVE') {
      throw new InvalidSessionStateError('Tebakan nilai untuk sesi ini sudah disimpan.');
    }

    const now = this.now();
    const actualDurationSec = actualFocusSec(session.startedAt, session.plannedDurationSec, now);
    const updated = await this.deps.repo.endFocus(userId, sessionId, {
      actualDurationSec,
      validity: validityOf(actualDurationSec, session.plannedDurationSec),
      predictedJolScore,
      focusEndedAt: now,
    });
    if (!updated) {
      // Status berubah di antara baca dan tulis (mis. PATCH ganda atau dibatalkan dari tab lain).
      throw new InvalidSessionStateError('Status sesi berubah. Muat ulang halaman lalu coba lagi.');
    }
    return toView(updated);
  }

  /** Membatalkan sesi aktif → EXPIRED. Idempoten untuk sesi yang sudah EXPIRED. */
  async cancel(userId: string, sessionId: string): Promise<SessionView> {
    const session = await this.load(userId, sessionId);
    if (session.status === 'EXPIRED') return toView(session);
    if (!ACTIVE.includes(session.status)) {
      throw new InvalidSessionStateError('Sesi yang sudah selesai tidak bisa dibatalkan.');
    }
    if (session.hasSubmission) {
      throw new InvalidSessionStateError('Foto catatan sudah diunggah dan sedang dicek, jadi sesi ini tidak bisa dibatalkan.');
    }
    const updated = await this.deps.repo.expire(userId, sessionId, ACTIVE);
    if (!updated) throw new NotFoundError(SESSION_NOT_FOUND);
    return toView(updated);
  }

  /**
   * Token QR untuk mengunggah foto dari HP (FR-04 skenario B). Hanya setelah JOL tersimpan dan foto
   * belum masuk; token lama untuk sesi yang sama langsung tidak berlaku.
   */
  async issueQrBridge(userId: string, sessionId: string): Promise<QrBridgeIssued> {
    const session = await this.load(userId, sessionId);
    if (session.status === 'EXPIRED') throw new SessionExpiredError();
    if (session.status !== 'AWAITING_SCAN' || session.hasSubmission) {
      throw new InvalidSessionStateError(
        session.status === 'FOCUS_ACTIVE'
          ? 'Simpan tebakan nilai dulu sebelum mengunggah foto.'
          : 'Foto untuk sesi ini sudah diunggah.',
      );
    }
    return this.deps.qrBridge.issue({ userId, sessionId });
  }

  /**
   * Menunggu foto dari HP untuk layar laptop (SSE). Kepemilikan dicek dulu; hasilnya submissionId,
   * atau null bila waktu habis atau koneksi ditutup.
   */
  async waitForQrUpload(userId: string, sessionId: string, signal: AbortSignal): Promise<string | null> {
    await this.load(userId, sessionId);
    return this.deps.qrBridge.waitForUpload(sessionId, { signal });
  }

  /** Membaca sesi milik user dan menerapkan aturan kedaluwarsa saat dibaca (tanpa cron, FR-02). */
  private async load(userId: string, sessionId: string): Promise<SessionRecord> {
    const session = await this.deps.repo.findOwned(userId, sessionId);
    if (!session) throw new NotFoundError(SESSION_NOT_FOUND);
    return this.expireIfStale(userId, session);
  }

  private async expireIfStale(userId: string, session: SessionRecord): Promise<SessionRecord> {
    if (!isStale(session, this.now())) return session;
    return (await this.deps.repo.expire(userId, session.id, [session.status])) ?? session;
  }
}

function addSec(date: Date, sec: number): Date {
  return new Date(date.getTime() + sec * 1000);
}

function presetOf(plannedDurationSec: number): PomodoroPreset | null {
  for (const [name, preset] of Object.entries(POMODORO_PRESETS)) {
    if (preset.focusSec === plannedDurationSec) return name as PomodoroPreset;
  }
  return null;
}

export function toView(s: SessionRecord): SessionView {
  const scanDeadline = s.status === 'AWAITING_SCAN' ? deadlineOf(s) : null;
  return {
    id: s.id,
    materialId: s.materialId,
    materialTitle: s.materialTitle,
    classId: s.classId,
    sessionType: s.sessionType,
    preset: presetOf(s.plannedDurationSec),
    status: s.status,
    validity: s.validity,
    plannedDurationSec: s.plannedDurationSec,
    actualDurationSec: s.actualDurationSec,
    predictedJolScore: s.predictedJolScore,
    startedAt: s.startedAt.toISOString(),
    focusEndsAt: addSec(s.startedAt, s.plannedDurationSec).toISOString(),
    focusDeadlineAt: addSec(s.startedAt, s.plannedDurationSec + FOCUS_GRACE_SEC).toISOString(),
    focusEndedAt: s.focusEndedAt ? s.focusEndedAt.toISOString() : null,
    scanDeadlineAt: scanDeadline ? scanDeadline.toISOString() : null,
    hasSubmission: s.hasSubmission,
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
  };
}
