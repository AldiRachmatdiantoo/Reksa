# E2E + aksesibilitas (Playwright + axe-core)

Uji alur pelajar terhadap stack lengkap (nginx + backend + worker audit + Postgres + Redis + S3), sesuai PRD §11.1. Setiap halaman yang dilewati diaudit axe-core untuk WCAG 2.1 A/AA; pelanggaran `critical` dan `serious` menggagalkan test.

| Test | Isi |
| :--- | :--- |
| golden path | pilih materi → fokus → tebak nilai → kirim foto → hasil asli dari worker; kuota terpotong; hasil tetap ada setelah muat ulang |
| QR bridge | laptop menampilkan QR → HP (konteks terpisah, tanpa login, layar Pixel 7) mengunggah → laptop pindah ke hasil lewat SSE; token tidak bisa dipakai lagi |
| navigasi menu | pindah Belajar, Materi, Kelas tanpa layar kosong; tidak ada pelanggaran CSP; timer tidak melebar; font dari bundel sendiri |
| pulihkan sesi | timer tetap berjalan setelah muat ulang, dipulihkan di tab baru dari `GET /sessions/active`; "Ulangi" membatalkan sesi di server |

## Menjalankan

Dari root repo (isi `.env` dulu, lihat `README.md`):

```bash
docker compose up -d postgres redis
docker compose --profile tools run --rm --build migrate   # wajib; --build supaya migrasi terbaru ikut
docker compose up -d --build                       # http://localhost:8080
```

Lalu di `frontend/`:

```bash
npx playwright install chromium   # sekali saja
npm run test:e2e                   # atau E2E_BASE_URL=http://host:port npm run test:e2e
```

Backend harus `AI_PROVIDER_MODE=mock` (bawaan `.env.example`), jadi hasil cek deterministik dan tidak memanggil Gemini.

## Catatan

- **Rate limit registrasi 10 per jam per IP.** Setiap run mendaftarkan 4 akun baru (kuota Free 3 scan per hari per akun). Lebih dari 2 run dalam satu jam akan gagal dengan `TOO_MANY_REQUESTS`; tunggu, atau pakai stack baru (`docker compose down -v`).
- Test menutup pemberitahuan cookie seperti pengguna sungguhan ("Hanya penting"), karena kotak itu menutupi tombol di bawah layar.
- Jejak (trace) test yang gagal ada di `test-results/` (`npx playwright show-trace <file>`).
- Jalan di CI: job `e2e` di `.github/workflows/ci-security.yml` menyalakan stack Docker penuh dengan `.env` acak sekali pakai, lalu menjalankan suite ini.
