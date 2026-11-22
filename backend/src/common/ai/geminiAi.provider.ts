import type { IAiService } from './ai.provider.interface.js';
import type { AiCohortClusterOutput, AiEssayAuditOutput, AiRubricOutput } from './ai.schema.js';
import { GeminiClient, type GeminiClientOptions } from './geminiClient.js';
import { GeminiCohortClusterer } from './geminiCohort.js';
import { GeminiRubricExtractor } from './geminiRubric.js';
import { GeminiVisionAuditor, type GeminiVisionAuditorOptions } from './geminiVision.js';

export type GeminiAiProviderOptions = {
  /** Klien siap pakai (test), atau opsi untuk membuatnya. */
  client?: GeminiClient;
  clientOptions?: GeminiClientOptions;
  /** PRD §5.1: gemini-2.5-flash untuk rubrik & audit esai. */
  visionModel?: string;
  /** Stage 1 (rubrik) dan Stage 3 (klaster kelas). Default gemini-2.5-flash. */
  textModel?: string;
  onSignal?: GeminiVisionAuditorOptions['onSignal'];
};

/**
 * Provider AI Fase 3 (AI_PROVIDER_MODE=gemini), dirangkai di ai.factory.ts.
 * Stage 1 `extractRubric` (Aldi, geminiRubric.ts), Stage 2 `evaluateHandwritingEssay` (Adli, geminiVision.ts),
 * Stage 3 `clusterCohortBlindSpots` (Aldi, geminiCohort.ts). Ketiganya memakai satu GeminiClient.
 */
export class GeminiAiProvider implements IAiService {
  private readonly rubric: GeminiRubricExtractor;
  private readonly vision: GeminiVisionAuditor;
  private readonly cohort: GeminiCohortClusterer;

  constructor(options: GeminiAiProviderOptions) {
    const client = options.client ?? (options.clientOptions ? new GeminiClient(options.clientOptions) : undefined);
    if (!client) throw new Error('GeminiAiProvider butuh client atau clientOptions');
    this.rubric = new GeminiRubricExtractor({ client, model: options.textModel });
    this.vision = new GeminiVisionAuditor({ client, model: options.visionModel, onSignal: options.onSignal });
    this.cohort = new GeminiCohortClusterer({ client, model: options.textModel });
  }

  extractRubric(materialText: string): Promise<AiRubricOutput> {
    return this.rubric.extract(materialText);
  }

  evaluateHandwritingEssay(imageBuffer: Buffer, mimeType: string, rubric: AiRubricOutput): Promise<AiEssayAuditOutput> {
    return this.vision.evaluate(imageBuffer, mimeType, rubric);
  }

  clusterCohortBlindSpots(blindSpotsList: AiEssayAuditOutput['blindSpots'][]): Promise<AiCohortClusterOutput> {
    return this.cohort.cluster(blindSpotsList);
  }
}
