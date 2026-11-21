-- FR-05 (PRD v1.3): audit AI asinkron. Dibuat Adli (opsi A di docs/UNTUK-ALDI.md), menunggu review Aldi.
--
-- Unggah foto membuat baris PENDING; worker mengisinya menjadi PROCESSING lalu DONE/FAILED. Karena itu
-- app_service_user kembali mendapat UPDATE (DELETE tetap dicabut), tetapi trigger di bawah menjaga ledger:
-- kolom bukti tidak pernah bisa diubah, dan baris yang sudah DONE terkunci total.

CREATE TYPE "AuditStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

ALTER TABLE essay_submissions
  ADD COLUMN audit_status      "AuditStatus" NOT NULL DEFAULT 'PENDING',
  -- Jumlah audit yang pernah dimulai (1 awal + maks. 2 retry dari pelajar).
  ADD COLUMN audit_attempts    INT NOT NULL DEFAULT 0,
  ADD COLUMN audit_error_code  VARCHAR(64),
  ADD COLUMN audit_started_at  TIMESTAMPTZ(6),
  ADD COLUMN audited_at        TIMESTAMPTZ(6),
  -- Kapan kuota terakhir dipotong untuk baris ini; dikosongkan saat dikembalikan, jadi tidak bisa dikembalikan dua kali.
  ADD COLUMN quota_charged_at  TIMESTAMPTZ(6),
  -- Bagian output AI Stage 2 (AiEssayAuditOutput.encouragingSummary) yang belum punya kolom.
  ADD COLUMN encouraging_summary TEXT;

ALTER TABLE essay_submissions
  ALTER COLUMN actual_ai_score DROP NOT NULL,
  ALTER COLUMN accurate_concepts_json DROP NOT NULL,
  ALTER COLUMN blind_spots_json DROP NOT NULL,
  ALTER COLUMN logic_corrections_json DROP NOT NULL,
  ALTER COLUMN ledger_hash DROP NOT NULL;

-- CHECK lama (rentang skor, format ledger_hash) tetap berlaku dan lolos untuk NULL.
ALTER TABLE essay_submissions
  ADD CONSTRAINT chk_submissions_attempts CHECK (audit_attempts BETWEEN 0 AND 3),
  ADD CONSTRAINT chk_submissions_done_complete CHECK (
    audit_status <> 'DONE' OR (
      actual_ai_score IS NOT NULL
      AND accurate_concepts_json IS NOT NULL
      AND blind_spots_json IS NOT NULL
      AND logic_corrections_json IS NOT NULL
      AND encouraging_summary IS NOT NULL
      AND ledger_hash IS NOT NULL
      AND audited_at IS NOT NULL
    )
  ),
  ADD CONSTRAINT chk_submissions_results_only_when_done CHECK (
    audit_status = 'DONE' OR (actual_ai_score IS NULL AND ledger_hash IS NULL)
  );

-- ---------- Penjaga ledger ----------
CREATE FUNCTION essay_submissions_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.audit_status = 'DONE' THEN
    RAISE EXCEPTION 'essay_submissions % sudah DONE dan tidak bisa diubah', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.image_storage_key IS DISTINCT FROM OLD.image_storage_key
     OR NEW.predicted_jol_score IS DISTINCT FROM OLD.predicted_jol_score
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'kolom bukti essay_submissions % tidak boleh diubah', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_essay_submissions_guard
  BEFORE UPDATE ON essay_submissions
  FOR EACH ROW EXECUTE FUNCTION essay_submissions_guard();

GRANT UPDATE ON TABLE essay_submissions TO app_service_user;

CREATE POLICY submissions_owner_update ON essay_submissions
  FOR UPDATE TO app_service_user
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());
