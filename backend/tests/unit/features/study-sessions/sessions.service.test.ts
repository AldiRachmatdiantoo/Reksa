import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  CreateSessionData,
  CreateSessionResult,
  EndFocusData,
  IsStale,
  SessionRecord,
  SessionsRepository,
} from '../../../../src/features/study-sessions/sessions.repository.js';
import type { SessionStatus } from '../../../../src/features/study-sessions/sessions.schema.js';
import {
  actualFocusSec,
  SessionsService,
  validityOf,
} from '../../../../src/features/study-sessions/sessions.service.js';

const USER = randomUUID();
const OTHER = randomUUID();
const MATERIAL = randomUUID();
const CLASS = randomUUID();
const T0 = new Date('2026-11-21T03:00:00.000Z');
const MIN = 60_000;

class FakeSessionsRepository implements SessionsRepository {
  sessions = new Map<string, SessionRecord>();
  accessibleMaterials = new Set<string>([`${USER}:${MATERIAL}`]);
  memberships = new Set<string>([`${USER}:${CLASS}`]);

  async isMaterialAccessible(userId: string, materialId: string) {
    return this.accessibleMaterials.has(`${userId}:${materialId}`);
  }

  async isClassMember(userId: string, classId: string) {
    return this.memberships.has(`${userId}:${classId}`);
  }

  async createIfNoActive(data: CreateSessionData, isStale: IsStale): Promise<CreateSessionResult> {
    for (const s of this.sessions.values()) {
      if (s.userId !== data.userId || !['FOCUS_ACTIVE', 'AWAITING_SCAN'].includes(s.status)) continue;
      if (!isStale({ ...s })) return { activeSessionId: s.id };
      s.status = 'EXPIRED';
    }
    const created: SessionRecord = {
      id: randomUUID(),
      ...data,
      materialTitle: 'Homeostasis',
      sessionType: 'INITIAL_BLURTING',
      actualDurationSec: null,
      predictedJolScore: null,
      status: 'FOCUS_ACTIVE',
      validity: null,
      focusEndedAt: null,
      completedAt: null,
      hasSubmission: false,
    };
    this.sessions.set(created.id, created);
    return { created: { ...created } };
  }

  async findOwned(userId: string, id: string) {
    const s = this.sessions.get(id);
    return s && s.userId === userId ? { ...s } : null;
  }

  async findActive(userId: string) {
    const s = [...this.sessions.values()].find(
      (x) => x.userId === userId && ['FOCUS_ACTIVE', 'AWAITING_SCAN'].includes(x.status),
    );
    return s ? { ...s } : null;
  }

  async expire(userId: string, id: string, from: SessionStatus[]) {
    const s = this.sessions.get(id);
    if (!s || s.userId !== userId) return null;
    if (from.includes(s.status)) s.status = 'EXPIRED';
    return { ...s };
  }

  async endFocus(userId: string, id: string, data: EndFocusData) {
    const s = this.sessions.get(id);
    if (!s || s.userId !== userId || s.status !== 'FOCUS_ACTIVE') return null;
    Object.assign(s, data, { status: 'AWAITING_SCAN' });
    return { ...s };
  }
}

const qrBridge = {
  issued: [] as { userId: string; sessionId: string }[],
  async issue(ticket: { userId: string; sessionId: string }) {
    this.issued.push(ticket);
    return { qrToken: 'A'.repeat(43), expiresInSec: 300 as const };
  },
  async waitForUpload() {
    return 'submission-id';
  },
};

let repo: FakeSessionsRepository;
let clock: Date;
let service: SessionsService;

function advance(ms: number) {
  clock = new Date(clock.getTime() + ms);
}

beforeEach(() => {
  repo = new FakeSessionsRepository();
  clock = T0;
  qrBridge.issued = [];
  service = new SessionsService({ repo, qrBridge, now: () => clock });
});

