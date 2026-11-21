# Checkpoint Progres REKSA

Catatan posisi proyek. Diperbarui setiap kali satu tahap selesai, supaya siapa pun (termasuk sesi Claude baru) bisa langsung melanjutkan.

**Checkpoint terakhir:** 21 November 2026, perbaikan hasil uji PR #16 sampai #20 (Aldi, branch `fix/aldi-docker-build-bugs`)

---

## Ringkasan posisi

| Tahap | Aldi | Adli |
| :--- | :--- | :--- |
| Langkah 0 | ✅ Selesai, di `main` (PR #1) | ⏳ Belum mulai (bagian frontend diambil alih Aldi) |
| Fase 1 | ✅ Selesai: `auth` (PR #2, #3), CI + branch protection (PR #4) | — |
| Fase 2 | ✅ Storage (PR #6) · ✅ `materials` (PR #8) · ✅ PRD v1.3 (PR #9) · ✅ `classes` FR-09 (PR #10) · 🟡 akun dasar FR-14 (branch `feat/aldi-account`) · 🟡 Frontend di [reksa-frontend](https://github.com/AldiRachmatdiantoo/reksa-frontend) | ✅ Variasi `MockAiProvider` + `study-sessions` (PR #13) · ✅ monorepo frontend (PR #14) · 🟡 `essay-scans` lengkap: foto, kuota, QR bridge, unggah + audit asinkron (branch `feat/adli-essay-scans`, menunggu review Aldi) |
| Fase 3 | ⬜ | ⬜ |

## Riwayat checkpoint

### #18 · Uji menyeluruh setelah PR #16 sampai #20, delapan perbaikan · branch `fix/aldi-docker-build-bugs`

Semua suite lulus di `main`, tapi uji manual di stack Docker (nginx) menemukan masalah yang tidak tertangkap test:

1. **Layar kosong saat pindah menu di dalam `/belajar`** (build produksi). `AnimatePresence mode="wait"` bersarang di `App.tsx` tidak pernah memasang halaman baru. Diganti outlet ber-key tanpa `AnimatePresence` kedua.
2. **CSP memblokir `<style>` NumberFlow:** timer tampil sebagai deretan `0123456789...` dan halaman melebar. Hash-nya masuk `style-src`.
3. **Font teks dari Google diblokir CSP:** di-self-host lewat `@fontsource`; `build.assetsInlineLimit` mencegah font kecil menjadi `data:` URI.
4. **Header keamanan dobel di respons API** (helmet + nginx, termasuk dua CSP dan `X-Frame-Options` DENY vs SAMEORIGIN). nginx mengosongkan header itu untuk `/api/` lewat `map`; helmet diset `frameguard: deny` dan `no-referrer`.
5. **Drift Prisma** FK `auth_tokens` (`ON UPDATE CASCADE`): migrasi `20261121000400_auth_tokens_fk_sync`; `prisma migrate diff` kosong.
6. **`frontend/.gitattributes`** (aturan LFS ekspor Figma) membuat jpg selalu "modified"; dihapus, root `.gitattributes` sudah menandai gambar sebagai binary.
7. **Dokumen migrate** butuh `--build` (README root dan `frontend/tests/e2e/README.md`).
8. **CI:** job `frontend` menjalankan `npm test`; job baru `e2e` menyalakan stack Docker dengan `.env` acak sekali pakai lalu menjalankan Playwright + axe. E2E baru `navigation.spec.ts` menjaga poin 1 sampai 3.

**Hasil:** E2E 4/4 lulus di stack Docker; backend 233 unit + integrasi lulus; frontend typecheck, 33 unit, build.

### #17 · Branch coverage `study-sessions` 81,65% → 100% · branch `feat/adli-sessions-coverage`

Satu-satunya angka milik Adli yang masih di bawah target PRD §11.1 (≥ 85%). Diukur gabungan unit + integrasi.

- **Perapian:** `sessions.repository.ts` mengulang `row ? ((await toRecords(...))[0] ?? null) : null` di 4 method; diganti satu helper `toRecord`. Arm `?? null` yang tidak mungkin tercapai ikut hilang (branch repository 34 → 20).
- **Test baru (unit):** `sessions.controller.test.ts` (SSE QR bridge: header, `ready` → `uploaded`/`timeout`, `error` tanpa detail internal, browser putus = tidak ada tulisan lagi dan wait dibatalkan, ping tiap 15 detik lalu berhenti, 404 sebelum stream dibuka); `sessions.repository.test.ts` (penjaga terakhir P2002 `idx_sessions_one_active`: jadi id sesi pemenang, P2002 tanpa sesi aktif dilempar ulang, error lain dilempar tanpa mencari sesi); `sessions.service.test.ts` (race: sesi hilang saat dibatalkan → 404, sesi basi yang gagal di-EXPIRED-kan tetap dikembalikan).
- **Test regresi (integrasi):** siswa keluar dari kelas pemilik materi → sesi tetap terbaca dengan `materialTitle: null` (alasan repository tidak memakai relasi wajib).

**Hasil:** controller 8/8, service 67/67, repository 20/20 → `study-sessions` 95/95 branch. Backend keseluruhan: 94,47% statement, 88,4% branch, 95,99% baris. 410 test lulus (3 live Gemini dilewati), `npm audit --omit=dev` 0, Semgrep 0.

### #16 · Frontend tersambung ke `sessions` + `scans`, E2E Playwright + axe · branch `feat/adli-frontend-scans`

Area frontend milik Aldi; dikerjakan Adli atas persetujuan pengguna tanpa menunggu tawaran dibalas, lalu dikabarkan di `UNTUK-ALDI.md`. Rincian lengkap di `frontend/docs/CHECKPOINT.md` #9.

- Ruang Belajar, Tebak & Foto, dan Hasil Cek memakai endpoint asli (`/sessions`, `/scans`, `/me/quota`); data contoh dan label "Hasil contoh" dihapus. QR bridge laptop ↔ HP + halaman publik `/unggah`.
- E2E `frontend/tests/e2e/` (3 skenario, axe WCAG 2.1 A/AA): lulus terhadap stack Docker lewat nginx.
- Temuan saat E2E: di stack nginx, CSP memblokir Google Fonts (ikon tampil sebagai kata, font teks fallback) dan style inline (`NumberFlow` rusak). Ikon diperbaiki (self-host); font teks dan `NumberFlow` diusulkan ke Aldi (`nginx.conf` area Aldi).

### #15 · Test loop worker audit · branch `feat/adli-audit-worker-tests`

PR #16 (`essay-scans`) dan #17 (Gemini Stage 2) sudah di-merge Aldi. Coverage gabungan unit + integrasi saat itu 92,5% statement / 85,3% branch; satu-satunya file Adli yang jauh di bawah target adalah `audit.queue.ts` (51%), karena test hanya memakai `drain()`.

**Selesai:** `backend/tests/unit/features/essay-scans/audit.queue.test.ts`. `RedisAuditQueue`: FIFO, job divalidasi saat masuk, entri rusak/asing/SQLi di Redis dibuang tanpa membuat worker mati. `AuditWorker`: batas konkurensi dipatuhi (puncak = 2), polling saat antrean kosong dan mengambil job yang datang belakangan, job yang melempar dilaporkan ke `onError` dengan job-nya dan loop berlanjut, Redis mati dilaporkan tanpa job lalu dicoba lagi, `stop()` menunggu job yang sedang berjalan dan tidak mengambil job baru, `start()` ganda tidak menggandakan loop dan bisa dijalankan lagi setelah `stop()`, `drain()` berurutan dan melaporkan error.

**Hasil:** `audit.queue.ts` 100% statement/branch/fungsi/baris; 221 unit lulus (3 live dilewati), stabil 3× berturut-turut.

**Lain-lain:** `CLAUDE.md` §1 diperbarui: monorepo sudah di-merge (PR #14), kerja frontend di repo ini.

### #14 · Persiapan Fase 3: Gemini Stage 2 Vision + pertahanan prompt injection · branch `feat/adli-gemini-vision`

Branch ini dibuat **di atas** `feat/adli-essay-scans` (PR belum di-merge), jadi PR-nya menyusul setelah PR itu.

**Selesai** di `backend/src/common/ai/`
- `geminiClient.ts`: klien REST `generateContent` tanpa SDK (tanpa dependency baru), structured JSON output (`responseSchema`), batas waktu `AbortSignal`, API key di header `x-goog-api-key` (tidak pernah di URL atau pesan error). Error → `AiProviderError`: 408/429/5xx/jaringan/timeout `TRANSIENT`, 400/401/403/404 `FATAL`, diblokir/terpotong/bukan JSON `INVALID_OUTPUT`. Bisa dipakai Aldi untuk Stage 1 dan 3.
- `geminiVision.ts` (`GeminiVisionAuditor`): prompt sistem (rubrik inklusif disgrafia/disleksia/*code-switching* + aturan keamanan), rubrik sebagai data berpembatas `<rubric_json>`, `responseSchema` yang mengunci `conceptId` ke id rubrik (enum) dan status ke `MASTERED/PARTIAL/MISSING`, validasi Zod `.strict()`.
- **Skor dihitung server:** `round(100 × Σ bobot × kredit / Σ bobot)` (MASTERED 1, PARTIAL 0,5, MISSING 0). Klaim dikuasai tanpa kutipan bukti diturunkan menjadi MISSING. Model tidak punya field skor, dan field asing ditolak. Blind spot = PARTIAL + MISSING, `importanceLevel` dari bobot (≥4 HIGH, 3 MEDIUM, ≤2 LOW).
- `geminiAi.provider.ts` (`GeminiAiProvider`): Stage 2 jalan; Stage 1/3 menolak `FATAL` sampai Aldi mengisinya. **Belum dirangkai di `ai.factory.ts`** (CLAUDE.md: tanpa Gemini asli di Fase 1–2).
- `ai.errors.ts`: jenis baru `FATAL`; `AuditService` tidak mengulang `FATAL`.

**Test:** unit `geminiClient.test.ts` (bentuk permintaan, key tidak bocor, pemetaan semua error, timeout), `geminiVision.test.ts` (rumus skor, pemetaan, model "tertipu" tanpa bukti → skor 0, field `score: 100` ditolak, flag injeksi tidak mengubah skor, prompt sistem terpisah dari data, skema tanpa field skor). `gemini.live.test.ts` = uji injeksi ke Gemini asli (PRD §11.2), **dilewati** kecuali `RUN_LIVE_AI=1` + `GEMINI_API_KEY`. Hasil: 212 unit lulus (3 live dilewati), integrasi `scans` 9/9, `npm audit --omit=dev` 0, Semgrep 0, build lulus.

### #13 · Unggah foto + audit AI asinkron (FR-04, FR-05, FR-06 sebagian) · branch `feat/adli-essay-scans`

**Sinkron riwayat:** `main` ditulis ulang Aldi (commit `figma[bot]`). Commit #10 sampai #12 di-*cherry-pick* ke branch baru `feat/adli-essay-scans` dari `main` baru (tidak memuat `55c5172`). Branch lama `feat/adli-image-processor` dan `feat/adli-frontend-monorepo` lokal **jangan di-push**.

**Keputusan:** opsi A (lihat `UNTUK-ALDI.md`), dikerjakan Adli karena belum ada jawaban; menunggu review Aldi.

**Migrasi** `20261121000300_essay_audit_async`: kolom status audit + `encouraging_summary` + `quota_charged_at`, kolom hasil nullable, 2 CHECK baru, `GRANT UPDATE` + trigger `essay_submissions_guard` (baris DONE dan kolom bukti tidak bisa diubah), policy RLS update pemilik.

**Selesai** di `backend/src/features/essay-scans/`
- `scans.repository.ts`: *unit of work* dalam satu transaksi berkonteks RLS (kunci kuota + kunci sesi + insert submission atomik).
- `scans.service.ts`: `upload` (202; login atau QR; cek sesi, cek cepat kuota, `imageProcessor`, simpan, `consume` token QR, potong kuota + buat submission dalam satu transaksi, foto yatim dihapus bila gagal, antre audit, beri tahu laptop), `get` (audit tertahan → `AUDIT_STALLED` + refund saat dibaca), `retry` (maks. 2, kuota dipotong lagi).
- `audit.service.ts`: PENDING → PROCESSING → DONE/FAILED. Batas 60 detik, TRANSIENT diulang 2× (jeda 2 dan 5 detik), INVALID_OUTPUT 1×, output AI divalidasi ulang dengan Zod. DONE: `ledger_hash` (`ledgerHash.ts`), sesi `COMPLETED`, jadwal H+3/H+7 bila ada blind spot. FAILED: kuota dikembalikan sekali; jatah habis → sesi `EXPIRED`.
- `audit.queue.ts`: antrean Redis `audit:v1:queue` + `AuditWorker` (2 bersamaan, `drain()` untuk test), dijalankan `server.ts`.
- `scans.routes.ts`: `POST /scans/upload` (rate limit IP sebelum multer, auth hanya bila `sessionId`), `GET /scans/:id`, `POST /scans/:id/retry`.
- Sesi: `submissionId` di `SessionView`; batal diizinkan bila audit `FAILED`.

**Di area Aldi (dicatat di `UNTUK-ALDI.md`):** migrasi + `schema.prisma`, `config/storage.ts` (`getObject`), `server.ts` (start/stop worker), `tests/security/rls.security.test.ts` (sesuai opsi A), `tests/integration/storage.test.ts`.

**Test:** unit `audit.service.test.ts`, `scans.service.test.ts` (+ `fakeScansRepository.ts`); integrasi `tests/integration/scans.test.ts` end-to-end (JPEG ber-EXIF → 202 → worker → DONE, foto tersimpan tanpa EXIF, ledger terkunci, QR + token dipakai ulang 410, kuota 3 lalu 429, FAILED → refund → retry → DONE, jatah habis → sesi EXPIRED, 415/413/400/401, IDOR 404). Hasil: 182 unit, 176 integrasi + security, `npm audit --omit=dev` 0, Semgrep 0, `npm run build` lulus. Uji asap Docker lewat nginx `:8080` berhasil (termasuk SSE real-time).

### #12 · QR bridge laptop ↔ HP (FR-04 skenario B) · branch `feat/adli-image-processor`

**Selesai**
- `backend/src/features/essay-scans/qrBridge.gateway.ts` (`RedisQrBridge`): token 32 byte base64url, di Redis hanya SHA-256-nya (`qr:v1:token:<hash>`, TTL 300 detik). Token baru untuk sesi yang sama langsung membatalkan token lama (`SET ... GET` atomik). `consume` memakai `GETDEL`, jadi sekali pakai walau diminta paralel. `resolve` untuk validasi awal, `notifyUploaded` + `waitForUpload` untuk memberi tahu laptop (polling Redis tiap detik; tanpa koneksi subscriber, aman untuk banyak instance).
- `POST /sessions/:id/qr-bridge` (STUDENT pemilik, 20/jam): `201 { qrToken, expiresInSec: 300 }`, hanya saat `AWAITING_SCAN` dan foto belum masuk.
- `GET /sessions/:id/qr-bridge/events` (SSE, 60/jam): `retry`, `ready`, ping tiap 15 detik, lalu `uploaded {submissionId}` atau `timeout` (330 detik), lalu ditutup. Kepemilikan dicek sebelum header SSE dikirim (404 tetap JSON).

**Keputusan:** path SSE diganti dari usulan `/scans/qr-bridge/:token/events` ke `/sessions/:id/qr-bridge/events` supaya token unggah tidak masuk URL/access log. Buffering nginx dimatikan per respons dengan `X-Accel-Buffering: no`, jadi tetap jalan dengan `nginx.conf` sekarang; permintaan merapikan `location` ada di `UNTUK-ALDI.md`. PRD §8.1 diperbarui.

**Belum:** pemakaian token di `POST /scans/upload` (`resolve` → proses foto → `consume` → `notifyUploaded`) ikut modul unggah yang masih menunggu keputusan Aldi.

**Test:** unit (aturan `issueQrBridge`, kepemilikan `waitForQrUpload`); integrasi `tests/integration/qrBridge.test.ts` (token tidak tersimpan mentah, TTL ≤ 300, token lama batal, 6 `consume` paralel → tepat 1, token aneh/SQLi ditolak, SSE asli lewat HTTP: header, `ready`, `uploaded`; 404 JSON untuk siswa lain). Hasil: 155 unit, 163 integrasi + security, `npm audit --omit=dev` 0, Semgrep (aturan CI) 0 temuan.

### #11 · Kuota scan harian (FR-11, bagian Adli) · branch `feat/adli-image-processor`

**Selesai** di `backend/src/features/essay-scans/`:
- `quota.policy.ts`: aturan murni. Free 3 scan per hari WIB (00.00 WIB = 17.00 UTC, dihitung dari `last_scan_reset_at`, tanpa cron); Pro tanpa batas tapi tetap dihitung; pengembalian kuota hanya untuk scan yang dipotong di hari WIB yang sama.
- `quota.repository.ts`: baris `users` dikunci `SELECT ... FOR UPDATE`. Helper `lockQuotaState(tx)` dan `writeQuotaCounters(tx)` diekspor supaya transaksi `POST /scans/upload` nanti bisa memotong kuota dan membuat submission secara atomik.
- `quota.service.ts`: `get`, `consume` (429 `QUOTA_EXCEEDED` + `details.resetAt` + `details.quota`), `refund(userId, consumedAt)` untuk audit `FAILED`.
- `GET /api/v1/me/quota` (STUDENT): `{ quota: { tier, used, limit, remaining, resetAt } }`, `Cache-Control: no-store`. Dipasang sebagai entri `'/me/quota'` di `container.ts`; router `/me` milik `auth` tidak diubah.

**Test:** unit `tests/unit/features/essay-scans/quota.test.ts` (batas 00.00 WIB, batas Free, Pro, refund lintas hari); integrasi `tests/integration/quota.test.ts` (8 `consume` paralel → tepat 3 lolos, refund hanya baris pemilik, 403 guru, 401 tanpa login, `PATCH /me` tetap jalan). Hasil: 152 unit, 155 integrasi + security, `npm audit --omit=dev` 0.

**Catatan:** tier masih dari `users.tier`; ganti ke `pro_expires_at` saat migrasi FR-11 Aldi masuk.

### #10 · `imageProcessor` foto esai (Adli) · branch `feat/adli-image-processor`

**Selesai:** `backend/src/common/utils/imageProcessor.ts` (`SharpImageProcessor`). Tipe dicek dari magic bytes (`file-type`), lalu piksel ditulis ulang sebagai WebP: orientasi EXIF diterapkan dulu, semua metadata (EXIF, GPS, perangkat, ICC, XMP) dibuang, lebar maks. 1600px tanpa memperbesar, batas 50 MP sebelum dekode (*decompression bomb*). Tipe salah 415, file rusak/terlalu besar 422.

**Keputusan**
- **HEIC tidak diterima.** `sharp` versi npm hanya membawa dekoder AV1 (`heif` → `.avif`), tanpa HEVC, jadi foto HEIC iPhone tidak bisa dibaca. `SCAN_ALLOWED_MIME_TYPES` kini JPEG/PNG/WebP. Frontend memakai `accept="image/jpeg,image/png,image/webp"` (Safari iOS otomatis mengirim JPEG).
- **`sharp` 0.35.5**, bukan 0.34.x: 0.34.5 punya advisory *high* (libvips, libheif, librsvg) yang menggagalkan gerbang `npm audit`.

**Test:** unit `tests/unit/common/utils/imageProcessor.test.ts` (fixture JPEG berisi EXIF + GPS + orientasi 6; output tanpa metadata, diputar benar, 1600×2400; `.exe`/SVG/PDF/GIF/AVIF ditolak 415; JPEG terpotong 422; batas piksel 422). Hasil: 140 unit lulus, `npm audit --omit=dev` 0, `sharp` diverifikasi jalan di image runner Alpine (musl).

**Backlog Adli** sekarang di [BACKLOG.md](BACKLOG.md).

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
2. ~~Backend `study-sessions`~~ ✅ (PR #13)
3. ~~`imageProcessor`, kuota, QR bridge~~ ✅ · ~~unggah + worker audit + `GET /scans/:id` + retry~~ ✅ (`feat/adli-essay-scans`)
4. Unggah + worker `essay-scans`: menunggu keputusan Aldi soal `essay_submissions` append-only dan infra antrean (lihat `UNTUK-ALDI.md`)

## Catatan teknis yang perlu diingat

- npm 10 (bawaan Node 22) punya bug saat memasang Vitest 4; Vitest dipasang lewat `npx npm@11`. npm 11 memblokir install script, jadi paket native seperti `argon2` dipasang dengan npm 10.
- Prisma tidak mengenal partial index. Saat membuat migrasi baru, hapus `DROP INDEX` untuk `idx_spaced_user_due` dan `idx_sessions_class_governance` jika muncul.
- `src/generated/prisma` tidak di-commit; jalankan `npx prisma generate` setelah clone.
- Advisory *moderate* tersisa hanya di dev tooling (`testcontainers` → `glob`); dependency produksi 0 vulnerability.
- Uji integration butuh Docker Desktop berjalan (Postgres, Redis, SeaweedFS ditarik otomatis).
- Image `minio/minio` sudah tidak tersedia; jangan kembali ke MinIO.
- Backend lokal di luar Docker: pakai `SMTP_URL=smtp://127.0.0.1:1025`, bukan `localhost`. Node me-resolve `localhost` ke `::1`, sedangkan port Mailpit hanya dibuka di `127.0.0.1`.
