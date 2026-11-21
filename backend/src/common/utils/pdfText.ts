import { extractText, getDocumentProxy } from 'unpdf';

export type PdfTextResult = { text: string; pages: number };

/** Diinjeksi ke service supaya unit test tidak perlu file PDF asli. */
export interface PdfTextExtractor {
  /** Melempar `PdfTooManyPagesError` bila jumlah halaman melebihi batas, error lain bila PDF rusak/terkunci. */
  extract(buffer: Buffer): Promise<PdfTextResult>;
}

export class PdfTooManyPagesError extends Error {
  constructor(public readonly pages: number) {
    super(`PDF memiliki ${pages} halaman`);
    this.name = 'PdfTooManyPagesError';
  }
}

/**
 * Mengambil teks dari PDF memakai pdf.js v5 (lewat `unpdf`). pdf.js v5 tidak lagi memakai eval
 * dan tidak menjalankan JavaScript di dalam PDF; di sini juga tidak ada render gambar.
 * Jumlah halaman dibatasi sebelum teks diambil supaya PDF raksasa tidak menghabiskan CPU.
 */
export class UnpdfTextExtractor implements PdfTextExtractor {
  constructor(private readonly maxPages = 150) {}

  async extract(buffer: Buffer): Promise<PdfTextResult> {
    // pdf.js mengambil alih buffer yang diberikan; salin supaya Buffer asli tetap utuh untuk disimpan.
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    try {
      if (pdf.numPages > this.maxPages) throw new PdfTooManyPagesError(pdf.numPages);
      const { totalPages, text } = await extractText(pdf, { mergePages: true });
      return { text, pages: totalPages };
    } finally {
      await pdf.cleanup();
    }
  }
}
