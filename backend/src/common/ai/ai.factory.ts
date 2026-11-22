import type { Env } from '../../config/env.js';
import type { IAiService } from './ai.provider.interface.js';
import { GeminiAiProvider, type GeminiAiProviderOptions } from './geminiAi.provider.js';
import { MockAiProvider } from './mockAi.provider.js';

export type AiFactoryEnv = Pick<Env, 'AI_PROVIDER_MODE' | 'MOCK_AI_LATENCY_MS'> &
  Partial<Pick<Env, 'GEMINI_API_KEY' | 'GEMINI_TEXT_MODEL' | 'GEMINI_VISION_MODEL'>>;

export type AiFactoryHooks = {
  /** Sinyal Stage 2 (instruksi mencurigakan di foto, klaim tanpa bukti). Hanya angka dan flag, tanpa isi. */
  onSignal?: GeminiAiProviderOptions['onSignal'];
};

export function createAiService(env: AiFactoryEnv, hooks: AiFactoryHooks = {}): IAiService {
  switch (env.AI_PROVIDER_MODE) {
    case 'mock':
      return new MockAiProvider({ latencyMs: env.MOCK_AI_LATENCY_MS });
    case 'gemini':
      // loadEnv sudah mewajibkan GEMINI_API_KEY di mode ini; GeminiClient tetap menolak kunci kosong.
      return new GeminiAiProvider({
        clientOptions: { apiKey: env.GEMINI_API_KEY ?? '' },
        textModel: env.GEMINI_TEXT_MODEL,
        visionModel: env.GEMINI_VISION_MODEL,
        onSignal: hooks.onSignal,
      });
  }
}
