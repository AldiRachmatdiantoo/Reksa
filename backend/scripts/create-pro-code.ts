/**
 * Membuat kode aktivasi Pro (FR-11). Dijalankan tim REKSA, bukan lewat API.
 * Memakai role pemilik skema karena aplikasi sengaja tidak punya hak INSERT di tabel kode.
 *
 *   MIGRATION_DATABASE_URL=postgresql://... npx tsx scripts/create-pro-code.ts --days 30 --max 1 --valid-days 90 --label "Uji coba SMA 1"
 *
 * Kode mentah hanya tampil sekali di sini; database menyimpan hash-nya saja.
 */
import { parseArgs } from 'node:util';
import { createPrismaClient } from '../src/config/prisma.js';
import { generateProCode, hashProCode, normalizeProCode } from '../src/features/subscriptions/pro.schema.js';

const { values } = parseArgs({
  options: {
    days: { type: 'string', default: '30' },
    max: { type: 'string', default: '1' },
    'valid-days': { type: 'string', default: '90' },
    label: { type: 'string' },
    count: { type: 'string', default: '1' },
  },
});

function positiveInt(name: string, raw: string | undefined, max: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`--${name} harus bilangan bulat 1..${max}`);
  return n;
}

async function main(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL wajib diisi (role pemilik skema)');
  const durationDays = positiveInt('days', values.days, 3660);
  const maxRedemptions = positiveInt('max', values.max, 100_000);
  const validDays = positiveInt('valid-days', values['valid-days'], 3660);
  const count = positiveInt('count', values.count, 1000);
  const label = values.label?.slice(0, 100) ?? null;
  const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60_000);

  const prisma = createPrismaClient(url);
  try {
    for (let i = 0; i < count; i++) {
      const code = generateProCode();
      await prisma.proActivationCode.create({
        data: { codeHash: hashProCode(normalizeProCode(code)), label, durationDays, maxRedemptions, expiresAt },
      });
      console.log(code);
    }
    console.error(
      `${count} kode dibuat: Pro ${durationDays} hari, maks. ${maxRedemptions} penukaran per kode, bisa ditukar sampai ${expiresAt.toISOString()}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
