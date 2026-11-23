/**
 * Menyiapkan akun demo pelajar atau guru: email langsung terverifikasi dan kata sandi diganti.
 * Dijalankan tim REKSA, bukan lewat API. Akun yang belum ada dibuat dengan peran yang diminta.
 *
 *   $env:MIGRATION_DATABASE_URL = "postgresql://..."
 *   $env:DEMO_PASSWORD = "<kata sandi>"
 *   npx tsx scripts/set-demo-account.ts --email demo@contoh.com --role STUDENT --name "Demo Pelajar"
 *
 * Kata sandi dibaca dari env, bukan argumen, supaya tidak tersimpan di riwayat shell. Aturannya sama
 * dengan pendaftaran (min. 12 karakter, huruf besar, huruf kecil, angka). Sesi login lama akun itu dicabut.
 * Akun baru belum menyetujui syarat dan kebijakan privasi, jadi diminta setuju saat masuk pertama kali.
 */
import { parseArgs } from 'node:util';
import { Argon2PasswordHasher } from '../src/common/utils/passwordHasher.js';
import { createPrismaClient } from '../src/config/prisma.js';
import { EmailSchema, StrongPasswordSchema } from '../src/features/auth/auth.schema.js';

const ROLES = ['STUDENT', 'EDUCATOR'] as const;
type DemoRole = (typeof ROLES)[number];

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    role: { type: 'string' },
    name: { type: 'string' },
  },
});

async function main(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL wajib diisi (role pemilik skema)');

  const email = EmailSchema.safeParse(values.email ?? '');
  if (!email.success) throw new Error('--email tidak valid');
  const role = values.role as DemoRole;
  if (!ROLES.includes(role)) throw new Error('--role harus STUDENT atau EDUCATOR');
  const password = StrongPasswordSchema.safeParse(process.env.DEMO_PASSWORD ?? '');
  if (!password.success) throw new Error(`DEMO_PASSWORD tidak memenuhi aturan: ${password.error.issues.map((i) => i.message).join(', ')}`);
  const fullName = (values.name?.trim() || (role === 'STUDENT' ? 'Demo Pelajar' : 'Demo Guru')).slice(0, 100);

  const passwordHash = await new Argon2PasswordHasher().hash(password.data);
  const prisma = createPrismaClient(url);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email: email.data },
        select: { id: true, role: true, emailVerifiedAt: true },
      });
      if (existing) {
        // Peran tidak diubah diam-diam: akun yang perannya lain kemungkinan bukan akun demo yang dimaksud.
        if (existing.role !== role) throw new Error(`Akun ${email.data} sudah ada dengan peran ${existing.role}, bukan ${role}. Tidak diubah.`);
        await tx.user.update({
          where: { id: existing.id },
          data: { passwordHash, emailVerifiedAt: existing.emailVerifiedAt ?? new Date() },
        });
        await tx.refreshToken.updateMany({ where: { userId: existing.id, isRevoked: false }, data: { isRevoked: true } });
        return { id: existing.id, created: false };
      }
      const user = await tx.user.create({
        data: { email: email.data, passwordHash, fullName, role, emailVerifiedAt: new Date() },
        select: { id: true },
      });
      return { id: user.id, created: true };
    });
    console.error(
      result.created
        ? `Akun baru ${email.data} (${role}, ${result.id}) dibuat, email terverifikasi.`
        : `Akun ${email.data} (${role}, ${result.id}): kata sandi diganti, email terverifikasi, sesi lama dicabut.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
