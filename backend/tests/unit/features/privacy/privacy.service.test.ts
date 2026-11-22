import { strFromU8, unzipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  StillReferencedError,
  type AccountArchive,
  type ExportKind,
  type ExportRow,
  type PrivacyRepository,
} from '../../../../src/features/privacy/privacy.repository.js';
import { PrivacyService } from '../../../../src/features/privacy/privacy.service.js';

const USER = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-22T10:00:00Z');

function archive(photoKeys: string[] = []): AccountArchive {
  return {
    account: {
      id: USER,
      email: 'a@reksa.id',
      fullName: 'A',
      role: 'STUDENT',
      birthYear: 2000,
      termsVersion: 'v',
      privacyVersion: 'v',
      consentedAt: NOW,
      guardianConsent: false,
      proExpiresAt: null,
      emailVerifiedAt: null,
      createdAt: NOW,
    },
    classes: [],
    materials: [],
    sessions: [],
    submissions: photoKeys.map((key, i) => ({
      id: `sub-${i}`,
      sessionId: `ses-${i}`,
      predictedJolScore: 50,
      actualAiScore: 60,
      accurateConcepts: [],
      blindSpots: [],
      logicCorrections: [],
      encouragingSummary: null,
      ledgerHash: null,
      auditStatus: 'DONE',
      createdAt: NOW,
      auditedAt: NOW,
      imageStorageKey: key,
    })),
    schedules: [],
  };
}

class FakeRepo implements PrivacyRepository {
  exports: (ExportRow & { kind: ExportKind; createdAt: Date })[] = [];
  data: AccountArchive | null = archive();
  check: { passwordHash: string; role: string; classesWithMembers: number } | null = {
    passwordHash: 'hashed:Benar123',
    role: 'STUDENT',
    classesWithMembers: 0,
  };
  keys: string[] = [];
  deleted = false;
  deleteError: Error | null = null;

  async latestExportAt(userId: string, kind: ExportKind) {
    return this.exports.filter((e) => e.userId === userId && e.kind === kind).at(-1)?.createdAt ?? null;
  }
  async createExport(data: { userId: string; kind: ExportKind; storageKey: string; expiresAt: Date }) {
    this.exports.push({ id: `e${this.exports.length}`, createdAt: NOW, ...data });
  }
  async listExpiredExports(now: Date) {
    return this.exports.filter((e) => e.expiresAt <= now);
  }
  async deleteExport(id: string) {
    this.exports = this.exports.filter((e) => e.id !== id);
  }
  async loadArchive() {
    return this.data;
  }
  async getDeletionCheck() {
    return this.check;
  }
  async listStorageKeys() {
    return this.keys;
  }
  async deleteAccount() {
    if (this.deleteError) throw this.deleteError;
    this.deleted = true;
    return true;
  }
}

class FakeStorage {
  objects = new Map<string, Buffer>();
  deletedKeys: string[] = [];
  failDelete = false;
  async putObject(input: { key: string; body: Buffer }) {
    this.objects.set(input.key, input.body);
  }
  async getObject(key: string) {
    const obj = this.objects.get(key);
    if (!obj) throw new Error('missing');
    return obj;
  }
  async getSignedUrl(key: string) {
    return `https://storage.test/${key}?X-Amz-Expires=300`;
  }
  async deleteObject(key: string) {
    if (this.failDelete) throw new Error('storage down');
    this.deletedKeys.push(key);
    this.objects.delete(key);
  }
}

const hasher = { verify: async (hash: string, pw: string) => hash === `hashed:${pw}` };

