-- FR-10: portal admin institusi.
--
-- 1. Kode undangan pengajar (hanya SHA-256 yang disimpan).
-- 2. Indeks institution_id di users dan classes.
-- 3. Dua fungsi SECURITY DEFINER yang hanya mengembalikan agregat. essay_submissions dan study_sessions
--    memakai RLS milik siswa/pengajar, jadi admin tidak bisa membacanya langsung. Fungsi ini memeriksa
--    sendiri bahwa pemanggil (app.current_user_id) adalah INSTITUTION_ADMIN dari institusi yang diminta,
--    dan menyembunyikan angka untuk kelompok di bawah 5 siswa supaya siswa tidak bisa dikenali.

CREATE TABLE "educator_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institution_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "created_by" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "educator_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idx_educator_invites_token_hash" ON "educator_invites"("token_hash");
CREATE INDEX "idx_educator_invites_institution" ON "educator_invites"("institution_id", "created_at" DESC);
CREATE INDEX "idx_users_institution" ON "users"("institution_id");
CREATE INDEX "idx_classes_institution" ON "classes"("institution_id");

ALTER TABLE "educator_invites" ADD CONSTRAINT "educator_invites_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "educator_invites" ADD CONSTRAINT "educator_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "educator_invites"
  ADD CONSTRAINT chk_educator_invites_token_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT chk_educator_invites_expiry CHECK (expires_at > created_at);

-- Pemanggil harus admin dari institusi itu. Dipakai kedua fungsi di bawah.
CREATE FUNCTION app_is_institution_admin(p_institution UUID) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = app_current_user_id()
      AND u.role = 'INSTITUTION_ADMIN'
      AND u.institution_id = p_institution
  )
$$;

-- Per kelas: siswa yang sudah dicek, sesi selesai, rata-rata skor. Hanya anggota kelas saat ini.
-- Kelas dengan kurang dari 5 siswa yang dicek: semua angka NULL.
CREATE FUNCTION institution_class_stats(p_institution UUID)
RETURNS TABLE (
  class_id UUID,
  audited_students INT,
  completed_sessions INT,
  avg_score NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH stats AS (
    SELECT
      c.id AS class_id,
      (SELECT count(DISTINCT e.user_id)
         FROM essay_submissions e
         JOIN study_sessions s ON s.id = e.session_id
         JOIN class_members cm ON cm.class_id = c.id AND cm.student_id = e.user_id
        WHERE s.class_id = c.id AND e.audit_status = 'DONE')::INT AS audited,
      (SELECT count(*)
         FROM study_sessions s
         JOIN class_members cm ON cm.class_id = c.id AND cm.student_id = s.user_id
        WHERE s.class_id = c.id AND s.status = 'COMPLETED')::INT AS sessions,
      (SELECT avg(e.actual_ai_score)
         FROM essay_submissions e
         JOIN study_sessions s ON s.id = e.session_id
         JOIN class_members cm ON cm.class_id = c.id AND cm.student_id = e.user_id
        WHERE s.class_id = c.id AND e.audit_status = 'DONE') AS score
    FROM classes c
    WHERE c.institution_id = p_institution
      AND app_is_institution_admin(p_institution)
  )
  SELECT
    class_id,
    CASE WHEN audited >= 5 THEN audited END,
    CASE WHEN audited >= 5 THEN sessions END,
    CASE WHEN audited >= 5 THEN round(score, 1) END
  FROM stats
$$;

-- Per konsep di seluruh institusi: dari hasil cek terakhir setiap siswa per materi kelas.
-- Materi pribadi siswa tidak ikut (judulnya milik siswa). Materi dengan kurang dari 5 siswa tidak muncul.
CREATE FUNCTION institution_concept_stats(p_institution UUID)
RETURNS TABLE (
  material_id UUID,
  material_title TEXT,
  concept TEXT,
  students_missing INT,
  students_audited INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (e.user_id, s.material_id)
      e.user_id, s.material_id, e.blind_spots_json
    FROM essay_submissions e
    JOIN study_sessions s ON s.id = e.session_id
    JOIN classes c ON c.id = s.class_id
    JOIN class_members cm ON cm.class_id = c.id AND cm.student_id = e.user_id
    JOIN study_materials m ON m.id = s.material_id AND m.class_id IS NOT NULL
    WHERE c.institution_id = p_institution
      AND e.audit_status = 'DONE'
      AND app_is_institution_admin(p_institution)
    ORDER BY e.user_id, s.material_id, e.created_at DESC, e.id DESC
  ),
  cohort AS (
    SELECT material_id, count(*)::INT AS n FROM latest GROUP BY material_id HAVING count(*) >= 5
  ),
  spots AS (
    SELECT DISTINCT
      l.user_id,
      l.material_id,
      lower(regexp_replace(btrim(x.label), '\s+', ' ', 'g')) AS concept_key,
      regexp_replace(btrim(x.label), '\s+', ' ', 'g') AS label
    FROM latest l
    JOIN cohort USING (material_id)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(l.blind_spots_json) = 'array' THEN l.blind_spots_json ELSE '[]'::jsonb END
    ) AS el
    CROSS JOIN LATERAL (
      SELECT CASE jsonb_typeof(el) WHEN 'string' THEN el #>> '{}' WHEN 'object' THEN el ->> 'concept' END AS label
    ) AS x
    WHERE x.label IS NOT NULL AND btrim(x.label) <> ''
  )
  SELECT
    sp.material_id,
    m.title::TEXT,
    min(sp.label),
    count(DISTINCT sp.user_id)::INT,
    co.n
  FROM spots sp
  JOIN cohort co USING (material_id)
  JOIN study_materials m ON m.id = sp.material_id
  GROUP BY sp.material_id, m.title, sp.concept_key, co.n
  ORDER BY count(DISTINCT sp.user_id)::NUMERIC / co.n DESC, min(sp.label)
  LIMIT 30
$$;

REVOKE ALL ON FUNCTION app_is_institution_admin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION institution_class_stats(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION institution_concept_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION institution_class_stats(UUID) TO app_service_user;
GRANT EXECUTE ON FUNCTION institution_concept_stats(UUID) TO app_service_user;
