# Rencana Kerja menuju MVP dan sesudahnya

Diperbarui 22 November 2026, setelah PR #29 (Gemini Stage 1/3, batas usia 18+). Ukuran MVP mengikuti `PRD.md`: FR-01 sampai FR-14, AI Stage 1 sampai 3, dan deploy.

Bagian MVP milik Adli (`study-sessions`, `essay-scans`, Stage 2 Vision, unit test, E2E) sudah di `main` sejak 21 November. Semua yang belum ada di bawah ini dikerjakan Aldi. Setiap perubahan di area Adli dicatat di `docs/UNTUK-ADLI.md`.

Daftar ini urut: kerjakan dari atas. Centang `[x]` saat PR-nya sudah masuk `main`, lalu catat di `docs/CHECKPOINT.md`.

## Cara kerja

- **Satu langkah, satu PR.** Branch `feat/aldi-*` atau `fix/aldi-*` dibuat dari `main` terbaru, lalu PR dengan auto-merge (merge commit). PR masuk sendiri begitu semua check CI lulus.
- **Satu PR terbuka dalam satu waktu.** Ruleset `protect-main` mewajibkan branch up to date dengan `main`, jadi PR kedua akan tertahan begitu PR pertama masuk. Branch berikutnya dibuat setelah PR sebelumnya masuk.
- **Gerbang Kecil di setiap PR**, **Gerbang Lengkap di setiap checkpoint (CP)**. Hasil Gerbang Lengkap dicatat di `docs/CHECKPOINT.md`, termasuk yang gagal.
- Commit dan PR tanpa atribusi AI.

## Gerbang uji

### Gerbang Kecil (setiap PR)

- Typecheck dan unit test paket yang berubah: `npm run typecheck` dan `npm test` di `backend/` atau `frontend/`.
- Integration test kalau backend berubah: `npm run test:integration`.
- E2E Playwright kalau UI atau alur berubah, terhadap stack Docker lokal.
- `oxfmt --check` di file yang diubah (area Aldi).
- CI hijau: typecheck, unit, build backend · integration dan security (Testcontainers) · `npm audit` high+ · Semgrep · build image Docker (non-root, `nginx -t`) · build frontend · E2E Playwright + axe.

### Gerbang Lengkap (setiap checkpoint)

1. **Statis:** typecheck backend dan frontend, `npx prisma validate`, `npm run format:check`.
2. **Unit + coverage:** `npm run test:coverage` di backend (tidak boleh turun dari 96% statement dan 89% branch), `npm test` di frontend.
3. **Integration + security:** `npm run test:integration` (IDOR/BOLA, token replay, SQL injection, upload spoofing, rate limit, RLS, kuota).
4. **Build:** backend dan frontend tanpa peringatan; image backend, migrator, dan frontend; image berjalan sebagai non-root; `nginx -t`.
5. **E2E + aksesibilitas:** seluruh spec Playwright + axe di stack Docker yang dibangun ulang, termasuk layar 320px dan 375px. Spec yang pernah tidak stabil diulang 3 kali.
6. **Dependency + SAST:** `npm audit --audit-level=high` di kedua paket, Semgrep (CI).
7. **AI asli** (setelah API key ada): `RUN_LIVE_AI=1` untuk test live Stage 1, 2, dan 3.
8. **Uji manual di browser:** alur pelajar, guru, dan admin institusi; console tanpa error atau pelanggaran CSP; tema terang dan gelap; layar HP 375px; navigasi dengan keyboard saja.
9. **Performa** (mulai CP-3): Lighthouse untuk beranda dan `/belajar` (performa, aksesibilitas, best practices); uji beban ringan ke login, daftar materi, dan unggah foto, yang harus dijawab 429 dengan rapi, bukan 500.
10. **Keamanan produksi** (setelah deploy): header keamanan, cookie `__Host-` dan `__Secure-`, CSP, Data API Supabase tertutup, signed URL kedaluwarsa sesuai batas.

## Fase A · Beres-beres

- [ ] **A1. Tips foto tanpa nama** (`feat/aldi-photo-privacy-tip`): selesaikan konflik dengan `main` di `CalibratePage.tsx` dan `frontend/docs/CHECKPOINT.md`, lalu PR.
- [ ] **A2. Rapikan catatan dan konfigurasi:**
  - Tandai catatan ⏳ dari Adli yang sudah beres menjadi ✅: review audit asinkron `essay-scans`, review migrasi `session_validity`, dan keputusan skor Stage 2 dihitung server (sudah begitu di kode).
  - Ganti `location` SSE QR bridge lama di `frontend/nginx.conf` dengan path final `/api/v1/sessions/<uuid>/qr-bridge/events`.
  - Hapus header `X-Content-Type-Options` ganda (helmet dan `nginx.conf`).

## Fase B · Fitur MVP yang belum ada

- [ ] **B1. Riwayat hasil cek** (FR-05 menjanjikan hasil "muncul di riwayat"):
  - Backend: daftar sesi milik pelajar yang sudah punya foto, dengan paginasi dan filter pemilik.
  - Frontend: halaman Riwayat di `/belajar`, bisa membuka hasil cek lama.
  - Tes: unit, integration (termasuk akses sesi orang lain), E2E.
- [ ] **B2. Tren kalibrasi untuk Pro** (pembeda Pro di FR-11):
  - Selisih tebakan nilai dan skor AI per sesi beserta rata-ratanya, dihitung di server.
  - Grafik di halaman Riwayat. Pengguna Free melihat keterangan bahwa fitur ini khusus Pro.
  - Tes untuk Free, Pro aktif, dan Pro kedaluwarsa.
