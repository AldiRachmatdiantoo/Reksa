-- REKSA security hardening (PRD §7.2, §9.1).
-- Berisi hal yang tidak bisa diekspresikan di schema.prisma:
-- CHECK constraints, partial indexes, role & privilege, dan Row-Level Security.

-- =====================================================================
-- 1. Role aplikasi (least privilege)
-- =====================================================================
-- Di docker compose, role ini sudah dibuat dengan LOGIN + password oleh
-- prisma/init/01-create-app-role.sh. Blok ini memastikan migrasi tetap jalan
-- di database lain (mis. Testcontainers) yang belum punya role tersebut.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service_user') THEN
    CREATE ROLE app_service_user NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_service_user;

-- Hanya DML. Tidak ada DROP / ALTER / TRUNCATE / REFERENCES / TRIGGER.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_service_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_service_user;

-- Riwayat migrasi bukan urusan aplikasi.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public._prisma_migrations FROM app_service_user';
  END IF;
END
$$;

-- Ledger bersifat append-only: setelah tersimpan, submission tidak bisa diubah
-- atau dihapus oleh aplikasi. (Cascade dari penghapusan akun tetap jalan karena
-- aksi foreign key dieksekusi dengan hak pemilik tabel.)
REVOKE UPDATE, DELETE ON TABLE essay_submissions FROM app_service_user;

-- =====================================================================
-- 2. CHECK constraints
-- =====================================================================
ALTER TABLE users
  ADD CONSTRAINT chk_users_email_lowercase CHECK (email = lower(email)),
  ADD CONSTRAINT chk_users_daily_scan_count CHECK (daily_scan_count >= 0);

ALTER TABLE study_materials
  ADD CONSTRAINT chk_materials_content_hash CHECK (content_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE study_sessions
  ADD CONSTRAINT chk_sessions_planned_duration CHECK (planned_duration_sec > 0),
  ADD CONSTRAINT chk_sessions_actual_duration CHECK (actual_duration_sec IS NULL OR actual_duration_sec >= 0),
  ADD CONSTRAINT chk_sessions_jol CHECK (predicted_jol_score IS NULL OR predicted_jol_score BETWEEN 0 AND 100);

ALTER TABLE essay_submissions
  ADD CONSTRAINT chk_submissions_jol CHECK (predicted_jol_score BETWEEN 0 AND 100),
  ADD CONSTRAINT chk_submissions_ai_score CHECK (actual_ai_score BETWEEN 0 AND 100),
  ADD CONSTRAINT chk_submissions_ledger_hash CHECK (ledger_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE spaced_schedules
  ADD CONSTRAINT chk_spaced_interval_day CHECK (interval_day IN (3, 7));

-- =====================================================================
-- 3. Partial indexes (tidak didukung schema.prisma)
-- =====================================================================
CREATE INDEX idx_spaced_user_due
  ON spaced_schedules (user_id, next_review_at)
  WHERE is_completed = FALSE;

CREATE INDEX idx_sessions_class_governance
  ON study_sessions (class_id, status, completed_at DESC)
  WHERE class_id IS NOT NULL;

-- =====================================================================
-- 4. Row-Level Security (lapisan pertahanan kedua setelah filter di repository)
-- =====================================================================
-- Aplikasi mengisi app.current_user_id per transaksi lewat
-- SELECT set_config('app.current_user_id', $1, true)  (lihat src/config/prisma.ts).
-- Tanpa konteks, fungsi ini mengembalikan NULL sehingga semua policy menolak.
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid $$;

-- RLS TIDAK diaktifkan pada:
--   users, refresh_tokens : login & refresh harus mencari data sebelum user diketahui.
--   institutions, classes, class_members : dibutuhkan oleh policy di bawah dan
--                                          untuk join kelas via kode; dilindungi
--                                          oleh filter kepemilikan di repository.
-- RLS tidak di-FORCE, jadi pemilik tabel (role migrasi) tetap bisa mengelola data.

-- ---------- study_materials ----------
ALTER TABLE study_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY materials_owner_all ON study_materials
  FOR ALL TO app_service_user
  USING (uploader_id = app_current_user_id())
  WITH CHECK (uploader_id = app_current_user_id());

CREATE POLICY materials_class_read ON study_materials
  FOR SELECT TO app_service_user
  USING (
    class_id IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM class_members m
        WHERE m.class_id = study_materials.class_id
          AND m.student_id = app_current_user_id()
      )
      OR EXISTS (
        SELECT 1 FROM classes c
        WHERE c.id = study_materials.class_id
          AND c.educator_id = app_current_user_id()
      )
    )
  );

-- ---------- study_sessions ----------
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessions_owner_select ON study_sessions
  FOR SELECT TO app_service_user
  USING (user_id = app_current_user_id());

CREATE POLICY sessions_owner_insert ON study_sessions
  FOR INSERT TO app_service_user
  WITH CHECK (user_id = app_current_user_id());

CREATE POLICY sessions_owner_update ON study_sessions
  FOR UPDATE TO app_service_user
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());

-- Pengajar hanya melihat sesi siswa yang benar-benar terdaftar di kelasnya.
CREATE POLICY sessions_educator_read ON study_sessions
  FOR SELECT TO app_service_user
  USING (
    class_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM classes c
      JOIN class_members m ON m.class_id = c.id
      WHERE c.id = study_sessions.class_id
        AND c.educator_id = app_current_user_id()
        AND m.student_id = study_sessions.user_id
    )
  );

-- ---------- essay_submissions (append-only) ----------
ALTER TABLE essay_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY submissions_owner_select ON essay_submissions
  FOR SELECT TO app_service_user
  USING (user_id = app_current_user_id());

CREATE POLICY submissions_owner_insert ON essay_submissions
  FOR INSERT TO app_service_user
  WITH CHECK (user_id = app_current_user_id());

CREATE POLICY submissions_educator_read ON essay_submissions
  FOR SELECT TO app_service_user
  USING (
    EXISTS (
      SELECT 1
      FROM study_sessions s
      JOIN classes c ON c.id = s.class_id
      JOIN class_members m ON m.class_id = s.class_id AND m.student_id = s.user_id
      WHERE s.id = essay_submissions.session_id
        AND c.educator_id = app_current_user_id()
    )
  );

-- ---------- spaced_schedules ----------
ALTER TABLE spaced_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY spaced_owner_select ON spaced_schedules
  FOR SELECT TO app_service_user
  USING (user_id = app_current_user_id());

CREATE POLICY spaced_owner_insert ON spaced_schedules
  FOR INSERT TO app_service_user
  WITH CHECK (user_id = app_current_user_id());

CREATE POLICY spaced_owner_update ON spaced_schedules
  FOR UPDATE TO app_service_user
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
