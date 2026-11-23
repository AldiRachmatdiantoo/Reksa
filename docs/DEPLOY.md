# Panduan Deploy REKSA (gratis)

Disusun 22 November 2026 (D1 di `docs/SISA-ALDI.md`). Semua akun, kata sandi, dan API key dibuat dan diisi sendiri oleh Aldi; tidak ada yang ditulis di repo atau dikirim lewat chat. Batas free tier di bawah dicek November 2026 dan sering berubah: buka halaman harga masing-masing sebelum mendaftar.

## 1. Pilihan hosting

Susunan yang direkomendasikan, semuanya tanpa kartu kredit:

| Bagian | Pilihan utama | Batas gratis yang relevan | Alternatif |
| :--- | :--- | :--- | :--- |
| Frontend | **Vercel Hobby** | Untuk proyek non-komersial. Rewrite `/api` ke backend menjaga cookie `SameSite=Strict` tetap satu origin. | Netlify (rewrite proxy serupa), Cloudflare Pages (proxy lewat Functions, perlu kode tambahan) |
| Backend | **Render Free** (Docker) | 750 jam/bulan, tidur setelah 15 menit tanpa request, bangun sekitar 1 menit. Disk sementara (aman: file disimpan di Supabase Storage). | Lihat langkah 4b: belum ada pengganti yang gratis tanpa kartu (Koyeb tidak lagi gratis sejak 2026) |
| Redis | **Render Key Value Free** | Hanya di memori, bisa di-restart kapan saja. Tidak ada batas jumlah perintah. | Upstash Free (500 ribu perintah/bulan). Sekarang muat: worker audit menunggu job dengan `BRPOP` 30 detik, jadi saat sepi hanya sekitar 175 ribu perintah/bulan. Lihat langkah 4b. |
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

## 4b. Kalau Render belum bisa dipakai: host Docker lain + Upstash

**Koyeb tidak lagi gratis** (dicek di halaman harganya 23 November 2026: paket termurah Pro $29/bulan). Belum ada pengganti Render yang gratis, tanpa kartu kredit, dan menyediakan backend sekaligus Redis. Pilihan yang tersisa:

| Opsi | Biaya | Catatan |
| :--- | :--- | :--- |
| Tunggu jatah Render | Gratis | Jatah bulanan Render reset tiap awal bulan. Paling sederhana: blueprint di langkah 4 sudah siap. |
| **Azure for Students** (lewat GitHub Student Developer Pack) | Kredit $100, tanpa kartu, usia 18+ | **Dipakai sekarang**, lihat langkah 4c. Container Apps dengan scale to zero kemungkinan masih di dalam jatah gratis bulanan. |
| Heroku untuk pelajar (GitHub Student Developer Pack) | Kredit $13/bulan selama 24 bulan | Kemungkinan tetap minta kartu untuk verifikasi. |
| Google Cloud Run, Oracle Always Free | Ada jatah gratis | Wajib akun billing atau verifikasi kartu. Cloud Run juga perlu CPU selalu aktif agar worker audit jalan di latar. |

Di host mana pun selain Render, Redis bisa dari **Upstash Free**:

1. Buat database Redis di region yang sama dengan backend, eviction **mati**. Salin URL `rediss://...` (TLS), itu `REDIS_URL`.
2. Variabel lain sama dengan daftar di `render.yaml`. `JWT_ACCESS_SECRET` dan `JWT_REFRESH_SECRET` dibuat sendiri, masing-masing minimal 32 karakter acak (mis. `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`), simpan di password manager.
3. Taruh backend, Supabase, dan Upstash di **region yang sama**. Setiap request memanggil database beberapa kali, jadi beda benua membuat halaman lambat.
4. Ganti tujuan rewrite pertama di `frontend/vercel.json` ke URL backend baru, dan buktikan `TRUST_PROXY_HOPS` di D4 (bagian 7).
5. Kuota Upstash 500 ribu perintah/bulan: worker audit yang menganggur memakai sekitar 175 ribu (`BRPOP` 30 detik), sisanya untuk rate limit dan antrean. Pantau grafiknya minggu pertama.

## 4c. Azure Container Apps + Upstash (dipakai November 2026)

Dipilih selama jatah Render habis. Akun Azure for Students tidak memakai kartu kredit: kalau kredit habis, layanan dimatikan, tidak ada tagihan. **Jangan tambahkan kartu kredit** di akun itu, karena kartu menghapus batas pengeluaran.

Biaya: Container Apps memberi jatah gratis per langganan per bulan (180 ribu vCPU-detik, 360 ribu GiB-detik, 2 juta request). Dengan **minimal replika 0**, uji coba dengan sedikit pengguna kemungkinan memotong sekitar $0. Kalau dibuat selalu menyala (minimal 1), perkiraannya sekitar $10 sampai $15 per bulan.

Yang **jangan** dibuat karena berbayar: Azure Cache for Redis (pakai Upstash), Azure Container Registry (pakai GitHub Container Registry), dan Log Analytics (pilih tanpa log).

