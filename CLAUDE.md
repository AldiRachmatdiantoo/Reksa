# REKSA — AI Engineering & Security-First Rules (`CLAUDE.md`)

## 0. MANDATORY IDENTITY GATE (WAJIB — EKSEKUSI PERTAMA)
Sebelum menulis kode, membuat file, merancang rencana teknis, atau menjalankan perintah apa pun di sesi baru, kamu **WAJIB** bertanya persis dengan kalimat berikut dan **BERHENTI MENUNGGU JAWABAN**:

> **"namamu aldi atau adli"**

- **DILARANG KERAS** menghasilkan kode, skema, atau langkah implementasi sebelum pengguna menjawab dengan nama **"Aldi"** atau **"Adli"** (meskipun pengguna langsung memberikan instruksi coding di prompt pertama).
- Setelah pengguna menjawab namanya, konfirmasi identitas tersebut secara singkat, kunci *workflow* dan batasan folder sesuai profil 50/50 di bawah ini, lalu barulah eksekusi permintaan pengguna.

---

## 1. PROTOKOL LANGKAH 0 (KICKOFF PARALEL & PRE-SEEDED MOCK AI)
Agar kedua developer dapat bekerja paralel tanpa saling menunggu (*zero blocking*) sejak hari pertama:
- **Aldi** menyiapkan kerangka `backend/`, `docker-compose.yml` (*Docker Multi-Stage*, PostgreSQL + *indexing* + RLS + `app_service_user`, Redis), seluruh kontrak skema `Zod` (`*.schema.ts`), dan antarmuka `IAiService`.
  - **Tips Percepatan Wajib:** Saat Aldi meminta AI membuat kerangka awal backend di Langkah 0, **langsung isi `MockAiProvider` dengan minimal 1 contoh respons JSON statis yang 100% valid secara skema Zod** untuk setiap metode (`extractRubric`, `evaluateHandwritingEssay`, `clusterCohortBlindSpots`). Dengan begitu, begitu Adli menarik kode (`git pull`) dari branch `main`, simulasi AI sudah langsung hidup dan Adli tinggal menyesuaikan variasi data *dummy*-nya sesuai kebutuhan tampilan UI.
- **Adli** secara bersamaan menyiapkan kerangka `frontend/` (`Vite + React TS + Tailwind CSS + Shadcn/UI`), `apiClient` berbasis cookie (`withCredentials: true`), struktur folder fitur, serta halaman awal Login/Register.
- **Status:** bagian Aldi selesai (backend, Docker, Prisma + RLS, kontrak Zod, `MockAiProvider`). Kontraknya dirangkum di `PRD.md` §8.3.
- **Checklist Adli setelah `git pull origin main`:**
  1. Review kontrak di folder Adli yang dibuat Aldi saat Langkah 0: `study-sessions/sessions.schema.ts`, `essay-scans/scans.schema.ts`, dan `backend/tests/unit/`. Setuju → lanjut; ingin ubah → kabari Aldi dulu.
  2. Perkaya variasi data dummy di `backend/src/common/ai/mockAi.fixtures.ts`, lalu jalankan `npm test` di `backend/`; test gagal jika ada dummy yang tidak lolos skema Zod.
  3. Buat kerangka `frontend/` dengan syarat: script `npm run build` menghasilkan `dist/`, `package-lock.json` ikut di-commit, dan `frontend/Dockerfile`, `frontend/nginx.conf`, `frontend/.dockerignore` tidak diubah (area Aldi). Setelah itu `docker compose up -d --build` menjalankan seluruh stack di `http://localhost:8080`.
  4. Fase 2: tetapkan endpoint final SSE/WebSocket QR bridge (usulan di `PRD.md` §8.1) dan kabari Aldi agar `nginx.conf` disesuaikan.

---

## 2. WORKFLOW ROUTING 50/50 BERDASARKAN IDENTITAS

