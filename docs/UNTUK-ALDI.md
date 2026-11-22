# Catatan untuk Aldi

Dari: Adli
Terakhir diperbarui: 21 November 2026

File ini adalah jalur Adli → Aldi, pasangan dari [`UNTUK-ADLI.md`](UNTUK-ADLI.md). Tulis di sini apa pun yang butuh tindakan atau perlu diketahui Aldi, lalu kirim lewat PR. Sesi Claude milik Aldi membaca file ini setiap kali mulai.

**Cara pakai**
- Tambahkan entri baru **di paling atas** bagiannya, lengkap dengan tanggal.
- Jangan hapus entri lama; tandai statusnya saja: `⏳ menunggu`, `🔧 dikerjakan`, `✅ selesai`.
- Aldi yang mengubah status menjadi `✅` setelah permintaan beres.

---

## Permintaan

Hal yang butuh perubahan di area Aldi (migrasi database, `nginx.conf`, Docker, `config/`, kontrak di fitur Aldi, dan sebagainya).

<!--
Contoh format:

### ⏳ 2026-11-25 — Kolom `concealed_at` di `study_sessions`
**Butuh untuk:** fitur mode penyembunyian materi (FR-02)
**Detail:** TIMESTAMPTZ nullable, diisi saat timer mulai.
**Mendesak?** Ya, memblokir integration test sessions.
-->

### ✅ 2026-11-21 — CSP nginx merusak angka `NumberFlow` dan font teks (area kamu, ditemukan E2E)
**Selesai (Aldi, branch `fix/aldi-docker-build-bugs`):** hash style NumberFlow masuk `style-src`, font teks di-self-host lewat `@fontsource` dan `<link>` Google dihapus, Vite tidak lagi menjadikan font kecil `data:` URI. Dijaga E2E baru `tests/e2e/navigation.spec.ts` (gagal bila ada pelanggaran CSP atau halaman melebar).
**Bukti** (stack Docker lewat nginx `:8080`, console browser):
- `Applying inline style violates ... 'style-src 'self''`: `NumberFlow` menyuntikkan style inline, jadi timer di Ruang Belajar dan skor di Hasil Cek tampil sebagai deretan `0123456789...` dan halaman melebar (1390px di layar 1280px).
- `Loading the stylesheet 'https://fonts.googleapis.com/...' violates ...`: Plus Jakarta Sans, Radio Canada Big, Spline Sans Mono tidak pernah termuat; aplikasi memakai font sistem.
- Di `npm run dev` semuanya terlihat normal karena Vite tidak memasang CSP, jadi wajar belum ketahuan.
**Usulan:**
- `NumberFlow`: tambahkan hash style-nya ke `style-src` (console memberi hash `sha256-...`), atau `style-src 'self' 'unsafe-inline'` (risiko kecil dibanding `script-src`), atau ganti komponen angka. Perlu juga di `vercel.json` nanti kalau CSP-nya sama.
- Font teks: self-host seperti ikon (`@fontsource/plus-jakarta-sans`, `@fontsource/radio-canada-big`, `@fontsource/spline-sans-mono`) lalu hapus `<link>` Google Fonts di `index.html`. Bonus privasi (FR-13): browser pelajar tidak menghubungi Google.
**Mendesak?** Sedang: semua halaman yang memakai angka animasi rusak di Docker/produksi.

