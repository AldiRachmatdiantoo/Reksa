import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import type { IAiService } from '../../common/ai/ai.provider.interface.js';
import { AiRubricOutputSchema, type AiRubricOutput } from '../../common/ai/ai.schema.js';
import {
  NotFoundError,
  UnprocessableEntityError,
  UnsupportedMediaTypeError,
} from '../../common/errors/AppError.js';
import { PdfTooManyPagesError, type PdfTextExtractor } from '../../common/utils/pdfText.js';
import { buildObjectKey, SIGNED_URL_MAX_TTL_SEC, type IStorageService } from '../../config/storage.js';
import type { MaterialRecord, MaterialsRepository } from './materials.repository.js';
import {
  MATERIAL_LIST_LIMIT,
  MATERIAL_MAX_PDF_TEXT_CHARS,
  MATERIAL_MIN_TEXT_CHARS,
  type CreatePdfMaterialFields,
  type CreateTextMaterialInput,
  type MaterialSummaryView,
  type MaterialView,
} from './materials.schema.js';
import type { RubricCache } from './rubricCache.js';

export type MaterialsServiceDeps = {
  repo: MaterialsRepository;
  ai: IAiService;
  cache: RubricCache;
  storage: IStorageService;
  pdf: PdfTextExtractor;
  onWarning?: (message: string, data: Record<string, unknown>) => void;
};

export type UploadedPdf = { buffer: Buffer; size: number };

export type CreateMaterialResult = { material: MaterialView; rubricCached: boolean };

/**
 * Teks dinormalisasi sebelum di-hash supaya materi yang sama (beda spasi/baris kosong,
 * atau sama-sama dari PDF dan tempel teks) memakai satu entri cache rubrik.
 */
