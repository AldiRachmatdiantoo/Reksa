import type { Env } from '../../config/env.js';
import type { IAiService } from './ai.provider.interface.js';
import { MockAiProvider } from './mockAi.provider.js';

export function createAiService(env: Pick<Env, 'AI_PROVIDER_MODE' | 'MOCK_AI_LATENCY_MS'>): IAiService {
  switch (env.AI_PROVIDER_MODE) {
    case 'mock':
      return new MockAiProvider({ latencyMs: env.MOCK_AI_LATENCY_MS });
    case 'gemini':
      // GeminiAiProvider dibangun di Fase 3 (Stage 1 & 3: Aldi, Stage 2: Adli).
      throw new Error('AI_PROVIDER_MODE=gemini belum tersedia: GeminiAiProvider dibangun di Fase 3');
  }
}