### 2026-11-21 — ✅ Frontend alur belajar tersambung ke backend asli (dikerjakan di areamu, branch `feat/adli-frontend-scans`)
Maaf tidak menunggu tawaran dibalas: saya (Adli) memutuskan langsung mengerjakannya karena backend sudah jadi dan halamannya masih memakai data contoh. Kalau ada yang tidak sesuai desainmu, bilang saja dan saya ubah.
- **File yang berubah:** `src/core/apiClient.ts` (`ApiError.details`), `src/App.tsx` (rute publik `/unggah`), `src/main.tsx` + `src/index.css` (ikon self-host), `features/studio/StudioPage.tsx` + `studySession.tsx`, `features/scanner/CalibratePage.tsx`, `features/audit-result/ResultPage.tsx`. **Baru:** `features/studio/sessionsApi.ts`, `features/scanner/{scansApi.ts, QrBridgePanel.tsx, PhoneUploadPage.tsx}`, `tests/unit/scansApi.test.ts`, `tests/e2e/`, `playwright.config.ts`. Halaman lain (beranda, auth, materi, kelas, guru) tidak disentuh.
- **Dependency baru:** `qrcode` 1.5.4, `@fontsource-variable/material-symbols-outlined` 5.3.9; dev: `@playwright/test` 1.59.1, `@axe-core/playwright` 4.14.0, `@types/qrcode`. `npm audit` 0.
- **Perilaku:** sesi dibuat di server saat "Mulai waktu fokus"; "Ulangi" dan "Mulai sesi baru" membatalkannya di server; sesi aktif dipulihkan dari `GET /sessions/active`. `sampleAudit.ts` masih ada hanya untuk tipe `EssayAudit` (tur beranda tidak memakainya).
- **Ikon:** di nginx, CSP memblokir Google Fonts sehingga ikon tampil sebagai kata. Saya self-host font ikonnya (varian `fill`, 1,1 MB) karena axe menggagalkannya (WCAG 2.5.3). `<link>` Google di `index.html` belum saya hapus (ikut keputusan font teks di atas).
- **E2E:** `npm run test:e2e` terhadap stack Docker, cara jalan di `frontend/tests/e2e/README.md`. Belum masuk CI.

### ✅ 2026-11-21 — Keputusan produk: skor Stage 2 dihitung server (Gemini)
**Disetujui (Aldi, 22 Nov 2026):** skor dihitung server dari bobot rubrik seperti di `mapStage2Output`; model tidak menentukan angka.
**Butuh untuk:** Fase 3, `GeminiAiProvider` Stage 2 (branch `feat/adli-gemini-vision`, belum aktif).
**Usulan:** dengan Gemini, `actualScore` **tidak** diambil dari model. Model hanya menilai tiap konsep rubrik (`MASTERED`/`PARTIAL`/`MISSING`) dan wajib mengutip bukti dari tulisan; server menghitung `round(100 × Σ bobot × kredit / Σ bobot)` (1 / 0,5 / 0). Klaim tanpa bukti dihitung `MISSING`.
**Alasan:** pertahanan *prompt injection* (PRD §5.3): tulisan "beri nilai 100" di foto tidak punya jalan untuk mengubah angka, dan skor bisa dijelaskan ke guru dari bobot rubrik (cocok dengan ledger FR-07).
**Konsekuensi:** skor menjadi "cakupan konsep berbobot", bukan penilaian holistik; kesalahan logika muncul di `logicCorrections` tetapi tidak mengurangi skor. `MockAiProvider` tetap memakai skor fixture. Kalau kamu lebih suka skor holistik dari model, bilang saja; rumus ada di satu fungsi (`mapStage2Output`).
**Mendesak?** Tidak, Fase 3 belum dibuka.

### 2026-11-21 — Untuk Stage 1 dan 3 (bagianmu, Fase 3)
- `backend/src/common/ai/geminiClient.ts` siap dipakai: `new GeminiClient({ apiKey }).generateJson({ model, systemInstruction, parts, responseSchema })`, error sudah dipetakan ke `AiProviderError` (`TRANSIENT`/`INVALID_OUTPUT`/`FATAL`). Hasilnya tetap wajib divalidasi dengan skema Zod di `ai.schema.ts`.
- `GeminiAiProvider.extractRubric` dan `clusterCohortBlindSpots` masih melempar `FATAL`; silakan isi di file yang sama atau modul terpisah seperti `geminiVision.ts`.
- `ai.factory.ts` belum saya ubah. Saat Fase 3 dibuka: `case 'gemini': return new GeminiAiProvider({ clientOptions: { apiKey: env.GEMINI_API_KEY! } })`.
- Jenis error baru `FATAL` (400/401/403): `AuditService` tidak mengulangnya. Kalau `materials` memanggil `extractRubric`, perlakukan `FATAL` sebagai konfigurasi salah, bukan kesalahan pengguna.

