import { z } from 'zod';

// Not .strict(): process.env always carries many unrelated variables (PATH, HOME, ...).
// Only the keys declared here are read; everything else is ignored.
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),

    CORS_ORIGIN: z.url(),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),

    // Object storage S3-compatible: MinIO (lokal) / Supabase Storage (staging & produksi).
    STORAGE_ENDPOINT: z.url({ protocol: /^https?$/ }),
    STORAGE_PUBLIC_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
    STORAGE_REGION: z.string().min(1).default('us-east-1'),
    STORAGE_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, 'Nama bucket tidak valid'),
    STORAGE_ACCESS_KEY_ID: z.string().min(1),
    STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
    STORAGE_FORCE_PATH_STYLE: z.stringbool().default(true),

    // Email transaksional (FR-14). Lokal: Mailpit (smtp://localhost:1025). Produksi: SMTP penyedia
    // email (mis. smtps://resend:<api-key>@smtp.resend.com:465). Kosong di development = email hanya dicatat di log.
    SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
    EMAIL_FROM: z.string().min(3).default('REKSA <no-reply@reksa.local>'),
    // Origin frontend untuk tautan di email. Default: CORS_ORIGIN.
    APP_URL: z.url({ protocol: /^https?$/ }).optional(),

    AI_PROVIDER_MODE: z.enum(['mock', 'gemini']).default('mock'),
    MOCK_AI_LATENCY_MS: z.coerce.number().int().min(0).max(10_000).default(300),
    GEMINI_API_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER_MODE === 'gemini' && !env.GEMINI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['GEMINI_API_KEY'],
        message: 'GEMINI_API_KEY wajib diisi saat AI_PROVIDER_MODE=gemini',
      });
    }
    if (env.NODE_ENV === 'production' && !env.SMTP_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_URL'],
        message: 'SMTP_URL wajib diisi di production (email verifikasi dan reset password)',
      });
    }
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET harus berbeda dari JWT_ACCESS_SECRET',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    // Print only key names and messages, never the values (they may be secrets).
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Konfigurasi environment tidak valid:\n${issues}`);
  }
  return result.data;
}
