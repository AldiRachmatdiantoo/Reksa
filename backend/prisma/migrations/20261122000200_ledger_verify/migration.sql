-- FR-07: verifikasi publik ledger_hash (GET /ledger/verify/:hash).
--
-- essay_submissions memakai RLS, jadi app_service_user tanpa konteks user tidak melihat baris apa pun.
-- Fungsi SECURITY DEFINER ini hanya mengembalikan kolom yang dibutuhkan untuk menghitung ulang hash,
-- untuk satu hash yang sudah DONE. Server menghitung ulang lalu hanya menjawab valid dan tanggal sesi.

CREATE INDEX idx_submissions_ledger_hash ON essay_submissions (ledger_hash);

CREATE FUNCTION ledger_lookup(p_hash TEXT)
RETURNS TABLE (
  submission_id UUID,
  session_id UUID,
  user_id UUID,
  material_id UUID,
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