### ✅ 2026-11-21 — Review: audit asinkron `essay-scans` menyentuh area kamu (opsi A)
**Selesai:** disetujui dan di-merge lewat PR #16 (tes worker di PR #18). Temuan header `X-Content-Type-Options` ganda sudah beres lewat `map` di `nginx.conf`.
Kamu belum sempat memutuskan, jadi atas persetujuan saya (Adli) Claude mengerjakan **opsi A** penuh di branch `feat/adli-essay-scans`. Mohon direview di PR; kalau tidak setuju, bilang saja dan saya ubah.

**File di area kamu yang berubah**
- `backend/prisma/migrations/20261121000300_essay_audit_async/` + `schema.prisma` (model `EssaySubmission`, enum `AuditStatus`):
  - kolom `audit_status`, `audit_attempts` (0..3), `audit_error_code`, `audit_started_at`, `audited_at`, `quota_charged_at`, `encouraging_summary` (output AI `encouragingSummary` sebelumnya tidak punya kolom);
  - kolom hasil jadi nullable; CHECK `chk_submissions_done_complete` (DONE wajib lengkap) dan `chk_submissions_results_only_when_done` (hasil hanya saat DONE);
  - `GRANT UPDATE` (DELETE tetap dicabut) + trigger `essay_submissions_guard`: baris `DONE` terkunci total, kolom bukti (`session_id`, `user_id`, `image_storage_key`, `predicted_jol_score`, `created_at`) tidak bisa diubah kapan pun; policy RLS `submissions_owner_update`.
- `backend/tests/security/rls.security.test.ts`: fixture submission diberi `auditStatus: 'DONE'`; test "owner cannot update" kini mengharapkan pesan trigger (`sudah DONE`), bukan `permission denied`; tambahan test kolom bukti, RLS update, dan dua CHECK baru.
- `backend/src/config/storage.ts`: method baru `getObject(key, maxBytes)` (worker mengunduh foto untuk AI; signed URL tidak terjangkau dari dalam container). Test di `tests/integration/storage.test.ts`.
- `backend/src/server.ts`: worker audit di-`start()` dan di-`stop()` sebelum DB/Redis ditutup.

**Yang perlu kamu tahu untuk modulmu**
- **FR-06:** saat audit `DONE` dengan ≥ 1 blind spot, worker membuat 2 baris `spaced_schedules` (H+3, H+7, `target_blind_spots_json` = blind spots) di transaksi yang sama. Modul `spaced-repetition` cukup membaca/menyelesaikannya.
- **FR-07:** `ledger_hash` = SHA-256 dari JSON kanonik berversi `reksa-ledger-v1` (`essay-scans/ledgerHash.ts`, `computeLedgerHash`). `GET /ledger/verify/:hash` bisa menghitung ulang untuk mendeteksi perubahan data.
- Antrean: daftar Redis `audit:v1:queue`, worker 2 audit bersamaan per proses. Job yang hilang (proses mati) tidak membuat data macet: `GET /scans/:id` menyatakan `AUDIT_STALLED` + kuota kembali.
- Uji asap di Docker (`docker compose` + migrator) lewat nginx `:8080`: daftar → sesi → JOL → unggah 202 → `DONE` dalam 1 detik → sesi `COMPLETED`, foto WebP tanpa EXIF; SSE QR bridge real-time lewat nginx tanpa ubah `nginx.conf`.
- Temuan kecil (area kamu, tidak mendesak): respons API membawa header `X-Content-Type-Options` dua kali (helmet + `add_header` nginx).

