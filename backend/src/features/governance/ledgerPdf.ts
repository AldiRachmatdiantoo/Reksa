import { PDFDocument, PDFName, PDFString, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

export type PdfPhoto = { jpeg: Uint8Array; width: number; height: number };

export type PdfSubmission = {
  materialTitle: string | null;
  startedAt: Date;
  focusEndedAt: Date | null;
  plannedDurationSec: number;
  actualDurationSec: number | null;
  validity: 'VALID' | 'SHORT_FOCUS' | null;
  predictedJolScore: number;
  actualScore: number;
  accurateConcepts: string[];
  blindSpots: { concept: string; explanation: string | null }[];
  ledgerHash: string;
  verifyUrl: string;
  photo: PdfPhoto | null;
};

export type LedgerPdfInput = { studentName: string; generatedAt: Date; items: PdfSubmission[] };

// A4 dalam point.
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const FOOTER_HEIGHT = 56;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

const INK = rgb(0.11, 0.13, 0.13);
const MUTED = rgb(0.38, 0.42, 0.42);
const TEAL = rgb(0, 0.4, 0.4);
const DANGER = rgb(0.73, 0.1, 0.1);

const TZ = 'Asia/Jakarta';
const dateTime = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: TZ });
const timeOnly = new Intl.DateTimeFormat('id-ID', { timeStyle: 'short', timeZone: TZ });

/**
 * Font standar PDF (WinAnsi) tidak punya semua karakter Unicode. Tanda baca umum diganti padanan ASCII,
 * sisanya yang tidak bisa dikodekan menjadi "?" supaya teks dari AI tidak menggagalkan PDF.
 */
export function toWinAnsi(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[→⇒]/g, '->')
    .replace(/[←⇐]/g, '<-')
    .replace(/•/g, '-')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

function minutes(sec: number | null): string {
  return sec === null ? '-' : `${Math.round(sec / 60)} menit`;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = toWinAnsi(text).split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // Kata yang lebih panjang dari satu baris dipotong paksa.
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

type Fonts = { regular: PDFFont; bold: PDFFont; mono: PDFFont };

/** Menulis isi satu submission dari atas ke bawah, membuka halaman lanjutan jika penuh. */
class Writer {
  page!: PDFPage;
  y = 0;

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: Fonts,
    private readonly input: LedgerPdfInput,
    private readonly item: PdfSubmission,
  ) {}

  newPage(continued: boolean) {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN;
    const header = `REKSA · Bukti belajar · ${this.input.studentName}${continued ? ' (lanjutan)' : ''}`;
    this.text(header, { size: 9, color: MUTED });
    this.y -= 6;
    this.footer();
  }

  private footer() {
    const { page, fonts, item } = this;
    const top = MARGIN - 8 + FOOTER_HEIGHT - 16;
    page.drawLine({ start: { x: MARGIN, y: top + 10 }, end: { x: PAGE.width - MARGIN, y: top + 10 }, thickness: 0.5, color: MUTED });
    page.drawText('Kode bukti:', { x: MARGIN, y: top, size: 8, font: fonts.bold, color: INK });
    page.drawText(item.ledgerHash, { x: MARGIN + 52, y: top, size: 7.5, font: fonts.mono, color: INK });
    const label = 'Cek keaslian di ';
    page.drawText(label, { x: MARGIN, y: top - 13, size: 8, font: fonts.regular, color: INK });
    const urlX = MARGIN + fonts.regular.widthOfTextAtSize(label, 8);
    const url = toWinAnsi(item.verifyUrl);
    page.drawText(url, { x: urlX, y: top - 13, size: 8, font: fonts.regular, color: TEAL });
    addLink(this.doc, page, url, urlX, top - 15, fonts.regular.widthOfTextAtSize(url, 8), 11);
    page.drawText(
      toWinAnsi(
        `Dibuat ${dateTime.format(this.input.generatedAt)} WIB. Skor dibuat mesin dan bisa salah; pakai sebagai bukti proses belajar.`,
      ),
      { x: MARGIN, y: top - 26, size: 7, font: fonts.regular, color: MUTED },
    );
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN + FOOTER_HEIGHT) this.newPage(true);
  }

  text(value: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number } = {}) {
    const size = opts.size ?? 11;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const indent = opts.indent ?? 0;
    for (const line of wrap(value, font, size, CONTENT_WIDTH - indent)) {
      this.ensure(size * 1.4);
      this.y -= size * 1.4;
      this.page.drawText(line, { x: MARGIN + indent, y: this.y, size, font, color: opts.color ?? INK });
    }
  }

  gap(points: number) {
    this.y -= points;
  }

  bullets(items: string[], empty: string) {
    if (items.length === 0) {
      this.text(empty, { size: 10, color: MUTED });
      return;
    }
    for (const item of items) this.text(`- ${item}`, { size: 10, indent: 8 });
  }

  photo(photo: PdfPhoto) {
    const maxW = 260;
    const maxH = 340;
    const scale = Math.min(maxW / photo.width, maxH / photo.height, 1);
    const w = photo.width * scale;
    const h = photo.height * scale;
    this.ensure(h + 8);
    this.y -= h + 8;
    return { x: MARGIN, y: this.y, w, h };
  }
}

