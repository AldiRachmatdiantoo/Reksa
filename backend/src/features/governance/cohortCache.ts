import type { Redis } from 'ioredis';
import { AiCohortClusterOutputSchema, type AiCohortClusterOutput } from '../../common/ai/ai.schema.js';

export interface CohortRecommendationCache {
  get(key: string): Promise<AiCohortClusterOutput | null>;
  set(key: string, value: AiCohortClusterOutput): Promise<void>;
}

const KEY_RE = /^[0-9a-f]{64}$/;
/** Data kelas jarang berubah cepat; enam jam cukup supaya guru yang membuka ulang tidak memicu AI lagi. */
const TTL_SEC = 6 * 60 * 60;

/** Cache saran AI peta bagian sulit (FR-08), dikunci SHA-256 dari isi blind spot yang dikirim ke AI. */
export class RedisCohortCache implements CohortRecommendationCache {
  constructor(
    private readonly redis: Redis,
    /** Cache opsional: gangguan Redis dicatat, saran tetap diminta ke AI. */
    private readonly onError: (err: unknown, op: 'get' | 'set') => void = () => {},
  ) {}

  private key(hash: string): string {
    if (!KEY_RE.test(hash)) throw new Error('kunci cache harus SHA-256 hex');
    // v1: naikkan versi kalau bentuk input atau output Stage 3 berubah.
    return `cohort:v1:${hash}`;
  }

  async get(hash: string): Promise<AiCohortClusterOutput | null> {
    let raw: string | null;
    try {
      raw = await this.redis.get(this.key(hash));
    } catch (err) {
      this.onError(err, 'get');
      return null;
    }
    if (raw === null) return null;
    try {
      const parsed = AiCohortClusterOutputSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async set(hash: string, value: AiCohortClusterOutput): Promise<void> {
    try {
      await this.redis.set(this.key(hash), JSON.stringify(value), 'EX', TTL_SEC);
    } catch (err) {
      this.onError(err, 'set');
    }
  }
}
