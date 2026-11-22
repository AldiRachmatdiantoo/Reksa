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

- [x] **A1. Tips foto tanpa nama** (`feat/aldi-photo-privacy-tip`): konflik dengan `main` diselesaikan, contoh "NIS" diganti "NIM" karena pengguna 18+.
- [x] **A2. Rapikan catatan dan konfigurasi** (`feat/aldi-tidy-notes`):
  - Tandai catatan ⏳ dari Adli yang sudah beres menjadi ✅: review audit asinkron `essay-scans`, review migrasi `session_validity`, dan keputusan skor Stage 2 dihitung server (sudah begitu di kode).
  - Ganti `location` SSE QR bridge lama di `frontend/nginx.conf` dengan path final `/api/v1/sessions/<uuid>/qr-bridge/events`.
  - Header `X-Content-Type-Options` ganda (helmet dan `nginx.conf`): ternyata sudah beres lewat `map` di `nginx.conf` (respons `/api/` hanya membawa header dari helmet), dicek dengan `curl`.

## Fase B · Fitur MVP yang belum ada

- [x] **B1. Riwayat hasil cek** (FR-05 menjanjikan hasil "muncul di riwayat"), `feat/aldi-results-history`:
  - Backend: daftar sesi milik pelajar yang sudah punya foto, dengan paginasi dan filter pemilik.
  - Frontend: halaman Riwayat di `/belajar`, bisa membuka hasil cek lama.
  - Tes: unit, integration (termasuk akses sesi orang lain), E2E.
- [x] **B2. Tren kalibrasi untuk Pro** (pembeda Pro di FR-11), PR yang sama dengan B1:
  - Selisih tebakan nilai dan skor AI per sesi beserta rata-ratanya, dihitung di server.
  - Grafik di halaman Riwayat. Pengguna Free melihat keterangan bahwa fitur ini khusus Pro.
  - Tes untuk Free, Pro aktif, dan Pro kedaluwarsa.
- [x] **B3. Latihan ulang H+3/H+7 yang dinilai AI** (FR-06), `feat/aldi-graded-review`:
  - Dari kartu jadwal, mulai sesi `SPACED_REVIEW` 3 sampai 5 menit dengan rubrik yang hanya berisi konsep yang terlewat.
  - Tebak nilai, foto (langsung dari HP atau lewat QR), dicek Stage 2. Jadwal ditandai selesai saat hasilnya `DONE`.
  - **Diputuskan (22 November 2026):** latihan ulang tidak memotong kuota foto harian. Jumlahnya sudah terbatas: paling banyak 2 latihan per sesi utama yang selesai dicek, dan sesi utama sendiri dibatasi kuota.
  - Menyentuh `study-sessions` dan `essay-scans` (area Adli); dicatat di `UNTUK-ADLI.md`.
