import { X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildPgPoolConfig, SUPABASE_ROOT_CA_2021 } from '../../../src/config/dbTls.js';

const supabaseUrl =
  'postgresql://app_service_user.ref:p%40ss@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require&application_name=reksa';

describe('buildPgPoolConfig', () => {
  it('passes the URL through untouched for the system CA (local, no TLS)', () => {
    const url = 'postgresql://app_service_user:pw@localhost:5432/reksa';
    expect(buildPgPoolConfig(url)).toEqual({ connectionString: url });
    expect(buildPgPoolConfig(url, 'system')).toEqual({ connectionString: url });
  });

  it('pins the Supabase root CA with full verification and drops URL TLS params that would override it', () => {
    const config = buildPgPoolConfig(supabaseUrl, 'supabase');
    expect(config.ssl).toEqual({ ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true });

    const url = new URL(config.connectionString ?? '');
    expect(url.searchParams.has('sslmode')).toBe(false);
    expect(url.searchParams.get('application_name')).toBe('reksa');
    expect(url.hostname).toBe('aws-1-ap-southeast-1.pooler.supabase.com');
    expect(decodeURIComponent(url.password)).toBe('p@ss');
  });

  it('ships the expected Supabase root certificate', () => {
    const cert = new X509Certificate(SUPABASE_ROOT_CA_2021);
    expect(cert.subject).toContain('CN=Supabase Root 2021 CA');
    expect(cert.ca).toBe(true);
    expect(cert.fingerprint256).toBe('80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
  });
});