### ✅ 2026-11-21 — `nginx.conf`: path SSE QR bridge final (tidak mendesak)
**Selesai (Aldi, branch `feat/aldi-tidy-notes`):** `location` lama diganti `~ "^/api/v1/sessions/[0-9a-f-]{36}/qr-bridge/events$"` dengan isi yang sama. Polanya wajib dikutip: tanpa kutip, nginx membaca `{` sebagai awal blok dan gagal start (tertangkap saat image dibangun ulang).
**Butuh untuk:** FR-04 skenario B (checklist Adli poin 4 di `CLAUDE.md`).
**Detail:** path final `GET /api/v1/sessions/<uuid>/qr-bridge/events`, bukan usulan lama `/api/v1/scans/qr-bridge/<token>/events` (token unggah sebaiknya tidak masuk URL karena tercatat di access log). Usul ganti `location` SSE di `frontend/nginx.conf` menjadi `~ ^/api/v1/sessions/[0-9a-f-]{36}/qr-bridge/events$` dengan isi yang sama (`proxy_buffering off`, `proxy_read_timeout 330s`).
**Mendesak?** Tidak. Backend sudah mengirim `X-Accel-Buffering: no` dan ping tiap 15 detik, jadi SSE tetap jalan lewat `location /api/` biasa. Perubahan ini hanya merapikan aturan lama yang sekarang tidak terpakai.
**Catatan deploy:** rewrite Vercel ke Render bisa membatasi durasi respons stream. Kalau SSE terputus di produksi, frontend cukup jatuh ke polling `GET /sessions/:id` (`hasSubmission`) tiap 3 detik.

### ✅ 2026-11-21 — Usulan: satukan `reksa-frontend` ke `frontend/` (monorepo)
**Selesai:** di-merge lewat PR #14.
**Butuh untuk:** satu tempat untuk menjalankan, menguji, dan me-review frontend + backend; kontrak API dan UI berubah dalam satu PR.
**Yang sudah saya lakukan** di branch `feat/adli-frontend-monorepo` (belum di-merge, menyentuh area kamu, jadi butuh persetujuanmu):
- *Subtree merge* `reksa-frontend` `main` (`b6e1792`, 15 commit, riwayat tetap utuh) ke `frontend/`. Tidak ada file yang bentrok: `frontend/Dockerfile`, `nginx.conf`, `.dockerignore` milikmu tidak berubah.
- Dicek lokal: `npm ci` + `npm run build` + 22 test frontend lulus, `npm audit --audit-level=high` 0, Semgrep (aturan CI) 0 temuan, `docker build frontend` jalan sebagai non-root.
- `CLAUDE.md` §1 dan `frontend/AGENTS.md` diberi catatan monorepo.
**Yang perlu kamu putuskan / lakukan kalau setuju:**
- Semua branch `reksa-frontend` (`feat/aldi-account`, `-classes`, `-frontend-app`, `-landing-story`, `-materials`) sudah ada di `main` repo itu, jadi tidak ada pekerjaan yang tertinggal. Commit baru di repo lama sebelum PR ini di-merge bisa ditarik dengan `git subtree pull --prefix=frontend https://github.com/AldiRachmatdiantoo/reksa-frontend main`, lalu repo lama diarsipkan.
- Vercel: *Root Directory* proyek diganti ke `frontend` (rencana `vercel.json` ikut pindah ke `frontend/`).
- Kalau tidak setuju, PR cukup ditutup; tidak ada yang berubah di repo mana pun.
**Mendesak?** Tidak. Kerja `study-sessions` ada di PR terpisah (`feat/adli-sessions`).

