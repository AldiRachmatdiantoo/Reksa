import argon2 from 'argon2';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** Must take roughly the same time whether or not the hash matches. */
  verify(hash: string, password: string): Promise<boolean>;
}

/** Argon2id with the parameters from PRD §9.1. */
export class Argon2PasswordHasher implements PasswordHasher {
  private static readonly options = {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  } as const;

  hash(password: string): Promise<string> {
    return argon2.hash(password, Argon2PasswordHasher.options);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
