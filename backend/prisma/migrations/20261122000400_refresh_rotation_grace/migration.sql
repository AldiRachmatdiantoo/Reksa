-- Masa tenggang rotasi refresh token (temuan QA 22 Nov 2026).
--
-- rotated_at hanya diisi saat token diganti lewat rotasi normal, bukan saat logout, kedaluwarsa,
-- atau pencabutan massal. Token yang sudah dirotasi lalu muncul lagi beberapa detik kemudian
-- adalah dua tab yang refresh bersamaan, bukan token curian: ditolak tanpa mencabut semua sesi.
-- Hak akses app_service_user ikut dari GRANT tingkat tabel di migrasi security_hardening.
ALTER TABLE refresh_tokens ADD COLUMN rotated_at TIMESTAMPTZ;
