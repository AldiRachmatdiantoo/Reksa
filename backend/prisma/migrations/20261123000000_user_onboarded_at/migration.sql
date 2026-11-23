-- Panduan sambutan maskot. Kolom nullable tanpa default: aman dijalankan sebelum image backend baru
-- (kode lama memakai select eksplisit, jadi tidak membaca kolom ini).
ALTER TABLE "users" ADD COLUMN "onboarded_at" TIMESTAMPTZ(6);
