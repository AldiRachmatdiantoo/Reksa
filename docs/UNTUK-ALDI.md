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
