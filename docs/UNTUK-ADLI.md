# Catatan untuk Adli

Dari: Aldi
Terakhir diperbarui: 21 November 2026
Status: Langkah 0, `auth`, CI, dan storage service sudah di `main`. Modul `materials` di PR `feat/aldi-materials` (lihat §1d). Frontend kini repo terpisah (lihat §0).

Hai Adli, ini ringkasan yang perlu kamu tahu sebelum mulai. Detail lengkapnya ada di [PRD.md §8.3](../PRD.md) dan [CLAUDE.md §1](../CLAUDE.md).

## 0. Penting: frontend pindah repo dan sekarang dipegang saya

Frontend dibangun di repo terpisah https://github.com/AldiRachmatdiantoo/reksa-frontend dari desain Figma Make. Jadi kamu **tidak perlu** membuat kerangka `frontend/`, `apiClient`, atau halaman Login/Register (checklist poin 3 di CLAUDE.md gugur). Halaman Ruang Belajar, Tebak & Foto, dan Hasil Cek sudah ada di sana dengan data contoh yang sama dengan `MockAiProvider`.

Fokusmu sekarang backend `study-sessions` dan `essay-scans` (plus Stage 2 Vision nanti). Begitu endpoint-nya siap, tulis di `UNTUK-ALDI.md` bentuk request/response finalnya, nanti saya sambungkan ke halaman itu. Yang dibutuhkan frontend:
- `POST /sessions`: `materialId`, durasi fokus, tebakan nilai (JOL 0-100)
- Unggah foto: respons berisi id scan + sisa kuota harian; error 413/415/429 dengan `{error:{code,message}}`
- Hasil cek: bentuk sama dengan skema `EssayAudit` (sudah dipakai di `sampleAudit.ts` frontend)

> **Mau minta sesuatu ke saya atau mengabarkan progres?** Tulis di [`docs/UNTUK-ALDI.md`](UNTUK-ALDI.md) lalu commit lewat PR. Sesi Claude saya membaca file itu setiap kali mulai, jadi tidak ada yang terlewat.

---

## 1. Yang sudah siap dipakai