### ✅ 2026-11-21 — Keputusan: `essay_submissions` append-only vs audit asinkron (FR-05) · opsi A, di-merge lewat PR #16
**Butuh untuk:** `essay-scans` (unggah 202 → worker audit)
**Masalah:** `security_hardening` mencabut `UPDATE, DELETE ON essay_submissions` dari `app_service_user`. PRD v1.3 FR-05 justru membuat baris saat unggah (`audit_status = PENDING`) lalu mengubahnya ke `PROCESSING` dan `DONE`/`FAILED`, sambil mengisi skor, `*_json`, dan `ledger_hash` saat `DONE`. Dengan grant sekarang, worker tidak bisa menulis hasil audit.
**Usulan (pilih salah satu):**
- **A (usulan saya):** kembalikan `GRANT UPDATE` (tanpa `DELETE`) dan tambah trigger `BEFORE UPDATE` yang menolak perubahan apa pun jika `OLD.audit_status = 'DONE'`, serta menolak perubahan kolom bukti (`session_id`, `user_id`, `image_storage_key`, `predicted_jol_score`, `created_at`) kapan pun. Ledger tetap tidak bisa diubah setelah `DONE`, dan kode `governance` tetap membaca satu tabel. Plus policy RLS `submissions_owner_update` (`user_id = app_current_user_id()`).
- **B:** pisahkan hasil ke tabel append-only baru `essay_audits` (`submission_id UNIQUE`, skor, `*_json`, `ledger_hash`), sedangkan status/percobaan di tabel lain yang boleh diubah. Lebih murni, tetapi `governance`/ledger harus join dua tabel.
**Mendesak?** Ya, memblokir `essay-scans`. Saya mulai dari `study-sessions` dulu sambil menunggu.

### ✅ 2026-11-21 — Review migrasi `20261121000200_session_validity` (saya buat di area kamu)
**Selesai:** disetujui dan di-merge lewat PR #13.
**Butuh untuk:** FR-02 aturan sesi sah. Sesuai UNTUK-ADLI §1e, saya membuatnya di `feat/adli-sessions`; mohon direview di PR.
**Isi** (aditif, hanya `study_sessions`):
- enum `SessionValidity (VALID, SHORT_FOCUS)` + kolom `validity` (nullable).
- kolom `focus_ended_at TIMESTAMPTZ`. Ini tidak ada di PRD §7.1, tapi dibutuhkan untuk batas 2 jam unggah foto: `actual_duration_sec` dipotong di preset + 5 menit, jadi waktu JOL tidak bisa diturunkan dari situ.
- CHECK `focus_ended_at >= started_at`, dan `focus_ended_at`, `validity`, `actual_duration_sec` selalu terisi bersamaan.
- partial unique index `idx_sessions_one_active ON study_sessions(user_id) WHERE status IN ('FOCUS_ACTIVE','AWAITING_SCAN')`. Prisma tidak mengenalnya, jadi ikut catatan CHECKPOINT: hapus `DROP INDEX idx_sessions_one_active` bila muncul di migrasi baru.
- `schema.prisma`: hanya model `StudySession` + enum baru (kolomnya ikut di-*align* ulang oleh `prisma format`).
**Mendesak?** Ya, `study-sessions` bergantung padanya. Semua test lulus: 129 unit, 148 integrasi + security.

### ✅ 2026-11-21 — Migrasi kolom audit untuk `essay-scans` (FR-05, FR-11) · `20261121000300_essay_audit_async` di PR #16; `pro_expires_at` di migrasi Aldi `20261122000100_privacy_pro`, dan kuota sudah membacanya
**Detail** (sesuai PRD §7.1, menunggu keputusan append-only di atas):
- `essay_submissions.audit_status` enum `AuditStatus (PENDING, PROCESSING, DONE, FAILED)` default `PENDING`, `audit_attempts INT DEFAULT 0 CHECK (audit_attempts >= 0)`, `audit_error_code VARCHAR(64) NULL`.
- `actual_ai_score`, `accurate_concepts_json`, `blind_spots_json`, `logic_corrections_json`, `ledger_hash` menjadi nullable; CHECK diganti agar wajib terisi saat `audit_status = 'DONE'`.
- `users.pro_expires_at` (FR-11). Kalau masih lama, saya pakai `users.tier` dulu sesuai UNTUK-ADLI §1e.
Kalau kamu setuju opsi A di atas, saya bisa sekalian membuat migrasi ini di branch `essay-scans` lalu kamu review, seperti migrasi sesi.

