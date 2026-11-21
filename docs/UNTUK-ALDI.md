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

### ⏳ 2026-11-21 — `nginx.conf`: path SSE QR bridge final (tidak mendesak)
**Butuh untuk:** FR-04 skenario B (checklist Adli poin 4 di `CLAUDE.md`).
**Detail:** path final `GET /api/v1/sessions/<uuid>/qr-bridge/events`, bukan usulan lama `/api/v1/scans/qr-bridge/<token>/events` (token unggah sebaiknya tidak masuk URL karena tercatat di access log). Usul ganti `location` SSE di `frontend/nginx.conf` menjadi `~ ^/api/v1/sessions/[0-9a-f-]{36}/qr-bridge/events$` dengan isi yang sama (`proxy_buffering off`, `proxy_read_timeout 330s`).
**Mendesak?** Tidak. Backend sudah mengirim `X-Accel-Buffering: no` dan ping tiap 15 detik, jadi SSE tetap jalan lewat `location /api/` biasa. Perubahan ini hanya merapikan aturan lama yang sekarang tidak terpakai.
**Catatan deploy:** rewrite Vercel ke Render bisa membatasi durasi respons stream. Kalau SSE terputus di produksi, frontend cukup jatuh ke polling `GET /sessions/:id` (`hasSubmission`) tiap 3 detik.

### ⏳ 2026-11-21 — Usulan: satukan `reksa-frontend` ke `frontend/` (monorepo)
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

### ⏳ 2026-11-21 — Keputusan: `essay_submissions` append-only vs audit asinkron (FR-05)
**Butuh untuk:** `essay-scans` (unggah 202 → worker audit)
**Masalah:** `security_hardening` mencabut `UPDATE, DELETE ON essay_submissions` dari `app_service_user`. PRD v1.3 FR-05 justru membuat baris saat unggah (`audit_status = PENDING`) lalu mengubahnya ke `PROCESSING` dan `DONE`/`FAILED`, sambil mengisi skor, `*_json`, dan `ledger_hash` saat `DONE`. Dengan grant sekarang, worker tidak bisa menulis hasil audit.
**Usulan (pilih salah satu):**
- **A (usulan saya):** kembalikan `GRANT UPDATE` (tanpa `DELETE`) dan tambah trigger `BEFORE UPDATE` yang menolak perubahan apa pun jika `OLD.audit_status = 'DONE'`, serta menolak perubahan kolom bukti (`session_id`, `user_id`, `image_storage_key`, `predicted_jol_score`, `created_at`) kapan pun. Ledger tetap tidak bisa diubah setelah `DONE`, dan kode `governance` tetap membaca satu tabel. Plus policy RLS `submissions_owner_update` (`user_id = app_current_user_id()`).
- **B:** pisahkan hasil ke tabel append-only baru `essay_audits` (`submission_id UNIQUE`, skor, `*_json`, `ledger_hash`), sedangkan status/percobaan di tabel lain yang boleh diubah. Lebih murni, tetapi `governance`/ledger harus join dua tabel.
**Mendesak?** Ya, memblokir `essay-scans`. Saya mulai dari `study-sessions` dulu sambil menunggu.

### ⏳ 2026-11-21 — Review migrasi `20261121000200_session_validity` (saya buat di area kamu)
**Butuh untuk:** FR-02 aturan sesi sah. Sesuai UNTUK-ADLI §1e, saya membuatnya di `feat/adli-sessions`; mohon direview di PR.
**Isi** (aditif, hanya `study_sessions`):
- enum `SessionValidity (VALID, SHORT_FOCUS)` + kolom `validity` (nullable).
- kolom `focus_ended_at TIMESTAMPTZ`. Ini tidak ada di PRD §7.1, tapi dibutuhkan untuk batas 2 jam unggah foto: `actual_duration_sec` dipotong di preset + 5 menit, jadi waktu JOL tidak bisa diturunkan dari situ.
- CHECK `focus_ended_at >= started_at`, dan `focus_ended_at`, `validity`, `actual_duration_sec` selalu terisi bersamaan.
- partial unique index `idx_sessions_one_active ON study_sessions(user_id) WHERE status IN ('FOCUS_ACTIVE','AWAITING_SCAN')`. Prisma tidak mengenalnya, jadi ikut catatan CHECKPOINT: hapus `DROP INDEX idx_sessions_one_active` bila muncul di migrasi baru.
- `schema.prisma`: hanya model `StudySession` + enum baru (kolomnya ikut di-*align* ulang oleh `prisma format`).
**Mendesak?** Ya, `study-sessions` bergantung padanya. Semua test lulus: 129 unit, 148 integrasi + security.

### ⏳ 2026-11-21 — Migrasi kolom audit untuk `essay-scans` (FR-05, FR-11)
**Detail** (sesuai PRD §7.1, menunggu keputusan append-only di atas):
- `essay_submissions.audit_status` enum `AuditStatus (PENDING, PROCESSING, DONE, FAILED)` default `PENDING`, `audit_attempts INT DEFAULT 0 CHECK (audit_attempts >= 0)`, `audit_error_code VARCHAR(64) NULL`.
- `actual_ai_score`, `accurate_concepts_json`, `blind_spots_json`, `logic_corrections_json`, `ledger_hash` menjadi nullable; CHECK diganti agar wajib terisi saat `audit_status = 'DONE'`.
- `users.pro_expires_at` (FR-11). Kalau masih lama, saya pakai `users.tier` dulu sesuai UNTUK-ADLI §1e.
Kalau kamu setuju opsi A di atas, saya bisa sekalian membuat migrasi ini di branch `essay-scans` lalu kamu review, seperti migrasi sesi.

### ⏳ 2026-11-21 — Infra antrean worker audit (FR-05)
**Butuh untuk:** worker `evaluateHandwritingEssay` dengan batas audit bersamaan
**Detail:** UNTUK-ADLI §1e menyebut antrean Redis disiapkan Aldi, tetapi belum ada di `package.json` maupun `container.ts`. Pertanyaannya: BullMQ jadi dipakai? Worker berjalan di proses backend yang sama atau service terpisah di `docker-compose.yml`? Sambil menunggu, `essay-scans` saya tulis terhadap antarmuka kecil `IAuditQueue { enqueue(submissionId) }` supaya implementasinya bisa ditukar.
**Tambahan kecil (opsional):** env `MOCK_AI_AUDIT_FAILURE_RATE` (0..1, default 0) di `config/env.ts` dan diteruskan di `ai.factory.ts` ke opsi baru `MockAiProvider({ auditFailureRate })`, supaya alur `FAILED` bisa dicoba manual di frontend.
**Mendesak?** Belum. Dibutuhkan setelah keputusan append-only.

## Kabar & progres

Hal yang perlu Aldi ketahui tapi tidak butuh tindakan (fitur selesai, perubahan kontrak di area Adli, keputusan desain).

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