### Profil A: Jika Pengguna = ALDI (50% Beban Kerja)
- **Fokus Domain:**
  - **Langkah 0 & Infra:** Docker Multi-Stage, Nginx reverse proxy, PostgreSQL Hardening (B-Tree/Unique/Partial Indexes, Least-Privilege DB role, RLS), Redis config, kontrak awal `Zod`, dan pre-seed 1 contoh JSON valid di `MockAiProvider`.
  - **Fase 1–2 (Full-Stack Vertical Slices):**
    1. `auth` (JWT + `__Host-` HttpOnly Secure SameSite=Strict Cookies, Argon2id, Refresh Token Rotation & Reuse Detection, RBAC).
    2. `materials` (Upload PDF/teks materi, SHA-256 Redis rubric cache, pratinjau rubrik).
    3. `spaced-repetition` (Penjadwalan otomatis *micro-blurting* H+3 & H+7 dan daftar sesi jatuh tempo).
    4. `governance` (*Proof of Understanding Ledger* dengan *Signed URL* & verifikasi `ledger_hash`, serta agregasi grafik *Cohort Blind-Spots*).
  - **Fase 3 (AI Teks & Data):** Implementasi `GeminiAiProvider` untuk **Stage 1 (`extractRubric`)** dan **Stage 3 (`clusterCohortBlindSpots`)**.
  - **Security & QA:** Menyusun *Automated Security & Pen-Test Suite* di `backend/tests/security/` (uji IDOR/BOLA, Token Replay, SQLi payload, File Upload Spoofing, Rate Limit).
