import { AiProviderError } from './ai.errors.js';
import type { IAiService } from './ai.provider.interface.js';
import type { AiCohortClusterOutput, AiEssayAuditOutput, AiRubricOutput } from './ai.schema.js';
import { GeminiClient, type GeminiClientOptions, type GenerateJsonRequest } from './geminiClient.js';
import { GeminiCohortClusterer } from './geminiCohort.js';
import { GeminiRubricExtractor } from './geminiRubric.js';
import { GeminiVisionAuditor, type GeminiVisionAuditorOptions } from './geminiVision.js';

export type GeminiAiProviderOptions = {
  /** Klien siap pakai (test), atau opsi untuk membuatnya. */
  client?: GeminiClient;
  clientOptions?: GeminiClientOptions;
  /** Stage 2 (foto). Satu model, atau daftar model berurutan (dipisah koma): model berikutnya dipakai saat kuota harian habis. */
  visionModel?: string | readonly string[];
  /** Stage 1 (rubrik) dan Stage 3 (klaster kelas), aturan daftar sama dengan visionModel. */
  textModel?: string | readonly string[];
  onSignal?: GeminiVisionAuditorOptions['onSignal'];
};

/**
 * Bawaan per 22 Nov 2026 (free tier). gemini-2.5-flash dialihkan Google ke model baru mulai Desember 2026.
 * Stage 2: gemini-3.5-flash-lite stabil di uji injeksi live (nilai sama dengan dan tanpa baris perintah).
 */
export const DEFAULT_VISION_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'] as const;
/** Stage 1/3: gemini-2.5-flash-lite menjawab 2 sampai 3 detik; gemini-3.5-flash 30 sampai 55 detik, terlalu dekat batas waktu. */
export const DEFAULT_TEXT_MODELS = ['gemini-2.5-flash-lite', 'gemini-3.5-flash-lite'] as const;

/** "a, b" atau ['a', 'b'] → ['a', 'b']; kosong → bawaan. */
export function modelList(value: string | readonly string[] | undefined, fallback: readonly string[]): string[] {
  const list = (typeof value === 'string' ? value.split(',') : (value ?? [])).map((m) => m.trim()).filter(Boolean);
  return list.length > 0 ? list : [...fallback];
}

type JsonClient = Pick<GeminiClient, 'generateJson'>;

/**
 * Klien yang mencoba model berikutnya HANYA saat kuota harian model sebelumnya habis. Error lain (sibuk, output
 * rusak, konfigurasi) diteruskan apa adanya ke pemanggil, yang punya aturan ulang sendiri. Kuota free tier
 * dihitung per model, jadi daftar model menambah kapasitas harian tanpa akun atau key tambahan.
 */
export function withModelFallback(client: JsonClient, models: readonly string[]): JsonClient {
  return {
    async generateJson(request: GenerateJsonRequest) {
      for (let i = 0; ; i++) {
        try {
          return await client.generateJson({ ...request, model: models[i]! });
        } catch (err) {
          const exhausted = err instanceof AiProviderError && err.kind === 'QUOTA_EXHAUSTED';
          if (!exhausted || i >= models.length - 1) throw err;
        }
      }
    },
  };
}

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
    const text = modelList(options.textModel, DEFAULT_TEXT_MODELS);
    const vision = modelList(options.visionModel, DEFAULT_VISION_MODELS);
    const textClient = withModelFallback(client, text);
    const visionClient = withModelFallback(client, vision);
    this.rubric = new GeminiRubricExtractor({ client: textClient, model: text[0] });
    this.vision = new GeminiVisionAuditor({ client: visionClient, model: vision[0], onSignal: options.onSignal });
    this.cohort = new GeminiCohortClusterer({ client: textClient, model: text[0] });
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
