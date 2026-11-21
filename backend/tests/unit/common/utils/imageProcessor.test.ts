import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { SharpImageProcessor } from '../../../../src/common/utils/imageProcessor.js';
import { SCAN_ALLOWED_MIME_TYPES } from '../../../../src/features/essay-scans/scans.schema.js';

const processor = new SharpImageProcessor({ allowedMimeTypes: SCAN_ALLOWED_MIME_TYPES });

/** Foto HP palsu: 3000×2000, orientasi EXIF 6 (diputar 90°), merek perangkat, dan koordinat GPS. */
async function phonePhoto(format: 'jpeg' | 'png' | 'webp' = 'jpeg', width = 3000, height = 2000): Promise<Buffer> {
  const base = sharp({ create: { width, height, channels: 3, background: '#e8dcc0' } })
    .withExif({
      IFD0: { Make: 'TestPhone', Model: 'X1' },
      IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '6/1 12/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '106/1 49/1 0/1' },
    })
    .withMetadata({ orientation: 6 });
  return base[format]().toBuffer();
}

const GPS_POINTER_LE = Buffer.from([0x25, 0x88]);

describe('SharpImageProcessor', () => {
  it('fixture sanity: the input really carries EXIF, GPS and orientation', async () => {
    const meta = await sharp(await phonePhoto()).metadata();
    expect(meta.orientation).toBe(6);
    expect(meta.exif?.includes('TestPhone')).toBe(true);
    expect(meta.exif?.includes(GPS_POINTER_LE)).toBe(true);
  });

  it('strips all metadata (EXIF, GPS, device, orientation) and outputs WebP', async () => {
    const out = await processor.process(await phonePhoto());
    const meta = await sharp(out.buffer).metadata();

    expect(out.mimeType).toBe('image/webp');
    expect(out.ext).toBe('webp');
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(out.buffer.includes('TestPhone')).toBe(false);
  });

  it('applies EXIF orientation to the pixels before stripping it, then caps width at 1600', async () => {
    const out = await processor.process(await phonePhoto());
    // 3000×2000 diputar 90° → 2000×3000 (potret), lalu diperkecil ke lebar 1600.
    expect(out.width).toBe(1600);
    expect(out.height).toBe(2400);
    const meta = await sharp(out.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([1600, 2400]);
  });

  it('never enlarges small photos', async () => {
    const small = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#fff' } }).png().toBuffer();
    const out = await processor.process(small);
    expect([out.width, out.height]).toEqual([800, 600]);
  });

  it.each(['jpeg', 'png', 'webp'] as const)('accepts %s', async (format) => {
    const out = await processor.process(await phonePhoto(format, 400, 300));
    expect(out.mimeType).toBe('image/webp');
  });

  it('rejects files whose magic bytes are not an allowed image (renamed .exe, SVG, PDF, GIF)', async () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>');
    const pdf = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n');
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).gif().toBuffer();
    for (const file of [exe, svg, pdf, gif, Buffer.alloc(0)]) {
      await expect(processor.process(file)).rejects.toMatchObject({ statusCode: 415 });
    }
  });

  it('rejects HEIC/AVIF-family files even though they are images (no HEVC decoder)', async () => {
    const avif = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#123' } }).avif().toBuffer();
    await expect(processor.process(avif)).rejects.toMatchObject({ statusCode: 415 });
  });

  it('answers 422 for a truncated image with valid magic bytes', async () => {
    const jpeg = await phonePhoto('jpeg', 400, 300);
    await expect(processor.process(jpeg.subarray(0, 200))).rejects.toMatchObject({ statusCode: 422 });
  });

  it('answers 422 for images above the pixel limit (decompression bomb)', async () => {
    const strict = new SharpImageProcessor({ allowedMimeTypes: SCAN_ALLOWED_MIME_TYPES, maxInputPixels: 100 * 100 });
    const big = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#fff' } }).png().toBuffer();
    await expect(strict.process(big)).rejects.toMatchObject({ statusCode: 422 });
  });
});
