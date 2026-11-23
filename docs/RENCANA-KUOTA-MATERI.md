# Rencana: kuota harian materi baru

Status: **dikerjakan** di branch `feat/aldi-kuota-materi` dengan pilihan bawaan: Gratis 3 / Pro 20 per hari, cache hit tidak dihitung, simpan maks 50 / 300 materi, fungsi WIB diimpor tanpa mengubah `essay-scans/`, belum wajib verifikasi email.

## Masalah

Batas 3 per hari hanya berlaku untuk foto catatan (scan). Unggah materi (PDF atau teks) belum punya kuota harian, jadi satu akun bisa terus menambah materi baru.

Kondisi sekarang:

| Hal | Nilai | Lokasi |
|---|---|---|
| Rate limit tambah materi | 20 per jam per akun (jadi bisa sampai 480 per hari) | `backend/src/features/materials/materials.routes.ts:61` |
| Ukuran PDF | maks 10 MB | `backend/src/features/materials/materials.schema.ts:5` |
| Panjang teks PDF | maks 100.000 karakter | `backend/src/features/materials/materials.schema.ts:7` |
| Cache rubrik | per SHA-256 isi teks, TTL 30 hari | `materials.service.ts` (`getRubric`), `rubricCache.ts:14` |
| Kuota scan | Gratis 3 per hari, Pro tanpa batas, reset 00.00 WIB | `backend/src/features/essay-scans/quota.policy.ts:23` |

Risiko kalau dibiarkan:

1. **Kuota Gemini habis untuk semua orang.** Setiap materi dengan isi baru memanggil `extractRubric` (Stage 1). Kuota gratis Gemini dipakai bersama seluruh pengguna, jadi satu akun yang spam bisa membuat pengguna lain tidak bisa menambah materi atau scan.
2. **Storage penuh.** PDF disimpan di Supabase Storage (gratis sekitar 1 GB). 480 PDF x 10 MB per hari dari satu akun sudah jauh melewati itu.
3. **Banyak akun.** Daftar dibatasi 100 per jam per IP, jadi kuota per akun tetap perlu, tapi bukan satu-satunya pertahanan.

## Usulan 1: kuota harian materi baru

**Aturan:**

- Gratis: 3 materi baru per hari. Pro: 20 per hari (bukan tanpa batas, karena tiap materi baru tetap memakai Gemini dan storage).
- Yang dihitung hanya materi yang **benar-benar memanggil Gemini** (cache miss). Materi yang rubriknya sudah ada di cache (isi sama persis, misalnya PDF yang dibagikan guru ke satu kelas) tidak memotong kuota, karena tidak memakai Gemini.
- Hari berganti pukul 00.00 WIB, sama seperti scan. Tidak perlu cron.
- Materi yang dibagikan guru ke kelas tidak memotong kuota siswa (siswa tidak mengunggah apa pun).

**Backend:**

1. Migrasi: tambah dua kolom di `users`, meniru kolom scan:
   - `daily_material_count INT NOT NULL DEFAULT 0`
   - `last_material_reset_at TIMESTAMPTZ NULL`
2. Kebijakan: jadikan fungsi murni di `essay-scans/quota.policy.ts` (`startOfWibDay`, `usedToday`, `planConsume`, `planRefund`) bisa dipakai ulang dengan batas berbeda. Pilihan: pindahkan ke `backend/src/common/quota/dailyQuota.ts` dan beri parameter `limit`, lalu `essay-scans` dan `materials` sama-sama memakainya. Batas per paket ditaruh di `materials/materialQuota.policy.ts`.
   - Catatan lintas batas: `essay-scans/` area Adli. Kalau fungsi dipindah, kabari Adli lewat `docs/UNTUK-ADLI.md` dulu. Alternatif tanpa menyentuh area Adli: salin fungsi kecilnya ke `common/quota/` dan biarkan `essay-scans` tetap seperti sekarang.
3. Repository: `lockMaterialQuota(tx, userId)` dengan `SELECT ... FOR UPDATE` di baris `users`, dan `writeMaterialCounters(tx, userId, counters)`. Selalu difilter `id = userId`.
4. Urutan di `MaterialsService.createFromText` dan `createFromPdf`:
   1. Validasi isi (magic bytes, panjang teks) seperti sekarang.
   2. Hitung `contentHash`, cek cache.
   3. **Cache hit:** lanjut tanpa menyentuh kuota.
   4. **Cache miss:** dalam transaksi, kunci baris user, cek sisa kuota. Habis: lempar `429 MATERIAL_QUOTA_EXCEEDED` dengan `resetAt`. Masih ada: tambah hitungan, commit.
   5. Panggil Gemini di luar transaksi (jangan menahan kunci selama panggilan AI).
   6. Gemini gagal (error, output rusak, kuota Gemini habis): kembalikan satu kuota (`planRefund`), sama seperti scan.
