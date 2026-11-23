-- Kuota harian materi baru (docs/RENCANA-KUOTA-MATERI.md). Kolom ber-default dan nullable: aman dijalankan
-- sebelum image backend baru (kode lama memakai select eksplisit, jadi tidak membaca kolom ini).
ALTER TABLE "users" ADD COLUMN "daily_material_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "last_material_reset_at" TIMESTAMPTZ(6);
ALTER TABLE "users" ADD CONSTRAINT chk_users_daily_material_count CHECK (daily_material_count >= 0);
