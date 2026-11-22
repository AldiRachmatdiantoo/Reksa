# Panduan Deploy REKSA (gratis)

Disusun 22 November 2026 (D1 di `docs/SISA-ALDI.md`). Semua akun, kata sandi, dan API key dibuat dan diisi sendiri oleh Aldi; tidak ada yang ditulis di repo atau dikirim lewat chat. Batas free tier di bawah dicek November 2026 dan sering berubah: buka halaman harga masing-masing sebelum mendaftar.

## 1. Pilihan hosting

Susunan yang direkomendasikan, semuanya tanpa kartu kredit:

| Bagian | Pilihan utama | Batas gratis yang relevan | Alternatif |
| :--- | :--- | :--- | :--- |
| Frontend | **Vercel Hobby** | Untuk proyek non-komersial. Rewrite `/api` ke backend menjaga cookie `SameSite=Strict` tetap satu origin. | Netlify (rewrite proxy serupa), Cloudflare Pages (proxy lewat Functions, perlu kode tambahan) |
| Backend | **Render Free** (Docker) | 750 jam/bulan, tidur setelah 15 menit tanpa request, bangun sekitar 1 menit. Disk sementara (aman: file disimpan di Supabase Storage). | Koyeb Free (1 instance 512 MB, tidur setelah 1 jam, bangun dalam detik; syarat daftar sejak akuisisi Mistral Feb 2026 belum jelas, ada laporan butuh kartu) |
| Redis | **Render Key Value Free** | Hanya di memori, bisa di-restart kapan saja. Tidak ada batas jumlah perintah. | Upstash Free (500 ribu perintah/bulan). Sekarang muat: worker audit menunggu job dengan `BRPOP` 30 detik, jadi saat sepi hanya sekitar 175 ribu perintah/bulan. Lihat jalur cadangan di langkah 4b. |
| Database + file | **Supabase Free** | DB 500 MB, Storage 1 GB, proyek dijeda setelah 1 minggu tanpa aktivitas (bisa dibangunkan dari dashboard). | Neon (DB saja; file tetap butuh storage S3 lain) |
| Email | **Brevo Free** | 300 email/hari lewat SMTP, ada branding Brevo di email. | Resend Free (3.000/bulan, maks. 100/hari, satu domain sendiri) |
| AI | **Gemini free tier** | Kuota harian per model; REKSA pindah ke model cadangan saat habis (CHECKPOINT #38). | - |

Konsekuensi yang perlu diterima di versi gratis:

- **Bangun dari tidur:** request pertama setelah 15 menit sepi menunggu sekitar 1 menit. Vercel menunggu backend sampai 120 detik, jadi request itu tetap selesai, hanya lambat.
- **Redis bisa kosong sewaktu-waktu:** audit yang sedang antre bisa hilang. REKSA sudah menanganinya: saat hasil dibuka, audit yang tertahan lebih dari 5 menit dinyatakan gagal (`AUDIT_STALLED`), kuota dikembalikan, dan tombol coba lagi muncul. Batas rate limit ikut ter-reset.
- **Supabase dijeda** kalau seminggu tidak dipakai.

## 2. Supabase (database + storage)

1. Buat proyek baru, region **Southeast Asia (Singapore)**, simpan kata sandi database di password manager.
2. **Matikan Data API:** Project Settings → Data API → nonaktifkan. Migrasi `supabase_data_api_lockdown` juga mencabut hak `anon` dan `authenticated` sebagai lapisan kedua.
3. **Jalankan migrasi dari laptop**, memakai connection string **Session pooler** (Connect → Session pooler, port 5432, IPv4) dengan user `postgres`:

   ```powershell
   cd backend
   $env:MIGRATION_DATABASE_URL = "<session pooler URL, user postgres>"
   npx prisma migrate deploy
   Remove-Item Env:MIGRATION_DATABASE_URL
   ```

4. **Beri login ke role aplikasi** di SQL Editor (kata sandi baru yang panjang dan acak, bukan kata sandi `postgres`):

   ```sql
   ALTER ROLE app_service_user WITH LOGIN PASSWORD '<kata sandi baru>';
   ```

   `DATABASE_URL` untuk Render = Session pooler URL dengan user `app_service_user.<project-ref>` dan kata sandi tadi. Backend tidak pernah memakai user `postgres`, jadi RLS tetap berlaku.

5. **Storage:** buat bucket **`reksa-private`**, *private* (bukan public). Lalu Storage → S3 Connection: catat endpoint dan region, buat **S3 access key**. Isi Render:
   - `STORAGE_ENDPOINT` dan `STORAGE_PUBLIC_ENDPOINT` = endpoint S3 itu (`https://<project-ref>.supabase.co/storage/v1/s3`)
   - `STORAGE_REGION` = region di halaman yang sama
   - `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` = access key tadi

## 3. Email (Brevo)

1. Daftar Brevo, verifikasi alamat pengirim (Senders).
2. SMTP & API → buat SMTP key.
3. Isi Render: `SMTP_URL` = `smtp://<login SMTP>:<SMTP key>@smtp-relay.brevo.com:587`, `EMAIL_FROM` = `REKSA <alamat pengirim terverifikasi>`.

## 4. Render (backend + Redis)

1. New → **Blueprint** → pilih repo ini. Render membaca `render.yaml`: layanan `reksa-api` (Docker, `backend/Dockerfile`) dan `reksa-redis`.
2. Isi semua variabel bertanda *sync: false* di form yang muncul: `DATABASE_URL`, nilai Storage, `SMTP_URL`, `EMAIL_FROM`, `GEMINI_API_KEY`. `CORS_ORIGIN` dan `APP_URL` diisi URL Vercel (langkah 5), boleh sementara `https://example.com` lalu diganti. `JWT_*` dibuat otomatis oleh Render.
3. Setelah deploy, buka `https://<nama>.onrender.com/api/v1/health` → `{"status":"ok"}`.
4. Kalau URL-nya **bukan** `https://reksa-api.onrender.com` (nama sudah dipakai orang), ganti tujuan rewrite pertama di `frontend/vercel.json`, commit lewat PR.

## 4b. Jalur cadangan: Koyeb + Upstash (kalau Render belum bisa dipakai)

Dipakai kalau jatah gratis Render habis atau akun belum bisa dibuat. Bedanya dengan Render: tidur setelah 1 jam sepi (bukan 15 menit) dan bangun dalam hitungan detik, tetapi Redis harus dari Upstash. Cek dulu di halaman harga Koyeb apakah daftar masih tanpa kartu kredit.

1. **Upstash:** buat database Redis, region **ap-southeast-1 (Singapore)**, eviction **mati**. Salin URL `rediss://...` (TLS). Itu `REDIS_URL`.
2. **Koyeb:** Create Service → Web Service → GitHub, pilih repo ini.
   - Builder **Dockerfile**, work directory `backend`, Dockerfile `Dockerfile`.
   - Instance **Free**, port **3000**, health check HTTP `/api/v1/health`.
   - Variabel: sama dengan daftar di `render.yaml` (`NODE_ENV=production`, `PORT=3000`, `AI_PROVIDER_MODE=gemini`, `STORAGE_BUCKET=reksa-private`, `STORAGE_FORCE_PATH_STYLE=true`, plus semua secret), ditambah `REDIS_URL` dari Upstash. `JWT_ACCESS_SECRET` dan `JWT_REFRESH_SECRET` dibuat sendiri, masing-masing minimal 32 karakter acak (mis. `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`), simpan di password manager.
   - `TRUST_PROXY_HOPS`: mulai dari `2`, lalu buktikan di D4 (lihat bagian 7). Rantai proxy Koyeb belum diuji.
3. Ganti tujuan rewrite pertama di `frontend/vercel.json` ke URL Koyeb (`https://<app>-<org>.koyeb.app/api/:path*`), commit lewat PR.
4. Kuota Upstash: worker yang menganggur memakai sekitar 175 ribu perintah/bulan, sisanya untuk rate limit dan antrean saat ada pengguna. Pantau grafik perintah di dashboard Upstash minggu pertama.

## 5. Vercel (frontend)

1. Add New → Project → repo ini, **Root Directory: `frontend`**. Framework dan perintah build dibaca dari `frontend/vercel.json`.
2. Setelah deploy, isi `CORS_ORIGIN` dan `APP_URL` di Render (atau Koyeb) dengan URL Vercel (mis. `https://reksa.vercel.app`), lalu Render akan deploy ulang.
3. `vercel.json` sudah membawa header keamanan yang sama dengan `nginx.conf` lokal (CSP dengan `img-src` ke `*.supabase.co` untuk signed URL), `sw.js` tanpa cache, dan aset `/assets/` di-cache setahun.

## 6. Data awal (D3)

Skrip admin dijalankan dari laptop dengan Session pooler user `postgres`, sama seperti migrasi:

```powershell
cd backend
$env:MIGRATION_DATABASE_URL = "<session pooler URL, user postgres>"
npx tsx scripts/create-institution.ts --name "Nama Institusi" --admin-email admin@contoh.ac.id --admin-name "Nama Admin"
npx tsx scripts/create-pro-code.ts --days 30 --max 1 --valid-days 90 --label "Uji coba"
Remove-Item Env:MIGRATION_DATABASE_URL
```

Kata sandi sementara admin dan kode Pro mentah hanya tampil sekali di terminal; simpan di password manager.

## 7. Yang wajib dicek di uji produksi (D4)

Hal yang tidak bisa dibuktikan di lokal:

- **Unggah lewat rewrite Vercel:** foto catatan (maks. 5 MB) dan PDF materi (maks. 10 MB). Batas body request untuk rewrite ke origin luar tidak tercantum jelas di dokumentasi Vercel (fungsi serverless dibatasi 4,5 MB). Kalau 413, opsi: kompres foto di browser sebelum unggah, atau custom domain bersama untuk frontend dan API.
- **SSE QR bridge** lewat rewrite: backend mengirim ping tiap 15 detik, di bawah batas jeda 120 detik Vercel.
- **IP klien untuk rate limit:** `TRUST_PROXY_HOPS=2` mengandaikan rantai Vercel → load balancer Render. Cek dengan login gagal berulang dari dua jaringan berbeda: hanya jaringan yang berulang yang kena 429.
- **Cookie:** `__Host-` dan `__Secure-refresh_token` muncul di domain Vercel, `HttpOnly`, `Secure`, `SameSite=Strict`.
- **Header dan CSP:** konsol browser tanpa pelanggaran CSP (gambar signed URL dari Supabase tampil).
- **Data API tertutup:** `https://<project-ref>.supabase.co/rest/v1/users` dengan anon key harus ditolak.
