-- FR-02 (PRD v1.3): aturan sesi sah. Dibuat Adli di feat/adli-sessions, dikabarkan di docs/UNTUK-ALDI.md.

CREATE TYPE "SessionValidity" AS ENUM ('VALID', 'SHORT_FOCUS');

-- validity       : diisi saat fokus diakhiri (PATCH /sessions/:id/jol). SHORT_FOCUS bila fokus < 50% preset.
-- focus_ended_at : waktu server saat fokus diakhiri; dasar batas 2 jam unggah foto. Tidak bisa diturunkan
--                  dari actual_duration_sec karena nilai itu dipotong di durasi preset + 5 menit.
ALTER TABLE study_sessions
  ADD COLUMN validity "SessionValidity",
  ADD COLUMN focus_ended_at TIMESTAMPTZ(6);

ALTER TABLE study_sessions
  ADD CONSTRAINT chk_sessions_focus_ended CHECK (focus_ended_at IS NULL OR focus_ended_at >= started_at),
  ADD CONSTRAINT chk_sessions_focus_ended_fields CHECK (
    (focus_ended_at IS NULL) = (validity IS NULL)
    AND (focus_ended_at IS NULL) = (actual_duration_sec IS NULL)
  );

-- Satu pelajar hanya boleh punya satu sesi aktif. Service mengunci baris users dengan FOR UPDATE
-- sebelum memeriksa; index ini penjaga terakhir bila ada jalur lain yang lolos.
-- Prisma tidak mengenal partial index: hapus DROP INDEX idx_sessions_one_active bila muncul di migrasi baru.
CREATE UNIQUE INDEX idx_sessions_one_active ON study_sessions(user_id)
  WHERE status IN ('FOCUS_ACTIVE', 'AWAITING_SCAN');
