import { beforeEach, describe, expect, it } from 'vitest';
import type { ExportFilter, ExportRow, ExportUser, LedgerExportRepository } from '../../../../src/features/governance/ledgerExport.repository.js';
import { LedgerExportService } from '../../../../src/features/governance/ledgerExport.service.js';
import { toWinAnsi, type LedgerPdfInput } from '../../../../src/features/governance/ledgerPdf.js';

const USER = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-22T10:00:00Z');

function row(id: string, extra: Partial<ExportRow> = {}): ExportRow {
  return {
    submissionId: id,
    materialTitle: 'Homeostasis',
    startedAt: new Date('2026-11-22T01:00:00Z'),
    focusEndedAt: new Date('2026-11-22T01:24:00Z'),
    plannedDurationSec: 1500,
    actualDurationSec: 1440,
    validity: 'VALID',
    predictedJolScore: 80,
    actualScore: 65,
    accurateConceptsJson: [{ concept: 'Reseptor', evidenceFromHandwriting: 'x' }, 'Hipotalamus', 3],
    blindSpotsJson: [{ concept: 'Umpan balik', explanation: 'Belum ada' }, { concept: 'Efektor' }, null],
    imageStorageKey: `scans/${USER}/${id}.webp`,
    ledgerHash: id.padEnd(64, '0'),
    ...extra,
  };
}

class FakeRepo implements LedgerExportRepository {
  user: ExportUser | null = { fullName: 'Ani', tier: 'FREE', proExpiresAt: new Date(NOW.getTime() + 1000) };
  rows: ExportRow[] = [row('a'), row('b')];
  filters: { filter: ExportFilter; limit: number }[] = [];
  async getUser() {
    return this.user;
  }
  async listOwnSubmissions(_userId: string, filter: ExportFilter, limit: number) {
    this.filters.push({ filter, limit });
    return this.rows.slice(0, limit);
  }
}

describe('LedgerExportService', () => {
  let repo: FakeRepo;
  let rendered: LedgerPdfInput | null;
  let stored: { kind: string; ext: string; contentType: string }[];
  let missingPhotos: Set<string>;
  let warnings: string[];
  let service: LedgerExportService;

  beforeEach(() => {
    repo = new FakeRepo();
    rendered = null;
    stored = [];
    missingPhotos = new Set();
    warnings = [];
    service = new LedgerExportService({
      repo,
      storage: {
        getObject: async (key: string) => {
          if (missingPhotos.has(key)) throw new Error('missing');
          return Buffer.from('webp');
        },
      },
      exports: {
        storeExport: async (_userId, kind, _body, ext, contentType) => {
          stored.push({ kind, ext, contentType });
          return { url: 'https://s.test/x.pdf', expiresAt: '2026-11-23T10:00:00.000Z' };
        },
      },
      appUrl: 'https://reksa.test',
      now: () => NOW,
      onWarning: (m) => warnings.push(m),
      render: async (input) => {
        rendered = input;
        return Buffer.from('%PDF-');
      },
      toJpeg: async () => ({ jpeg: new Uint8Array([1]), width: 3, height: 4 }),
    });
  });

  it('renders the selected submissions with verify links and stores a LEDGER_PDF', async () => {
    const result = await service.create(USER, { submissionIds: ['a', 'b', 'a'] });
    expect(result).toEqual({ url: 'https://s.test/x.pdf', expiresAt: '2026-11-23T10:00:00.000Z', count: 2 });
    expect(repo.filters[0]).toEqual({ filter: { submissionIds: ['a', 'b'] }, limit: 51 });
    expect(stored).toEqual([{ kind: 'LEDGER_PDF', ext: 'pdf', contentType: 'application/pdf' }]);
    expect(rendered!.studentName).toBe('Ani');
    expect(rendered!.items[0]).toMatchObject({
      verifyUrl: `https://reksa.test/cek-bukti/${'a'.padEnd(64, '0')}`,
      accurateConcepts: ['Reseptor', 'Hipotalamus'],
      blindSpots: [
        { concept: 'Umpan balik', explanation: 'Belum ada' },
        { concept: 'Efektor', explanation: null },
      ],
      photo: { width: 3, height: 4 },
    });
  });

  it('turns a date range into WIB day bounds, end day inclusive', async () => {
    await service.create(USER, { from: '2026-11-01', to: '2026-11-03' });
    expect(repo.filters[0]!.filter).toEqual({
      from: new Date('2026-10-31T17:00:00Z'),
      to: new Date('2026-11-03T17:00:00Z'),
    });
  });

  it('rejects a reversed or over-long range', async () => {
    await expect(service.create(USER, { from: '2026-11-05', to: '2026-11-01' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.create(USER, { from: '2024-01-01', to: '2026-01-01' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('requires effective Pro', async () => {
    repo.rows = [row('a')];
    repo.user = { fullName: 'Ani', tier: 'FREE', proExpiresAt: new Date(NOW.getTime() - 1) };
    await expect(service.create(USER, { submissionIds: ['a'] })).rejects.toMatchObject({ statusCode: 403, code: 'PRO_REQUIRED' });
    repo.user = { fullName: 'Ani', tier: 'PRO', proExpiresAt: null };
    await expect(service.create(USER, { submissionIds: ['a'] })).resolves.toBeDefined();
  });

  it('rejects an unknown user', async () => {
    repo.user = null;
    await expect(service.create(USER, { submissionIds: ['a'] })).rejects.toMatchObject({ statusCode: 401 });
  });

  it('answers 404 when some ids are not found, and when a range is empty', async () => {
    repo.rows = [row('a')];
    await expect(service.create(USER, { submissionIds: ['a', 'zzz'] })).rejects.toMatchObject({ statusCode: 404 });
    repo.rows = [];
    await expect(service.create(USER, { from: '2026-11-01', to: '2026-11-02' })).rejects.toMatchObject({ statusCode: 404 });
    expect(stored).toEqual([]);
  });

  it('refuses a range with more than 50 submissions', async () => {
    repo.rows = Array.from({ length: 51 }, (_, i) => row(`r${i}`));
    await expect(service.create(USER, { from: '2026-11-01', to: '2026-11-30' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'TOO_MANY_SUBMISSIONS',
    });
  });

  it('keeps going without a photo that cannot be loaded', async () => {
    missingPhotos.add(`scans/${USER}/a.webp`);
    await service.create(USER, { submissionIds: ['a', 'b'] });
    expect(rendered!.items[0]!.photo).toBeNull();
    expect(rendered!.items[1]!.photo).not.toBeNull();
    expect(warnings).toEqual(['Foto tidak bisa dimasukkan ke PDF']);
  });
});

describe('toWinAnsi', () => {
  it('maps common typography to ASCII and replaces what the standard font cannot draw', () => {
    expect(toWinAnsi('“Umpan” – balik → efektor… ‘ok’')).toBe('"Umpan" - balik -> efektor... \'ok\'');
    expect(toWinAnsi('suhu 37°C · café')).toBe('suhu 37°C · café');
    expect(toWinAnsi('emoji 😀 dan 漢字\nbaris')).toBe('emoji ?? dan ?? baris');
  });
});
