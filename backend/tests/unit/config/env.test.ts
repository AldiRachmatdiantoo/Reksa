import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../../src/config/env.js';

const validEnv = {
  DATABASE_URL: 'postgresql://app_service_user:pw@localhost:5432/reksa',
  REDIS_URL: 'redis://:pw@localhost:6379',
  CORS_ORIGIN: 'http://localhost:8080',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('loadEnv', () => {
  it('applies safe defaults', () => {
    const env = loadEnv(validEnv);
    expect(env.AI_PROVIDER_MODE).toBe('mock');
    expect(env.PORT).toBe(3000);
  });

  it('requires GEMINI_API_KEY in gemini mode', () => {
    expect(() => loadEnv({ ...validEnv, AI_PROVIDER_MODE: 'gemini' })).toThrow(/GEMINI_API_KEY/);
  });

  it('rejects short JWT secrets', () => {
    expect(() => loadEnv({ ...validEnv, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects identical access and refresh secrets', () => {
    expect(() => loadEnv({ ...validEnv, JWT_REFRESH_SECRET: validEnv.JWT_ACCESS_SECRET })).toThrow(
      /JWT_REFRESH_SECRET/,
    );
  });

  it('never echoes secret values in the error message', () => {
    const secret = 'super-secret-but-too-short';
    try {
      loadEnv({ ...validEnv, JWT_ACCESS_SECRET: secret });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain(secret);
    }
  });
});
