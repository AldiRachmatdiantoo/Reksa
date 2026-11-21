import { AiProviderError } from './ai.errors.js';
import type { IAiService } from './ai.provider.interface.js';
import type { AiCohortClusterOutput, AiEssayAuditOutput, AiRubricOutput } from './ai.schema.js';
import { GeminiClient, type GeminiClientOptions } from './geminiClient.js';
import { GeminiVisionAuditor, type GeminiVisionAuditorOptions } from './geminiVision.js';

export type GeminiAiProviderOptions = {
  /** Klien siap pakai (test), atau opsi untuk membuatnya. */
  client?: GeminiClient;
  clientOptions?: GeminiClientOptions;
  /** PRD §5.1: gemini-2.5-flash untuk rubrik & audit esai. */
  visionModel?: string;
  onSignal?: GeminiVisionAuditorOptions['onSignal'];
};

/**
 * Provider AI Fase 3 (AI_PROVIDER_MODE=gemini). Stage 2 (Adli) sudah diimplementasi.
 * Stage 1 `extractRubric` dan Stage 3 `clusterCohortBlindSpots` adalah bagian Aldi; sampai diisi,
 * keduanya menolak dengan FATAL supaya tidak diam-diam memakai data palsu.
 * Belum dirangkai di ai.factory.ts: CLAUDE.md melarang panggilan Gemini asli selama Fase 1–2.
 */
export class GeminiAiProvider implements IAiService {
  private readonly vision: GeminiVisionAuditor;

  constructor(options: GeminiAiProviderOptions) {
    const client = options.client ?? (options.clientOptions ? new GeminiClient(options.clientOptions) : undefined);
    if (!client) throw new Error('GeminiAiProvider butuh client atau clientOptions');
    this.vision = new GeminiVisionAuditor({ client, model: options.visionModel, onSignal: options.onSignal });
  }

  async extractRubric(_materialText: string): Promise<AiRubricOutput> {
    throw new AiProviderError('FATAL', 'Gemini Stage 1 (extractRubric) belum diimplementasi (bagian Aldi, Fase 3)');
  }

  evaluateHandwritingEssay(imageBuffer: Buffer, mimeType: string, rubric: AiRubricOutput): Promise<AiEssayAuditOutput> {
    return this.vision.evaluate(imageBuffer, mimeType, rubric);
  }

  async clusterCohortBlindSpots(_blindSpotsList: AiEssayAuditOutput['blindSpots'][]): Promise<AiCohortClusterOutput> {
    throw new AiProviderError('FATAL', 'Gemini Stage 3 (clusterCohortBlindSpots) belum diimplementasi (bagian Aldi, Fase 3)');
  }
}
