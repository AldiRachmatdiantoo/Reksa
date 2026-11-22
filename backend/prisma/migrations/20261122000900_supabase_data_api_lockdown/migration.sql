-- D1: tutup Data API (PostgREST) Supabase.
--
-- Supabase memberi role `anon` dan `authenticated` akses ke skema public lewat Data API, termasuk tabel
-- tanpa RLS (users, refresh_tokens, auth_tokens). REKSA tidak memakai Data API: semua akses lewat backend
-- sebagai app_service_user. Hak kedua role dicabut di sini, juga untuk tabel/fungsi yang dibuat nanti.
-- Data API sebaiknya tetap dimatikan di dashboard (Settings → API); migrasi ini lapisan kedua.
--
-- Postgres lokal (docker compose, Testcontainers) tidak punya role ini, jadi blok dilewati.

DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE USAGE ON SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END
$$;
