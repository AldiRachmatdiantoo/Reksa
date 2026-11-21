# Checkpoint Progres REKSA

Catatan posisi proyek. Diperbarui setiap kali satu tahap selesai, supaya siapa pun (termasuk sesi Claude baru) bisa langsung melanjutkan.

**Checkpoint terakhir:** 21 November 2026, `study-sessions` FR-01 sampai FR-03 (Adli, branch `feat/adli-sessions`)

---

## Ringkasan posisi

| Tahap | Aldi | Adli |
| :--- | :--- | :--- |
| Langkah 0 | ✅ Selesai, di `main` (PR #1) | ⏳ Belum mulai (bagian frontend diambil alih Aldi) |
| Fase 1 | ✅ Selesai: `auth` (PR #2, #3), CI + branch protection (PR #4) | — |
| Fase 2 | ✅ Storage (PR #6) · ✅ `materials` (PR #8) · ✅ PRD v1.3 (PR #9) · ✅ `classes` FR-09 (PR #10) · 🟡 akun dasar FR-14 (branch `feat/aldi-account`) · 🟡 Frontend di [reksa-frontend](https://github.com/AldiRachmatdiantoo/reksa-frontend) | 🟡 Variasi `MockAiProvider` + `study-sessions` (branch `feat/adli-sessions`) · ⬜ `essay-scans` |
| Fase 3 | ⬜ | ⬜ |

## Riwayat checkpoint

### #9 · `study-sessions` + variasi mock AI (Adli) · branch `feat/adli-sessions`

**Mock AI:** fixture audit skor tinggi (tanpa blind spot), sedang (tetap), rendah, plus materi fotosintesis. Varian audit dipilih dari hash SHA-256 foto (deterministik). Opsi `auditFailureRate` melempar `AiProviderError` (`common/ai/ai.errors.ts`) untuk menguji alur `FAILED`.

**Migrasi** `20261121000200_session_validity` (area Aldi, menunggu review di PR): `study_sessions.validity`, `focus_ended_at`, CHECK konsistensi, partial unique index `idx_sessions_one_active`.

**Endpoint** `/api/v1/sessions` (STUDENT): `POST /`, `GET /active`, `GET /:id`, `PATCH /:id/jol`, `POST /:id/cancel`. Detail request/response di `UNTUK-ALDI.md`.

**Aturan FR-02** (di `sessions.service.ts`): waktu dari server; satu sesi aktif (baris `users` dikunci `FOR UPDATE` saat membuat sesi, index parsial sebagai penjaga terakhir); fokus aktual dipotong di preset + 5 menit; `SHORT_FOCUS` bila < 50%; `EXPIRED` dihitung saat dibaca (fokus > preset + 30 menit, atau 2 jam setelah JOL tanpa foto; batas 2 jam tidak berlaku setelah foto tersimpan). PATCH JOL bersyarat status, jadi dua permintaan paralel hanya satu yang berhasil.

**Test:** unit `tests/unit/features/study-sessions/` + varian mock; integrasi `tests/integration/sessions.test.ts` (termasuk 5 `POST` paralel → tepat 1 sesi, JOL paralel, IDOR, RLS tanpa filter, SQLi di id). Hasil: 129 unit, 148 integrasi + security, semua lulus.

**Belum:** `POST /sessions/:id/qr-bridge` (ikut `essay-scans`). Sesi `AWAITING_SCAN` dengan audit yang akhirnya `FAILED` tidak bisa dibatalkan; penyelesaiannya diatur di `essay-scans`.

### #8 · Akun dasar (FR-14) · branch `feat/aldi-account`

**Migrasi** `20261121000100_account_basics`: kolom `users.email_verified_at`, enum `AuthTokenPurpose` (`EMAIL_VERIFY`, `PASSWORD_RESET`), tabel `auth_tokens` (hanya hash SHA-256 token yang disimpan, unik, index parsial untuk token yang belum dipakai), grant DML ke `app_service_user`.

**Email:** antarmuka `IEmailService` di `src/config/email.ts`. `SmtpEmailService` (nodemailer) dipakai bila `SMTP_URL` diisi, selain itu `LogEmailService` hanya mencatat penerima dan subjek ke log. Production wajib `SMTP_URL`. Docker Compose punya service `mailpit` (SMTP `127.0.0.1:1025`, kotak masuk http://localhost:8025). Tautan di email memakai `APP_URL`, jatuh ke `CORS_ORIGIN` bila kosong. Pengiriman tidak ditunggu oleh request; kegagalan dicatat sebagai warning.

**Endpoint**
- `POST /auth/verify-email {token}` 204 (20/jam per IP) · `POST /auth/verify-email/resend` 202, butuh login, 3/jam per user, 409 bila sudah terverifikasi. Token verifikasi berlaku 24 jam, dikirim juga saat register.
- `POST /auth/password/forgot {email}` selalu 202 dengan pesan yang sama (10/jam per IP + 3/jam per email) · `POST /auth/password/reset {token,newPassword}` 204 (10 per 15 menit per IP). Token reset berlaku 30 menit. Reset juga menandai email terverifikasi, karena pemilik tautan terbukti memegang kotak masuknya.
- `PATCH /me {fullName}` · `PATCH /me/password {currentPassword,newPassword}` (5 per 15 menit per user). Password lama salah dijawab **400** `INVALID_CURRENT_PASSWORD`, bukan 401, supaya `apiClient` tidak mencoba refresh. Perangkat ini mendapat cookie sesi baru.
- Token sekali pakai: `updateMany` atomik dengan syarat `used_at IS NULL` dan belum kedaluwarsa. Tautan salah, terpakai, atau kedaluwarsa dijawab 400 `INVALID_TOKEN` dengan pesan yang sama. Token baru menghapus token lama dengan tujuan yang sama.
- `GET /auth/me` dan semua respons user bertambah `emailVerified`.

**FR-09:** `POST /classes/join` kini menolak siswa yang belum verifikasi dengan 403 `EMAIL_NOT_VERIFIED`, dicek sebelum kode kelas supaya tidak membocorkan kode yang valid.

**Keputusan:** saat ganti atau reset password, refresh token **dihapus**, bukan ditandai `revoked`. Kalau ditandai, refresh dari perangkat lain terbaca sebagai reuse dan ikut mencabut sesi baru di perangkat yang baru saja mengganti password (ditemukan oleh test integrasi).

**Catatan:** akun yang dibuat sebelum migrasi ini berstatus belum terverifikasi, jadi siswa lama perlu verifikasi dari halaman Akun sebelum bisa bergabung ke kelas. Belum ada data produksi, jadi tidak ada backfill.

**Test:** unit `auth.service.test.ts` (verifikasi, kirim ulang, lupa/reset, profil, ganti password, email gagal tidak menggagalkan register) dan `env.test.ts`; integrasi `tests/integration/account.test.ts`; security `tests/security/account.security.test.ts` (token dipakai ulang, token kedaluwarsa, enumerasi akun lewat lupa password, rate limit, sesi lain dicabut setelah reset dan ganti password, field asing ditolak) + kasus join tanpa verifikasi di `classes.security.test.ts`. Email di test ditangkap `tests/support/memoryEmail.ts`. Hasil: 96 unit, 130 integrasi + security, semua lulus.

**Frontend** (`reksa-frontend`, branch `feat/aldi-account`): halaman `/verifikasi-email`, `/lupa-password`, `/atur-ulang-password`, dan `/akun`; tautan "Lupa kata sandi?" di halaman masuk; pemberitahuan verifikasi di halaman Kelas siswa. Diverifikasi di browser bersama Mailpit.

### #7 · Kelola kelas & keanggotaan (FR-09) · branch `feat/aldi-classes`

**Endpoint** (semua butuh login, `/api/v1/classes`)
- `POST /` (EDUCATOR) `{name}` 1 sampai 100 karakter. Server membuat `class_code` 8 karakter dari alfabet tanpa `0 O 1 I L` (`crypto.randomInt`), dicoba ulang maksimal 5 kali kalau bentrok. `institution_id` diambil dari `users.institution_id`.
- `GET /`: guru mendapat kelas yang diampu, siswa mendapat kelas yang diikuti, peran lain `[]`.
- `POST /join` (STUDENT) `{classCode}`: spasi, tanda hubung, dan huruf kecil dinormalkan. Kode salah apa pun bentuknya dijawab 404 dengan pesan yang sama. Rate limit 10 percobaan per jam per user, dipasang sebelum validasi. Bergabung dua kali tidak membuat baris ganda.
- `GET /:id` (pemilik atau anggota; anggota mendapat `classCode: null`) · `PATCH /:id` ganti nama · `POST /:id/code` kode baru, kode lama langsung mati · `DELETE /:id` 204, atau 409 kalau masih ada anggota (baris kelas dikunci `FOR UPDATE` supaya tidak balapan dengan siswa yang bergabung).
- `GET /:id/members` (pemilik): `{studentId, fullName, joinedAt}`, tanpa email. `DELETE /:id/members/:studentId`: guru mengeluarkan siswa, atau siswa keluar sendiri.
- Kelas milik orang lain dijawab 404. `classes` dan `class_members` tidak memakai RLS, jadi setiap query memfilter `educatorId` atau keanggotaan secara eksplisit.

**Perubahan `materials`**
- `GET /materials`, `GET /materials/:id`, dan `GET /materials/:id/file` kini juga mengembalikan materi kelas tempat user menjadi anggota atau guru. Filter eksplisit sama dengan policy RLS `materials_class_read` yang sudah ada.
- Respons materi bertambah `className` dan `isOwner`. Hapus tetap hanya untuk pengunggah (anggota mendapat 404).

**Keputusan:** aturan hapus kelas di PRD diganti dari "belum ada sesi" menjadi "belum ada anggota", karena sesi siswa yang sudah keluar tidak terlihat oleh guru (RLS `sessions_educator_read`).

**Test:** unit `tests/unit/features/classes/` (service, kode, normalisasi) + materi kelas di unit materials; integrasi `tests/integration/classes.test.ts`; security `tests/security/classes.security.test.ts` (IDOR di semua aksi pemilik, anggota tidak melihat kode/daftar anggota, siswa tidak bisa mengeluarkan siswa lain, orang luar tidak bisa membaca materi kelas, payload SQL di kode, brute-force join 429). Hasil: 82 unit, 111 integrasi + security, semua lulus.

**Frontend** (`reksa-frontend`, branch `feat/aldi-classes`): portal guru untuk membuat kelas, menyalin dan mengganti kode, mengelola siswa, membagikan materi ke kelas, dan menghapus kelas kosong; halaman `/belajar/kelas` untuk siswa (gabung lewat kode, keluar kelas); materi kelas tampil di halaman Materi dengan label kelas dan tanpa tombol hapus. Diverifikasi di browser dengan akun guru dan siswa uji di localhost.

**Berikutnya:** FR-14 verifikasi email belum ada, jadi join belum mensyaratkan email terverifikasi (PRD FR-14). Tambahkan cek itu saat FR-14 dibangun.

### #6 · Modul `materials` (Fase 2) · branch `feat/aldi-materials`

**Endpoint** (semua butuh login, `/api/v1/materials`)
- `POST /`: JSON `{title, content, classId?}` (teks maks. 15.000 karakter) atau `multipart/form-data` field `file` + `title` (PDF maks. 10 MB, 150 halaman). Respons 201 `{material, rubricCached}`. Tipe lain 415.
- `GET /` daftar milik sendiri (maks. 50, tanpa rubrik, dengan `conceptCount`) · `GET /:id` lengkap dengan rubrik · `GET /:id/file` signed URL PDF 300 detik (`Cache-Control: no-store`) · `DELETE /:id` 204, atau 409 kalau sudah dipakai sesi belajar.

**Alur**
- PDF: magic bytes harus `application/pdf` (`file-type`), teks diambil dengan `unpdf` (`common/utils/pdfText.ts`), PDF hasil scan tanpa teks ditolak 422.
- Teks dinormalisasi lalu di-hash SHA-256. Rubrik dicache di Redis `rubric:v1:<sha256>` selama 30 hari dan divalidasi ulang dengan `AiRubricOutputSchema` saat dibaca. Teks yang sama dari PDF maupun tempelan memakai cache yang sama.
- Redis mati tidak menggagalkan unggahan (cache dilewati, dicatat di log). Kalau insert DB gagal, file PDF di storage dihapus lagi.

**Keamanan**
- Query lewat `withUserContext` (RLS) + filter `uploaderId` eksplisit; materi orang lain dijawab 404.
- `classId` hanya diterima kalau kelas itu milik pendidik yang mengunggah, selain itu 404.
- Rate limit 20 unggahan/jam per user. Zod `.strict()` untuk JSON dan field multipart.
- Middleware baru `common/middlewares/upload.middleware.ts` (`singleFileUpload`): multer di memori, 1 file, error dipetakan ke 413/400. Error baru di `AppError`: `PayloadTooLargeError` 413, `UnsupportedMediaTypeError` 415, `UnprocessableEntityError` 422.

**Test**: unit service + cache, integration (Testcontainers), security (IDOR, kelas milik pendidik lain, RLS tanpa filter, file ganda, SQLi di judul, rate limit). Total 155 lulus.

**Frontend** ([reksa-frontend](https://github.com/AldiRachmatdiantoo/reksa-frontend) branch `feat/aldi-materials`): halaman `/belajar/materi` (tempel teks atau unggah PDF, pratinjau konsep kunci, daftar, buka PDF, hapus), ruang belajar memakai materi asli. Materi contoh dihapus.

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

**Aldi** (daftar lengkap dan perkiraan progres di [SISA-ALDI.md](SISA-ALDI.md))
1. Merge PR `feat/aldi-account` di kedua repo
2. Modul `spaced-repetition` (jadwal H+3/H+7) lalu `governance`
3. Persiapan deploy: migrasi pencabutan hak `anon`/`authenticated` Supabase, `vercel.json` di reksa-frontend (rewrite + header), konfigurasi Render
4. Pantau `docs/UNTUK-ALDI.md` untuk permintaan dari Adli

**Adli** (lihat [UNTUK-ADLI.md](UNTUK-ADLI.md))
1. ~~Review schema di foldernya, perkaya `mockAi.fixtures.ts`~~ ✅
2. ~~Backend `study-sessions`~~ ✅ (PR `feat/adli-sessions`)
3. `essay-scans`: menunggu keputusan Aldi soal `essay_submissions` append-only dan infra antrean (lihat `UNTUK-ALDI.md`)

## Catatan teknis yang perlu diingat

- npm 10 (bawaan Node 22) punya bug saat memasang Vitest 4; Vitest dipasang lewat `npx npm@11`. npm 11 memblokir install script, jadi paket native seperti `argon2` dipasang dengan npm 10.
- Prisma tidak mengenal partial index. Saat membuat migrasi baru, hapus `DROP INDEX` untuk `idx_spaced_user_due` dan `idx_sessions_class_governance` jika muncul.
- `src/generated/prisma` tidak di-commit; jalankan `npx prisma generate` setelah clone.
- Advisory *moderate* tersisa hanya di dev tooling (`testcontainers` → `glob`); dependency produksi 0 vulnerability.
- Uji integration butuh Docker Desktop berjalan (Postgres, Redis, SeaweedFS ditarik otomatis).
- Image `minio/minio` sudah tidak tersedia; jangan kembali ke MinIO.
- Backend lokal di luar Docker: pakai `SMTP_URL=smtp://127.0.0.1:1025`, bukan `localhost`. Node me-resolve `localhost` ke `::1`, sedangkan port Mailpit hanya dibuka di `127.0.0.1`.
