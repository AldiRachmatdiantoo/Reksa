/**
 * Membuat PDF kecil yang valid (satu baris teks per halaman) tanpa dependensi tambahan,
 * dengan tabel xref yang offset-nya dihitung benar supaya pdf.js bisa membacanya.
 */
export function buildPdf(pages: string[]): Buffer {
  const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1: catalog, 2: pages, 3: font, lalu pasangan (page, content) per halaman.
  let next = 4;
  const pageObjects: string[] = [];
  for (const text of pages) {
    const pageId = next++;
    const contentId = next++;
    pageIds.push(pageId);
    const stream = `BT /F1 12 Tf 50 750 Td (${escape(text)}) Tj ET`;
    pageObjects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
      `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );
  }
  objects.push(
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>\nendobj\n`,
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    ...pageObjects,
  );

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += obj;
  }
  const xrefOffset = Buffer.byteLength(body, 'latin1');
  const count = objects.length + 1;
  body += `xref\n0 ${count}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

export const SAMPLE_PDF_TEXT =
  'Homeostasis adalah kemampuan tubuh menjaga kondisi internal tetap stabil melalui umpan balik negatif.';
