-- F1 ganti email (lanjutan FR-14).
-- Nilai enum baru dipisah ke migrasi sendiri: PostgreSQL tidak mengizinkan nilai hasil
-- ALTER TYPE ... ADD VALUE dipakai di transaksi yang sama (CHECK di migrasi berikutnya memakainya).
ALTER TYPE "AuthTokenPurpose" ADD VALUE 'EMAIL_CHANGE';
