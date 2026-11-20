# Catatan untuk Adli

Dari: Aldi
Terakhir diperbarui: 20 November 2026
Status branch: Langkah 0 sudah di `main`; modul `auth` ada di `feat/aldi-auth` (menunggu PR)

Hai Adli, ini ringkasan yang perlu kamu tahu sebelum mulai. Detail lengkapnya ada di [PRD.md §8.3](../PRD.md) dan [CLAUDE.md §1](../CLAUDE.md).

---

## 1. Yang sudah siap dipakai

- **Backend jalan di Docker** dengan Postgres + Redis. Cara menjalankan ada di [README](../README.md#menjalankan-proyek).
- **`MockAiProvider` sudah hidup.** Ketiga method AI mengembalikan JSON valid tanpa API key.
- **Kontrak Zod semua fitur sudah ada** di `backend/src/features/*/` `*.schema.ts`.
- **Endpoint auth** (setelah `feat/aldi-auth` di-merge): register, login, refresh, logout, me.

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

- **Kolom database baru** untuk `study-sessions` atau `essay-scans`: bilang ke saya, saya yang buat migrasinya di `backend/prisma/`.
- **Endpoint SSE QR bridge:** di `nginx.conf` saya pakai usulan `/api/v1/scans/qr-bridge/:token/events`. Kalau kamu pakai path lain atau WebSocket, kabari saya supaya `nginx.conf` disesuaikan.
- **Dependency backend baru** (misalnya `sharp`, `file-type`): silakan tambah sendiri. Kalau `package-lock.json` konflik saat merge, ambil versi `main` lalu jalankan `npm install` lagi.

## 6. Menjalankan test

```bash
cd backend
npm test                    # unit test, cepat, tanpa Docker
npm run test:integration    # butuh Docker Desktop jalan (Postgres + Redis via Testcontainers)
```

Untuk test yang butuh database, pakai helper `createTestContext()` di `backend/tests/support/testContext.ts`. Helper ini sudah terhubung sebagai `app_service_user` (kena RLS) seperti aplikasi aslinya.
