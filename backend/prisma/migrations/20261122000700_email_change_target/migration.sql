-- F1 ganti email: alamat tujuan disimpan bersama tokennya. Email baru belum dipakai akun
-- sampai tautan di alamat itu dibuka, jadi kolom users.email tetap alamat lama selama menunggu.
-- Hak akses app_service_user ikut dari GRANT tingkat tabel di migrasi account_basics.
ALTER TABLE auth_tokens ADD COLUMN new_email VARCHAR(254);

-- Hanya token EMAIL_CHANGE yang punya alamat tujuan, dan token EMAIL_CHANGE wajib punya.
ALTER TABLE auth_tokens ADD CONSTRAINT auth_tokens_new_email_check
  CHECK ((purpose = 'EMAIL_CHANGE') = (new_email IS NOT NULL));
