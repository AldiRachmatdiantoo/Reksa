import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../../src/config/env.js';

const validEnv = {
  DATABASE_URL: 'postgresql://app_service_user:pw@localhost:5432/reksa',
  REDIS_URL: 'redis://:pw@localhost:6379',
  CORS_ORIGIN: 'http://localhost:8080',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  STORAGE_ENDPOINT: 'http://localhost:9000',
  STORAGE_BUCKET: 'reksa-private',
  STORAGE_ACCESS_KEY_ID: 'key',
  STORAGE_SECRET_ACCESS_KEY: 'secret',
};

describe('loadEnv', () => {
  it('applies safe defaults', () => {
    const env = loadEnv(validEnv);
    expect(env.AI_PROVIDER_MODE).toBe('mock');
    expect(env.PORT).toBe(3000);
  });

  it('parses STORAGE_FORCE_PATH_STYLE as a boolean, defaulting to true', () => {
    expect(loadEnv(validEnv).STORAGE_FORCE_PATH_STYLE).toBe(true);
    expect(loadEnv({ ...validEnv, STORAGE_FORCE_PATH_STYLE: 'false' }).STORAGE_FORCE_PATH_STYLE).toBe(false);
  });

  it('rejects an invalid bucket name', () => {
    expect(() => loadEnv({ ...validEnv, STORAGE_BUCKET: 'Bad_Bucket!' })).toThrow(/STORAGE_BUCKET/);
  });

  it('requires SMTP_URL in production, accepts smtp/smtps URLs only', () => {
    expect(() => loadEnv({ ...validEnv, NODE_ENV: 'production' })).toThrow(/SMTP_URL/);
    expect(loadEnv({ ...validEnv, NODE_ENV: 'production', SMTP_URL: 'smtps://u:p@smtp.example.com:465' }).SMTP_URL).toBeDefined();
    expect(() => loadEnv({ ...validEnv, SMTP_URL: 'http://smtp.example.com' })).toThrow(/SMTP_URL/);
    expect(loadEnv(validEnv).SMTP_URL).toBeUndefined();
  });

  it('requires GEMINI_API_KEY in gemini mode', () => {
    expect(() => loadEnv({ ...validEnv, AI_PROVIDER_MODE: 'gemini' })).toThrow(/GEMINI_API_KEY/);
  });

  it('defaults both Gemini models to gemini-2.5-flash and rejects model names that could change the URL path', () => {
    const env = loadEnv(validEnv);
    expect(env.GEMINI_TEXT_MODEL).toBe('gemini-2.5-flash');
    expect(env.GEMINI_VISION_MODEL).toBe('gemini-2.5-flash');
    expect(loadEnv({ ...validEnv, GEMINI_TEXT_MODEL: 'gemini-2.5-flash-lite' }).GEMINI_TEXT_MODEL).toBe('gemini-2.5-flash-lite');
    expect(() => loadEnv({ ...validEnv, GEMINI_TEXT_MODEL: '../files' })).toThrow(/GEMINI_TEXT_MODEL/);
    expect(() => loadEnv({ ...validEnv, GEMINI_VISION_MODEL: 'Gemini Flash' })).toThrow(/GEMINI_VISION_MODEL/);
  });

  it('rejects short JWT secrets', () => {
    expect(() => loadEnv({ ...validEnv, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects identical access and refresh secrets', () => {
    expect(() => loadEnv({ ...validEnv, JWT_REFRESH_SECRET: validEnv.JWT_ACCESS_SECRET })).toThrow(/JWT_REFRESH_SECRET/);
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
