import { describe, expect, it, vi } from 'vitest';
import { AiProviderError } from '../../../../src/common/ai/ai.errors.js';
import {
  DEFAULT_TEXT_MODELS,
  DEFAULT_VISION_MODELS,
  GeminiAiProvider,
  modelList,
  withModelFallback,
} from '../../../../src/common/ai/geminiAi.provider.js';
import type { GenerateJsonRequest } from '../../../../src/common/ai/geminiClient.js';
import { MOCK_RUBRIC } from '../../../../src/common/ai/mockAi.fixtures.js';

const request: GenerateJsonRequest = {
  model: 'diabaikan',
  systemInstruction: 'SYSTEM',
  parts: [{ text: 'DATA' }],
  responseSchema: { type: 'OBJECT', properties: {} },
};

const quota = () => new AiProviderError('QUOTA_EXHAUSTED', 'Kuota harian Gemini habis (HTTP 429)');

describe('modelList', () => {
  it('splits a comma list, trims it, and falls back to the defaults when empty', () => {
    expect(modelList(' a , b ,, ', ['x'])).toEqual(['a', 'b']);
    expect(modelList(['a'], ['x'])).toEqual(['a']);
    expect(modelList(undefined, ['x', 'y'])).toEqual(['x', 'y']);
    expect(modelList('', ['x'])).toEqual(['x']);
  });
});

describe('withModelFallback', () => {
  it('moves to the next model only when the daily quota of the current one is used up', async () => {
    const generateJson = vi
      .fn<(r: GenerateJsonRequest) => Promise<unknown>>()
      .mockRejectedValueOnce(quota())
      .mockResolvedValueOnce({ ok: true });
    await expect(withModelFallback({ generateJson }, ['m1', 'm2', 'm3']).generateJson(request)).resolves.toEqual({ ok: true });
    expect(generateJson.mock.calls.map((c) => c[0].model)).toEqual(['m1', 'm2']);
  });

  it.each(['TRANSIENT', 'INVALID_OUTPUT', 'FATAL'] as const)(
    'does not switch model on %s (the caller has its own retry rules)',
    async (kind) => {
      const generateJson = vi.fn<(r: GenerateJsonRequest) => Promise<unknown>>().mockRejectedValue(new AiProviderError(kind, 'x'));
      await expect(withModelFallback({ generateJson }, ['m1', 'm2']).generateJson(request)).rejects.toMatchObject({ kind });
      expect(generateJson).toHaveBeenCalledOnce();
    },
  );

  it('reports QUOTA_EXHAUSTED once every model is used up', async () => {
    const generateJson = vi.fn<(r: GenerateJsonRequest) => Promise<unknown>>().mockRejectedValue(quota());
    await expect(withModelFallback({ generateJson }, ['m1', 'm2']).generateJson(request)).rejects.toMatchObject({
      kind: 'QUOTA_EXHAUSTED',
    });
    expect(generateJson.mock.calls.map((c) => c[0].model)).toEqual(['m1', 'm2']);
  });
});

describe('GeminiAiProvider model wiring', () => {
  it('uses separate default model lists for photos and for text', async () => {
    const generateJson = vi.fn<(r: GenerateJsonRequest) => Promise<unknown>>().mockRejectedValue(new AiProviderError('FATAL', 'stop'));
    const provider = new GeminiAiProvider({ client: { generateJson } as never });
    await provider.evaluateHandwritingEssay(Buffer.from('x'), 'image/webp', MOCK_RUBRIC).catch(() => {});
    await provider.extractRubric('materi').catch(() => {});
    expect(generateJson.mock.calls.map((c) => c[0].model)).toEqual([DEFAULT_VISION_MODELS[0], DEFAULT_TEXT_MODELS[0]]);
    expect(DEFAULT_VISION_MODELS).not.toContain('gemini-2.5-flash');
  });

  it('a photo check falls through the vision list when quotas run out', async () => {
    const generateJson = vi.fn<(r: GenerateJsonRequest) => Promise<unknown>>().mockRejectedValue(quota());
    const provider = new GeminiAiProvider({ client: { generateJson } as never, visionModel: 'v1,v2', textModel: ['t1'] });
    await expect(provider.evaluateHandwritingEssay(Buffer.from('x'), 'image/webp', MOCK_RUBRIC)).rejects.toMatchObject({
      kind: 'QUOTA_EXHAUSTED',
    });
    expect(generateJson.mock.calls.map((c) => c[0].model)).toEqual(['v1', 'v2']);
  });
});