export function normalizeMaterialText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export class MaterialsService {
  constructor(private readonly deps: MaterialsServiceDeps) {}

  async createFromText(userId: string, input: CreateTextMaterialInput): Promise<CreateMaterialResult> {
    await this.assertClassAccess(userId, input.classId);
    const text = normalizeMaterialText(input.content);
    if (text.length === 0) throw new UnprocessableEntityError('Isi materi kosong');
    const contentHash = sha256Hex(text);
    const { rubric, cached } = await this.getRubric(contentHash, text);

    const record = await this.deps.repo.create(userId, {
      classId: input.classId ?? null,
      title: input.title,
      contentHash,
      storageKey: null,
      rubric,
    });
    return { material: toView(record, userId), rubricCached: cached };
  }

  async createFromPdf(userId: string, fields: CreatePdfMaterialFields, file: UploadedPdf): Promise<CreateMaterialResult> {
    await this.assertClassAccess(userId, fields.classId);

    // Nama file dan Content-Type dari klien tidak dipercaya; yang menentukan isi byte-nya.
    const detected = await fileTypeFromBuffer(file.buffer);
    if (detected?.mime !== 'application/pdf') {
      throw new UnsupportedMediaTypeError('File harus PDF asli. Ubah nama file saja tidak cukup.');
    }

    const text = normalizeMaterialText(await this.extractPdfText(file.buffer));
    if (text.length < MATERIAL_MIN_TEXT_CHARS) {
      throw new UnprocessableEntityError(
        'PDF ini tidak berisi teks yang bisa dibaca, mungkin hasil scan foto. Salin isinya lalu kirim sebagai materi teks.',
      );
    }
    if (text.length > MATERIAL_MAX_PDF_TEXT_CHARS) {
      throw new UnprocessableEntityError('PDF terlalu panjang. Unggah per bab supaya rubriknya lebih tajam.');
    }

    const contentHash = sha256Hex(text);
    const { rubric, cached } = await this.getRubric(contentHash, text);

    const storageKey = buildObjectKey('materials', userId, 'pdf');
    await this.deps.storage.putObject({ key: storageKey, body: file.buffer, contentType: 'application/pdf' });

    let record: MaterialRecord;
    try {
      record = await this.deps.repo.create(userId, {
        classId: fields.classId ?? null,
        title: fields.title,
        contentHash,
        storageKey,
        rubric,
      });
    } catch (err) {
      // Jangan tinggalkan file yatim di bucket kalau baris database gagal dibuat.
      await this.deps.storage.deleteObject(storageKey).catch((cleanupErr: unknown) => {
        this.deps.onWarning?.('Gagal menghapus file materi setelah insert gagal', { storageKey, cleanupErr });
      });
      throw err;
    }
    return { material: toView(record, userId), rubricCached: cached };
  }

  async list(userId: string): Promise<MaterialSummaryView[]> {
    const records = await this.deps.repo.listAccessible(userId, MATERIAL_LIST_LIMIT);
    return records.map((r) => {
      const { rubric, ...view } = toView(r, userId);
      return { ...view, conceptCount: rubric.keyConcepts.length };
    });
  }

  async get(userId: string, id: string): Promise<MaterialView> {
    const record = await this.deps.repo.findByIdAccessible(userId, id);
    if (!record) throw new NotFoundError('Materi tidak ditemukan');
    return toView(record, userId);
  }

  /** Signed URL berumur pendek untuk membuka PDF asli (pemilik atau anggota kelas). Materi teks tidak punya file. */
  async getFileUrl(userId: string, id: string): Promise<{ url: string; expiresInSec: number }> {
    const record = await this.deps.repo.findByIdAccessible(userId, id);
    if (!record?.storageKey) throw new NotFoundError('File materi tidak ditemukan');
    const url = await this.deps.storage.getSignedUrl(record.storageKey, { expiresInSec: SIGNED_URL_MAX_TTL_SEC });
    return { url, expiresInSec: SIGNED_URL_MAX_TTL_SEC };
  }

  async delete(userId: string, id: string): Promise<void> {
    const deleted = await this.deps.repo.deleteForOwner(userId, id);
    if (!deleted) throw new NotFoundError('Materi tidak ditemukan');
    if (deleted.storageKey) {
      await this.deps.storage.deleteObject(deleted.storageKey).catch((err: unknown) => {
        this.deps.onWarning?.('Gagal menghapus file materi dari storage', { storageKey: deleted.storageKey, err });
      });
    }
  }

  private async assertClassAccess(userId: string, classId: string | undefined): Promise<void> {
    if (classId === undefined) return;
    // Tanpa cek ini, siapa pun bisa menyisipkan materi ke kelas orang lain (dan terbaca oleh
    // anggotanya lewat policy RLS materials_class_read). 404, bukan 403: jangan bocorkan keberadaan kelas.
    if (!(await this.deps.repo.isClassOwnedBy(classId, userId))) {
      throw new NotFoundError('Kelas tidak ditemukan');
    }
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      return (await this.deps.pdf.extract(buffer)).text;
    } catch (err) {
      if (err instanceof PdfTooManyPagesError) {
        throw new UnprocessableEntityError('PDF terlalu banyak halaman. Unggah per bab.');
      }
      throw new UnprocessableEntityError('PDF tidak bisa dibuka. Pastikan file tidak rusak dan tidak dikunci kata sandi.');
    }
  }

  private async getRubric(contentHash: string, text: string): Promise<{ rubric: AiRubricOutput; cached: boolean }> {
    const hit = await this.deps.cache.get(contentHash);
    if (hit) return { rubric: hit, cached: true };
    // Output AI divalidasi ulang di sini juga: provider apa pun tidak dipercaya begitu saja.
    const rubric = AiRubricOutputSchema.parse(await this.deps.ai.extractRubric(text));
    await this.deps.cache.set(contentHash, rubric);
    return { rubric, cached: false };
  }
}

function toView(record: MaterialRecord, viewerId: string): MaterialView {
  return {
    id: record.id,
    title: record.title,
    classId: record.classId,
    className: record.className,
    isOwner: record.uploaderId === viewerId,
    source: record.storageKey ? 'PDF' : 'TEXT',
    createdAt: record.createdAt.toISOString(),
    rubric: AiRubricOutputSchema.parse(record.extractedRubricJson),
  };
}
