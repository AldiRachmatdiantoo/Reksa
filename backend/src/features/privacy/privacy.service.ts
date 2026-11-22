import { strToU8, zipSync, type Zippable } from 'fflate';
import { AppError, ConflictError, UnauthorizedError } from '../../common/errors/AppError.js';
import type { PasswordHasher } from '../../common/utils/passwordHasher.js';
import { buildObjectKey, SIGNED_URL_MAX_TTL_SEC, type IStorageService } from '../../config/storage.js';
import { StillReferencedError, type ExportKind, type PrivacyRepository } from './privacy.repository.js';

export type PrivacyServiceDeps = {
  repo: PrivacyRepository;
  storage: Pick<IStorageService, 'putObject' | 'getObject' | 'getSignedUrl' | 'deleteObject'>;
  hasher: Pick<PasswordHasher, 'verify'>;
  now?: () => Date;
  onWarning?: (message: string, data: Record<string, unknown>) => void;
};

export type ExportResult = { url: string; expiresAt: string };

const DAY_MS = 24 * 60 * 60_000;
/** FR-13: satu arsip per hari; file hidup 24 jam. */
export const ACCOUNT_EXPORT_COOLDOWN_MS = DAY_MS;
export const EXPORT_TTL_MS = DAY_MS;
/** Foto esai sudah dikompres saat unggah (maks. 5 MB); batas ini mencegah objek tak terduga. */
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const CLEANUP_BATCH = 100;

export class PrivacyService {
  private readonly now: () => Date;

  constructor(private readonly deps: PrivacyServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * "Unduh data saya": arsip ZIP berisi data.json (akun, kelas, materi, sesi, hasil audit, jadwal)
   * dan foto catatan. Disimpan di prefix `exports`, diberikan lewat signed URL 300 detik.
   */
  async exportAccount(userId: string): Promise<ExportResult> {
    await this.assertCooldown(userId, 'ACCOUNT', ACCOUNT_EXPORT_COOLDOWN_MS);

    const archive = await this.deps.repo.loadArchive(userId);
    if (!archive) throw new UnauthorizedError();

    const files: Zippable = {};
    const photos: Record<string, string> = {};
    for (const s of archive.submissions) {
      const ext = s.imageStorageKey.split('.').pop() ?? 'jpg';
      const name = `foto/${s.id}.${ext}`;
      try {
        files[name] = new Uint8Array(await this.deps.storage.getObject(s.imageStorageKey, MAX_PHOTO_BYTES));
        photos[s.id] = name;
      } catch (err) {
        // Satu foto hilang tidak boleh menggagalkan seluruh arsip; dicatat di data.json.
        this.deps.onWarning?.('Foto tidak bisa dimasukkan ke arsip', { userId, submissionId: s.id, err });
      }
    }

    const data = {
      exportedAt: this.now().toISOString(),
      note: 'Arsip data pribadimu dari REKSA. Foto catatan ada di folder foto/.',
      ...archive,
      submissions: archive.submissions.map(({ imageStorageKey: _key, ...rest }) => ({ ...rest, photo: photos[rest.id] ?? null })),
    };
    files['data.json'] = strToU8(JSON.stringify(data, null, 2));

    return this.storeExport(userId, 'ACCOUNT', Buffer.from(zipSync(files, { level: 6 })), 'zip', 'application/zip');
  }

  /**
   * FR-13: hapus akun beserta seluruh datanya. Wajib password; guru yang masih punya kelas beranggota
   * ditolak 409. File di storage dihapus setelah baris database terhapus (best effort, dicatat bila gagal).
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const check = await this.deps.repo.getDeletionCheck(userId);
    if (!check) throw new UnauthorizedError();
    if (!(await this.deps.hasher.verify(check.passwordHash, password))) {
      throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Kata sandi salah');
    }
    if (check.classesWithMembers > 0) {
      throw new ConflictError('Kamu masih punya kelas dengan siswa. Keluarkan siswa atau hapus kelasnya dulu.');
    }

    const keys = await this.deps.repo.listStorageKeys(userId);
    try {
      if (!(await this.deps.repo.deleteAccount(userId))) throw new UnauthorizedError();
    } catch (err) {
      if (err instanceof StillReferencedError) {
        throw new ConflictError('Materi yang kamu unggah masih dipakai di sesi siswa lain, jadi akun belum bisa dihapus.');
      }
      throw err;
    }
    await this.deleteObjects(keys, { userId });
  }

  /** Menghapus file ekspor yang sudah lewat 24 jam. Dipanggil berkala oleh server. */
  async cleanupExpiredExports(): Promise<number> {
    const rows = await this.deps.repo.listExpiredExports(this.now(), CLEANUP_BATCH);
    let removed = 0;
    for (const row of rows) {
      try {
        await this.deps.storage.deleteObject(row.storageKey);
        await this.deps.repo.deleteExport(row.id);
        removed += 1;
      } catch (err) {
        this.deps.onWarning?.('Gagal menghapus file ekspor kedaluwarsa', { exportId: row.id, err });
      }
    }
    return removed;
  }

  /** Dipakai juga oleh ekspor PDF ledger (FR-12). */
  async assertCooldown(userId: string, kind: ExportKind, cooldownMs: number): Promise<void> {
    const last = await this.deps.repo.latestExportAt(userId, kind);
    if (last && this.now().getTime() - last.getTime() < cooldownMs) {
      const retryAt = new Date(last.getTime() + cooldownMs).toISOString();
      throw new AppError(429, 'EXPORT_LIMIT', 'Arsip baru bisa dibuat lagi nanti.', { retryAt });
    }
  }

  async storeExport(userId: string, kind: ExportKind, body: Buffer, ext: 'zip' | 'pdf', contentType: string): Promise<ExportResult> {
    const key = buildObjectKey('exports', userId, ext);
    await this.deps.storage.putObject({ key, body, contentType });
    const expiresAt = new Date(this.now().getTime() + EXPORT_TTL_MS);
    try {
      await this.deps.repo.createExport({ userId, kind, storageKey: key, expiresAt });
    } catch (err) {
      await this.deleteObjects([key], { userId });
      throw err;
    }
    return {
      url: await this.deps.storage.getSignedUrl(key, { expiresInSec: SIGNED_URL_MAX_TTL_SEC, disposition: 'attachment' }),
      expiresAt: expiresAt.toISOString(),
    };
  }

  private async deleteObjects(keys: string[], context: Record<string, unknown>): Promise<void> {
    for (const key of keys) {
      await this.deps.storage.deleteObject(key).catch((err: unknown) => {
        this.deps.onWarning?.('Gagal menghapus file storage', { ...context, key, err });
      });
    }
  }
}
