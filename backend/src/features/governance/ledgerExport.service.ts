import sharp from 'sharp';
import { AppError, BadRequestError, NotFoundError, UnauthorizedError } from '../../common/errors/AppError.js';
import { effectiveTier } from '../../common/utils/tier.js';
import type { IStorageService } from '../../config/storage.js';
import { SCAN_MAX_IMAGE_BYTES } from '../essay-scans/scans.schema.js';
import type { ExportResult, PrivacyService } from '../privacy/privacy.service.js';
import type { ExportFilter, ExportRow, LedgerExportRepository } from './ledgerExport.repository.js';
import { renderLedgerPdf, type PdfPhoto, type PdfSubmission } from './ledgerPdf.js';

export const LEDGER_EXPORT_MAX = 50;
const DAY = 24 * 60 * 60_000;

export type LedgerExportInput = { submissionIds?: string[]; from?: string; to?: string };

export type LedgerExportServiceDeps = {
  repo: LedgerExportRepository;
  storage: Pick<IStorageService, 'getObject'>;
  exports: Pick<PrivacyService, 'storeExport'>;
  /** Asal tautan cek keaslian, mis. https://reksa.id (tanpa garis miring di akhir). */
  appUrl: string;
  now?: () => Date;
  onWarning?: (message: string, meta?: Record<string, unknown>) => void;
  render?: typeof renderLedgerPdf;
  toJpeg?: (image: Buffer) => Promise<PdfPhoto>;
};

/** Foto disimpan WebP; pdf-lib hanya menerima JPEG/PNG. Diperkecil supaya PDF 50 halaman tetap ringan. */
async function webpToJpeg(image: Buffer): Promise<PdfPhoto> {
  const { data, info } = await sharp(image, { limitInputPixels: 40_000_000 })
    .resize({ width: 900, height: 1200, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { jpeg: new Uint8Array(data), width: info.width, height: info.height };
}

/** FR-12: PDF Proof of Understanding untuk pelajar Pro, data milik sendiri saja. */
export class LedgerExportService {
  private readonly now: () => Date;

  constructor(private readonly deps: LedgerExportServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async create(userId: string, input: LedgerExportInput): Promise<ExportResult & { count: number }> {
    const now = this.now();
    const user = await this.deps.repo.getUser(userId);
    if (!user) throw new UnauthorizedError();
    if (effectiveTier(user.tier, user.proExpiresAt, now) !== 'PRO') {
      throw new AppError(403, 'PRO_REQUIRED', 'Ekspor PDF hanya untuk paket Pro.');
    }

    const filter = this.toFilter(input);
    const rows = await this.deps.repo.listOwnSubmissions(userId, filter, LEDGER_EXPORT_MAX + 1);
    if ('submissionIds' in filter) {
      // Id milik orang lain atau yang belum selesai dicek dijawab sama seperti yang tidak ada.
      if (rows.length !== filter.submissionIds.length) throw new NotFoundError('Sebagian catatan tidak ditemukan atau belum selesai dicek');
    } else {
      if (rows.length === 0) throw new NotFoundError('Tidak ada catatan yang sudah dicek di rentang tanggal ini');
      if (rows.length > LEDGER_EXPORT_MAX) {
        throw new AppError(400, 'TOO_MANY_SUBMISSIONS', `Satu PDF paling banyak ${LEDGER_EXPORT_MAX} catatan. Persempit rentang tanggalnya.`);
      }
    }

    const items: PdfSubmission[] = [];
    for (const row of rows) items.push(await this.toItem(userId, row));
    const pdf = await (this.deps.render ?? renderLedgerPdf)({ studentName: user.fullName, generatedAt: now, items });
    const stored = await this.deps.exports.storeExport(userId, 'LEDGER_PDF', pdf, 'pdf', 'application/pdf');
    return { ...stored, count: items.length };
  }

  private toFilter(input: LedgerExportInput): ExportFilter {
    if (input.submissionIds) return { submissionIds: [...new Set(input.submissionIds)] };
    const from = new Date(`${input.from}T00:00:00+07:00`);
    // `to` inklusif sampai akhir hari (WIB).
    const to = new Date(new Date(`${input.to}T00:00:00+07:00`).getTime() + DAY);
    if (!(from < to)) throw new BadRequestError('Tanggal awal harus sebelum atau sama dengan tanggal akhir');
    if (to.getTime() - from.getTime() > 366 * DAY) throw new BadRequestError('Rentang paling panjang satu tahun');
    return { from, to };
  }

  private async toItem(userId: string, row: ExportRow): Promise<PdfSubmission> {
    let photo: PdfPhoto | null = null;
    try {
      const image = await this.deps.storage.getObject(row.imageStorageKey, SCAN_MAX_IMAGE_BYTES);
      photo = await (this.deps.toJpeg ?? webpToJpeg)(image);
    } catch (err) {
      this.deps.onWarning?.('Foto tidak bisa dimasukkan ke PDF', { userId, submissionId: row.submissionId, err });
    }
    return {
      materialTitle: row.materialTitle,
      startedAt: row.startedAt,
      focusEndedAt: row.focusEndedAt,
      plannedDurationSec: row.plannedDurationSec,
      actualDurationSec: row.actualDurationSec,
      validity: row.validity,
      predictedJolScore: row.predictedJolScore,
      actualScore: row.actualScore,
      accurateConcepts: conceptsOf(row.accurateConceptsJson),
      blindSpots: blindSpotsOf(row.blindSpotsJson),
      ledgerHash: row.ledgerHash,
      verifyUrl: `${this.deps.appUrl}/cek-bukti/${row.ledgerHash}`,
      photo,
    };
  }
}

function conceptsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((e) => {
    if (typeof e === 'string') return [e];
    const concept = (e as { concept?: unknown } | null)?.concept;
    return typeof concept === 'string' ? [concept] : [];
  });
}

function blindSpotsOf(value: unknown): { concept: string; explanation: string | null }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((e) => {
    const o = e as { concept?: unknown; explanation?: unknown } | null;
    if (typeof o?.concept !== 'string') return [];
    return [{ concept: o.concept, explanation: typeof o.explanation === 'string' ? o.explanation : null }];
  });
}
