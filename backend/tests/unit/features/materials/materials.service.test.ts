import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAiProvider } from '../../../../src/common/ai/mockAi.provider.js';
import type { AiRubricOutput } from '../../../../src/common/ai/ai.schema.js';
import {
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
  UnsupportedMediaTypeError,
} from '../../../../src/common/errors/AppError.js';
import { PdfTooManyPagesError, type PdfTextExtractor } from '../../../../src/common/utils/pdfText.js';
import type { IStorageService } from '../../../../src/config/storage.js';
import type {
  CreateMaterialData,
  MaterialRecord,
  MaterialsRepository,
} from '../../../../src/features/materials/materials.repository.js';
import {
  MaterialsService,
  normalizeMaterialText,
  sha256Hex,
} from '../../../../src/features/materials/materials.service.js';
import type { RubricCache } from '../../../../src/features/materials/rubricCache.js';
import { buildPdf, SAMPLE_PDF_TEXT } from '../../../support/pdfFixture.js';

class InMemoryMaterialsRepository implements MaterialsRepository {
  rows: MaterialRecord[] = [];
  classes: { id: string; educatorId: string }[] = [];
  failNextCreate = false;
  usedInSession = new Set<string>();

  async isClassOwnedBy(classId: string, userId: string) {
    return this.classes.some((c) => c.id === classId && c.educatorId === userId);
  }
  async create(userId: string, data: CreateMaterialData) {
    if (this.failNextCreate) throw new Error('db down');
    const row: MaterialRecord = {
      id: randomUUID(),
      uploaderId: userId,
      classId: data.classId,
      title: data.title,
      contentHash: data.contentHash,
      storageKey: data.storageKey,
      extractedRubricJson: structuredClone(data.rubric),
      createdAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }
  async listByOwner(userId: string, limit: number) {
    return this.rows.filter((r) => r.uploaderId === userId).slice(0, limit);
  }
  async findByIdForOwner(userId: string, id: string) {
    return this.rows.find((r) => r.id === id && r.uploaderId === userId) ?? null;
  }
  async deleteForOwner(userId: string, id: string) {
    const row = await this.findByIdForOwner(userId, id);
    if (!row) return null;
    if (this.usedInSession.has(id)) throw new ConflictError('dipakai');
    this.rows = this.rows.filter((r) => r !== row);
    return row;
  }
}

class MapCache implements RubricCache {
  map = new Map<string, AiRubricOutput>();
  async get(hash: string) {
    return this.map.get(hash) ?? null;
  }
  async set(hash: string, rubric: AiRubricOutput) {
    this.map.set(hash, rubric);
  }
}

function fakeStorage() {
  const objects = new Map<string, Buffer>();
  const storage: IStorageService = {
    putObject: vi.fn(async ({ key, body }) => void objects.set(key, body)),
    getSignedUrl: vi.fn(async (key: string) => `https://storage.test/${key}?sig=1`),
    deleteObject: vi.fn(async (key: string) => void objects.delete(key)),
    checkConnection: vi.fn(async () => undefined),
  };
  return { storage, objects };
}

const user = randomUUID();
const other = randomUUID();
const textInput = { title: 'Homeostasis', content: 'Homeostasis menjaga suhu tubuh tetap stabil lewat umpan balik negatif.' };

describe('MaterialsService', () => {
  let repo: InMemoryMaterialsRepository;
  let cache: MapCache;
  let ai: MockAiProvider;
  let store: ReturnType<typeof fakeStorage>;
  let pdf: PdfTextExtractor;
  let service: MaterialsService;

  beforeEach(() => {
    repo = new InMemoryMaterialsRepository();
    cache = new MapCache();
    ai = new MockAiProvider({ latencyMs: 0 });
    vi.spyOn(ai, 'extractRubric');
    store = fakeStorage();
    pdf = { extract: vi.fn(async () => ({ text: SAMPLE_PDF_TEXT, pages: 1 })) };
    service = new MaterialsService({ repo, ai, cache, storage: store.storage, pdf });
  });

  describe('createFromText', () => {
    it('extracts a rubric on a cache miss and stores the SHA-256 of the normalized text', async () => {
      const { material, rubricCached } = await service.createFromText(user, textInput);

      expect(rubricCached).toBe(false);
      expect(ai.extractRubric).toHaveBeenCalledOnce();
      expect(material).toMatchObject({ title: 'Homeostasis', source: 'TEXT', classId: null });
      expect(material.rubric.keyConcepts.length).toBeGreaterThan(0);
      expect(repo.rows[0]?.contentHash).toBe(sha256Hex(normalizeMaterialText(textInput.content)));
      expect(store.storage.putObject).not.toHaveBeenCalled();
    });

    it('reuses the cached rubric for the same content, even with different whitespace', async () => {
      await service.createFromText(user, textInput);
      const second = await service.createFromText(other, {
        title: 'Salinan',
        content: `  ${textInput.content.replace(/ /g, '   ')}\r\n\r\n\r\n`,
      });

      expect(second.rubricCached).toBe(true);
      expect(ai.extractRubric).toHaveBeenCalledOnce();
    });

    it('rejects a classId the user does not own, without revealing whether it exists', async () => {
      const classId = randomUUID();
      repo.classes.push({ id: classId, educatorId: other });

      await expect(service.createFromText(user, { ...textInput, classId })).rejects.toBeInstanceOf(NotFoundError);
      expect(repo.rows).toHaveLength(0);
      expect(ai.extractRubric).not.toHaveBeenCalled();
    });

    it('accepts a classId owned by the educator', async () => {
      const classId = randomUUID();
      repo.classes.push({ id: classId, educatorId: user });
      const { material } = await service.createFromText(user, { ...textInput, classId });
      expect(material.classId).toBe(classId);
    });

    it('re-validates the AI output and refuses an invalid rubric', async () => {
      vi.mocked(ai.extractRubric).mockResolvedValueOnce({ materialTitle: '' } as AiRubricOutput);
      await expect(service.createFromText(user, textInput)).rejects.toThrow();
      expect(repo.rows).toHaveLength(0);
      expect(cache.map.size).toBe(0);
    });
  });

  describe('createFromPdf', () => {
    const fields = { title: 'Bab 3' };
    const realPdf = () => {
      const buffer = buildPdf([SAMPLE_PDF_TEXT]);
      return { buffer, size: buffer.length };
    };

    it('stores the PDF under a server-built key and saves the material', async () => {
      const { material } = await service.createFromPdf(user, fields, realPdf());

      expect(material.source).toBe('PDF');
      const key = repo.rows[0]?.storageKey ?? '';
      expect(key).toMatch(new RegExp(`^materials/${user}/[0-9a-f-]{36}\\.pdf$`));
      expect(store.objects.has(key)).toBe(true);
      expect(store.storage.putObject).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'application/pdf' }));
    });

    it('rejects a file whose bytes are not a PDF (spoofed name or Content-Type)', async () => {
      const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
      await expect(service.createFromPdf(user, fields, { buffer: png, size: png.length })).rejects.toBeInstanceOf(
        UnsupportedMediaTypeError,
      );
      const text = Buffer.from('ini cuma teks biasa, bukan pdf');
      await expect(service.createFromPdf(user, fields, { buffer: text, size: text.length })).rejects.toBeInstanceOf(
        UnsupportedMediaTypeError,
      );
      expect(store.storage.putObject).not.toHaveBeenCalled();
    });

    it('returns 422 for a PDF without readable text', async () => {
      vi.mocked(pdf.extract).mockResolvedValueOnce({ text: '   \n ', pages: 3 });
      await expect(service.createFromPdf(user, fields, realPdf())).rejects.toBeInstanceOf(UnprocessableEntityError);
    });

    it('returns 422 for a broken, locked, or oversized PDF', async () => {
      vi.mocked(pdf.extract).mockRejectedValueOnce(new Error('PasswordException'));
      await expect(service.createFromPdf(user, fields, realPdf())).rejects.toBeInstanceOf(UnprocessableEntityError);
      vi.mocked(pdf.extract).mockRejectedValueOnce(new PdfTooManyPagesError(900));
      await expect(service.createFromPdf(user, fields, realPdf())).rejects.toThrow(/halaman/);
    });

    it('deletes the uploaded file when the database insert fails', async () => {
      repo.failNextCreate = true;
      await expect(service.createFromPdf(user, fields, realPdf())).rejects.toThrow('db down');
      expect(store.storage.deleteObject).toHaveBeenCalledOnce();
      expect(store.objects.size).toBe(0);
    });
  });

  describe('reading and deleting (anti-IDOR)', () => {
    it("lists only the user's own materials with a concept count", async () => {
      await service.createFromText(user, textInput);
      await service.createFromText(other, { ...textInput, title: 'Milik orang lain' });

      const list = await service.list(user);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ title: 'Homeostasis', conceptCount: expect.any(Number) });
      expect(list[0]).not.toHaveProperty('rubric');
    });

    it("returns 404 for someone else's material on get, file URL, and delete", async () => {
      const { material } = await service.createFromPdf(user, { title: 'A' }, { buffer: buildPdf([SAMPLE_PDF_TEXT]), size: 1 });

      await expect(service.get(other, material.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.getFileUrl(other, material.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.delete(other, material.id)).rejects.toBeInstanceOf(NotFoundError);
      expect(repo.rows).toHaveLength(1);
    });

    it('signs a 300-second URL only for PDF materials', async () => {
      const pdfMaterial = await service.createFromPdf(user, { title: 'A' }, { buffer: buildPdf([SAMPLE_PDF_TEXT]), size: 1 });
      const textMaterial = await service.createFromText(user, textInput);

      await expect(service.getFileUrl(user, pdfMaterial.material.id)).resolves.toMatchObject({ expiresInSec: 300 });
      await expect(service.getFileUrl(user, textMaterial.material.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('deletes the row and its file', async () => {
      const { material } = await service.createFromPdf(user, { title: 'A' }, { buffer: buildPdf([SAMPLE_PDF_TEXT]), size: 1 });
      await service.delete(user, material.id);
      expect(repo.rows).toHaveLength(0);
      expect(store.objects.size).toBe(0);
    });

    it('refuses to delete a material that is used by a session', async () => {
      const { material } = await service.createFromText(user, textInput);
      repo.usedInSession.add(material.id);
      await expect(service.delete(user, material.id)).rejects.toBeInstanceOf(ConflictError);
    });
  });
});

describe('normalizeMaterialText', () => {
  it('collapses spaces and blank lines but keeps paragraphs', () => {
    expect(normalizeMaterialText('  a   b\r\n\r\n\r\n\tc  ')).toBe('a b\n\nc');
  });
});
