import type { IAiService } from './ai.provider.interface.js';
import {
  AiCohortClusterOutputSchema,
  AiEssayAuditOutputSchema,
  AiRubricOutputSchema,
  type AiCohortClusterOutput,
  type AiEssayAuditOutput,
  type AiRubricOutput,
} from './ai.schema.js';
import { MOCK_COHORT_CLUSTERS, MOCK_ESSAY_AUDIT, MOCK_RUBRIC } from './mockAi.fixtures.js';

export type MockAiProviderOptions = {
  /** Simulasi latensi API (ms). Pakai 0 di unit test. */
  latencyMs?: number;
};

/**
 * Provider AI untuk Fase 1–2 (AI_PROVIDER_MODE=mock). Tidak memanggil API apa pun.
 * Output di-parse ulang dengan skema Zod yang sama dengan provider asli, jadi
 * fixture yang rusak langsung gagal di sini, bukan di UI.
 */
export class MockAiProvider implements IAiService {
  private readonly latencyMs: number;

  constructor(options: MockAiProviderOptions = {}) {
    this.latencyMs = options.latencyMs ?? 300;
  }

  async extractRubric(_materialText: string): Promise<AiRubricOutput> {
    await this.simulateLatency();
    return AiRubricOutputSchema.parse(structuredClone(MOCK_RUBRIC));
  }

  async evaluateHandwritingEssay(
    _imageBuffer: Buffer,
    _mimeType: string,
    _rubric: AiRubricOutput,
  ): Promise<AiEssayAuditOutput> {
    await this.simulateLatency();
    return AiEssayAuditOutputSchema.parse(structuredClone(MOCK_ESSAY_AUDIT));
  }

  async clusterCohortBlindSpots(
    _blindSpotsList: AiEssayAuditOutput['blindSpots'][],
  ): Promise<AiCohortClusterOutput> {
    await this.simulateLatency();
    return AiCohortClusterOutputSchema.parse(structuredClone(MOCK_COHORT_CLUSTERS));
  }

  private async simulateLatency(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
  }
}