1. **Upstash:** buat database Redis region **ap-southeast-1 (Singapore)**, eviction mati. Salin URL `rediss://...`, itu `REDIS_URL`.
2. **Image backend:** workflow `.github/workflows/backend-image.yml` membangun image setiap merge ke `main` yang menyentuh `backend/` (bisa juga dijalankan manual dari tab Actions → Backend image → Run workflow). Hasilnya `ghcr.io/aldirachmatdiantoo/reksa-backend:<12 huruf awal SHA>`; tag lengkapnya tercantum di ringkasan run.
3. **Akses Azure ke image:** package di GitHub Container Registry privat. Buat GitHub **personal access token (classic)** dengan hak **`read:packages` saja**, masa berlaku secukupnya (mis. 60 hari). Simpan di password manager.
4. **Buat Container App** di portal Azure (Container Apps → Create):
   - Grup resource baru `reksa`, nama `reksa-api`, region **Indonesia Central**. Langganan Azure for Students punya kebijakan "Allowed resource deployment regions" yang menolak Southeast Asia (validasi gagal dengan `RequestDisallowedByAzure`); daftar region yang diizinkan ada di Policy → Assignments. Jarak ke Supabase Singapore tetap pendek.
   - Environment baru: paket **Consumption only**, zone redundancy mati. Monitoring: **tanpa log** (Don't save logs) supaya tidak ada biaya Log Analytics.
   - Container: matikan quickstart image. Sumber image: registry lain (Docker Hub or other registries), **Private**, login server `ghcr.io`, username akun GitHub, password = token tadi. Image: `aldirachmatdiantoo/reksa-backend:<tag SHA>`. CPU **0.5**, memori **1 Gi**.
   - Variabel lingkungan: sama dengan daftar di `render.yaml` (`NODE_ENV=production`, `PORT=3000`, `AI_PROVIDER_MODE=gemini`, `STORAGE_BUCKET=reksa-private`, `STORAGE_FORCE_PATH_STYLE=true`, `DATABASE_SSL_CA=supabase`), ditambah `TRUST_PROXY_HOPS=2` (rewrite Vercel + ingress Azure) dan `REDIS_URL`. `DATABASE_SSL_CA=supabase` wajib: pooler Supabase memakai CA sendiri, dan tanpa variabel ini setiap query gagal dengan `self-signed certificate in certificate chain` (`/health` tetap 200 karena tidak menyentuh database, jadi uji juga dengan login). Nilai rahasia (`DATABASE_URL`, `REDIS_URL`, `JWT_*`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `SMTP_URL`, `GEMINI_API_KEY`) dibuat sebagai **Secret** di Container App lalu dirujuk dari variabel lingkungan. `JWT_ACCESS_SECRET` dan `JWT_REFRESH_SECRET` dibuat sendiri, berbeda satu sama lain, masing-masing minimal 32 karakter acak (mis. `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`).
   - Ingress: aktif, terima trafik dari mana saja, HTTP, target port **3000**.
   - **Gemini lewat relay:** Google menolak panggilan dari server Azure Indonesia Central (`User location is not supported`). Buat token acak 48 byte, isi sebagai `GEMINI_RELAY_TOKEN` di env proyek Vercel (Production) dan sebagai Secret `gemini-relay-token` di Container App, lalu tambahkan `GEMINI_API_BASE_URL=https://<app>.vercel.app/api/gemini-relay` dan `GEMINI_RELAY_TOKEN` (rujuk secret) di variabel lingkungan. Fungsinya `frontend/api/gemini-relay.ts`; tanpa token yang cocok ia menjawab 401.
5. **Setelah dibuat:**
   - Scale: **minimal 0, maksimal 1** replika. Maksimal 1 sekaligus membatasi biaya.
   - Buka `https://<URL aplikasi>/api/v1/health` → `{"status":"ok"}`. Permintaan pertama setelah sepi menunggu beberapa detik (replika dinyalakan).
   - Ganti tujuan rewrite pertama di `frontend/vercel.json` ke URL itu (`https://<URL aplikasi>/api/:path*`), commit lewat PR.
6. **Budget alert:** Cost Management → Budgets → anggaran $10 per bulan dengan email peringatan di 50% dan 100%. Cek Cost Management sehari setelah deploy: harus sekitar $0.
7. **Update berikutnya:** setelah workflow image selesai, buka Container App → Revisions and replicas → buat revisi baru dengan tag SHA yang baru.
8. **Selesai uji coba:** hapus grup resource `reksa` supaya tidak ada sisa biaya.

Catatan teknis: worker audit berjalan di proses yang sama. Dengan scale to zero, replika tetap hidup beberapa menit setelah request terakhir, cukup untuk menyelesaikan audit yang baru masuk. Job yang tertahan karena replika mati tetap ditangani `AUDIT_STALLED` (kuota dikembalikan, pelajar bisa coba lagi). SSE QR bridge mengirim ping tiap 15 detik, di bawah batas jeda ingress Azure (240 detik).

## 5. Vercel (frontend)

1. Add New → Project → repo ini, **Root Directory: `frontend`**. Framework dan perintah build dibaca dari `frontend/vercel.json`.
2. Setelah deploy, isi `CORS_ORIGIN` dan `APP_URL` di Render atau Azure (langkah 4c) dengan URL Vercel (mis. `https://reksa.vercel.app`), lalu Render akan deploy ulang.
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
- **IP klien untuk rate limit:** `TRUST_PROXY_HOPS=2` mengandaikan rantai Vercel → load balancer Render (atau ingress Azure Container Apps). Cek dengan login gagal berulang dari dua jaringan berbeda: hanya jaringan yang berulang yang kena 429.
- **Cookie:** `__Host-` dan `__Secure-refresh_token` muncul di domain Vercel, `HttpOnly`, `Secure`, `SameSite=Strict`.
- **Header dan CSP:** konsol browser tanpa pelanggaran CSP (gambar signed URL dari Supabase tampil).
- **Data API tertutup:** `https://<project-ref>.supabase.co/rest/v1/users` dengan anon key harus ditolak.
