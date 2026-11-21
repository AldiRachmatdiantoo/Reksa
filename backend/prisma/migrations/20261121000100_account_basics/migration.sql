-- FR-14: verifikasi email dan reset password.

ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ(6);

CREATE TYPE "AuthTokenPurpose" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET');

-- Token email sekali pakai. Yang disimpan hanya SHA-256 dari token acak 32 byte,
-- jadi isi tabel ini saja tidak cukup untuk memverifikasi email atau mengganti password.
CREATE TABLE auth_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     "AuthTokenPurpose" NOT NULL,
  token_hash  VARCHAR(64) NOT NULL,
  expires_at  TIMESTAMPTZ(6) NOT NULL,
  used_at     TIMESTAMPTZ(6),
  created_at  TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_auth_tokens_hash ON auth_tokens(token_hash);
-- Membersihkan token lama yang belum dipakai saat token baru diterbitkan.
CREATE INDEX idx_auth_tokens_user_purpose ON auth_tokens(user_id, purpose) WHERE used_at IS NULL;

-- ALTER DEFAULT PRIVILEGES (migrasi security_hardening) sudah memberi DML ke app_service_user;
-- GRANT eksplisit di sini supaya tidak bergantung pada siapa yang menjalankan migrasi.
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_tokens TO app_service_user;
