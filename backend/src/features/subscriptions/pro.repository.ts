import type { PrismaClient } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';

export type RedeemOutcome = { kind: 'ok'; proExpiresAt: Date } | { kind: 'invalid' } | { kind: 'already_redeemed' };

type CodeRow = { id: string; duration_days: number; max_redemptions: number; redemption_count: number; expires_at: Date };

/**
 * `pro_activation_codes`, `pro_code_redemptions`, dan `users` tanpa RLS; setiap query memfilter id
 * secara eksplisit. Aplikasi tidak punya hak INSERT/DELETE pada tabel kode (hanya skrip admin).
 */
export interface ProRepository {
  isEmailVerified(userId: string): Promise<boolean>;
  getStatus(userId: string): Promise<{ tier: 'FREE' | 'PRO'; proExpiresAt: Date | null } | null>;
  /**
   * Satu transaksi: kunci baris kode (`SELECT ... FOR UPDATE`) supaya penukaran paralel tidak melewati
   * batas, catat penukaran (unik per user), naikkan hitungan, lalu perpanjang `pro_expires_at` dari
   * tanggal yang lebih akhir antara sekarang dan masa Pro yang masih berjalan.
   */
  redeem(userId: string, codeHash: string, now: Date): Promise<RedeemOutcome>;
}

export class PrismaProRepository implements ProRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async isEmailVerified(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
    return Boolean(user?.emailVerifiedAt);
  }

  getStatus(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: { tier: true, proExpiresAt: true } });
  }

  async redeem(userId: string, codeHash: string, now: Date): Promise<RedeemOutcome> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<CodeRow[]>`
          SELECT id, duration_days, max_redemptions, redemption_count, expires_at
          FROM pro_activation_codes WHERE code_hash = ${codeHash}
          FOR UPDATE`;
        const code = rows[0];
        if (!code || code.expires_at.getTime() <= now.getTime() || code.redemption_count >= code.max_redemptions) {
          return { kind: 'invalid' } as const;
        }

        await tx.proCodeRedemption.create({ data: { codeId: code.id, userId, redeemedAt: now } });
        await tx.proActivationCode.update({ where: { id: code.id }, data: { redemptionCount: { increment: 1 } } });

        const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { proExpiresAt: true } });
        const base = user.proExpiresAt && user.proExpiresAt.getTime() > now.getTime() ? user.proExpiresAt : now;
        const proExpiresAt = new Date(base.getTime() + code.duration_days * 24 * 60 * 60_000);
        await tx.user.update({ where: { id: userId }, data: { proExpiresAt } });
        return { kind: 'ok', proExpiresAt } as const;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { kind: 'already_redeemed' };
      }
      throw err;
    }
  }
}