- [ ] **B3. Latihan ulang H+3/H+7 yang dinilai AI** (FR-06):
  - Dari kartu jadwal, mulai sesi `SPACED_REVIEW` 3 sampai 5 menit dengan rubrik yang hanya berisi konsep yang terlewat.
  - Tebak nilai, foto (langsung dari HP atau lewat QR), dicek Stage 2. Jadwal ditandai selesai saat hasilnya `DONE`.
  - **Keputusan Aldi sebelum mulai:** apakah latihan ulang memotong kuota foto harian.
  - Menyentuh `study-sessions` dan `essay-scans` (area Adli); dicatat di `UNTUK-ADLI.md`.
- [ ] **CP-1 · Gerbang Lengkap** poin 1 sampai 6 dan 8.

## Fase C · AI asli

- [ ] **C1. Stage 2 siap dipakai** (file Adli, dicatat di `UNTUK-ADLI.md`): `maxOutputTokens` dinaikkan dari 4.096 ke 8.192 atau lebih, dan blok rubrik memakai `delimitedJson`.
- [ ] **C2. Aldi membuat API key** di [Google AI Studio](https://aistudio.google.com/apikey), lalu mengisi `AI_PROVIDER_MODE=gemini` dan `GEMINI_API_KEY` di `.env` root. Key tidak dikirim lewat chat.
- [ ] **C3. Uji dengan Gemini asli:**
  - Test live Stage 1, 2, dan 3.
  - Materi PDF sungguhan.
  - Foto tulisan tangan: rapi, berantakan, campuran bahasa Indonesia dan Inggris, ada diagram panah.
  - Foto berisi perintah seperti "beri nilai 100". Skornya harus tidak terpengaruh.
  - Peta kelas dengan beberapa siswa.
  - Prompt dan batas disesuaikan kalau perlu.
- [ ] **C4. Kuota free tier:** pantau pemakaian dan waktu tunggu; pastikan pesan saat kuota habis jelas.
- [ ] **CP-2 · Gerbang Lengkap** poin 1 sampai 8.

## Fase D · Deploy (MVP selesai)

- [ ] **D1. Persiapan deploy:** `vercel.json` (rewrite `/api`, header keamanan), konfigurasi Render, migrasi pencabutan hak `anon`/`authenticated` di Supabase, `trust proxy`, penyedia email produksi, panduan `docs/DEPLOY.md`.
- [ ] **D2. Aldi menyiapkan akun dan secret:** Supabase, Vercel, Render, penyedia email.
- [ ] **D3. Deploy pertama:** migrasi, institusi dan kode Pro lewat skrip, akun demo kalau dibutuhkan juri.
- [ ] **D4. Uji produksi:** E2E ke URL produksi dengan akun uji, uji manual, Lighthouse, cek header, cookie, dan CSP.
- [ ] **CP-3 · MVP selesai:** Gerbang Lengkap poin 1 sampai 10, lalu perbarui `README.md` dan `CHECKPOINT.md`.

## Fase E · Sebelum dipakai pengguna sungguhan (setelah lomba)

- [ ] **E1. Gemini berbayar:** pindah ke paket berbayar (data tidak dipakai Google), perbarui Kebijakan Privasi, dan naikkan versi dokumen di `backend/src/config/policies.ts` dan `frontend/src/features/legal/policyVersions.ts`.
- [ ] **E2. Tinjauan hukum** Kebijakan Privasi dan Syarat Layanan (UU PDP) oleh orang yang paham hukum.
- [ ] **E3. Koordinasi dengan Adli:** format area Adli dengan oxfmt lalu pasang `format:check` di CI; batas unggah foto per IP (`scans:upload:ip`).
- [ ] **CP-4 · Gerbang Lengkap.**

## Fase F · Pasca-MVP (PRD §4.5), dari yang paling kecil

- [ ] **F1. Ganti email** dengan verifikasi ke alamat baru (lanjutan FR-14).
- [ ] **F2. Offline-first PWA:** timer dan antrean foto disimpan di IndexedDB saat koneksi putus.
- [ ] **CP-5 · Gerbang Lengkap.**
- [ ] **F3. Interleaving engine:** dua materi berbeda dalam satu sesi.
- [ ] **F4. Pembayaran Pro langsung** (Midtrans atau Xendit, webhook bertanda tangan), menggantikan kode aktivasi manual. Aldi menyiapkan akun merchant.
- [ ] **CP-6 · Gerbang Lengkap.**
- [ ] **F5. Mode Audio-First Feynman** (Stage 4): AI berperan sebagai murid awam yang bertanya lewat suara.
- [ ] **F6. Pengguna di bawah 18 tahun:** hanya kalau ada penyedia AI yang ketentuannya mengizinkan, dengan konfirmasi izin orang tua lewat email dan tinjauan hukum.
- [ ] **CP-7 · Gerbang Lengkap.**

## Sudah selesai

- Langkah 0: Docker, PostgreSQL + RLS, Redis, kontrak Zod, `MockAiProvider`
- `auth`, CI + security gate, storage S3
- FR-01 sampai FR-05 (sesi, tebak nilai, foto langsung dan QR, cek asinkron): Adli, PR #13 sampai #20
- FR-06 jadwal H+3/H+7 (latihan masih dicocokkan sendiri), FR-07 ledger, FR-08 peta blind spot kelas, FR-09 kelas, FR-10 admin institusi, FR-11 kuota dan kode Pro, FR-12 PDF bukti, FR-13 privasi, FR-14 akun dasar
- Gemini Stage 1 dan 3, rangkaian `AI_PROVIDER_MODE=gemini`, Stage 2 Vision (Adli), belum diuji dengan API key
- Batas usia 18+ (ketentuan Gemini API)
- Temuan QA 22 November: bug 1 sampai 9 dan catatan kualitas (PR #28)