describe('PrivacyService', () => {
  let repo: FakeRepo;
  let storage: FakeStorage;
  let now: Date;
  let warnings: string[];
  let service: PrivacyService;

  beforeEach(() => {
    repo = new FakeRepo();
    storage = new FakeStorage();
    now = NOW;
    warnings = [];
    service = new PrivacyService({ repo, storage, hasher, now: () => now, onWarning: (m) => warnings.push(m) });
  });

  describe('exportAccount', () => {
    it('zips data.json plus photos and stores it under exports/ for 24 hours', async () => {
      storage.objects.set('scans/x/a.jpg', Buffer.from('foto'));
      repo.data = archive(['scans/x/a.jpg']);

      const result = await service.exportAccount(USER);
      expect(result.expiresAt).toBe('2026-11-23T10:00:00.000Z');
      const stored = repo.exports[0]!;
      expect(stored.storageKey).toMatch(new RegExp(`^exports/${USER}/[0-9a-f-]{36}\\.zip$`));
      expect(result.url).toContain(stored.storageKey);

      const zip = unzipSync(new Uint8Array(storage.objects.get(stored.storageKey)!));
      expect(strFromU8(zip['foto/sub-0.jpg']!)).toBe('foto');
      const data = JSON.parse(strFromU8(zip['data.json']!));
      expect(data.submissions[0].photo).toBe('foto/sub-0.jpg');
      expect(data.submissions[0].imageStorageKey).toBeUndefined();
    });

    it('keeps going when a photo is missing and notes it as null', async () => {
      repo.data = archive(['scans/x/hilang.jpg']);
      await service.exportAccount(USER);
      const zip = unzipSync(new Uint8Array(storage.objects.get(repo.exports[0]!.storageKey)!));
      expect(JSON.parse(strFromU8(zip['data.json']!)).submissions[0].photo).toBeNull();
      expect(warnings).toContain('Foto tidak bisa dimasukkan ke arsip');
    });

    it('allows one archive per 24 hours', async () => {
      await service.exportAccount(USER);
      now = new Date(NOW.getTime() + 23 * 60 * 60_000);
      await expect(service.exportAccount(USER)).rejects.toMatchObject({
        statusCode: 429,
        code: 'EXPORT_LIMIT',
        details: { retryAt: '2026-11-23T10:00:00.000Z' },
      });
      now = new Date(NOW.getTime() + 24 * 60 * 60_000);
      await expect(service.exportAccount(USER)).resolves.toBeDefined();
    });

    it('rejects an unknown user', async () => {
      repo.data = null;
      await expect(service.exportAccount(USER)).rejects.toMatchObject({ statusCode: 401 });
    });

    it('removes the uploaded file if the database row cannot be written', async () => {
      repo.createExport = async () => {
        throw new Error('db down');
      };
      await expect(service.exportAccount(USER)).rejects.toThrow('db down');
      expect(storage.objects.size).toBe(0);
    });
  });

  describe('deleteAccount', () => {
    it('verifies the password, deletes the rows, then the files', async () => {
      repo.keys = ['scans/x/a.jpg', 'exports/x/b.zip'];
      await service.deleteAccount(USER, 'Benar123');
      expect(repo.deleted).toBe(true);
      expect(storage.deletedKeys).toEqual(['scans/x/a.jpg', 'exports/x/b.zip']);
    });

    it('rejects a wrong password with 400 and deletes nothing', async () => {
      await expect(service.deleteAccount(USER, 'Salah')).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_CURRENT_PASSWORD' });
      expect(repo.deleted).toBe(false);
    });

    it('refuses an educator with populated classes (409)', async () => {
      repo.check = { passwordHash: 'hashed:Benar123', role: 'EDUCATOR', classesWithMembers: 2 };
      await expect(service.deleteAccount(USER, 'Benar123')).rejects.toMatchObject({ statusCode: 409 });
      expect(repo.deleted).toBe(false);
    });

    it('turns a still-referenced material into 409 and keeps the files', async () => {
      repo.keys = ['materials/x/a.pdf'];
      repo.deleteError = new StillReferencedError();
      await expect(service.deleteAccount(USER, 'Benar123')).rejects.toMatchObject({ statusCode: 409 });
      expect(storage.deletedKeys).toEqual([]);
    });

    it('still succeeds when storage cleanup fails, and logs it', async () => {
      repo.keys = ['scans/x/a.jpg'];
      storage.failDelete = true;
      await service.deleteAccount(USER, 'Benar123');
      expect(repo.deleted).toBe(true);
      expect(warnings).toContain('Gagal menghapus file storage');
    });

    it('rejects an unknown user', async () => {
      repo.check = null;
      await expect(service.deleteAccount(USER, 'Benar123')).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  describe('cleanupExpiredExports', () => {
    it('deletes only expired files and rows, and keeps rows whose file could not be deleted', async () => {
      repo.exports = [
        { id: 'old', userId: USER, kind: 'ACCOUNT', storageKey: 'exports/x/old.zip', expiresAt: new Date(NOW.getTime() - 1), createdAt: NOW },
        { id: 'new', userId: USER, kind: 'ACCOUNT', storageKey: 'exports/x/new.zip', expiresAt: new Date(NOW.getTime() + 1), createdAt: NOW },
      ];
      expect(await service.cleanupExpiredExports()).toBe(1);
      expect(repo.exports.map((e) => e.id)).toEqual(['new']);

      now = new Date(NOW.getTime() + 10);
      storage.failDelete = true;
      expect(await service.cleanupExpiredExports()).toBe(0);
      expect(repo.exports.map((e) => e.id)).toEqual(['new']);
    });
  });
});
