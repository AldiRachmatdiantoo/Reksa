import type { Redis } from 'ioredis';
import { AiRubricOutputSchema, type AiRubricOutput } from '../../common/ai/ai.schema.js';

/**
 * Cache rubrik per SHA-256 isi materi (PRD §6, FR-01): materi yang sama tidak diekstrak ulang
 * oleh AI, berapa pun user yang mengunggahnya. Kuncinya hash isi, jadi tidak membocorkan siapa
 * pengunggahnya.
 */
export interface RubricCache {
  get(contentHash: string): Promise<AiRubricOutput | null>;
  set(contentHash: string, rubric: AiRubricOutput): Promise<void>;
}

const TTL_SEC = 30 * 24 * 60 * 60;
const HASH_RE = /^[0-9a-f]{64}$/;

export class RedisRubricCache implements RubricCache {
  constructor(
    private readonly redis: Redis,
    /** Cache bersifat opsional: gangguan Redis dicatat, upload tetap jalan lewat AI. */
    private readonly onError: (err: unknown, op: 'get' | 'set') => void = () => {},
  ) {}

  private key(contentHash: string): string {
    if (!HASH_RE.test(contentHash)) throw new Error('contentHash harus SHA-256 hex');
    // v1: naikkan versi kalau skema rubrik berubah, supaya cache lama tidak terbaca.
    return `rubric:v1:${contentHash}`;
  }

  async get(contentHash: string): Promise<AiRubricOutput | null> {
    let raw: string | null;
    try {
      raw = await this.redis.get(this.key(contentHash));
    } catch (err) {
      this.onError(err, 'get');
      return null;
    }
    if (raw === null) return null;
    // Isi cache tetap divalidasi ulang: data rusak diperlakukan sebagai cache miss.
    try {
      const parsed = AiRubricOutputSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async set(contentHash: string, rubric: AiRubricOutput): Promise<void> {
    try {
      await this.redis.set(this.key(contentHash), JSON.stringify(rubric), 'EX', TTL_SEC);
    } catch (err) {
      this.onError(err, 'set');
    }
  }
}
