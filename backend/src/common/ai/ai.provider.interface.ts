import type { AiCohortClusterOutput, AiEssayAuditOutput, AiRubricOutput } from './ai.schema.js';

export type { AiCohortClusterOutput, AiEssayAuditOutput, AiRubricOutput };

/**
 * Satu-satunya pintu ke AI. Service hanya bergantung pada antarmuka ini,
 * sehingga MockAiProvider (Fase 1–2) dan GeminiAiProvider (Fase 3) bisa
 * ditukar lewat AI_PROVIDER_MODE tanpa mengubah kode lain.
 */
export interface IAiService {
  /** Stage 1: materi → rubrik konsep kunci. */
  extractRubric(materialText: string): Promise<AiRubricOutput>;

  /** Stage 2: foto tulisan tangan + rubrik → audit pemahaman. */
  evaluateHandwritingEssay(
    imageBuffer: Buffer,
    mimeType: string,
    rubric: AiRubricOutput,
  ): Promise<AiEssayAuditOutput>;

  /** Stage 3: kumpulan blind spots satu kelas (satu array per siswa) → klaster & rekomendasi. */
  clusterCohortBlindSpots(blindSpotsList: AiEssayAuditOutput['blindSpots'][]): Promise<AiCohortClusterOutput>;
}