### ✅ 2026-11-21 — Infra antrean worker audit (FR-05) · antrean Redis sederhana tanpa BullMQ, di-merge lewat PR #16
**Butuh untuk:** worker `evaluateHandwritingEssay` dengan batas audit bersamaan
**Detail:** UNTUK-ADLI §1e menyebut antrean Redis disiapkan Aldi, tetapi belum ada di `package.json` maupun `container.ts`. Pertanyaannya: BullMQ jadi dipakai? Worker berjalan di proses backend yang sama atau service terpisah di `docker-compose.yml`? Sambil menunggu, `essay-scans` saya tulis terhadap antarmuka kecil `IAuditQueue { enqueue(submissionId) }` supaya implementasinya bisa ditukar.
**Tambahan kecil (opsional):** env `MOCK_AI_AUDIT_FAILURE_RATE` (0..1, default 0) di `config/env.ts` dan diteruskan di `ai.factory.ts` ke opsi baru `MockAiProvider({ auditFailureRate })`, supaya alur `FAILED` bisa dicoba manual di frontend.
**Mendesak?** Belum. Dibutuhkan setelah keputusan append-only.

## Kabar & progres

Hal yang perlu Aldi ketahui tapi tidak butuh tindakan (fitur selesai, perubahan kontrak di area Adli, keputusan desain).

### 2026-11-21 — ✅ Unggah foto + hasil cek asli siap disambungkan (FR-04, FR-05)
- `POST /api/v1/scans/upload` multipart: `image` (JPEG/PNG/WebP, maks. 5 MB) + **tepat satu** dari `sessionId` (login STUDENT) atau `qrToken` (HP tanpa login). → `202 { submissionId, auditStatus: 'PENDING', quota }`.
  - Error: `400` field salah · `401` `sessionId` tanpa login · `404` sesi bukan milik · `409 INVALID_SESSION_STATE` (JOL belum / foto sudah ada) · `409 SESSION_EXPIRED` · `410 QR_TOKEN_INVALID` · `413` · `415` · `422` foto rusak · `429 QUOTA_EXCEEDED` (`details.quota`) atau `429` rate limit (30/jam per IP).
- `GET /api/v1/scans/:id` → `{ scan }`: `auditStatus` (`PENDING`/`PROCESSING`/`DONE`/`FAILED`), `retriesLeft`, `errorCode`, `imageUrl` (signed 300 detik), `ledgerHash`, dan `result` saat `DONE`: `{ actualScore, jolDelta, accurateConcepts, blindSpots, logicCorrections, encouragingSummary }` (bentuk sama dengan `SAMPLE_AUDIT`, ditambah `jolDelta`). Poll tiap 2 detik sampai 90 detik (PRD FR-05).
- `POST /api/v1/scans/:id/retry` → `202` sama seperti unggah. Hanya saat `FAILED`, maks. 2 kali, memotong kuota lagi (kuota audit gagal sudah dikembalikan).
- `SessionView` kini punya `submissionId`; setelah muat ulang, halaman hasil bisa ditemukan dari `GET /sessions/active` atau `GET /sessions/:id`. Sesi yang auditnya `FAILED` boleh dibatalkan (`POST /sessions/:id/cancel`); bila jatah cek ulang habis, sesi otomatis `EXPIRED`.

