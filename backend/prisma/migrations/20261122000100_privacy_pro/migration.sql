-- FR-13 (privasi & data anak) dan FR-11 (tier Pro lewat kode aktivasi).

-- ---------- FR-13: persetujuan & tahun lahir ----------
-- Nullable supaya akun lama tetap sah; akun tanpa versi terbaru diminta menyetujui ulang saat masuk.
ALTER TABLE users
  ADD COLUMN birth_year       SMALLINT,
  ADD COLUMN terms_version    VARCHAR(32),
  ADD COLUMN privacy_version  VARCHAR(32),
  ADD COLUMN consented_at     TIMESTAMPTZ(6),
  ADD COLUMN guardian_consent BOOLEAN NOT NULL DEFAULT FALSE,
  -- FR-11: tier efektif PRO selama pro_expires_at > now().
  ADD COLUMN pro_expires_at   TIMESTAMPTZ(6),
  ADD CONSTRAINT chk_users_birth_year CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND 2100);

-- Arsip "unduh data saya". Tanpa RLS (seperti refresh_tokens): pembersih berkala perlu melihat
-- semua baris kedaluwarsa; repository selalu memfilter user_id untuk permintaan pengguna.
CREATE TABLE data_exports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  kind         VARCHAR(16) NOT NULL,
  storage_key  TEXT NOT NULL,
  created_at   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT chk_data_exports_kind CHECK (kind IN ('ACCOUNT', 'LEDGER_PDF'))
);
CREATE INDEX idx_data_exports_user_kind_created ON data_exports(user_id, kind, created_at DESC);
CREATE INDEX idx_data_exports_expires ON data_exports(expires_at);

-- ---------- FR-11: kode aktivasi Pro ----------
-- Yang disimpan hanya SHA-256 kode; kode mentah hanya tampil sekali di skrip admin.
CREATE TABLE pro_activation_codes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash        VARCHAR(64) NOT NULL,
  label            VARCHAR(100),
  duration_days    INTEGER NOT NULL,
  max_redemptions  INTEGER NOT NULL,
  redemption_count INTEGER NOT NULL DEFAULT 0,
  expires_at       TIMESTAMPTZ(6) NOT NULL,
  created_at       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT chk_pro_codes_hash CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_pro_codes_duration CHECK (duration_days BETWEEN 1 AND 3660),
  CONSTRAINT chk_pro_codes_max CHECK (max_redemptions > 0),
  CONSTRAINT chk_pro_codes_count CHECK (redemption_count >= 0 AND redemption_count <= max_redemptions)
);
CREATE UNIQUE INDEX idx_pro_codes_hash ON pro_activation_codes(code_hash);

-- Satu user hanya bisa menukar kode yang sama satu kali.
CREATE TABLE pro_code_redemptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id     UUID NOT NULL REFERENCES pro_activation_codes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  redeemed_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_pro_redemptions_code_user ON pro_code_redemptions(code_id, user_id);
CREATE INDEX idx_pro_redemptions_user ON pro_code_redemptions(user_id);

-- Aplikasi hanya boleh menukar kode, bukan membuat atau menghapusnya (itu tugas skrip admin
-- yang memakai role pemilik skema).
REVOKE INSERT, DELETE ON TABLE pro_activation_codes FROM app_service_user;
REVOKE UPDATE, DELETE ON TABLE pro_code_redemptions FROM app_service_user;
