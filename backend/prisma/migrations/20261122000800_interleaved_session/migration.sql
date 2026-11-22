-- F3 (interleaving): satu sesi boleh mencampur dua materi berbeda.
--
-- second_material_id hanya untuk sesi INITIAL_BLURTING dan wajib berbeda dari material_id.
-- Audit memakai gabungan rubrik keduanya; bagian yang terlewat dijadwalkan ulang per materi,
-- jadi satu submission kini bisa punya jadwal H+3/H+7 untuk dua materi.

ALTER TABLE "study_sessions" ADD COLUMN "second_material_id" UUID;

ALTER TABLE "study_sessions"
  ADD CONSTRAINT "study_sessions_second_material_id_fkey"
  FOREIGN KEY ("second_material_id") REFERENCES "study_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "study_sessions"
  ADD CONSTRAINT "study_sessions_second_material_check"
  CHECK ("second_material_id" IS NULL OR ("second_material_id" <> "material_id" AND "session_type" = 'INITIAL_BLURTING'));

-- Pemeriksaan FK saat materi dihapus.
CREATE INDEX "idx_sessions_second_material" ON "study_sessions"("second_material_id");

DROP INDEX "idx_spaced_origin_interval";
CREATE UNIQUE INDEX "idx_spaced_origin_material_interval" ON "spaced_schedules"("origin_submission_id", "material_id", "interval_day");

-- Verifikasi publik ledger (FR-07) ikut membaca materi kedua, karena ia bagian dari isi yang di-hash.
DROP FUNCTION ledger_lookup(TEXT);

CREATE FUNCTION ledger_lookup(p_hash TEXT)
RETURNS TABLE (
  submission_id UUID,
  session_id UUID,
  user_id UUID,
  material_id UUID,
  second_material_id UUID,
  started_at TIMESTAMPTZ,
  focus_ended_at TIMESTAMPTZ,
  actual_duration_sec INT,
  validity TEXT,
  predicted_jol_score INT,
  actual_score INT,
  image_storage_key TEXT,
  submitted_at TIMESTAMPTZ,
  audited_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    e.id,
    e.session_id,
    e.user_id,
    s.material_id,
    s.second_material_id,
    s.started_at,
    s.focus_ended_at,
    s.actual_duration_sec,
    s.validity::TEXT,
    e.predicted_jol_score,
    e.actual_ai_score,
    e.image_storage_key,
    e.created_at,
    e.audited_at
  FROM essay_submissions e
  JOIN study_sessions s ON s.id = e.session_id
  WHERE p_hash ~ '^[0-9a-f]{64}$'
    AND e.ledger_hash = p_hash
    AND e.audit_status = 'DONE'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION ledger_lookup(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ledger_lookup(TEXT) TO app_service_user;
