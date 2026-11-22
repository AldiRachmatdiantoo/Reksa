import { AiProviderError } from './ai.errors.js';

// Klien REST kecil untuk Google Gemini `generateContent` dengan structured JSON output (PRD §5.1).
// Tanpa SDK: tidak ada dependency baru, `fetch` bisa disuntikkan di test, dan batas waktu dikendalikan
// lewat AbortSignal. Dipakai Stage 2 (Adli) dan bisa dipakai Stage 1/3 (Aldi).

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Subset OpenAPI yang diterima `responseSchema` Gemini. */
export type GeminiSchema =
  | { type: 'STRING'; enum?: string[]; description?: string }
  | { type: 'INTEGER' | 'NUMBER' | 'BOOLEAN'; description?: string }
  | { type: 'ARRAY'; items: GeminiSchema; description?: string }
  | {
      type: 'OBJECT';
      properties: Record<string, GeminiSchema>;
      required?: string[];
      propertyOrdering?: string[];
      description?: string;
    };

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export type GenerateJsonRequest = {
  model: string;
  /** Otoritas tertinggi: aturan penilaian dan pertahanan prompt injection. */
  systemInstruction: string;
  /** Data dari pengguna (rubrik, foto). Tidak pernah digabung ke systemInstruction. */
  parts: GeminiPart[];
  responseSchema: GeminiSchema;
  temperature?: number;
  maxOutputTokens?: number;
};

export type GeminiClientOptions = {
  apiKey: string;
  fetch?: typeof fetch;
  /** Batas waktu satu permintaan; AuditService juga membatasi 60 detik dari luar. */
  timeoutMs?: number;
  baseUrl?: string;
};

type GenerateContentResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

const MODEL_PATTERN = /^[a-z0-9.-]{1,64}$/;
/** Isi error 429 dibaca sebatas ini, hanya untuk mengenali kuota harian. */
const ERROR_BODY_MAX_CHARS = 16_384;

/**
 * 429 karena kuota HARIAN (quotaId `...PerDay...`) tidak pulih dalam hitungan detik, beda dengan batas per menit.
 * Hanya pola quotaId yang diperiksa; isi respons tidak pernah dimasukkan ke pesan error atau log.
 */
export function isDailyQuotaBody(body: string): boolean {
  return /"quotaId"\s*:\s*"[A-Za-z]*PerDay/.test(body.slice(0, ERROR_BODY_MAX_CHARS));
}

export class GeminiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(private readonly options: GeminiClientOptions) {
    if (!options.apiKey) throw new Error('GEMINI_API_KEY kosong');
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 55_000;
    this.baseUrl = options.baseUrl ?? GEMINI_API_BASE;
  }

  /**
   * Mengembalikan objek JSON hasil model (belum divalidasi Zod; pemanggil wajib memvalidasi).
   * Error dipetakan ke AiProviderError: 429/5xx/jaringan/timeout → TRANSIENT, 400/401/403/404 → FATAL,
   * diblokir/terpotong/bukan JSON → INVALID_OUTPUT. Pesan error tidak pernah memuat API key atau isi permintaan.
   */
  async generateJson(request: GenerateJsonRequest): Promise<unknown> {
    if (!MODEL_PATTERN.test(request.model)) throw new AiProviderError('FATAL', 'Nama model Gemini tidak valid');

    const body = {
      systemInstruction: { parts: [{ text: request.systemInstruction }] },
      contents: [{ role: 'user', parts: request.parts }],
      generationConfig: {
        temperature: request.temperature ?? 0,
        maxOutputTokens: request.maxOutputTokens ?? 4096,
        responseMimeType: 'application/json',
        responseSchema: request.responseSchema,
      },
    };

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/models/${request.model}:generateContent`, {
        method: 'POST',
        // API key di header, bukan query string, supaya tidak tercatat di log URL mana pun.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.options.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new AiProviderError('TRANSIENT', 'Gemini tidak bisa dihubungi atau melewati batas waktu', { cause: err });
    }

    if (!res.ok) {
      // Isi respons error tidak dibaca ke pesan: bisa memuat potongan permintaan.
      if (res.status === 402) throw new AiProviderError('QUOTA_EXHAUSTED', 'Saldo prabayar Gemini habis (HTTP 402)');
      if (res.status === 429) {
        const body = await res.text().catch(() => '');
        if (isDailyQuotaBody(body)) throw new AiProviderError('QUOTA_EXHAUSTED', 'Kuota harian Gemini habis (HTTP 429)');
        throw new AiProviderError('TRANSIENT', 'Gemini menjawab HTTP 429');
      }
      await res.body?.cancel().catch(() => {});
      const retryable = res.status === 408 || res.status >= 500;
      throw new AiProviderError(retryable ? 'TRANSIENT' : 'FATAL', `Gemini menjawab HTTP ${res.status}`);
    }

    let payload: GenerateContentResponse;
    try {
      payload = (await res.json()) as GenerateContentResponse;
    } catch (err) {
      throw new AiProviderError('INVALID_OUTPUT', 'Respons Gemini bukan JSON', { cause: err });
    }

    if (payload.promptFeedback?.blockReason) {
      throw new AiProviderError('INVALID_OUTPUT', `Permintaan diblokir Gemini (${payload.promptFeedback.blockReason})`);
    }
    const candidate = payload.candidates?.[0];
    if (!candidate) throw new AiProviderError('INVALID_OUTPUT', 'Gemini tidak mengembalikan kandidat');
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      throw new AiProviderError('INVALID_OUTPUT', `Gemini berhenti dengan alasan ${candidate.finishReason}`);
    }
    const text = (candidate.content?.parts ?? []).map((p) => p.text ?? '').join('');
    try {
      return JSON.parse(text) as unknown;
    } catch (err) {
      throw new AiProviderError('INVALID_OUTPUT', 'Isi jawaban Gemini bukan JSON yang valid', { cause: err });
    }
  }
}
