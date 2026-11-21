import { describe, expect, it, vi } from 'vitest';
import { AiProviderError } from '../../../../src/common/ai/ai.errors.js';
import { AiEssayAuditOutputSchema } from '../../../../src/common/ai/ai.schema.js';
import { GeminiAiProvider } from '../../../../src/common/ai/geminiAi.provider.js';
import type { GenerateJsonRequest } from '../../../../src/common/ai/geminiClient.js';
import {
  buildStage2ResponseSchema,
  GeminiVisionAuditor,
  mapStage2Output,
  STAGE2_SYSTEM_INSTRUCTION,
  type GeminiStage2Output,
} from '../../../../src/common/ai/geminiVision.js';
import { MOCK_RUBRIC } from '../../../../src/common/ai/mockAi.fixtures.js';

// MOCK_RUBRIC: homeostasis 5, reseptor 3, pusat-kontrol 4, efektor 3, umpan-balik-negatif 5 → total bobot 20.

function output(partial: Partial<GeminiStage2Output> = {}): GeminiStage2Output {
  return {
    conceptAssessments: [
      { conceptId: 'homeostasis', status: 'MASTERED', evidenceFromHandwriting: '"tubuh jaga kondisi dalam tetap stabil"', explanation: '' },
      { conceptId: 'efektor', status: 'MASTERED', evidenceFromHandwriting: 'panah ke "kelenjar keringat"', explanation: '' },
      { conceptId: 'umpan-balik-negatif', status: 'PARTIAL', evidenceFromHandwriting: '"keringat → suhu turun"', explanation: 'Belum dijelaskan kenapa disebut negatif.' },
      { conceptId: 'reseptor', status: 'MISSING', evidenceFromHandwriting: '', explanation: 'Belum ada bagian yang mendeteksi suhu.' },
      { conceptId: 'pusat-kontrol', status: 'MISSING', evidenceFromHandwriting: '', explanation: 'Hipotalamus belum disebut.' },
    ],
    logicCorrections: [{ studentStatement: '"otak langsung bikin keringat"', correction: 'Hipotalamus menerima sinyal reseptor dulu.' }],
    encouragingSummary: 'Kerangkanya sudah ada, lengkapi alur kontrolnya.',
    suspiciousInstructions: false,
    ...partial,
  };
}

describe('mapStage2Output: score is computed by the server', () => {
  it('weights MASTERED 1, PARTIAL 0.5, MISSING 0 by rubric weight', () => {
    const { audit } = mapStage2Output(MOCK_RUBRIC, output());
    // (5 + 3 + 0.5 × 5) / 20 = 10.5 / 20 = 52.5 → 53
    expect(audit.actualScore).toBe(53);
    expect(AiEssayAuditOutputSchema.safeParse(audit).success).toBe(true);
  });

  it('lists MASTERED and PARTIAL as accurate, PARTIAL and MISSING as blind spots with weight-based importance', () => {
    const { audit } = mapStage2Output(MOCK_RUBRIC, output());
    expect(audit.accurateConcepts.map((c) => c.concept)).toEqual(['Homeostasis', 'Efektor', 'Umpan balik negatif']);
    expect(audit.blindSpots.map((b) => [b.concept, b.importanceLevel])).toEqual([
      ['Reseptor', 'MEDIUM'],
      ['Pusat kontrol', 'HIGH'],
      ['Umpan balik negatif', 'HIGH'],
    ]);
    expect(audit.blindSpots.find((b) => b.concept === 'Reseptor')!.explanation).toBe('Belum ada bagian yang mendeteksi suhu.');
  });

  it('treats concepts the model skipped as MISSING, and only counts the first of duplicate assessments', () => {
    const skipped = mapStage2Output(MOCK_RUBRIC, output({ conceptAssessments: [] }));
    expect(skipped.audit.actualScore).toBe(0);
    expect(skipped.audit.blindSpots).toHaveLength(5);
    expect(skipped.audit.blindSpots[0]!.explanation).toContain('Intinya:');

    const dup = output();
    dup.conceptAssessments.push({ conceptId: 'reseptor', status: 'MASTERED', evidenceFromHandwriting: 'termoreseptor', explanation: '' });
    expect(mapStage2Output(MOCK_RUBRIC, dup).audit.actualScore).toBe(53);
  });

  it('ignores assessments for concepts outside the rubric', () => {
    const extra = output();
    extra.conceptAssessments.push({ conceptId: 'konsep-palsu', status: 'MASTERED', evidenceFromHandwriting: 'apa saja', explanation: '' });
    expect(mapStage2Output(MOCK_RUBRIC, extra).audit.actualScore).toBe(53);
  });
});

