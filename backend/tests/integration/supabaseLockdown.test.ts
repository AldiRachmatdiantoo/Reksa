import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext } from '../support/testContext.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

const MIGRATION = readFileSync(
  path.resolve(import.meta.dirname, '../../prisma/migrations/20261122000900_supabase_data_api_lockdown/migration.sql'),
  'utf8',
);

/** Hak role atas tabel/skema, dibaca sebagai owner. */
async function privileges(role: string) {
  const [row] = await ctx.owner.$queryRawUnsafe<{ users: boolean; tokens: boolean; schema: boolean; ledger: boolean }[]>(`
    SELECT has_table_privilege('${role}', 'public.users', 'SELECT') AS users,
           has_table_privilege('${role}', 'public.refresh_tokens', 'SELECT') AS tokens,
           has_schema_privilege('${role}', 'public', 'USAGE') AS schema,
           has_function_privilege('${role}', 'public.ledger_lookup(text)', 'EXECUTE') AS ledger`);
  return row!;
}

// D1: di Supabase, role anon/authenticated (Data API) tidak boleh membaca tabel REKSA. Postgres uji tidak
// punya role itu, jadi dibuat di sini dengan hak bawaan seperti Supabase, lalu migrasinya dijalankan ulang.
describe('Supabase Data API lockdown migration', () => {
  it('removes every privilege anon and authenticated get by default, including on tables created later', async () => {
    for (const role of ['anon', 'authenticated']) {
      await ctx.owner.$executeRawUnsafe(
        `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`,
      );
      await ctx.owner.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await ctx.owner.$executeRawUnsafe(`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${role}`);
      await ctx.owner.$executeRawUnsafe(`GRANT EXECUTE ON FUNCTION public.ledger_lookup(text) TO ${role}`);
      await ctx.owner.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${role}`);
    }
    expect(await privileges('anon')).toEqual({ users: true, tokens: true, schema: true, ledger: true });

    await ctx.owner.$executeRawUnsafe(MIGRATION);

    for (const role of ['anon', 'authenticated']) {
      // USAGE skema tetap ada lewat PUBLIC (bawaan Postgres), tetapi tanpa hak tabel/fungsi tidak ada yang terbaca.
      expect(await privileges(role)).toMatchObject({ users: false, tokens: false, ledger: false });
    }
    await ctx.owner.$executeRawUnsafe('CREATE TABLE public.lockdown_probe (id INT)');
    try {
      const [row] = await ctx.owner.$queryRawUnsafe<{ probe: boolean }[]>(
        `SELECT has_table_privilege('anon', 'public.lockdown_probe', 'SELECT') AS probe`,
      );
      expect(row!.probe).toBe(false);
    } finally {
      await ctx.owner.$executeRawUnsafe('DROP TABLE public.lockdown_probe');
    }
    // Backend tetap berjalan seperti biasa.
    expect(await privileges('app_service_user')).toMatchObject({ users: true, schema: true, ledger: true });
  });
});
