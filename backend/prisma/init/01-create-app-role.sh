#!/bin/sh
# Dijalankan otomatis oleh image postgres saat volume database pertama kali dibuat.
# Membuat role aplikasi least-privilege. Hak akses tabel diberikan oleh migrasi
# 20261120000100_security_hardening.
set -eu

: "${APP_DB_PASSWORD:?APP_DB_PASSWORD wajib diisi}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=app_password="$APP_DB_PASSWORD" \
  --set=db_name="$POSTGRES_DB" <<'EOSQL'
CREATE ROLE app_service_user
  LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 50;

REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db_name" TO app_service_user;
EOSQL
