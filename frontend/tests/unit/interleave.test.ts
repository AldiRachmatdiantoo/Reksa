import { describe, expect, it } from 'vitest';
import type { ServerSession } from '../../src/features/studio/sessionsApi';
import { fromServer, sessionTitle } from '../../src/features/studio/studySession';

const base: ServerSession = {
  id: '11111111-1111-4111-8111-111111111111',
  materialId: '22222222-2222-4222-8222-222222222222',
  materialTitle: 'Homeostasis',
  secondMaterialId: '33333333-3333-4333-8333-333333333333',
  secondMaterialTitle: 'Fotosintesis',
  classId: null,
  sessionType: 'INITIAL_BLURTING',
  preset: 'CLASSIC_25_5',
  status: 'FOCUS_ACTIVE',
  validity: null,
  plannedDurationSec: 1500,
  actualDurationSec: null,
  predictedJolScore: null,
  startedAt: '2026-11-22T10:00:00.000Z',
  focusEndsAt: '2026-11-22T10:25:00.000Z',
  focusDeadlineAt: '2026-11-22T10:55:00.000Z',
  focusEndedAt: null,
  scanDeadlineAt: null,
  hasSubmission: false,
  submissionId: null,
  completedAt: null,
};

describe('interleaved sessions (F3)', () => {
  it('keeps the second material from the server and shows both titles', () => {
    const local = fromServer(base);
    expect(local.secondMaterial).toEqual({ id: base.secondMaterialId, title: 'Fotosintesis' });
    expect(sessionTitle(local)).toBe('Homeostasis + Fotosintesis');
  });

  it('falls back to the cached title when the server can no longer read the second material', () => {
    const previous = fromServer(base);
    const local = fromServer({ ...base, secondMaterialTitle: null }, previous);
    expect(local.secondMaterial?.title).toBe('Fotosintesis');
  });

  it('is a plain single-material session when the server has no second material', () => {
    const local = fromServer({ ...base, secondMaterialId: null, secondMaterialTitle: null });
    expect(local.secondMaterial).toBeNull();
    expect(sessionTitle(local)).toBe('Homeostasis');
  });
});