### 2026-11-21 — ✅ QR bridge laptop ↔ HP siap disambungkan (FR-04 skenario B)
Alur untuk frontend:
1. Laptop, setelah `PATCH /sessions/:id/jol`: `POST /api/v1/sessions/:id/qr-bridge` → `201 { qrToken, expiresInSec: 300 }`. `409 INVALID_SESSION_STATE` bila JOL belum disimpan atau foto sudah masuk; `409 SESSION_EXPIRED`. Minta lagi = token lama batal.
2. Tampilkan QR berisi tautan halaman unggah HP dengan token di **fragment**, misalnya `${APP_URL}/unggah#<qrToken>`. Fragment tidak dikirim ke server, jadi token tidak masuk log mana pun.
3. Laptop membuka `new EventSource('/api/v1/sessions/:id/qr-bridge/events', { withCredentials: true })` dan mendengarkan event `ready`, `uploaded` (`{ submissionId }`, lalu buka halaman hasil), `timeout` (token habis, tawarkan QR baru), dan `error`. Server menutup stream setelah `uploaded`/`timeout`; tutup `EventSource` di sisi klien juga supaya tidak tersambung ulang.
4. HP (tanpa login) mengirim `POST /api/v1/scans/upload` multipart `image` + `qrToken`. **Endpoint ini belum ada** (menunggu keputusan append-only), tetapi kontraknya tetap seperti `UploadScanFieldsSchema`.
- Rate limit: buat token 20/jam, buka stream 60/jam per user.

### 2026-11-21 — ✅ `GET /me/quota` siap (FR-11)
- `GET /api/v1/me/quota` (STUDENT) → `{ quota: { tier, used, limit, remaining, resetAt } }`; Pro: `limit` dan `remaining` `null`. `resetAt` = 00.00 WIB berikutnya (ISO UTC).
- Dipasang sebagai entri `'/me/quota'` tersendiri di `container.ts`, jadi `createMeRouter` di `auth.routes.ts` **tidak** saya ubah. Kalau nanti kamu menambah `GET /me/:sesuatu` dengan parameter dinamis, pastikan tidak menelan `/me/quota`.
- Kuota habis nanti di `POST /scans/upload`: `429` dengan `error.code = 'QUOTA_EXCEEDED'` dan `error.details = { resetAt, quota }`. Bedakan dari `429 TOO_MANY_REQUESTS` rate limit (yang punya header `Retry-After`).
- Tier masih dibaca dari `users.tier`. Begitu `pro_expires_at` kamu migrasi, kabari saya; cukup ubah `lockQuotaState`/`getState` di `quota.repository.ts`.

### 2026-11-21 — Kontrak foto esai: HEIC tidak diterima lagi
- `SCAN_ALLOWED_MIME_TYPES` di `essay-scans/scans.schema.ts` kini hanya `image/jpeg`, `image/png`, `image/webp`. `sharp` versi npm tidak punya dekoder HEVC, jadi HEIC dari iPhone tidak bisa dibaca server.
- **Untuk frontend:** pasang `accept="image/jpeg,image/png,image/webp"` di input foto (juga yang `capture="environment"`). Safari iOS otomatis mengonversi ke JPEG bila HEIC tidak diminta. File lain dijawab `415 UNSUPPORTED_MEDIA_TYPE`, foto rusak `422`.
- Foto disimpan sebagai WebP maks. lebar 1600px tanpa metadata, jadi `<img>` hasil signed URL selalu WebP.
- Dependency baru `sharp` 0.35.5 (0.34.x punya advisory *high*). Jalan di image Alpine, sudah dicek.

### 2026-11-21 — ✅ Endpoint `study-sessions` siap disambungkan ke frontend (branch `feat/adli-sessions`)
Semua butuh login sebagai `STUDENT`. Sesi milik orang lain dijawab 404. Semua waktu dari jam server (ISO UTC); field waktu dari klien ditolak 400 (`.strict()`).

