# REKSA

**Recall & Knowledge Semantic Audit**: platform belajar aktif multisensori dengan audit pemahaman tulisan tangan berbasis AI.

> **Status:** Langkah 0. Kerangka backend, database, dan infrastruktur Docker sudah ada; fitur belum. Kerangka frontend sedang disiapkan.

---

## Daftar Isi

- [Tentang REKSA](#tentang-reksa)
- [Fitur MVP](#fitur-mvp)
- [Tech Stack](#tech-stack)
- [Arsitektur](#arsitektur)
- [Struktur Repositori](#struktur-repositori)
- [Menjalankan Proyek](#menjalankan-proyek)
- [Environment Variables](#environment-variables)
- [Ringkasan API](#ringkasan-api)
- [Keamanan](#keamanan)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Tim & Alur Kerja Git](#tim--alur-kerja-git)
- [Dokumen Terkait](#dokumen-terkait)

---

## Tentang REKSA

*Reksa* berarti "menjaga" atau "mengawasi". REKSA menjaga integritas proses belajar siswa dan mutu evaluasi akademik.

Siklusnya: pelajar mengunggah materi, belajar dengan timer Pomodoro, lalu menulis ulang semua yang diingat di **kertas** (*paper blurting*) saat materi disembunyikan. Foto tulisan tangan itu diaudit AI terhadap rubrik yang diekstrak dari materi. Hasilnya: skor pemahaman, konsep yang sudah dikuasai, *blind spots*, dan koreksi alur logika. Konsep yang terlupa dijadwalkan ulang pada hari ke-3 dan ke-7.

Masalah yang diselesaikan:

1. **Evaluasi pasif.** Kuis pilihan ganda melatih pengenalan, bukan *active recall*.
2. **Integritas & akses.** Esai hasil salin-tempel chatbot sulit dibedakan dari pemahaman asli, sementara aplikasi catatan digital menuntut tablet dan stylus yang mahal.

| Pilar | Solusi di REKSA |
| :--- | :--- |
| **Pendidikan** | Pomodoro + *paper blurting* + audit semantik AI + *spaced repetition* H+3/H+7 |
| **Teknologi inklusif** | Cukup kertas, pulpen, dan kamera HP. Rubrik AI tidak menghukum tulisan berantakan (disgrafia), salah eja (disleksia), atau campuran bahasa Indonesia–Inggris |
| **Tata kelola** | *Proof of Understanding Ledger* ber-*timestamp* dan *Cohort Blind-Spots Dashboard* untuk pengajar |

Landasan ilmiah: *retrieval practice*, *generation effect*, *dual-coding*, *judgment of learning*, dan *distributed practice*. Rinciannya di [PRD.md §2](PRD.md).

---

## Fitur MVP

### Portal Pelajar

| Kode | Fitur | Inti |
| :--- | :--- | :--- |
| FR-01 | Ekstraksi rubrik otomatis | Unggah PDF (≤10 MB) atau teks (≤15.000 karakter). Rubrik di-cache Redis berdasarkan hash SHA-256 |
| FR-02 | Fokus & *paper blurting* | Materi disembunyikan selama timer berjalan. Waktu mulai dikunci di server |
| FR-03 | Kalibrasi metakognisi | *JOL slider* 0–100 wajib diisi sebelum foto diunggah |
| FR-04 | *Adaptive image capture* | HP: kamera belakang langsung. Laptop: QR code sekali pakai (TTL 5 menit) + SSE/WebSocket |
| FR-05 | Audit AI Vision | Skor aktual, selisih JOL, konsep akurat, *blind spots*, koreksi logika, tombol "Bacakan Hasil Koreksi" |
| FR-06 | *Spaced re-blurting* | Jadwal otomatis H+3 dan H+7 khusus untuk *blind spots* |

### Portal Pendidik & Institusi

| Kode | Fitur | Inti |
| :--- | :--- | :--- |
| FR-07 | *Proof of Understanding Ledger* | Timestamp sesi, durasi fokus, foto asli via *signed URL*, JOL vs. skor AI, verifikasi `ledger_hash` |
| FR-08 | *Cohort Blind-Spots* | Persentase kegagalan per konsep dalam satu kelas + rekomendasi perbaikan modul dari AI |
| FR-09 | Kelola kelas | Guru membuat kelas dengan kode 8 karakter, siswa bergabung lewat kode, materi kelas terbaca anggota |
| FR-10 | Portal admin institusi | Kode undangan pengajar, daftar pengajar & kelas, analitik agregat (kelompok < 5 siswa disembunyikan) |

### Akun & Langganan

| Kode | Fitur | Inti |
| :--- | :--- | :--- |
| FR-11 | Tier Free/Pro & kuota | Free 3 scan/hari (reset 00.00 WIB), Pro lewat kode aktivasi; payment gateway pasca-MVP |
| FR-12 | Ekspor PDF *Proof of Understanding* | PDF milik sendiri (Pro) lewat *signed URL*, verifikasi publik `ledger_hash` tanpa data pribadi |
| FR-13 | Privasi & data anak | Kebijakan Privasi & Syarat Layanan berversi, tahun lahir + izin orang tua, unduh data, hapus akun, aturan penyimpanan |
| FR-14 | Akun dasar | Verifikasi email, lupa password tanpa enumerasi akun, ganti password, ubah nama |

### Peran (RBAC)

- **`STUDENT`**: tier Free (kuota scan harian terbatas, *spaced re-blurting* H+3/H+7) dan Pro (scan tanpa batas, analitik tren kalibrasi, ekspor PDF).
- **`EDUCATOR`**: mengelola kelas, materi resmi, verifikasi ledger, analitik kelas.
- **`INSTITUTION_ADMIN`**: analitik lintas kelas dan manajemen pengajar. Tidak bisa melihat audit esai individu.

---

## Tech Stack

| Lapisan | Teknologi |
| :--- | :--- |
| Backend | Node.js 22, Express, TypeScript, Zod, Prisma |
| Database | PostgreSQL (UUID PK, RLS, role *least-privilege*) |
| Cache & token sementara | Redis |
| Frontend | Vite, React, TypeScript, Tailwind CSS, Shadcn/UI, Zustand, TanStack Query, Axios |
| AI | `IAiService` → `MockAiProvider` (Fase 1–2) / `GeminiAiProvider` (Fase 3: `gemini-2.5-flash`, `gemini-2.5-pro`) |
| File | `file-type` (magic bytes), `sharp` (strip EXIF, kompresi), bucket S3 privat (Supabase Storage di produksi, SeaweedFS di lokal) |
| Auth | JWT di cookie `HttpOnly`, Argon2id, *refresh token rotation* |
| Infra | Docker multi-stage, docker compose, Nginx |
| Testing | Vitest, Supertest, Testcontainers, Playwright, `@axe-core/playwright`, Semgrep, OWASP ZAP |

---

## Arsitektur

### Backend: layered + feature-based

```text
Request
  → *.routes.ts      endpoint, rate limiter, auth & RBAC middleware, validasi Zod
  → *.controller.ts  ambil data request/cookie, format response (tanpa logika bisnis)
  → *.service.ts     logika bisnis & orkestrasi IAiService (tanpa objek Express)
  → *.repository.ts  akses database via Prisma (parameterized)
  → PostgreSQL
```

Setiap modul fitur juga punya `*.schema.ts` berisi kontrak Zod `.strict()` untuk input dan output AI.

### Mock-first AI

Semua panggilan AI lewat satu antarmuka:

```typescript
export interface IAiService {
  extractRubric(materialText: string): Promise<AiRubricOutput>;
  evaluateHandwritingEssay(imageBuffer: Buffer, mimeType: string, rubric: AiRubricOutput): Promise<AiEssayAuditOutput>;
  clusterCohortBlindSpots(blindSpotsList: AiEssayAuditOutput['blindSpots'][]): Promise<AiCohortClusterOutput>;
}
```

`AI_PROVIDER_MODE=mock` mengembalikan JSON statis yang lolos skema Zod, sehingga seluruh alur dan test berjalan tanpa API key dan tanpa biaya token. Di Fase 3, `AI_PROVIDER_MODE=gemini` mengganti provider tanpa mengubah controller, repository, maupun frontend.

### Jaringan container

Container `postgres` dan `redis` berada di jaringan `internal_net` (`internal: true`) tanpa port yang dibuka ke host. Ke host hanya ada dua port, keduanya di `127.0.0.1`: Nginx (`8080`) dan storage S3 (`8333`). Storage perlu terbuka karena browser mengambil file langsung lewat *signed URL*; tanpa signature yang valid bucket menjawab 403.

---

## Struktur Repositori

Target setelah Langkah 0:

```text
reksa/
├── docker-compose.yml
├── .github/workflows/ci-security.yml
├── backend/
│   ├── Dockerfile                 # 3-stage: deps → builder → non-root runner
│   ├── prisma/schema.prisma       # skema, migrasi, kebijakan RLS
│   ├── src/
│   │   ├── config/                # validasi env (Zod), DB, Redis, storage
│   │   ├── common/
│   │   │   ├── ai/                # interface, mock, gemini, factory
│   │   │   ├── middlewares/       # auth, rbac, validate, rateLimit
│   │   │   ├── errors/            # AppError & global error handler
│   │   │   └── utils/             # logger (Pino), imageProcessor (sharp), crypto
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── materials/
│   │   │   ├── study-sessions/
│   │   │   ├── essay-scans/       # termasuk qrBridge.gateway.ts
│   │   │   ├── spaced-repetition/
│   │   │   └── governance/
│   │   ├── app.ts
│   │   └── server.ts
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── security/
└── frontend/
    ├── Dockerfile                 # 2-stage: builder → nginx-unprivileged
    ├── nginx.conf                 # security headers & reverse proxy
    ├── src/
    │   ├── core/                  # apiClient, queryClient, router
    │   ├── shared/                # components/ui (Shadcn), hooks
    │   └── features/              # auth, studio, scanner, audit-result, governance
    └── tests/e2e/
```

---

## Menjalankan Proyek

### Prasyarat

- Docker Desktop (dengan docker compose v2)
- Node.js 22 LTS dan npm, untuk menjalankan test dan tooling di luar container
- Git

### Langkah

```bash
git clone https://github.com/AldiRachmatdiantoo/Reksa.git reksa
cd reksa

cp .env.example .env                              # ganti semua CHANGE_ME (openssl rand -hex 32)
docker compose up -d postgres redis storage-init  # database, cache, storage + bucket privat
docker compose --profile tools run --rm --build migrate   # migrasi sebagai pemilik skema; --build agar image memuat migrasi terbaru
docker compose up -d --build                      # backend + frontend (nginx)
```

Aplikasi bisa dibuka di `http://localhost:8080`. Health check backend ada di `http://localhost:8080/api/v1/health`.

Di lokal tidak perlu sertifikat, karena Chrome dan Firefox memperlakukan `http://localhost` sebagai *secure context*, jadi cookie `Secure`/`__Host-` tetap jalan. Di staging/produksi, HTTPS diterminasi di depan Nginx.

> Service `frontend` baru bisa di-build setelah kerangka Vite dari Adli masuk ke `main`. Sebelum itu, jalankan backend saja: `docker compose up -d --build backend`.

### Pengembangan backend tanpa Docker (opsional)

Postgres dan Redis tidak membuka port ke host secara default. Untuk development, buka keduanya di `127.0.0.1` lewat file override:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis

cd backend
cp .env.example .env      # samakan password dengan .env di root
npm ci
npx prisma generate
npm run dev
```

### Perintah backend

| Perintah | Fungsi |
| :--- | :--- |
| `npm run dev` | Server dengan hot reload (`tsx watch`) |
| `npm run build` | Kompilasi TypeScript ke `dist/` |
| `npm run typecheck` | Cek tipe termasuk folder `tests/` |
| `npm test` | Unit test (cepat, tanpa Docker) |
| `npm run test:integration` | Integration + security test dengan PostgreSQL & Redis asli via Testcontainers (Docker harus jalan) |
| `npm run test:all` | Semua test |
| `npm run test:coverage` | Semua test dengan laporan coverage |
| `npx prisma generate` | Buat ulang Prisma Client ke `src/generated/prisma` |

Membuat migrasi baru: `npx prisma migrate dev --create-only --name <nama>` dengan `MIGRATION_DATABASE_URL` terisi. Periksa file SQL-nya sebelum di-apply, karena Prisma tidak mengenal partial index dan bisa menambahkan `DROP INDEX` untuk `idx_spaced_user_due` / `idx_sessions_class_governance`.

---

## Environment Variables

Ada dua file contoh:

- [`.env.example`](.env.example) (root): dibaca docker compose. Isinya password mentah; compose yang merakit URL koneksi.
- [`backend/.env.example`](backend/.env.example): untuk `npm run dev` di host. Isinya URL koneksi lengkap ke `127.0.0.1`.

Variabel yang dibaca backend divalidasi Zod di [`backend/src/config/env.ts`](backend/src/config/env.ts). Kalau ada yang salah, server menolak start dan hanya menampilkan nama variabelnya, bukan nilainya.

| Variabel | Dibaca oleh | Keterangan |
| :--- | :--- | :--- |
| `POSTGRES_OWNER_USER` / `POSTGRES_OWNER_PASSWORD` | compose | Pemilik skema, khusus migrasi |
| `APP_DB_PASSWORD` | compose | Password `app_service_user` (role aplikasi, kena RLS) |
| `REDIS_PASSWORD` | compose | Redis selalu memakai password |
| `DATABASE_URL` | backend | Koneksi sebagai `app_service_user` |
| `MIGRATION_DATABASE_URL` | Prisma CLI | Koneksi sebagai pemilik skema ([`prisma.config.ts`](backend/prisma.config.ts)) |
| `REDIS_URL` | backend | Cache rubrik, token QR, rate limit |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | backend | Minimal 32 karakter, wajib berbeda |
| `CORS_ORIGIN` | backend | Origin frontend yang diizinkan |
| `AI_PROVIDER_MODE` | backend | `mock` (Fase 1–2) atau `gemini` (Fase 3) |
| `MOCK_AI_LATENCY_MS` | backend | Simulasi latensi `MockAiProvider` (default 300) |
| `GEMINI_API_KEY` | backend | Wajib hanya di mode `gemini` |
| `PORT`, `LOG_LEVEL`, `NODE_ENV` | backend | Default `3000`, `info`, `development` |
| `STORAGE_ENDPOINT` | backend | Endpoint S3 yang dipakai backend (compose: `http://storage:8333`) |
| `STORAGE_PUBLIC_ENDPOINT` | backend, compose | Host di dalam *signed URL* yang dibuka browser (lokal: `http://localhost:8333`). Kosongkan jika sama dengan `STORAGE_ENDPOINT` |
| `STORAGE_REGION` | backend | Default `us-east-1`; di Supabase isi region project |
| `STORAGE_BUCKET` | backend, compose | Bucket privat, default `reksa-private` |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | backend, compose | Kunci S3. Lokal bebas (hex); produksi dari Supabase → Storage → S3 access keys |
| `STORAGE_FORCE_PATH_STYLE` | backend | Default `true` (wajib untuk SeaweedFS dan Supabase) |

File `.env` tidak pernah di-commit (sudah ada di `.gitignore`).

---

## Ringkasan API

Semua endpoint di bawah prefix `/api/v1`, dengan body divalidasi Zod `.strict()`.

| Method | Endpoint | Akses | Fungsi |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register`, `/auth/login` | Publik, rate-limited | Set cookie `__Host-access_token` & `__Secure-refresh_token` |
| `POST` | `/auth/refresh` | Cookie refresh | Rotasi token + deteksi *reuse* |
| `DELETE` | `/auth/refresh` | Cookie refresh | Logout perangkat ini |
| `GET` | `/auth/me` | Login | Profil user saat ini |
| `POST` | `/materials` | Login | Unggah materi, ekstraksi rubrik |
| `POST` | `/sessions` | `STUDENT` | Mulai sesi Pomodoro |
| `PATCH` | `/sessions/:id/jol` | `STUDENT` (pemilik) | Simpan skor JOL |
| `POST` | `/sessions/:id/qr-bridge` | `STUDENT` (pemilik) | Token QR sementara (TTL 300 detik) |
| `POST` | `/scans/upload` | `STUDENT` / token QR | Upload foto esai, audit AI, jadwal H+3/H+7 |
| `GET` | `/spaced/due` | `STUDENT` | Sesi *micro-blurting* jatuh tempo |
| `GET` | `/governance/classes/:classId/ledger` | `EDUCATOR` (pengampu) | Ledger siswa + *signed URL* |
| `GET` | `/governance/classes/:classId/blind-spots` | `EDUCATOR` / `INSTITUTION_ADMIN` | Klaster *blind spots* & rekomendasi |

Kontrak lengkap di [PRD.md §8](PRD.md).

---

## Keamanan

Keamanan adalah prioritas tertinggi proyek ini. Aturan yang wajib dipatuhi setiap PR:

- **SQL injection:** semua query lewat Prisma yang terparameterisasi. Interpolasi string ke SQL dilarang.
- **Validasi input:** semua input eksternal melewati Zod `.strict()`, sehingga field asing ditolak dengan `400`.
- **IDOR/BOLA:** setiap query data milik user menyertakan filter kepemilikan (`userId`, atau `classes.educator_id` + `class_members` untuk pendidik).
- **RLS PostgreSQL** sebagai lapisan kedua. Konteks user diset dengan `set_config('app.current_user_id', $1, true)` di dalam transaksi. `app_service_user` tidak punya `BYPASSRLS`.
- **Cookie:** token tidak pernah disimpan di `localStorage`/`sessionStorage`.
  - Access token: `__Host-access_token` (`HttpOnly; Secure; SameSite=Strict; Path=/`).
  - Refresh token: `__Secure-refresh_token` (`Path=/api/v1/auth/refresh`, tanpa `Domain`). Kalau token lama dipakai ulang, seluruh *token family* dicabut.
- **Password:** Argon2id (`memoryCost: 65536`, `timeCost: 3`).
- **Upload:** batas ukuran (5 MB gambar, 10 MB PDF), cek *magic bytes*, EXIF/GPS dihapus via `sharp`, file disimpan di bucket privat dan hanya diakses via *signed URL* 5 menit.
- **Konkurensi:** pemotongan kuota scan dan pembuatan `ledger_hash` memakai transaksi + `SELECT ... FOR UPDATE`.
- **HTTP:** Helmet, CSP, CORS eksplisit, rate limit Redis (contoh: 5 login/menit per IP, 10 request AI/jam per user).
- **Prompt injection (Fase 3):** teks di dalam gambar diperlakukan sebagai data tak tepercaya, dan output AI divalidasi ulang dengan Zod.

Temukan celah keamanan? Laporkan langsung ke maintainer, jangan lewat issue publik.

---

## Testing

| Jenis | Tools | Lokasi | Target |
| :--- | :--- | :--- | :--- |
| Unit | Vitest | `backend/tests/unit/` | Coverage ≥ 85% di layer service |
| Integration | Vitest + Supertest + Testcontainers | `backend/tests/integration/` | Alur penuh route → DB dengan PostgreSQL & Redis asli |
| Security | Supertest | `backend/tests/security/` | IDOR, token replay, SQLi/fuzzing, file spoofing, rate limit |
| E2E | Playwright | `frontend/tests/e2e/` | Login → upload → Pomodoro → JOL → scan → hasil → dashboard |
| Aksesibilitas | `@axe-core/playwright` | `frontend/tests/e2e/` | WCAG 2.1 AA, 0 pelanggaran kritis |
| SAST & dependensi | Semgrep, `npm audit --audit-level=high` | CI | Setiap PR |
| DAST | OWASP ZAP | Staging | Baseline & full scan |

Semua pemeriksaan di atas (kecuali DAST) dijalankan otomatis oleh [`.github/workflows/ci-security.yml`](.github/workflows/ci-security.yml) di setiap pull request ke `main`.

Aturan: setiap `*.service.ts` baru wajib punya unit test, setiap endpoint baru wajib punya integration test, dan setiap fitur akses data wajib punya skenario negatif (IDOR/unauthorized).

---

## Roadmap

- [ ] **Langkah 0: kickoff paralel**
  - [x] Aldi: kerangka backend, docker compose, Prisma + RLS, kontrak Zod, `IAiService`, `MockAiProvider` berisi contoh JSON valid
  - [ ] Adli: kerangka frontend, `apiClient` berbasis cookie, struktur fitur, halaman Login/Register
- [ ] **Fase 1: infrastruktur, hardening database, auth** (tanpa AI)
  - [x] Modul `auth`: Argon2id, cookie `__Host-`/`__Secure-`, refresh rotation + reuse detection, RBAC, rate limit Redis
  - [x] Security suite: cookie, token replay, JWT palsu, SQLi/fuzzing, rate limit, RLS, least privilege
  - [x] CI: typecheck, unit, integration (Testcontainers), `npm audit`, Semgrep, Docker build
- [ ] **Fase 2: golden path & governance dengan `MockAiProvider`**, beserta seluruh test
  - [x] Storage service S3 (`IStorageService`): object key tervalidasi, bucket privat, *signed URL* maks. 5 menit
- [ ] **Fase 3: `GeminiAiProvider` & uji prompt injection**

Setelah MVP: mode audio Feynman, *interleaving engine*, PWA *offline-first*.

---

## Deploy

Target produksi:

| Bagian | Layanan | Catatan |
| :--- | :--- | :--- |
| Frontend | **Vercel** | Build `frontend/` (Vite). Header keamanan dari `nginx.conf` dipindah ke `vercel.json` |
| Backend | **Render** (Docker, target `runner`) | Migrasi dijalankan sebagai pemilik skema sebelum deploy (target `migrator` atau `npx prisma migrate deploy`) |
| Database | **Supabase Postgres** | Aplikasi konek sebagai `app_service_user` lewat pooler; migrasi lewat koneksi langsung |
| File | **Supabase Storage** (S3-compatible) | `STORAGE_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3`, bucket privat |
| Redis | Redis terkelola (`rediss://`) | Rate limit, cache rubrik, token QR |

`docker-compose.yml` tetap dipakai untuk lokal dan CI. Yang perlu disiapkan sebelum deploy pertama:

1. **Cookie lintas domain.** Cookie auth memakai `SameSite=Strict` dan `__Host-`, jadi frontend dan API harus satu situs. Rencananya Vercel me-*rewrite* `/api/*` ke backend Render, sehingga browser hanya melihat domain Vercel.
2. **Supabase Data API.** Secara default Supabase membuka skema `public` lewat REST untuk role `anon`/`authenticated`. REKSA tidak memakainya, jadi Data API dimatikan dan hak akses kedua role itu dicabut lewat migrasi.
3. **`trust proxy`.** Jumlah hop disesuaikan dengan rantai Vercel → Render agar rate limit membaca IP klien yang benar.
4. **CSP.** `img-src`/`frame-src` mengizinkan host Supabase Storage untuk *signed URL*.

---

## Tim & Alur Kerja Git

Beban kerja dibagi 50/50. Rincian folder per orang ada di [CLAUDE.md §2](CLAUDE.md).

| | Aldi | Adli |
| :--- | :--- | :--- |
| Fokus | Infra, Docker, Nginx, Prisma, `auth`, `materials`, `spaced-repetition`, `governance`, AI Stage 1 & 3, security test suite | Frontend base, `study-sessions`, `essay-scans` + QR bridge, AI Stage 2 (vision), unit & E2E/a11y test |
| Branch | `feat/aldi-<fitur>`, `fix/aldi-<bug>` | `feat/adli-<fitur>`, `fix/adli-<bug>` |

Alur:

1. Buat branch dari `main` sesuai konvensi di atas.
2. Kerjakan hanya di folder milikmu. Kalau perlu menyentuh folder rekan, kabari dulu supaya tidak konflik, dan pastikan kontrak Zod tetap sinkron.
3. Buka pull request ke `main`. PR harus lolos test dan pemeriksaan keamanan di CI sebelum di-merge.

---

## Dokumen Terkait

- [PRD.md](PRD.md): spesifikasi produk lengkap (fitur, skema database, API, keamanan, rencana QA)
- [CLAUDE.md](CLAUDE.md): aturan kerja untuk AI assistant dan pembagian tugas tim
- [docs/CHECKPOINT.md](docs/CHECKPOINT.md): posisi progres terakhir, keputusan, dan langkah berikutnya
- [docs/UNTUK-ADLI.md](docs/UNTUK-ADLI.md): catatan dan permintaan dari Aldi untuk Adli
- [docs/UNTUK-ALDI.md](docs/UNTUK-ALDI.md): catatan dan permintaan dari Adli untuk Aldi

## Lisensi

Belum ditentukan.