describe('pure rules', () => {
  it('caps actual focus at preset + 5 minutes and never goes negative', () => {
    expect(actualFocusSec(T0, 1500, new Date(T0.getTime() + 10 * MIN))).toBe(600);
    expect(actualFocusSec(T0, 1500, new Date(T0.getTime() + 60 * MIN))).toBe(1500 + 300);
    expect(actualFocusSec(T0, 1500, new Date(T0.getTime() - MIN))).toBe(0);
  });

  it('marks focus under 50% of the preset as SHORT_FOCUS', () => {
    expect(validityOf(749, 1500)).toBe('SHORT_FOCUS');
    expect(validityOf(750, 1500)).toBe('VALID');
  });
});

describe('start', () => {
  it('creates a FOCUS_ACTIVE session with server time and preset duration', async () => {
    const view = await service.start(USER, { materialId: MATERIAL, preset: 'FOCUS_SPRINT_15_3' });
    expect(view).toMatchObject({
      status: 'FOCUS_ACTIVE',
      preset: 'FOCUS_SPRINT_15_3',
      plannedDurationSec: 900,
      startedAt: T0.toISOString(),
      focusEndsAt: new Date(T0.getTime() + 15 * MIN).toISOString(),
      focusDeadlineAt: new Date(T0.getTime() + 45 * MIN).toISOString(),
      classId: null,
      validity: null,
      scanDeadlineAt: null,
    });
  });

  it('answers 404 for a material the student cannot read', async () => {
    await expect(service.start(OTHER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('accepts classId only for a class the student belongs to', async () => {
    const ok = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5', classId: CLASS });
    expect(ok.classId).toBe(CLASS);

    repo.accessibleMaterials.add(`${OTHER}:${MATERIAL}`);
    await expect(
      service.start(OTHER, { materialId: MATERIAL, preset: 'CLASSIC_25_5', classId: CLASS }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses a second active session with 409 and the active id', async () => {
    const first = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' });
    await expect(service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'ACTIVE_SESSION_EXISTS',
      details: { activeSessionId: first.id },
    });
  });

  it('expires a stale active session and starts a new one', async () => {
    const first = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' });
    advance(25 * MIN + 30 * MIN);
    const second = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' });
    expect(second.id).not.toBe(first.id);
    expect(repo.sessions.get(first.id)?.status).toBe('EXPIRED');
  });
});

describe('submitJol', () => {
  it('ends focus with server time, stores JOL and moves to AWAITING_SCAN', async () => {
    const s = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' });
    advance(24 * MIN);
    const view = await service.submitJol(USER, s.id, 70);
    expect(view).toMatchObject({
      status: 'AWAITING_SCAN',
      predictedJolScore: 70,
      actualDurationSec: 24 * 60,
      validity: 'VALID',
      focusEndedAt: clock.toISOString(),
      scanDeadlineAt: new Date(clock.getTime() + 120 * MIN).toISOString(),
    });
  });

  it('flags short focus but still lets the student continue', async () => {
    const s = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' });
    advance(5 * MIN);
    const view = await service.submitJol(USER, s.id, 90);
    expect(view.status).toBe('AWAITING_SCAN');
    expect(view.validity).toBe('SHORT_FOCUS');
  });

  it('caps the recorded duration when JOL arrives late but within the grace period', async () => {
    const s = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' });
    advance(50 * MIN);
    const view = await service.submitJol(USER, s.id, 50);
    expect(view.actualDurationSec).toBe(30 * 60);
  });

  it('expires the session when focus was not ended within preset + 30 minutes', async () => {
    const s = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' });
    advance(55 * MIN);
    await expect(service.submitJol(USER, s.id, 50)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(repo.sessions.get(s.id)?.status).toBe('EXPIRED');
  });

  it('refuses a second JOL', async () => {
    const s = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' });
    await service.submitJol(USER, s.id, 50);
    await expect(service.submitJol(USER, s.id, 99)).rejects.toMatchObject({ code: 'INVALID_SESSION_STATE' });
  });

  it("answers 404 for another student's session", async () => {
    const s = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' });
    await expect(service.submitJol(OTHER, s.id, 50)).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.sessions.get(s.id)?.status).toBe('FOCUS_ACTIVE');
  });
});

describe('expiry on read', () => {
  it('expires AWAITING_SCAN two hours after JOL when no photo arrived', async () => {
    const s = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' });
    advance(25 * MIN);
    await service.submitJol(USER, s.id, 60);
    advance(120 * MIN - 1000);
    expect((await service.get(USER, s.id)).status).toBe('AWAITING_SCAN');
    advance(1000);
    expect((await service.get(USER, s.id)).status).toBe('EXPIRED');
  });

  it('does not expire AWAITING_SCAN once the photo is stored', async () => {
    const s = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' });
    await service.submitJol(USER, s.id, 60);
    repo.sessions.get(s.id)!.hasSubmission = true;
    advance(24 * 60 * MIN);
    const view = await service.get(USER, s.id);
    expect(view.status).toBe('AWAITING_SCAN');
    expect(view.scanDeadlineAt).toBeNull();
  });

  it('getActive returns null once the active session went stale', async () => {
    await service.start(USER, { materialId: MATERIAL, preset: 'FOCUS_SPRINT_15_3' });
    expect(await service.getActive(USER)).not.toBeNull();
    advance(45 * MIN);
    expect(await service.getActive(USER)).toBeNull();
  });
});

describe('cancel', () => {
  it('expires an active session and is idempotent', async () => {
    const s = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' });
    expect((await service.cancel(USER, s.id)).status).toBe('EXPIRED');
    expect((await service.cancel(USER, s.id)).status).toBe('EXPIRED');
    await expect(service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' })).resolves.toBeDefined();
  });

  it('refuses once a photo was uploaded, and for completed sessions', async () => {
    const s = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' });
    await service.submitJol(USER, s.id, 60);
    repo.sessions.get(s.id)!.hasSubmission = true;
    await expect(service.cancel(USER, s.id)).rejects.toMatchObject({ code: 'INVALID_SESSION_STATE' });

    repo.sessions.get(s.id)!.status = 'COMPLETED';
    await expect(service.cancel(USER, s.id)).rejects.toMatchObject({ code: 'INVALID_SESSION_STATE' });
  });

  it("answers 404 for another student's session", async () => {
    const s = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' });
    await expect(service.cancel(OTHER, s.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('QR bridge', () => {
  it('issues a token only after JOL, while waiting for the photo', async () => {
    const s = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' });
    await expect(service.issueQrBridge(USER, s.id)).rejects.toMatchObject({ code: 'INVALID_SESSION_STATE' });

    await service.submitJol(USER, s.id, 60);
    await expect(service.issueQrBridge(USER, s.id)).resolves.toEqual({ qrToken: 'A'.repeat(43), expiresInSec: 300 });
    expect(qrBridge.issued).toEqual([{ userId: USER, sessionId: s.id }]);
  });

  it('refuses once the photo is in, after expiry, and for other students', async () => {
    const s = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' });
    await service.submitJol(USER, s.id, 60);

    await expect(service.issueQrBridge(OTHER, s.id)).rejects.toMatchObject({ statusCode: 404 });

    repo.sessions.get(s.id)!.hasSubmission = true;
    await expect(service.issueQrBridge(USER, s.id)).rejects.toMatchObject({ code: 'INVALID_SESSION_STATE' });

    repo.sessions.get(s.id)!.hasSubmission = false;
    advance(121 * MIN);
    await expect(service.issueQrBridge(USER, s.id)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(qrBridge.issued).toHaveLength(0);
  });

  it('waitForQrUpload checks ownership before waiting', async () => {
    const s = await service.start(USER, { materialId: MATERIAL, preset: 'CLASSIC_25_5' });
    const signal = new AbortController().signal;
    await expect(service.waitForQrUpload(OTHER, s.id, signal)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.waitForQrUpload(USER, s.id, signal)).resolves.toBe('submission-id');
  });
});
