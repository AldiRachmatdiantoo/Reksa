# REKSA

**Recall & Knowledge Semantic Audit**: platform belajar aktif multisensori dengan audit pemahaman tulisan tangan berbasis AI.

> **Status:** tahap perencanaan. Baru ada dokumen spesifikasi ([PRD.md](PRD.md)) dan aturan kerja ([CLAUDE.md](CLAUDE.md)); kode backend & frontend dibangun mulai Langkah 0. Perintah di bagian [Menjalankan Proyek](#menjalankan-proyek) adalah target setelah Langkah 0 selesai.

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

### Peran (RBAC)

- **`STUDENT`**: tier Free (kuota scan harian terbatas) dan Pro (tanpa batas, *spaced re-blurting*, ekspor PDF).
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
| File | `file-type` (magic bytes), `sharp` (strip EXIF, kompresi), Cloudflare R2 / S3 privat |
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

Container `postgres` dan `redis` berada di jaringan `internal_net` (`internal: true`) tanpa port yang dibuka ke host. Hanya reverse proxy Nginx yang menerima trafik dari luar.

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

> Tersedia setelah Langkah 0. Bagian ini akan diperbarui begitu `docker-compose.yml` dan `.env.example` masuk ke `main`.

### Prasyarat

- Docker Desktop (dengan docker compose v2)
- Node.js 22 LTS dan npm, untuk menjalankan test dan tooling di luar container
- Git

### Langkah

```bash
git clone <url-repo> reksa
cd reksa

cp .env.example .env               # isi secret; biarkan AI_PROVIDER_MODE=mock
docker compose up -d --build       # postgres, redis, backend, frontend + nginx

docker compose exec backend npx prisma migrate deploy
```

Aplikasi lalu bisa dibuka lewat Nginx di `https://localhost`. Cookie `__Host-` dan `__Secure-` mewajibkan HTTPS, jadi pengembangan lokal juga memakai sertifikat dev.

### Pengembangan tanpa Docker (opsional)

```bash
cd backend && npm ci && npm run dev
cd frontend && npm ci && npm run dev
```

PostgreSQL dan Redis tetap dijalankan lewat docker compose.

---

## Environment Variables

Draf. Daftar final ada di `.env.example` dan divalidasi Zod di `backend/src/config/`.

| Variabel | Contoh | Keterangan |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `DATABASE_URL` | `postgresql://app_service_user:...@postgres:5432/reksa` | Koneksi aplikasi memakai role *least-privilege* |
| `MIGRATION_DATABASE_URL` | `postgresql://reksa_owner:...@postgres:5432/reksa` | Role pemilik skema, khusus migrasi |
| `REDIS_URL` | `redis://redis:6379` | Cache rubrik, token QR, rate limit |
| `JWT_ACCESS_SECRET` | *(acak, ≥32 byte)* | TTL access token 15 menit |
| `JWT_REFRESH_SECRET` | *(acak, ≥32 byte)* | TTL refresh token 7 hari |
| `CORS_ORIGIN` | `https://localhost` | Origin frontend yang diizinkan |
| `AI_PROVIDER_MODE` | `mock` | `mock` (Fase 1–2) atau `gemini` (Fase 3) |
| `GEMINI_API_KEY` | *(kosong saat mock)* | Hanya dibutuhkan di mode `gemini` |
| `STORAGE_BUCKET` | `reksa-private` | Bucket privat R2/S3 |
| `STORAGE_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` | Endpoint S3-compatible |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | | Kredensial bucket |

File `.env` tidak pernah di-commit (sudah ada di `.gitignore`).

---

## Ringkasan API

Semua endpoint di bawah prefix `/api/v1`, dengan body divalidasi Zod `.strict()`.

| Method | Endpoint | Akses | Fungsi |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register`, `/auth/login` | Publik, rate-limited | Set cookie `__Host-access_token` & `__Secure-refresh_token` |
| `POST` | `/auth/refresh` | Cookie refresh | Rotasi token + deteksi *reuse* |
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

Aturan: setiap `*.service.ts` baru wajib punya unit test, setiap endpoint baru wajib punya integration test, dan setiap fitur akses data wajib punya skenario negatif (IDOR/unauthorized).

---

## Roadmap

- [ ] **Langkah 0: kickoff paralel**
  - [ ] Aldi: kerangka backend, docker compose, Prisma, kontrak Zod, `IAiService`, `MockAiProvider` berisi contoh JSON valid
  - [ ] Adli: kerangka frontend, `apiClient` berbasis cookie, struktur fitur, halaman Login/Register
- [ ] **Fase 1: infrastruktur, hardening database, auth** (tanpa AI)
- [ ] **Fase 2: golden path & governance dengan `MockAiProvider`**, beserta seluruh test
- [ ] **Fase 3: `GeminiAiProvider` & uji prompt injection**

Setelah MVP: mode audio Feynman, *interleaving engine*, PWA *offline-first*.

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

## Lisensi

Belum ditentukan.
