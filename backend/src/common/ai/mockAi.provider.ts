import { createHash } from 'node:crypto';
import { AiProviderError } from './ai.errors.js';
import type { IAiService } from './ai.provider.interface.js';
import {
  AiCohortClusterOutputSchema,
  AiEssayAuditOutputSchema,
  AiRubricOutputSchema,
  type AiCohortClusterOutput,
  type AiEssayAuditOutput,
  type AiRubricOutput,
} from './ai.schema.js';
import {
  MOCK_COHORT_CLUSTERS,
  MOCK_ESSAY_AUDIT_FOTOSINTESIS,
  MOCK_ESSAY_AUDIT_VARIANTS,
  MOCK_RUBRIC,
  MOCK_RUBRIC_FOTOSINTESIS,
} from './mockAi.fixtures.js';

export type MockAiProviderOptions = {
  /** Simulasi latensi API (ms). Pakai 0 di unit test. */
  latencyMs?: number;
  /**
   * Peluang (0..1) `evaluateHandwritingEssay` gagal dengan AiProviderError TRANSIENT,
   * untuk menguji alur FAILED, retry, dan pengembalian kuota (PRD FR-05). Default 0.
   */
  auditFailureRate?: number;
  /** Sumber acak untuk `auditFailureRate`; disuntikkan di test agar deterministik. */
  random?: () => number;
};

/**
 * Provider AI untuk Fase 1–2 (AI_PROVIDER_MODE=mock). Tidak memanggil API apa pun.
 * Output di-parse ulang dengan skema Zod yang sama dengan provider asli, jadi
 * fixture yang rusak langsung gagal di sini, bukan di UI.
 *
 * Pemilihan data dummy deterministik:
 * - Rubrik: materi yang menyebut "fotosintesis" → rubrik fotosintesis, selain itu homeostasis.
 * - Audit: rubrik fotosintesis → audit fotosintesis; selain itu varian skor tinggi/sedang/rendah
 *   dipilih dari hash SHA-256 foto, jadi foto yang sama selalu mendapat hasil yang sama.
 */
export class MockAiProvider implements IAiService {
  private readonly latencyMs: number;
  private readonly auditFailureRate: number;
  private readonly random: () => number;

  constructor(options: MockAiProviderOptions = {}) {
    this.latencyMs = options.latencyMs ?? 300;
    this.auditFailureRate = Math.min(Math.max(options.auditFailureRate ?? 0, 0), 1);
    this.random = options.random ?? Math.random;
  }

  async extractRubric(materialText: string): Promise<AiRubricOutput> {
    await this.simulateLatency();
    const fixture = /fotosintesis/i.test(materialText) ? MOCK_RUBRIC_FOTOSINTESIS : MOCK_RUBRIC;
    return AiRubricOutputSchema.parse(structuredClone(fixture));
  }

  async evaluateHandwritingEssay(
    imageBuffer: Buffer,
    _mimeType: string,
    rubric: AiRubricOutput,
  ): Promise<AiEssayAuditOutput> {
    await this.simulateLatency();
    if (this.auditFailureRate > 0 && this.random() < this.auditFailureRate) {
      throw new AiProviderError('TRANSIENT', 'Simulasi: penyedia AI sementara tidak tersedia');
    }
    return AiEssayAuditOutputSchema.parse(structuredClone(pickAudit(imageBuffer, rubric)));
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

function pickAudit(imageBuffer: Buffer, rubric: AiRubricOutput): AiEssayAuditOutput {
  if (rubric.materialTitle === MOCK_RUBRIC_FOTOSINTESIS.materialTitle) {
    return MOCK_ESSAY_AUDIT_FOTOSINTESIS;
  }
  const firstByte = createHash('sha256').update(imageBuffer).digest()[0] ?? 0;
  // Panjang varian selalu > 0 (konstanta fixture), jadi indeks ini selalu terisi.
  return MOCK_ESSAY_AUDIT_VARIANTS[firstByte % MOCK_ESSAY_AUDIT_VARIANTS.length]!;
}