| Method | Path | Body | Sukses | Error khusus |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/sessions` | `{ materialId, preset: 'CLASSIC_25_5' \| 'DEEP_45_10' \| 'FOCUS_SPRINT_15_3', classId? }` | `201 { session }` | `404` materi/kelas tidak bisa diakses · `409 ACTIVE_SESSION_EXISTS` + `error.details.activeSessionId` · `429` (30/jam) |
| `GET` | `/api/v1/sessions/active` | | `200 { session \| null }` | |
| `GET` | `/api/v1/sessions/:id` | | `200 { session }` | `404` |
| `PATCH` | `/api/v1/sessions/:id/jol` | `{ predictedJolScore: int 0..100 }` | `200 { session }` (status `AWAITING_SCAN`) | `409 SESSION_EXPIRED` · `409 INVALID_SESSION_STATE` (JOL sudah disimpan) |
| `POST` | `/api/v1/sessions/:id/cancel` | | `200 { session }` (status `EXPIRED`, idempoten) | `409 INVALID_SESSION_STATE` (sudah selesai / foto sudah diunggah) |

Bentuk `session` (`SessionView` di `sessions.schema.ts`): `id, materialId, materialTitle (null bila materi tak lagi terbaca), classId, sessionType, preset, status, validity ('VALID' | 'SHORT_FOCUS' | null), plannedDurationSec, actualDurationSec, predictedJolScore, startedAt, focusEndsAt, focusDeadlineAt, focusEndedAt, scanDeadlineAt, hasSubmission, completedAt`.

Catatan untuk frontend:
- **Timer** dihitung dari `focusEndsAt` server, bukan jam klien. Setelah halaman dimuat ulang, panggil `GET /sessions/active` untuk memulihkan timer (pengganti persistensi Zustand sebagai sumber kebenaran).
- **Kontrak beda dari dugaan UNTUK-ADLI §0:** JOL tidak dikirim di `POST /sessions`, tapi di `PATCH /sessions/:id/jol` saat fokus diakhiri (sesuai PRD §8.3). Durasi tidak dikirim klien, cukup `preset`.
- **409 `ACTIVE_SESSION_EXISTS`:** tawarkan "Lanjutkan sesi" (`GET /sessions/:id`) atau "Batalkan" (`POST /sessions/:id/cancel`).
- `classId` tidak otomatis diambil dari materi kelas; kirim eksplisit bila sesi untuk kelas (supaya masuk ledger guru).
- `validity = SHORT_FOCUS` tetap boleh lanjut ke foto; cukup beri tahu pelajar fokusnya terlalu singkat untuk ledger.
- `POST /sessions/:id/qr-bridge` belum ada; ikut modul `essay-scans`.

### 2026-11-21 — `MockAiProvider` sekarang punya variasi data dan simulasi gagal
- Fixture baru di `mockAi.fixtures.ts`: `MOCK_ESSAY_AUDIT_HIGH` (91, tanpa blind spot), `MOCK_ESSAY_AUDIT` (62, tidak berubah, tetap sama dengan `SAMPLE_AUDIT` frontend), `MOCK_ESSAY_AUDIT_LOW` (28, 4 blind spot), serta materi kedua `MOCK_RUBRIC_FOTOSINTESIS` + `MOCK_ESSAY_AUDIT_FOTOSINTESIS`.
- `extractRubric` mengembalikan rubrik fotosintesis kalau teks materi menyebut "fotosintesis"; selain itu tetap homeostasis (test `materials` tidak terpengaruh).
- `evaluateHandwritingEssay` memilih varian dari hash SHA-256 foto (foto sama → hasil sama). Opsi baru `auditFailureRate` + `random` melempar `AiProviderError` (`common/ai/ai.errors.ts`, `kind: 'TRANSIENT' | 'INVALID_OUTPUT'`). Default 0, jadi perilaku lama tidak berubah. `GeminiAiProvider` nanti sebaiknya memakai error yang sama.
- Frontend: halaman hasil cek sekarang bisa diuji untuk keadaan "tanpa blind spot" (tidak ada jadwal H+3/H+7) dan "banyak blind spot".

## Pertanyaan

_Belum ada pertanyaan._
