-- FR-06 (B3 di docs/SISA-ALDI.md): latihan ulang H+3/H+7 yang dinilai AI.
-- Sesi SPACED_REVIEW menunjuk jadwal yang sedang dilatih. Audit memakai kolom ini untuk membatasi rubrik
-- ke konsep yang terlewat dan menandai jadwalnya selesai saat hasil DONE. Unggah foto sesi ini tidak
-- memotong kuota harian (keputusan Aldi, 22 Nov 2026).
ALTER TABLE study_sessions ADD COLUMN spaced_schedule_id UUID;

ALTER TABLE study_sessions
  ADD CONSTRAINT study_sessions_spaced_schedule_id_fkey FOREIGN KEY (spaced_schedule_id)
    REFERENCES spaced_schedules(id) ON DELETE SET NULL ON UPDATE CASCADE,
  -- Hanya sesi latihan ulang yang boleh menunjuk jadwal.
  ADD CONSTRAINT chk_sessions_review_schedule CHECK (spaced_schedule_id IS NULL OR session_type = 'SPACED_REVIEW');

CREATE INDEX idx_sessions_spaced_schedule ON study_sessions(spaced_schedule_id);
