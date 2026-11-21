import { describe, expect, it, vi } from 'vitest';
import { AiProviderError } from '../../../../src/common/ai/ai.errors.js';
import { GeminiClient, type GenerateJsonRequest } from '../../../../src/common/ai/geminiClient.js';

const API_KEY = 'test-key-SECRET-123';

const request: GenerateJsonRequest = {
  model: 'gemini-2.5-flash',
  systemInstruction: 'SYSTEM',
  parts: [{ text: 'DATA' }, { inlineData: { mimeType: 'image/webp', data: 'AAAA' } }],
  responseSchema: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } }, required: ['ok'] },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const answer = (text: string, finishReason = 'STOP') => jsonResponse({ candidates: [{ content: { parts: [{ text }] }, finishReason }] });

function clientWith(fetchImpl: typeof fetch, timeoutMs?: number) {
  return new GeminiClient({ apiKey: API_KEY, fetch: fetchImpl, timeoutMs });
}

async function errorOf(promise: Promise<unknown>): Promise<AiProviderError> {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AiProviderError);
  return err as AiProviderError;
}

describe('GeminiClient request', () => {
  it('posts to generateContent with the key in a header, system instruction separate from user data, JSON mode', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => answer('{"ok":true}'));
    await expect(clientWith(fetchImpl).generateJson(request)).resolves.toEqual({ ok: true });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(String(url)).not.toContain(API_KEY);
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe(API_KEY);
    const body = JSON.parse(init!.body as string);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'SYSTEM' }] });
    expect(body.contents).toEqual([{ role: 'user', parts: request.parts }]);
    expect(body.generationConfig).toMatchObject({ temperature: 0, responseMimeType: 'application/json', responseSchema: request.responseSchema });
    expect(init!.signal).toBeInstanceOf(AbortSignal);
  });

  it('refuses suspicious model names before any network call', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const err = await errorOf(clientWith(fetchImpl).generateJson({ ...request, model: '../../v1/evil?key=' }));
    expect(err.kind).toBe('FATAL');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('requires an API key', () => {
    expect(() => new GeminiClient({ apiKey: '' })).toThrow(/GEMINI_API_KEY/);
  });
});

describe('GeminiClient error mapping', () => {
  it.each([
    [429, 'TRANSIENT'],
    [500, 'TRANSIENT'],
    [503, 'TRANSIENT'],
    [408, 'TRANSIENT'],
    [400, 'FATAL'],
    [401, 'FATAL'],
    [403, 'FATAL'],
    [404, 'FATAL'],
  ] as const)('HTTP %i → %s, without leaking the key or the response body', async (status, kind) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ error: { message: `bad key ${API_KEY}` } }, status));
    const err = await errorOf(clientWith(fetchImpl).generateJson(request));
    expect(err.kind).toBe(kind);
    expect(err.message).not.toContain(API_KEY);
  });

  it('network failures and timeouts are TRANSIENT', async () => {
    const down = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    expect((await errorOf(clientWith(down).generateJson(request))).kind).toBe('TRANSIENT');

    const hanging = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
        }),
    );
    expect((await errorOf(clientWith(hanging, 20).generateJson(request))).kind).toBe('TRANSIENT');
  });

  it.each([
    ['blocked prompt', jsonResponse({ promptFeedback: { blockReason: 'SAFETY' } })],
    ['no candidate', jsonResponse({ candidates: [] })],
    ['truncated output', answer('{"ok":', 'MAX_TOKENS')],
    ['non-JSON text', answer('Tentu! Ini hasilnya: ok')],
    ['non-JSON body', new Response('<html>oops</html>', { status: 200 })],
  ])('%s is INVALID_OUTPUT', async (_name, response) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => response);
    expect((await errorOf(clientWith(fetchImpl).generateJson(request))).kind).toBe('INVALID_OUTPUT');
  });

  it('joins multi-part text answers', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ candidates: [{ content: { parts: [{ text: '{"ok":' }, { text: 'true}' }] }, finishReason: 'STOP' }] }),
    );
    await expect(clientWith(fetchImpl).generateJson(request)).resolves.toEqual({ ok: true });
  });
});
