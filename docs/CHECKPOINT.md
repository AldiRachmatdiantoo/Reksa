# Checkpoint Frontend REKSA

## #1 · 2026-11-21 · Aplikasi pertama dari ekspor Figma Make

Branch: `feat/aldi-frontend-app`

### Sumber

- Repo: https://github.com/AldiRachmatdiantoo/reksa-frontend
- Desain: ekspor Figma Make (commit `42caaec`), dipindah dari `src/design/` ke `design-reference/`. Folder `.figma/` dan `pnpm-lock.yaml` dihapus; proyek kini memakai npm.
- Token tema: `src/theme.css` dari ekspor Figma, dipetakan ke warna semantik di `src/index.css` (terang + gelap).
- Animasi: Watermelon UI. Dari katalognya diambil pola *Discrete Tabs* (indikator `layoutId`, spring stiffness 210 / damping 18) untuk `SegmentedTabs`, dan `@number-flow/react` (dipakai *Run Widget*) untuk timer, persen tebakan, dan skor hasil.
- Ilustrasi `public/assets/*.jpg`: dari pemilik produk.

### Yang sudah jalan

| Halaman | Rute | Status |
| --- | --- | --- |
| Beranda | `/` | Statis. Tab Pelajar/Guru, bagian cara kerja dan cara menilai |
| Masuk / Daftar | `/masuk`, `/daftar` | Tersambung ke backend asli (`/auth/register`, `/auth/login`, `/auth/me`, `DELETE /auth/refresh`) |
| Ruang belajar | `/belajar` | Timer fokus (25/45/15 menit), materi dikunci saat fokus, bertahan saat reload |
| Tebak & foto | `/belajar/foto` | Slider tebakan nilai, kamera belakang di HP, pilih file, validasi tipe & 5 MB |
| Hasil cek | `/belajar/hasil` | Kalibrasi tebakan vs nilai, bagian terlewat, koreksi, jadwal H+3/H+7, dibacakan (Web Speech) |
| Portal guru | `/guru` | Keadaan kosong jujur, belum ada data kelas |

- Guard rute per peran: STUDENT ke `/belajar`, EDUCATOR/INSTITUTION_ADMIN ke `/guru`.
- `apiClient`: cookie saja, refresh single-flight, sesi kedaluwarsa memicu logout lokal. 7 unit test lulus.
- Tema terang/gelap dengan toggle, mengikuti sistem kalau belum dipilih.
- `prefers-reduced-motion` dihormati lewat `MotionConfig reducedMotion="user"`.

### Masih data contoh (diberi label di UI)

- Materi: sama dengan `MOCK_RUBRIC` di backend (homeostasis).
- Hasil cek: sama dengan `MOCK_ESSAY_AUDIT` di backend (nilai 62). Foto belum diunggah; hanya disimpan sebagai object URL di memori.
- Jadwal H+3/H+7 hanya dihitung di browser, belum tersimpan.

### Diverifikasi

Klik manual di browser terhadap backend lokal: daftar pelajar & guru, salah sandi, login kembali ke halaman asal, cookie tidak terbaca JS (`document.cookie` kosong), tidak ada token di storage, alur timer sampai hasil, keyboard pada tab dan slider, tema gelap, layar 375px tanpa scroll horizontal. `npm run typecheck`, `npm test`, `npm run build` lulus (JS 144 KB gzip).

### Keputusan

- Dari desain Figma dibuang: klaim "Teruji Secara Ilmiah", chip berkilau di atas judul, kuota "3/hari" (PRD hanya menulis "misal"), banner cookie (hanya cookie esensial), chip "Hemat kuota".
- Halaman Figma pasca-MVP (teman belajar suara, latihan campur topik, mode offline, QR bridge) belum dibuat; lihat backlog.
- Logout pindah ke `/` dulu baru memanggil API, supaya guard tidak melempar ke `/masuk`.
