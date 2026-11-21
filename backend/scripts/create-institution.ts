/**
 * Membuat institusi dan akun admin-nya (FR-10). Dijalankan tim REKSA, bukan lewat API:
 * INSTITUTION_ADMIN tidak bisa mendaftar sendiri.
 *
 *   MIGRATION_DATABASE_URL=postgresql://... npx tsx scripts/create-institution.ts \
 *     --name "SMA Negeri 1 Contoh" --admin-email kepsek@sekolah.sch.id --admin-name "Ibu Kepala Sekolah"
 *
 * Tambah admin kedua ke institusi yang sudah ada: ganti --name dengan --institution-id <uuid>.
 * Kata sandi sementara hanya tampil sekali di sini. Minta admin menggantinya di halaman Akun setelah masuk;
 * saat masuk pertama kali admin juga diminta menyetujui syarat dan kebijakan privasi.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { Argon2PasswordHasher } from '../src/common/utils/passwordHasher.js';
import { createPrismaClient } from '../src/config/prisma.js';

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    'institution-id': { type: 'string' },
    'admin-email': { type: 'string' },
    'admin-name': { type: 'string' },
  },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function required(name: string, raw: string | undefined, max: number): string {
  const value = raw?.trim();
  if (!value || value.length > max) throw new Error(`--${name} wajib diisi, maksimal ${max} karakter`);
  return value;
}

async function main(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL wajib diisi (role pemilik skema)');
  if (Boolean(values.name) === Boolean(values['institution-id'])) throw new Error('Isi salah satu: --name atau --institution-id');
  const email = required('admin-email', values['admin-email'], 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('--admin-email tidak valid');
  const fullName = required('admin-name', values['admin-name'], 100);

  // 18 byte acak: 24 karakter base64url, memenuhi aturan kata sandi aplikasi.
  const password = `${randomBytes(18).toString('base64url')}A1!`;
  const passwordHash = await new Argon2PasswordHasher().hash(password);

  const prisma = createPrismaClient(url);
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
        throw new Error('Email itu sudah dipakai akun lain');
      }
      let institution: { id: string; name: string };
      if (values['institution-id']) {
        const id = values['institution-id'];
        if (!UUID_RE.test(id)) throw new Error('--institution-id harus UUID');
        institution = await tx.institution.findUniqueOrThrow({ where: { id }, select: { id: true, name: true } });
      } else {
        institution = await tx.institution.create({ data: { name: required('name', values.name, 200) }, select: { id: true, name: true } });
      }
      const admin = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          role: 'INSTITUTION_ADMIN',
          institutionId: institution.id,
          // Akun dibuat langsung oleh tim, emailnya diterima apa adanya.
          emailVerifiedAt: new Date(),
        },
        select: { id: true },
      });
      return { institution, adminId: admin.id };
    });
    console.error(`Institusi: ${result.institution.name} (${result.institution.id})`);
    console.error(`Admin: ${email} (${result.adminId})`);
    console.error('Kata sandi sementara (tampil sekali, kirim lewat jalur aman, minta segera diganti):');
    console.log(password);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