- **Konvensi Git Branch:** Wajib bekerja di branch `feat/aldi-<nama-fitur>` atau `fix/aldi-<nama-bug>`.
- **Area Folder Eksklusif Aldi:**
  - `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, `backend/prisma/`, `backend/src/config/`, `backend/src/common/middlewares/`
  - `backend/src/features/auth/`, `backend/src/features/materials/`, `backend/src/features/spaced-repetition/`, `backend/src/features/governance/`
  - `frontend/src/features/auth/`, `frontend/src/features/materials/`, `frontend/src/features/spaced-repetition/`, `frontend/src/features/governance/`
  - `backend/tests/security/`

### Profil B: Jika Pengguna = ADLI (50% Beban Kerja)
- **Fokus Domain:**
  - **Langkah 0 & Frontend Base:** Scaffolding `frontend/` (`Vite + React TS + Tailwind + Shadcn/UI`), `core/apiClient.ts`, `shared/hooks/`, serta menyesuaikan dan memperkaya variasi data *dummy* JSON di `MockAiProvider` setelah `git pull` dari `main`.
  - **Fase 1–2 (Full-Stack Vertical Slices):**
    1. `study-sessions` (Timer Pomodoro persisten Zustand + validasi server, mode penyembunyian materi, dan kalibrasi metakognisi *JOL Slider*).
    2. `essay-scans` (*Adaptive Image Capture*: kamera belakang langsung di HP tanpa QR Code vs. *Cross-Device QR Scan Bridge* via Redis TTL + SSE/WebSocket; validasi *magic bytes*, strip metadata EXIF/GPS & kompresi via `sharp`; pemotongan kuota harian via `SELECT FOR UPDATE`; halaman hasil audit *blind spots* + tombol pembaca koreksi *Web Speech API*).
  - **Fase 3 (AI Multimodal Vision):** Implementasi `GeminiAiProvider` untuk **Stage 2 (`evaluateHandwritingEssay` dari foto tulisan tangan, diagram panah, dan *code-switching*)** beserta pengujian pertahanan *AI Prompt Injection*.
  - **Unit & E2E QA:** Menyusun *Unit Tests* (`Vitest`) di `backend/tests/unit/` serta *E2E & WCAG Accessibility Tests* (`Playwright + @axe-core/playwright`) di `frontend/tests/e2e/`.
- **Konvensi Git Branch:** Wajib bekerja di branch `feat/adli-<nama-fitur>` atau `fix/adli-<nama-bug>`.
- **Area Folder Eksklusif Adli:**
  - `backend/src/common/ai/mockAi.provider.ts` (variasi dummy), `backend/src/common/ai/geminiAi.provider.ts` (Stage 2 Vision), `backend/src/common/utils/imageProcessor.ts`
  - `backend/src/features/study-sessions/`, `backend/src/features/essay-scans/` (termasuk `qrBridge.gateway.ts`)
  - `frontend/src/core/`, `frontend/src/shared/`, `frontend/src/features/studio/`, `frontend/src/features/scanner/`, `frontend/src/features/audit-result/`
  - `backend/tests/unit/`, `frontend/tests/e2e/`

### Aturan Lintas Batas (Anti-Merge Conflict)
- Jika **Aldi** meminta perubahan di folder eksklusif **Adli** (atau sebaliknya), **peringatkan pengguna terlebih dahulu** sebelum menyentuh file tersebut agar tidak terjadi konflik Git, dan pastikan kontrak skema `Zod` tetap sinkron.

---

## 3. ARSITEKTUR & TECH STACK WAJIB (REKSA)
- **Struktur Proyek:** Folder terpisah `backend/` (Express + TypeScript) dan `frontend/` (Vite + React + TypeScript + Tailwind CSS + Shadcn/UI).
- **Layered + Feature-Based Architecture (Backend):** Setiap modul fitur wajib memisahkan tanggung jawab secara ketat:
  1. `*.routes.ts`: Definisi endpoint, rate limiter, auth middleware, dan validasi Zod.
  2. `*.schema.ts`: Kontrak validasi input (`body`, `params`, `query`) dan output AI menggunakan `Zod` mode `.strict()`.
  3. `*.controller.ts`: Ekstraksi request/cookie dan format HTTP response saja. **Dilarang menaruh logika bisnis atau query database di Controller.**
  4. `*.service.ts`: Seluruh logika bisnis dan orkestrasi `IAiService`. **Dilarang mengimpor objek `Request`/`Response` Express di Service.**
  5. `*.repository.ts`: Akses database murni menggunakan ORM terparameterisasi (Prisma) ke PostgreSQL.
- **Mock-First AI Strategy (Fase 1 & Fase 2):**
  - Jangan membuat panggilan ke API Gemini asli selama Fase 1 dan Fase 2 (`AI_PROVIDER_MODE=mock`).
  - Seluruh fitur AI wajib memanggil antarmuka `IAiService` yang diimplementasikan oleh `MockAiProvider` (mengembalikan JSON statis yang lolos validasi skema `Zod`).

---

## 4. SECURITY-FIRST GUARDRAILS (PRIORITAS TERTINGGI)
1. **Zero SQL Injection:** 100% query wajib menggunakan *parameterized queries* dari ORM. Penggunaan *string interpolation/concatenation* pada SQL dilarang keras.
2. **Strict Input Validation:** Semua input eksternal wajib melewati schema `Zod` dengan `.strict()` untuk menolak *field* asing.
3. **Anti-IDOR / BOLA Enforcement:** Setiap method di `Service` dan `Repository` yang membaca/mengubah data milik pengguna wajib menyertakan filter kepemilikan (`user_id = authenticatedUserId`).
4. **Concurrency & Data Integrity:** Pemotongan kuota scan harian dan penguncian *Proof of Understanding Ledger* wajib dibungkus dalam *Database Transaction* dengan `SELECT ... FOR UPDATE`.
5. **Auth & Cookie Hardening:** Token autentikasi tidak boleh disimpan di `localStorage` atau `sessionStorage`. Gunakan cookie ber-prefiks `__Host-` dengan flag `HttpOnly`, `Secure`, dan `SameSite=Strict`. Pengecualian: refresh token memakai `__Secure-refresh_token` dengan `Path=/api/v1/auth/refresh` (tanpa `Domain`), karena browser menolak cookie `__Host-` yang `Path`-nya bukan `/`.
6. **File Upload Hardening:** Validasi tipe file berdasarkan *magic bytes* (`file-type`), bersihkan seluruh metadata EXIF/GPS menggunakan `sharp` sebelum disimpan, dan sajikan file privat hanya melalui *Signed URL* berbatas waktu.
7. **Testing Discipline:** Setiap file `*.service.ts` baru wajib disertai unit test (`Vitest`), setiap endpoint baru wajib memiliki integration test (`Supertest`), dan fitur terkait akses data wajib memiliki skenario uji negatif (IDOR/unauthorized access).