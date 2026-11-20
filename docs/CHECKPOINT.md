# Checkpoint Progres REKSA

Catatan posisi proyek. Diperbarui setiap kali satu tahap selesai, supaya siapa pun (termasuk sesi Claude baru) bisa langsung melanjutkan.

**Checkpoint terakhir:** 20 November 2026, setelah pipeline CI Fase 1 (Aldi)

---

## Ringkasan posisi

| Tahap | Aldi | Adli |
| :--- | :--- | :--- |
| Langkah 0 | ✅ Selesai, di `main` (PR #1) | ⏳ Belum mulai |
| Fase 1 | ✅ Selesai: `auth` (PR #2, #3), CI + branch protection (PR #4) | — |
| Fase 2 | ⬜ | ⬜ |
| Fase 3 | ⬜ | ⬜ |

## Riwayat checkpoint

### #3 — Pipeline CI & security gate (Fase 1) · PR #4, sudah di `main`

**Selesai**
- `.github/workflows/ci-security.yml`, jalan di setiap PR ke `main` dan push ke `main`:
  - `backend-quality`: `npm ci`, `prisma generate` + `validate`, typecheck, unit test, build
  - `backend-integration`: integration + security test dengan Testcontainers (Docker bawaan runner)
  - `dependency-audit`: `npm audit --audit-level=high` (backend; frontend otomatis jika sudah ada)
  - `semgrep`: OWASP Top 10, TypeScript, Node.js, secrets (`--error`, gagal jika ada temuan)
  - `docker-build`: image backend runner + migrator, cek non-root, image frontend (jika ada), `nginx -t`
  - `frontend`: `npm ci` + `npm run build`, dilewati otomatis sampai `frontend/package.json` ada
- Permission workflow minimal (`contents: read`), run lama dibatalkan otomatis saat ada push baru

**Ditemukan & diperbaiki oleh Semgrep**
- `nginx.conf` meneruskan header `Host` dari klien ke backend (bisa dipalsukan). Sekarang diisi nilai tetap `reksa-backend`.

**Verifikasi lokal**
- Semgrep 0 temuan (154 aturan), actionlint + shellcheck bersih, `nginx -t` lolos, cek non-root lolos
- Hijau di GitHub Actions (run 44771431215), keenam job lulus

**Belum**
- ~~Action belum di-pin ke commit SHA~~ → sudah: `actions/checkout` v7.0.1 dan `actions/setup-node` v7.1.0 di-pin ke SHA (temuan Semgrep di run CI pertama), `persist-credentials: false`
- ~~Branch protection~~ → aktif: ruleset `main` (tanpa hapus, tanpa force push, wajib PR, wajib 6 check hijau + up to date)
- DAST (OWASP ZAP) menunggu lingkungan staging

### #2 — Modul `auth` (Fase 1) · PR #2 & #3, sudah di `main`

**Selesai**
- Endpoint `/api/v1/auth`: `POST /register`, `POST /login`, `POST /refresh`, `DELETE /refresh` (logout), `GET /me`
- Argon2id (`memoryCost 65536`, `timeCost 3`, `parallelism 1`); login menjalankan verifikasi hash dummy untuk email tak terdaftar agar waktu respons tidak membocorkan keberadaan akun
- Cookie `__Host-access_token` (15 menit, `Path=/`) dan `__Secure-refresh_token` (7 hari, `Path=/api/v1/auth/refresh`)
- Refresh token disimpan sebagai HMAC-SHA256; rotasi di dalam transaksi `SELECT ... FOR UPDATE`; reuse mencabut semua sesi user dan dicatat sebagai `REFRESH_TOKEN_REUSE`
- Middleware bersama: `requireAuth`, `requireRole`, `rateLimit` (Redis sliding window, *fail closed* → 503)
- `src/container.ts` merangkai repository → service → router

**Test**
- Unit 30 (`npm test`), integration + security 58 (`npm run test:integration`, Testcontainers)
- Security suite: atribut cookie, token replay, JWT palsu/`alg=none`/kedaluwarsa, SQLi & field asing, rate limit, RLS, least privilege, ledger append-only, CHECK constraint
- Diverifikasi di Docker: register → me → refresh → replay (401) berjalan, Argon2 native jalan di Alpine

**Keputusan**
- Logout di `DELETE /auth/refresh` karena cookie refresh hanya terkirim ke path itu
- Replay token yang sudah di-logout juga dianggap reuse
- Rate limit per IP saja (login 5/menit, register 10/jam, refresh 30/menit); lockout per akun ditunda karena bisa disalahgunakan untuk mengunci akun korban
- Frontend wajib melakukan refresh *single-flight* (lihat [UNTUK-ADLI.md](UNTUK-ADLI.md) §3)

### #1 — Langkah 0 (Aldi) · PR #1, sudah di `main`

**Selesai**
- Backend Express 5 + TypeScript (ESM), env divalidasi Zod, error handler tanpa stack trace, middleware `validate()`
- Prisma 7 + `@prisma/adapter-pg`; 9 tabel; migrasi `init` + `security_hardening` (role `app_service_user`, CHECK, partial index, RLS di 4 tabel, ledger append-only)
- `IAiService`, `MockAiProvider` + fixture valid untuk ketiga stage, kontrak Zod keenam fitur
- Docker: backend 3 stage + target `migrator`, frontend 2 stage, `nginx.conf`, compose dengan `internal_net`, container read-only + `cap_drop: ALL`
- Dokumen: README, PRD §8.3 (kontrak), CLAUDE.md §1 (checklist Adli)

**Keputusan**
- Prisma 7 (bukan 6) karena Prisma 6 membawa advisory *high* yang menggagalkan gerbang `npm audit`
- Kolom `study_sessions.predicted_jol_score` ditambahkan agar JOL tersimpan sebelum foto diunggah (FR-03)
- Refresh cookie memakai prefiks `__Secure-` karena `__Host-` mewajibkan `Path=/`
- Tabel `class_members` ditambahkan sebagai dasar otorisasi pengajar
- Dev lokal lewat `http://localhost:8080` tanpa sertifikat (localhost dianggap *secure context*)

---

## Berikutnya

**Aldi**
1. Storage service (`IStorageService` + MinIO lokal / R2 staging); Adli menunggu ini untuk upload foto esai
2. Modul `materials`
3. Pantau `docs/UNTUK-ALDI.md` untuk permintaan dari Adli

**Adli** (lihat [UNTUK-ADLI.md](UNTUK-ADLI.md))
1. Review schema di foldernya, perkaya `mockAi.fixtures.ts`
2. Kerangka frontend + `apiClient` dengan refresh single-flight
3. Halaman Login/Register memakai endpoint `auth`

## Catatan teknis yang perlu diingat

- npm 10 (bawaan Node 22) punya bug saat memasang Vitest 4; Vitest dipasang lewat `npx npm@11`. npm 11 memblokir install script, jadi paket native seperti `argon2` dipasang dengan npm 10.
- Prisma tidak mengenal partial index. Saat membuat migrasi baru, hapus `DROP INDEX` untuk `idx_spaced_user_due` dan `idx_sessions_class_governance` jika muncul.
- `src/generated/prisma` tidak di-commit; jalankan `npx prisma generate` setelah clone.
- Advisory *moderate* tersisa hanya di dev tooling (`testcontainers` → `glob`); dependency produksi 0 vulnerability.
- Uji integration butuh Docker Desktop berjalan.
