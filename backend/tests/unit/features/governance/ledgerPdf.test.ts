import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { renderLedgerPdf, type PdfSubmission } from '../../../../src/features/governance/ledgerPdf.js';

const HASH = 'ab'.repeat(32);
const VERIFY_URL = `https://reksa.test/cek-bukti/${HASH}`;

function submission(extra: Partial<PdfSubmission> = {}): PdfSubmission {
  return {
    materialTitle: 'Homeostasis',
    startedAt: new Date('2026-11-22T01:00:00Z'),
    focusEndedAt: new Date('2026-11-22T01:24:00Z'),
    plannedDurationSec: 1500,
    actualDurationSec: 1440,
    validity: 'VALID',
    predictedJolScore: 80,
    actualScore: 65,
    accurateConcepts: ['Reseptor'],
    blindSpots: [{ concept: 'Umpan balik', explanation: 'Belum ada' }],
    ledgerHash: HASH,
    verifyUrl: VERIFY_URL,
    photo: null,
    ...extra,
  };
}

/** Baris teks yang digambar di setiap halaman, dibaca dari content stream (pdf-lib menulisnya sebagai `<hex> Tj`). */
async function readPdf(bytes: Buffer) {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages().map((page) => {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
    const source = streams.map((s) => Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString('latin1')).join('\n');
    const lines = [...source.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)].map((m) => Buffer.from(m[1]!, 'hex').toString('latin1'));
    const links = (page.node.Annots()?.asArray() ?? []).map((ref) => {
      const action = (doc.context.lookup(ref) as PDFDict).lookup(PDFName.of('A'), PDFDict);
      return action.lookup(PDFName.of('URI'), PDFString).decodeText();
    });
    return { lines, links };
  });
  return { doc, pages };
}

describe('renderLedgerPdf', () => {
  it('writes one section per submission with the session facts, photo, concepts, and a verify link on every page', async () => {
    const jpeg = await sharp({ create: { width: 30, height: 40, channels: 3, background: '#888888' } })
      .jpeg()
      .toBuffer();
    const bytes = await renderLedgerPdf({
      studentName: 'Ani “Rahma”',
      generatedAt: new Date('2026-11-22T03:00:00Z'),
      items: [submission({ photo: { jpeg, width: 30, height: 40 } }), submission({ materialTitle: 'Fotosintesis' })],
    });

    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const { doc, pages } = await readPdf(bytes);
    expect(doc.getTitle()).toBe('Bukti belajar REKSA - Ani "Rahma"');
    expect(pages).toHaveLength(2);

    const first = pages[0]!.lines;
    expect(first[0]).toBe('REKSA · Bukti belajar · Ani "Rahma"');
    expect(first).toContain('Homeostasis');
    expect(first.find((l) => l.startsWith('Sesi: '))).toMatch(/ sampai \d{2}\.\d{2} WIB$/);
    expect(first).toContain('Fokus: 24 menit dari rencana 25 menit');
    expect(first).toContain('Status sesi: sah');
    expect(first).toContain('Tebakan nilai sebelum dicek: 80 · Skor pemeriksaan: 65');
    expect(first).toContain('Foto catatan tulisan tangan (metadata lokasi dan kamera sudah dihapus).');
    expect(first).toContain('- Reseptor');
    expect(first).toContain('- Umpan balik: Belum ada');
    expect(pages[1]!.lines).toContain('Fotosintesis');
    expect(pages[1]!.lines).toContain('Foto catatan tidak bisa dimuat saat PDF dibuat.');

    for (const page of pages) {
      expect(page.lines).toContain(HASH);
      expect(page.lines).toContain(VERIFY_URL);
      expect(page.links).toEqual([VERIFY_URL]);
    }
  });

  it('handles missing data, a short focus, an unbreakable word, and overflow onto a continuation page', async () => {
    const longWord = 'x'.repeat(200);
    const bytes = await renderLedgerPdf({
      studentName: 'Budi',
      generatedAt: new Date('2026-11-22T03:00:00Z'),
      items: [
        submission({
          materialTitle: null,
          focusEndedAt: null,
          actualDurationSec: null,
          validity: 'SHORT_FOCUS',
          accurateConcepts: [],
          blindSpots: [
            { concept: longWord, explanation: null },
            ...Array.from({ length: 60 }, (_, i) => ({ concept: `Konsep ${i + 1}`, explanation: null })),
          ],
        }),
      ],
    });

    const { pages } = await readPdf(bytes);
    expect(pages).toHaveLength(2);
    const first = pages[0]!.lines;
    expect(first).toContain('Materi tidak tersedia');
    expect(first.find((l) => l.startsWith('Sesi: '))).not.toContain('sampai');
    expect(first).toContain('Fokus: - dari rencana 25 menit');
    expect(first).toContain('Status sesi: fokus kurang dari separuh waktu');
    // "Konsep yang sudah tepat" kosong.
    expect(first[first.indexOf('Konsep yang sudah tepat') + 1]).toBe('Tidak ada.');

    // Kata yang lebih panjang dari satu baris dipotong menjadi beberapa baris tanpa kehilangan huruf.
    const pieces = first.filter((l) => /^x+$/.test(l));
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join('')).toBe(longWord);

    // Halaman lanjutan memuat kepala "(lanjutan)", sisa daftar, dan kode bukti yang sama.
    const second = pages[1]!.lines;
    expect(second[0]).toBe('REKSA · Bukti belajar · Budi (lanjutan)');
    expect(second).toContain('- Konsep 60');
    expect(first).not.toContain('- Konsep 60');
    expect(second).toContain(HASH);
    expect(pages[1]!.links).toEqual([VERIFY_URL]);
  });
});