- **Backend jalan di Docker** dengan Postgres + Redis. Cara menjalankan ada di [README](../README.md#menjalankan-proyek).
- **`MockAiProvider` sudah hidup.** Ketiga method AI mengembalikan JSON valid tanpa API key.
- **Kontrak Zod semua fitur sudah ada** di `backend/src/features/*/` `*.schema.ts`.
- **Endpoint auth**: register, login, refresh, logout, me.
- **Middleware untuk endpoint-mu**: `requireAuth(signer)` dan `requireRole('STUDENT')` di `backend/src/common/middlewares/`. Ambil user yang login di controller dengan `getAuth(res).userId`. Contoh pemakaian ada di `features/auth/auth.routes.ts`.
- **Konteks RLS**: setiap query ke `study_sessions`, `essay_submissions`, `study_materials`, dan `spaced_schedules` **wajib** lewat `withUserContext(prisma, userId, async (tx) => ...)` dari `backend/src/config/prisma.ts`. Tanpa itu, RLS mengembalikan 0 baris (bukan error), jadi gejalanya "data kosong". Tetap tulis filter `userId` di repository; RLS hanya lapisan kedua.
- **Rangkai router di `backend/src/container.ts`**: tambahkan satu entri, mis. `'/sessions': createSessionsRouter(...)`. Itu satu-satunya baris di file itu yang perlu kamu sentuh.

## 1b. Fase 2: ketergantunganmu ke saya

Kamu bisa langsung mulai `study-sessions` dan `essay-scans`. Ada dua hal yang saya siapkan paralel:

| Kamu butuh | Dari | Sementara itu |
| :--- | :--- | :--- |
| ~~`materialId` valid untuk `POST /sessions`~~ | ✅ **Modul `materials` siap**, lihat §1d | Di test tetap boleh buat materi langsung lewat `ctx.owner.studyMaterial.create(...)` |
| ~~Simpan foto esai ke bucket privat + *signed URL*~~ | ✅ **Storage service siap**, lihat §1c | — |

## 1c. ✅ Storage service siap dipakai

File: `backend/src/config/storage.ts`. **Jangan buat klien S3 sendiri**; pakai `IStorageService` yang sudah disuntikkan ke `buildRoutes()` sebagai `deps.storage`.

```ts
import { buildObjectKey, type IStorageService } from '../../config/storage.js';

// Di essay-scans service, SETELAH magic bytes dicek dan EXIF di-strip via sharp:
const key = buildObjectKey('scans', userId, 'webp'); // scans/<userId>/<uuid>.webp
await storage.putObject({ key, body: cleanedBuffer, contentType: 'image/webp' });
// simpan `key` ke essay_submissions.image_storage_key

// Untuk halaman hasil audit:
const url = await storage.getSignedUrl(submission.imageStorageKey); // berlaku 5 menit (maks.)
```

- Key **selalu** dibuat lewat `buildObjectKey(prefix, ownerId, ext)`; prefix `'scans'` untukmu, ext `webp | jpg | png | pdf`. Semua method menolak key lain (anti *path traversal*).
- Bucket privat: tanpa signature dijawab 403. Signed URL maksimal 300 detik; `expiresInSec` yang lebih besar otomatis dipotong.
- Sebelum memberi signed URL, **tetap cek kepemilikan** baris `essay_submissions` di repository (anti-IDOR). Signed URL hanya cara unduh, bukan otorisasi.
- Di test integration, `createTestContext()` punya `ctx.storage` yang terhubung ke bucket S3 sungguhan (container SeaweedFS). Contoh: `backend/tests/integration/storage.test.ts`.
- Lokal: `docker compose up -d storage-init` membuat bucket; signed URL mengarah ke `http://localhost:8333`. Produksi memakai Supabase Storage dengan antarmuka yang sama.
- Frontend: tampilkan gambar dengan `<img src={signedUrl}>`. CSP `img-src` di `nginx.conf` sudah mengizinkan `localhost:8333`.

## 1d. ✅ Modul `materials` siap (PR `feat/aldi-materials`)

- `POST /api/v1/materials` membuat materi dan rubriknya; `id` di respons itulah `materialId` untuk `POST /sessions`. Rubrik lengkap (`keyConcepts`, `causalRelations`) ada di `study_materials.rubric_json`, jadi `essay-scans` bisa membacanya langsung saat memanggil `evaluateHandwritingEssay`.
- **Hapus materi ditolak 409** kalau sudah ada `study_sessions` yang memakainya (FK `Restrict`). Jangan ubah FK itu jadi cascade tanpa kabari saya.
- **Middleware unggah bisa kamu pakai** untuk foto esai: `singleFileUpload({ field: 'photo', maxBytes })` dari `common/middlewares/upload.middleware.ts`. File masuk ke `req.file.buffer` (memori), ukuran lebih dari batas otomatis 413. Magic bytes tetap kamu cek di service (contoh: `materials.service.ts` `createFromPdf`).
- Error baru di `common/errors/AppError.ts`: `PayloadTooLargeError` (413), `UnsupportedMediaTypeError` (415), `UnprocessableEntityError` (422). Pakai ini supaya frontend menampilkan pesan yang sama.

## 2. Yang perlu kamu lakukan

### a. Pull dan cek file di foldermu
Saat Langkah 0, saya membuat beberapa file di area kamu karena CLAUDE.md memintanya. Tolong direview:

| File | Isi |
| :--- | :--- |
| `backend/src/features/study-sessions/sessions.schema.ts` | Preset Pomodoro (`CLASSIC_25_5`, `DEEP_45_10`, `FOCUS_SPRINT_15_3`), `StartSessionSchema`, `SubmitJolSchema` |
| `backend/src/features/essay-scans/scans.schema.ts` | Format token QR (base64url 43 karakter), batas foto 5 MB, MIME yang diizinkan, aturan `sessionId` **atau** `qrToken` |
| `backend/src/common/ai/mockAi.fixtures.ts` | Data dummy AI (materi homeostasis) |
| `backend/tests/unit/` | Test awal mock AI, env, dan `AuthService` |

Kalau setuju, lanjut saja. Kalau mau mengubah kontrak, kabari saya dulu, karena frontend dan backend sama-sama bergantung padanya.

### b. Perkaya data dummy AI
Tambahkan variasi di `mockAi.fixtures.ts` (skor tinggi tanpa blind spot, skor rendah, materi lain). Lalu:
```bash
cd backend && npm test
```
Test gagal kalau ada dummy yang tidak lolos skema Zod.

### c. Kerangka frontend
Syarat agar cocok dengan Docker yang sudah ada:
- `npm run build` menghasilkan folder `dist/`
- `package-lock.json` ikut di-commit
- **Jangan ubah** `frontend/Dockerfile`, `frontend/nginx.conf`, `frontend/.dockerignore` (area saya; kalau perlu diubah, bilang ke saya)

Setelah itu `docker compose up -d --build` menjalankan semuanya di `http://localhost:8080`.

## 3. ⚠️ Wajib di `apiClient`: refresh token satu kali saja

Ini yang paling penting. Backend memakai **refresh token rotation + reuse detection**:

- Setiap `POST /api/v1/auth/refresh` menukar refresh token lama dengan yang baru.
- Kalau token lama dipakai lagi, backend menganggapnya **dicuri** dan **mencabut semua sesi user** di semua perangkat.

Artinya, kalau 3 request gagal `401` bersamaan lalu masing-masing memanggil refresh, request kedua dan ketiga akan memakai token yang sudah diganti, sehingga user ter-logout total.

**Yang harus dilakukan `apiClient`:**
1. Saat menerima `401`, cek apakah sudah ada refresh yang sedang berjalan.
2. Kalau belum ada, panggil `POST /auth/refresh` dan simpan promise-nya.
3. Kalau sudah ada, tunggu promise yang sama (jangan panggil refresh lagi).
4. Setelah refresh berhasil, ulangi request yang tadi gagal.
5. Kalau refresh juga `401`, arahkan ke halaman login.

Contoh pola (Axios):
```ts
let refreshing: Promise<void> | null = null;

apiClient.interceptors.response.use(undefined, async (error) => {
  const original = error.config;
  // 401 dari login/register berarti kredensial salah, bukan sesi habis.
  const isAuthCall = /^\/auth\/(login|register|refresh)/.test(original?.url ?? '');
  if (error.response?.status !== 401 || original._retried || isAuthCall) {
    throw error;
  }
  original._retried = true;

  refreshing ??= apiClient
    .post('/auth/refresh')
    .then(() => undefined)
    .finally(() => { refreshing = null; });

  try {
    await refreshing;
  } catch {
    window.location.assign('/login');
    throw error;
  }
  return apiClient(original);
});
```

## 4. Hal lain tentang auth

- Token **hanya** di cookie `HttpOnly`. Frontend tidak bisa (dan tidak perlu) membaca token. Cukup `withCredentials: true`.
- Header `Authorization` diabaikan backend.
- Untuk tahu siapa yang login, panggil `GET /api/v1/auth/me`.
- Logout: `DELETE /api/v1/auth/refresh` (bukan `/auth/logout`).
- Pesan error login selalu sama untuk email tidak terdaftar dan password salah. Tampilkan apa adanya, jangan dibedakan.
- Rate limit: login 5x/menit per IP. Tangani `429` dengan pesan "coba lagi nanti" (ada header `Retry-After` dalam detik).
- Format error dari backend:
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "...", "issues": [{ "path": "email", "message": "..." }] } }
  ```
  `issues` hanya ada untuk error validasi; cocok untuk menampilkan pesan per field di form.
- Aturan password: 12–128 karakter, wajib huruf kecil, huruf besar, dan angka. Validasi yang sama sebaiknya ada di form.

## 5. Kalau butuh perubahan di area saya

Tulis permintaannya di [`docs/UNTUK-ALDI.md`](UNTUK-ALDI.md) (bagian "Permintaan"), lalu kirim lewat PR. Contohnya:

- **Kolom database baru** untuk `study-sessions` atau `essay-scans`: bilang ke saya, saya yang buat migrasinya di `backend/prisma/`.
- **Endpoint SSE QR bridge:** di `nginx.conf` saya pakai usulan `/api/v1/scans/qr-bridge/:token/events`. Kalau kamu pakai path lain atau WebSocket, kabari saya supaya `nginx.conf` disesuaikan.
- **Dependency backend baru** (misalnya `sharp`, `file-type`): silakan tambah sendiri. Kalau `package-lock.json` konflik saat merge, ambil versi `main` lalu jalankan `npm install` lagi.

## 6. CI di GitHub

Setiap PR ke `main` menjalankan `.github/workflows/ci-security.yml`: typecheck, unit test, integration test, `npm audit --audit-level=high`, Semgrep, dan build Docker. PR sebaiknya baru di-merge kalau semua job hijau.

Untuk frontend:
- Job `frontend` dan build image frontend otomatis aktif begitu `frontend/package.json` ada di branch-mu. Pastikan `npm ci` dan `npm run build` lolos.
- `npm audit --audit-level=high` juga akan memeriksa `frontend/`. Hindari dependency dengan advisory *high*/*critical*.
- Semgrep memindai seluruh repo, termasuk kode frontend (mis. `dangerouslySetInnerHTML`, secret yang ter-commit).

## 7. Menjalankan test

```bash
cd backend
npm test                    # unit test, cepat, tanpa Docker
npm run test:integration    # butuh Docker Desktop jalan (Postgres + Redis via Testcontainers)
```

Untuk test yang butuh database, pakai helper `createTestContext()` di `backend/tests/support/testContext.ts`. Helper ini sudah terhubung sebagai `app_service_user` (kena RLS) seperti aplikasi aslinya.
