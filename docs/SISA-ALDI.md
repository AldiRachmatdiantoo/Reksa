# Sisa Tugas Aldi menuju MVP

Diperbarui 21 November 2026, setelah FR-14 (branch `feat/aldi-account`). Ukuran MVP mengikuti `PRD.md`: FR-01 sampai FR-14, AI Stage 1 sampai 3, dan deploy. Frontend ada di repo [reksa-frontend](https://github.com/AldiRachmatdiantoo/reksa-frontend), jadi UI semua fitur ikut menjadi bagian Aldi.

Centang `[x]` saat selesai dan catat di `docs/CHECKPOINT.md`.

## Sudah selesai

- [x] Langkah 0: Docker, PostgreSQL + RLS, Redis, kontrak Zod, `MockAiProvider`
- [x] `auth` (Fase 1), CI + security gate, storage S3
- [x] `materials`: unggah materi dan ekstraksi rubrik (masih mock AI)
- [x] FR-09 Kelola kelas & keanggotaan
- [x] FR-14 Akun dasar (menunggu merge PR `feat/aldi-account`)

## Bisa dikerjakan sekarang (tidak menunggu Adli)

- [ ] **FR-13 Privasi & data anak** (wajib sebelum rilis publik)
  - Persetujuan Kebijakan Privasi & Syarat Layanan saat daftar, kolom `birth_year`, `terms_version`, `privacy_version`, `consented_at`, `guardian_consent`
  - Centang pernyataan izin orang tua atau wali untuk pengguna di bawah 18 tahun
  - `POST /me/consent` saat versi kebijakan berubah
  - `POST /me/export`: arsip data pribadi lewat Signed URL, 1 kali per hari
  - `DELETE /me`: hapus akun dan seluruh datanya, dengan konfirmasi kata sandi
  - Halaman `/privasi` dan `/syarat` di frontend
- [ ] **FR-11 Tier Free/Pro (bagian Aldi)**
  - Kolom `pro_expires_at` sebagai sumber tier efektif
  - Kode aktivasi Pro: disimpan sebagai hash, punya durasi dan batas pemakaian, `POST /me/activate-pro`, wajib email terverifikasi
  - Tampilan tier dan masa berlaku di halaman Akun
  - Catatan: pemotongan kuota scan harian ada di `essay-scans` (Adli)
- [ ] **FR-10 Portal admin institusi**
- [ ] **Persiapan deploy** (Supabase, Vercel, Render)
  - Migrasi pencabutan hak `anon`/`authenticated` di Supabase (Data API)
  - `vercel.json` di reksa-frontend: rewrite `/api/*` ke Render, header keamanan (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`)
  - Konfigurasi Render untuk backend
  - Penyedia email produksi (misal Resend atau Amazon SES) untuk `SMTP_URL`
- [ ] **Gemini Stage 1 (`extractRubric`)** di `GeminiAiProvider`, menggantikan mock saat unggah materi (Fase 3)
- [ ] **QA frontend:** E2E Playwright + `@axe-core/playwright`, CI GitHub Actions (typecheck, test, build)

## Bisa dibangun sekarang, diuji penuh setelah sesi dan scan Adli jadi

- [ ] **FR-06 Jadwal ulang** (`spaced-repetition`): micro-blurting H+3 dan H+7 dibuat dari sesi yang selesai, daftar sesi jatuh tempo
- [ ] **FR-07 Proof of Understanding Ledger** (`governance`): `ledger_hash`, Signed URL, `GET /ledger/verify/:hash`
- [ ] **FR-12 Ekspor PDF Proof of Understanding** (Pro), memakai data ledger
- [ ] **FR-08 Peta blind spot kelas** + **Gemini Stage 3 (`clusterCohortBlindSpots`)**
- [ ] **Sambungkan frontend studio ke backend Adli:** sesi belajar, unggah foto, hasil audit asli (ganti `SAMPLE_AUDIT`), QR bridge laptop ke HP

## Perkiraan progres

| Kondisi | Perkiraan MVP |
| :--- | :--- |
| Sekarang (21 Nov 2026) | sekitar 30 sampai 35% |
| Semua tugas di file ini selesai | sekitar 60 sampai 65% |

Sisanya adalah alur inti milik Adli: mulai sesi (FR-01), FR-02 sampai FR-05, Gemini Stage 2 Vision, dan pemotongan kuota scan. Angka di atas perkiraan kasar, bukan hitungan pasti.

## Urutan yang disarankan

1. FR-13
2. Kode aktivasi FR-11
3. Persiapan deploy
4. FR-10
5. FR-06, FR-07, FR-08, FR-12 sambil menunggu Adli
6. Gemini Stage 1 dan 3 (Fase 3)