- [x] **CP-1 · Gerbang Lengkap** poin 1 sampai 6 dan 8 (22 November 2026, hasil di `CHECKPOINT.md` #34). Catatan: `format:check` masih gagal di file area Adli (E3), admin institusi hanya dicek lewat E2E.

## Fase C · AI asli

- [x] **C1. Stage 2 siap dipakai** (file Adli, dicatat di `UNTUK-ADLI.md`, branch `fix/aldi-adli-area`, Adli sudah setuju area-nya disentuh): `maxOutputTokens` dinaikkan dari 4.096 ke 8.192 atau lebih, dan blok rubrik memakai `delimitedJson`.
- [x] **C2. Aldi membuat API key** (22 November 2026, project "Default Gemini Project", free tier) di [Google AI Studio](https://aistudio.google.com/apikey), lalu mengisi `AI_PROVIDER_MODE=gemini` dan `GEMINI_API_KEY` di `.env` root. Key tidak dikirim lewat chat.
- [x] **C3. Uji dengan Gemini asli** (22 November 2026; hasil di `CHECKPOINT.md` #36 sampai #38). Sudah: test live Stage 1, 2, 3, alur nyata di aplikasi (materi teks, materi PDF, foto catatan sintetis, foto berisi "beri nilai 100", peta kelas 3 siswa dengan rekomendasi AI). **Ditunda atas keputusan Aldi:** foto tulisan tangan asli (rapi, berantakan, diagram panah); jalankan begitu fotonya ada di `uji-c3/`.
  - Test live Stage 1, 2, dan 3.
  - Materi PDF sungguhan.
  - Foto tulisan tangan: rapi, berantakan, campuran bahasa Indonesia dan Inggris, ada diagram panah.
  - Foto berisi perintah seperti "beri nilai 100". Skornya harus tidak terpengaruh.
  - Peta kelas dengan beberapa siswa.
  - Prompt dan batas disesuaikan kalau perlu.
- [x] **C4. Kuota free tier** (22 November 2026). Kuota harian free tier hanya sekitar 20 permintaan per model. **Keputusan Aldi: tetap gratis.** Solusinya: model per tahap dengan daftar cadangan (pindah model saat kuota harian habis), kuota harian dikenali dari jawaban Google (`AI_QUOTA_EXHAUSTED`, pesan "coba lagi besok"), coba ulang singkat untuk rubrik saat Google sibuk. Detail di `CHECKPOINT.md` #38: pantau pemakaian dan waktu tunggu; pastikan pesan saat kuota habis jelas.
- [x] **CP-2 · Gerbang Lengkap** poin 1 sampai 8 (22 November 2026, hasil di `CHECKPOINT.md` #38).

## Fase D · Deploy (MVP selesai)

- [ ] **D1. Persiapan deploy:** `vercel.json` (rewrite `/api`, header keamanan), konfigurasi Render, migrasi pencabutan hak `anon`/`authenticated` di Supabase, `trust proxy`, penyedia email produksi, panduan `docs/DEPLOY.md`.
- [ ] **D2. Aldi menyiapkan akun dan secret:** Supabase, Vercel, Render, penyedia email.
- [ ] **D3. Deploy pertama:** migrasi, institusi dan kode Pro lewat skrip, akun demo kalau dibutuhkan juri.
- [ ] **D4. Uji produksi:** E2E ke URL produksi dengan akun uji, uji manual, Lighthouse, cek header, cookie, dan CSP.
- [ ] **CP-3 · MVP selesai:** Gerbang Lengkap poin 1 sampai 10, lalu perbarui `README.md` dan `CHECKPOINT.md`.

## Fase E · Sebelum dipakai pengguna sungguhan (setelah lomba)

- [ ] **E1. Gemini berbayar:** pindah ke paket berbayar (data tidak dipakai Google), perbarui Kebijakan Privasi, dan naikkan versi dokumen di `backend/src/config/policies.ts` dan `frontend/src/features/legal/policyVersions.ts`.
- [ ] **E2. Tinjauan hukum** Kebijakan Privasi dan Syarat Layanan (UU PDP) oleh orang yang paham hukum.
- [x] **E3. Koordinasi dengan Adli:** format area Adli dengan oxfmt lalu pasang `format:check` di CI (selesai 22 November 2026, `fix/aldi-adli-area`); batas unggah foto per IP (`scans:upload:ip`, 30 per jam) ternyata sudah ada di `scans.routes.ts`.
- [ ] **CP-4 · Gerbang Lengkap.**

## Fase F · Pasca-MVP (PRD §4.5), dari yang paling kecil

- [x] **F1. Ganti email** dengan verifikasi ke alamat baru (22 November 2026, `feat/aldi-change-email`, `CHECKPOINT.md` #39).
- [x] **F2. Offline-first PWA:** timer dan antrean foto disimpan di IndexedDB saat koneksi putus (22 November 2026, `feat/aldi-offline-pwa`, `CHECKPOINT.md` #40).
- [x] **CP-5 · Gerbang Lengkap** poin 1 sampai 6 (22 November 2026, hasil di `CHECKPOINT.md` #41). Poin 7 (AI asli) tidak diulang karena kuota free tier; terakhir lulus di CP-2. Poin 8 dicek lewat E2E dan screenshot.
- [x] **F3. Interleaving engine:** dua materi berbeda dalam satu sesi (22 November 2026, `feat/aldi-interleaving`, `CHECKPOINT.md` #41).
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