5. Respons: tambah `materialQuota: { limit, used, remaining, resetAt }` di `GET /api/v1/materials` (atau endpoint kecil `GET /api/v1/materials/quota`). `limit: null` tidak dipakai karena Pro juga punya batas.
6. Rate limit 20 per jam tetap ada sebagai rem kasar untuk cache hit dan request rusak.

**Kode error baru:** `429 MATERIAL_QUOTA_EXCEEDED`, pesan: "Jatah materi baru hari ini sudah habis. Coba lagi besok mulai pukul 00.00 WIB." Berbeda dari 429 rate limit biasa supaya frontend bisa menampilkan pesan yang tepat.

## Usulan 2: batas penyimpanan per akun

Kuota harian membatasi kecepatan, tapi dalam sebulan akun Gratis tetap bisa mengumpulkan 90 PDF (sampai 900 MB). Usulan:

- Maks 50 materi tersimpan per akun Gratis, 300 untuk Pro. Lewat dari itu: `409 MATERIAL_LIMIT_REACHED`, minta hapus materi lama dulu.
- Butuh tombol hapus materi di halaman Materi kalau belum ada (hapus baris + objek storage, filter `user_id`).
- Alternatif yang lebih tepat tapi lebih rumit: batas total byte (misalnya 200 MB). Perlu kolom `size_bytes` di `materials`.

## Usulan 3: tampilan dan teks

- Halaman Materi: baris kecil di atas form, "Sisa 2 materi baru hari ini", plus keterangan bahwa materi yang sama persis dengan yang sudah pernah diproses tidak dihitung.
- Kuota habis: form dinonaktifkan, pesan ramah dari Risu dengan jam reset, bukan pesan error merah.
- Panduan maskot (`frontend/src/features/onboarding/guideSteps.ts`, langkah "Mulai dari Materi"): tambah "Paket gratis bisa 3 materi baru per hari."
- Halaman Akun (bagian paket): tampilkan kuota materi di samping kuota scan.
- Syarat Layanan (`frontend/src/features/legal/LegalPage.tsx`): sebut batas materi harian dan batas penyimpanan. Ini perubahan isi dokumen, jadi naikkan versi di `policyVersions.ts` hanya kalau isinya mengubah hak atau kewajiban pengguna (batas pemakaian biasanya cukup diumumkan, tidak perlu persetujuan ulang).

## Pengujian

- Unit (`backend/tests/unit/`): kebijakan kuota materi (reset WIB, batas Gratis vs Pro, refund hanya di hari yang sama), service (cache hit tidak memotong, cache miss memotong, Gemini gagal mengembalikan kuota).
- Integrasi (`Supertest`): unggah ke-4 akun Gratis di hari yang sama dapat 429 `MATERIAL_QUOTA_EXCEEDED`; isi yang sama dengan materi sebelumnya tetap diterima; 401 tanpa login.
- Konkurensi: 5 unggah paralel dengan sisa kuota 1 hanya meloloskan 1 (membuktikan `FOR UPDATE` bekerja).
- Negatif: akun A tidak bisa membaca atau mengubah kuota akun B.
- Frontend: tampilan sisa kuota dan pesan kuota habis.

## Urutan rilis

1. PR backend (migrasi + service + test). Merge.
2. Jalankan migrasi di Supabase (oleh Aldi, lewat Session pooler) **sebelum** image baru jalan.
3. Buat revisi Azure dengan image baru.
4. PR frontend (sisa kuota, pesan, panduan, Syarat). Vercel deploy otomatis.
5. Catat di `docs/CHECKPOINT.md` dan kabari Adli di `docs/UNTUK-ADLI.md` soal kode error baru.

## Keputusan yang dibutuhkan

1. Angka kuota: Gratis 3 dan Pro 20 per hari, setuju?
2. Materi cache hit tidak dihitung, setuju? (Kelemahannya: tetap memakai storage. Batas penyimpanan di Usulan 2 menutup ini.)
3. Batas penyimpanan: per jumlah materi (50 / 300) atau per total ukuran (200 MB)?
4. Fungsi kuota: pindahkan ke `common/quota/` (perlu kabari Adli) atau salin tanpa menyentuh `essay-scans/`?
5. Perlu wajib verifikasi email sebelum bisa menambah materi, supaya akun palsu lebih sulit dibuat?