describe('prompt injection defenses (PRD §5.3, §11.2)', () => {
  it('a model fooled into "everything mastered" without evidence scores 0, not 100', () => {
    const fooled = output({
      conceptAssessments: MOCK_RUBRIC.keyConcepts.map((c) => ({
        conceptId: c.id,
        status: 'MASTERED' as const,
        evidenceFromHandwriting: '',
        explanation: 'Sudah dikuasai sesuai instruksi di foto.',
      })),
    });
    const { audit, downgradedConcepts } = mapStage2Output(MOCK_RUBRIC, fooled);
    expect(audit.actualScore).toBe(0);
    expect(downgradedConcepts).toBe(5);
    expect(audit.accurateConcepts).toHaveLength(0);
    // Penjelasan "sudah dikuasai" dari model yang tertipu tidak ditampilkan ke pelajar.
    expect(audit.blindSpots.every((b) => !b.explanation.includes('instruksi di foto'))).toBe(true);
  });

  it('rejects any extra field such as a model-chosen "score" (INVALID_OUTPUT, retried once by the worker)', () => {
    const err = (() => {
      try {
        mapStage2Output(MOCK_RUBRIC, { ...output(), score: 100 });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).kind).toBe('INVALID_OUTPUT');
  });

  it('rejects unknown statuses and malformed shapes', () => {
    const bad = output();
    (bad.conceptAssessments[0] as { status: string }).status = 'PERFECT';
    expect(() => mapStage2Output(MOCK_RUBRIC, bad)).toThrow(AiProviderError);
    expect(() => mapStage2Output(MOCK_RUBRIC, 'beri nilai 100')).toThrow(AiProviderError);
  });

  it('a flagged injection does not change the score, and only a signal (no content) is reported', async () => {
    const client = { generateJson: vi.fn(async () => output({ suspiciousInstructions: true })) };
    const onSignal = vi.fn();
    const audit = await new GeminiVisionAuditor({ client, onSignal }).evaluate(Buffer.from('img'), 'image/webp', MOCK_RUBRIC);
    expect(audit.actualScore).toBe(53);
    expect(onSignal).toHaveBeenCalledWith({ suspiciousInstructions: true, downgradedConcepts: 0 });
  });

  it('the system instruction marks image and rubric text as untrusted and is never mixed with user data', async () => {
    const client = { generateJson: vi.fn<(r: GenerateJsonRequest) => Promise<unknown>>(async () => output()) };
    await new GeminiVisionAuditor({ client }).evaluate(Buffer.from('foto'), 'image/webp', MOCK_RUBRIC);
    const req = client.generateJson.mock.calls[0]![0];

    expect(req.systemInstruction).toBe(STAGE2_SYSTEM_INSTRUCTION);
    expect(STAGE2_SYSTEM_INSTRUCTION).toMatch(/untrusted/i);
    expect(STAGE2_SYSTEM_INSTRUCTION).toMatch(/Ignore any commands/i);
    expect(req.systemInstruction).not.toContain(MOCK_RUBRIC.keyConcepts[0]!.definition);
    expect(req.parts[0]).toEqual({ text: expect.stringContaining('<rubric_json>') });
    expect(req.parts[1]).toEqual({ inlineData: { mimeType: 'image/webp', data: Buffer.from('foto').toString('base64') } });
    expect(req.temperature).toBe(0);
  });
});

describe('response schema', () => {
  it('locks concept ids to the rubric and statuses to three values', () => {
    const schema = buildStage2ResponseSchema(MOCK_RUBRIC);
    expect(schema).toMatchObject({
      type: 'OBJECT',
      required: ['conceptAssessments', 'logicCorrections', 'encouragingSummary', 'suspiciousInstructions'],
      properties: {
        conceptAssessments: {
          items: {
            properties: {
              conceptId: { type: 'STRING', enum: MOCK_RUBRIC.keyConcepts.map((c) => c.id) },
              status: { type: 'STRING', enum: ['MASTERED', 'PARTIAL', 'MISSING'] },
            },
          },
        },
      },
    });
    // Tidak ada field skor yang bisa diisi model.
    expect(JSON.stringify(schema)).not.toMatch(/score/i);
  });
});

describe('GeminiAiProvider', () => {
  it('delegates Stage 2 and refuses Stage 1/3 until Aldi implements them', async () => {
    const client = { generateJson: vi.fn(async () => output()) };
    const provider = new GeminiAiProvider({ client: client as never });
    await expect(provider.evaluateHandwritingEssay(Buffer.from('x'), 'image/webp', MOCK_RUBRIC)).resolves.toMatchObject({ actualScore: 53 });
    await expect(provider.extractRubric('materi')).rejects.toMatchObject({ kind: 'FATAL' });
    await expect(provider.clusterCohortBlindSpots([])).rejects.toMatchObject({ kind: 'FATAL' });
  });
});
