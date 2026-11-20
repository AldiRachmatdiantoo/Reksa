import { randomUUID } from 'node:crypto';
import { errors as joseErrors, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
const ISSUER = 'reksa-api';
const AUDIENCE = 'reksa-web';

export const RoleSchema = z.enum(['STUDENT', 'EDUCATOR', 'INSTITUTION_ADMIN']);
export type Role = z.infer<typeof RoleSchema>;

export type AccessTokenClaims = {
  userId: string;
  role: Role;
};

const AccessPayloadSchema = z.object({
  sub: z.uuid(),
  role: RoleSchema,
});

export class AccessTokenSigner {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({ role: claims.role })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
      .setJti(randomUUID())
      .sign(this.key);
  }

  /** Returns null for any invalid token (bad signature, expired, wrong alg/iss/aud, bad claims). */
  async verify(token: string): Promise<AccessTokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      const parsed = AccessPayloadSchema.safeParse(payload);
      return parsed.success ? { userId: parsed.data.sub, role: parsed.data.role } : null;
    } catch (err) {
      if (err instanceof joseErrors.JOSEError) return null;
      throw err;
    }
  }
}