function addLink(doc: PDFDocument, page: PDFPage, url: string, x: number, y: number, w: number, h: number) {
  const annot = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [x, y, x + w, y + h],
    Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
  });
  const ref = doc.context.register(annot);
  const existing = page.node.Annots();
  if (existing) existing.push(ref);
  else page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
}

/** PDF Proof of Understanding (FR-12): satu bagian per submission, tiap halaman memuat kode bukti dan tautan cek. */
export async function renderLedgerPdf(input: LedgerPdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(toWinAnsi(`Bukti belajar REKSA - ${input.studentName}`));
  doc.setProducer('REKSA');
  doc.setCreator('REKSA');
  doc.setCreationDate(input.generatedAt);
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };

  for (const item of input.items) {
    const w = new Writer(doc, fonts, input, item);
    w.newPage(false);
    w.text(item.materialTitle ?? 'Materi tidak tersedia', { size: 18, bold: true });
    w.gap(4);
    const end = item.focusEndedAt ? ` sampai ${timeOnly.format(item.focusEndedAt)}` : '';
    w.text(`Sesi: ${dateTime.format(item.startedAt)}${end} WIB`, { size: 10.5 });
    w.text(`Fokus: ${minutes(item.actualDurationSec)} dari rencana ${minutes(item.plannedDurationSec)}`, { size: 10.5 });
    w.text(item.validity === 'SHORT_FOCUS' ? 'Status sesi: fokus kurang dari separuh waktu' : 'Status sesi: sah', {
      size: 10.5,
      color: item.validity === 'SHORT_FOCUS' ? DANGER : INK,
    });
    w.text(`Tebakan nilai sebelum dicek: ${item.predictedJolScore} · Skor pemeriksaan: ${item.actualScore}`, { size: 10.5 });
    w.gap(10);

    if (item.photo) {
      const image = await doc.embedJpg(item.photo.jpeg);
      const box = w.photo(item.photo);
      w.page.drawImage(image, { x: box.x, y: box.y, width: box.w, height: box.h });
      w.page.drawRectangle({ x: box.x, y: box.y, width: box.w, height: box.h, borderColor: MUTED, borderWidth: 0.5 });
      w.gap(4);
      w.text('Foto catatan tulisan tangan (metadata lokasi dan kamera sudah dihapus).', { size: 8.5, color: MUTED });
    } else {
      w.text('Foto catatan tidak bisa dimuat saat PDF dibuat.', { size: 9, color: MUTED });
    }
    w.gap(12);

    w.text('Konsep yang sudah tepat', { size: 12, bold: true });
    w.bullets(item.accurateConcepts, 'Tidak ada.');
    w.gap(8);
    w.text('Konsep yang terlewat', { size: 12, bold: true });
    w.bullets(
      item.blindSpots.map((b) => (b.explanation ? `${b.concept}: ${b.explanation}` : b.concept)),
      'Tidak ada.',
    );
  }

  // Tanpa object stream: kompatibel dengan pembaca PDF lama dan tautan tetap terbaca alat sederhana.
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}
