# Checkpoint Progres REKSA

Catatan posisi proyek. Diperbarui setiap kali satu tahap selesai, supaya siapa pun (termasuk sesi Claude baru) bisa langsung melanjutkan.

**Checkpoint terakhir:** 21 November 2026, frontend di repo terpisah (Aldi, `reksa-frontend` branch `feat/aldi-frontend-app`)

---

## Ringkasan posisi

| Tahap | Aldi | Adli |
| :--- | :--- | :--- |
| Langkah 0 | ✅ Selesai, di `main` (PR #1) | ⏳ Belum mulai (bagian frontend diambil alih Aldi) |
| Fase 1 | ✅ Selesai: `auth` (PR #2, #3), CI + branch protection (PR #4) | — |
| Fase 2 | ✅ Storage (PR #6) · 🟡 Frontend di [reksa-frontend](https://github.com/AldiRachmatdiantoo/reksa-frontend) | ⬜ |
| Fase 3 | ⬜ | ⬜ |

## Riwayat checkpoint

### #5 · Frontend di repo terpisah · `reksa-frontend` branch `feat/aldi-frontend-app`

**Sumber frontend**
- Repo: https://github.com/AldiRachmatdiantoo/reksa-frontend, pemilik Aldi (bukan lagi area Adli)
- Desain: ekspor Figma Make, disimpan di `design-reference/` repo itu sebagai referensi
- Animasi: Watermelon UI (pola tab bergeser *Discrete Tabs* + `@number-flow/react`)
- Stack: Vite 8, React 19, TypeScript, Tailwind 4, react-router 7, motion

**Selesai**
- Masuk/Daftar tersambung ke endpoint `auth` asli (cookie `HttpOnly`, refresh single-flight, guard per peran)
- Alur pelajar: timer fokus → tebak nilai (JOL) + foto → hasil cek, memakai data contoh = fixture `MockAiProvider`, diberi label "contoh" di UI
- Portal guru (keadaan kosong), beranda, tema terang/gelap
- Status rinci dan backlog: `docs/CHECKPOINT.md` dan `docs/BACKLOG.md` di repo frontend

**Di repo ini**
- `docker-compose.dev.yml`: port Postgres/Redis dev kini `127.0.0.1` dan bisa diatur (`POSTGRES_DEV_PORT`, `REDIS_DEV_PORT`), untuk mesin yang port 5432-nya sudah dipakai
- CLAUDE.md §1 dan `UNTUK-ADLI.md` dicatat soal perpindahan frontend

**Menjalankan lokal**: backend `npm run dev` di `backend/`, lalu `npm run dev` di `reksa-frontend` (proksi `/api` ke `VITE_API_PROXY_TARGET`, default `http://localhost:3000`).

### #4 — Storage service S3 (Fase 2) · branch `feat/aldi-storage`

**Selesai**
- `backend/src/config/storage.ts`: `IStorageService` (`putObject`, `getSignedUrl`, `deleteObject`, `checkConnection`) + `S3StorageService` (AWS SDK v3)
- Object key dibuat server: `buildObjectKey(prefix, ownerId, ext)` → `<materials|scans>/<uuid>/<uuid>.<ext>`; setiap method menolak key di luar pola itu
- Signed URL default dan maksimal 300 detik; ditandatangani terhadap `STORAGE_PUBLIC_ENDPOINT` (host yang dibuka browser), bukan endpoint internal
- Env `STORAGE_*` divalidasi Zod; server menolak start jika bucket tidak bisa diakses
- Compose: service `storage` (SeaweedFS 4.54, uid 1000, read-only, `cap_drop: ALL`, `127.0.0.1:8333`) + `storage-init` (membuat bucket, idempoten); backend menunggu keduanya
- CSP `nginx.conf`: `img-src`/`frame-src` mengizinkan `http://localhost:8333`

**Test**
- Unit 45 (+storage key, TTL clamp, endpoint publik, env), integration 66 (+8 storage terhadap bucket sungguhan: signed URL, tanpa signature 403, signature dipindah ke key lain 403, kedaluwarsa 403, attachment, delete, key ilegal)
- Docker: backend upload dari container, signed URL diambil dari host (200), tanpa signature 403
- Semgrep bersih, `npm audit --omit=dev` 0

**Keputusan**
- **SeaweedFS, bukan MinIO.** Image MinIO tidak lagi bisa ditarik (Docker Hub & quay.io). SeaweedFS memvalidasi SigV4 dan presigned URL seperti S3/Supabase
- **Deploy: Supabase (Postgres + Storage) / Vercel (frontend) / Render (backend).** Persiapannya dicatat di README §Deploy dan PRD §9.3: rewrite `/api/*` di Vercel (cookie `SameSite=Strict`), matikan Data API Supabase + cabut hak `anon`/`authenticated`, header keamanan di `vercel.json`, `trust proxy` sesuai rantai proxy, CSP untuk host Supabase Storage

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
1. Merge PR `feat/aldi-frontend-app` (reksa-frontend) dan `feat/aldi-frontend-integration` (repo ini)
2. Modul `materials` (upload PDF → magic bytes → storage, cache rubrik SHA-256 di Redis) + halaman unggah materi di frontend
3. Persiapan deploy: migrasi pencabutan hak `anon`/`authenticated` Supabase, `vercel.json` di reksa-frontend (rewrite + header), konfigurasi Render
4. Pantau `docs/UNTUK-ALDI.md` untuk permintaan dari Adli

**Adli** (lihat [UNTUK-ADLI.md](UNTUK-ADLI.md))
1. Review schema di foldernya, perkaya `mockAi.fixtures.ts`
2. Backend `study-sessions` dan `essay-scans`, lalu kabari bentuk API final lewat `UNTUK-ALDI.md`

## Catatan teknis yang perlu diingat

- npm 10 (bawaan Node 22) punya bug saat memasang Vitest 4; Vitest dipasang lewat `npx npm@11`. npm 11 memblokir install script, jadi paket native seperti `argon2` dipasang dengan npm 10.
- Prisma tidak mengenal partial index. Saat membuat migrasi baru, hapus `DROP INDEX` untuk `idx_spaced_user_due` dan `idx_sessions_class_governance` jika muncul.
- `src/generated/prisma` tidak di-commit; jalankan `npx prisma generate` setelah clone.
- Advisory *moderate* tersisa hanya di dev tooling (`testcontainers` → `glob`); dependency produksi 0 vulnerability.
- Uji integration butuh Docker Desktop berjalan (Postgres, Redis, SeaweedFS ditarik otomatis).
- Image `minio/minio` sudah tidak tersedia; jangan kembali ke MinIO.
