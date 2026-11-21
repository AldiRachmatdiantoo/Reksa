import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { UnprocessableEntityError, UnsupportedMediaTypeError } from '../errors/AppError.js';

export type ProcessedImage = {
  buffer: Buffer;
  mimeType: 'image/webp';
  ext: 'webp';
  width: number;
  height: number;
};

export interface ImageProcessor {
  /**
   * Memvalidasi foto dari magic bytes, lalu menulis ulang piksel-nya sebagai WebP baru:
   * orientasi EXIF diterapkan, semua metadata (EXIF, GPS, tipe perangkat, ICC, XMP) dibuang,
   * dan lebar dibatasi. File asli tidak pernah disimpan.
   */
  process(input: Buffer): Promise<ProcessedImage>;
}

export type SharpImageProcessorOptions = {
  /** MIME yang diterima, dicek dari magic bytes (bukan nama file / Content-Type). */
  allowedMimeTypes: readonly string[];
  /** PRD FR-04: lebar maksimal 1600px. Gambar lebih kecil tidak diperbesar. */
  maxWidth?: number;
  /** Batas lebar × tinggi sebelum didekode, menolak *decompression bomb*. */
  maxInputPixels?: number;
  quality?: number;
};

/** 50 MP: di atas kamera HP umum (48 MP), jauh di bawah ukuran yang menghabiskan memori. */
const DEFAULT_MAX_INPUT_PIXELS = 50_000_000;

export class SharpImageProcessor implements ImageProcessor {
  private readonly allowed: ReadonlySet<string>;
  private readonly maxWidth: number;
  private readonly maxInputPixels: number;
  private readonly quality: number;

  constructor(options: SharpImageProcessorOptions) {
    this.allowed = new Set(options.allowedMimeTypes);
    this.maxWidth = options.maxWidth ?? 1600;
    this.maxInputPixels = options.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS;
    this.quality = options.quality ?? 80;
  }

  async process(input: Buffer): Promise<ProcessedImage> {
    const detected = await fileTypeFromBuffer(input);
    if (!detected || !this.allowed.has(detected.mime)) {
      throw new UnsupportedMediaTypeError('Foto harus JPEG, PNG, atau WebP. Ubah nama file saja tidak cukup.');
    }

    try {
      const { data, info } = await sharp(input, {
        failOn: 'error',
        limitInputPixels: this.maxInputPixels,
        // Hanya frame pertama untuk WebP/PNG animasi.
        pages: 1,
      })
        // Terapkan orientasi EXIF ke piksel sebelum metadata dibuang, supaya foto tidak miring.
        .rotate()
        .resize({ width: this.maxWidth, withoutEnlargement: true })
        // sharp tidak menyalin metadata ke output kecuali diminta (withMetadata/keepExif): jangan diminta.
        .webp({ quality: this.quality })
        .toBuffer({ resolveWithObject: true });
      return { buffer: data, mimeType: 'image/webp', ext: 'webp', width: info.width, height: info.height };
    } catch {
      // Magic bytes cocok tapi isi rusak, terpotong, atau terlalu besar untuk didekode.
      throw new UnprocessableEntityError('Foto tidak bisa dibaca. Coba ambil ulang fotonya.');
    }
  }
}
