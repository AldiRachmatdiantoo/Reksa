# Checkpoint Frontend REKSA

## #3 · 2026-11-21 · Pop up cookie dan dialog konfirmasi

Branch: `feat/aldi-frontend-app`

- **Pop up "Cookie & privasi"** (dari desain Figma beranda, `src/shared/ui/CookieNotice.tsx`): muncul sekali di halaman mana pun sampai user memilih. Tidak modal. Tombol Hanya penting / Terima semua / Atur pilihan, plus tombol tutup (= hanya penting). Bisa dibuka lagi dari tautan "Pengaturan cookie" di footer beranda.
  - Pilihannya nyata: switch "Ingat pilihan tema" mengatur apakah tema disimpan di `localStorage` (`reksa-theme`). Hanya penting = tema tidak disimpan dan yang lama dihapus. Default mati.
  - Catatan persetujuan di `localStorage` `reksa-consent` (`src/shared/consent.tsx`).
  - Ini membatalkan keputusan #1 yang membuang banner cookie: sekarang ada pilihan yang benar-benar berpengaruh, jadi banner tidak kosong.
- **Dialog konfirmasi** (`src/shared/ui/ConfirmDialog.tsx`, `<dialog>` + `showModal()`): fokus terkunci, Esc menutup, fokus awal di tombol batal. Dipakai sebelum aksi yang menghapus progres: "Ulangi dan buka bacaan" saat fokus, "Mulai sesi baru" di ruang belajar, dan "Mulai sesi belajar baru" di hasil cek.
- Animasi `motion`: pop up naik dengan spring, ikon berputar masuk, rincian membuka, knob switch meluncur; dialog dengan latar gelap memudar dan panel spring.

Diverifikasi di browser: pop up muncul saat persetujuan kosong, Atur pilihan → switch → Simpan menyimpan `preferences: true` dan tema, dibuka lagi dari footer → Hanya penting menghapus `reksa-theme`, dialog modal + fokus di tombol batal + Esc tidak menghapus waktu + konfirmasi me-reset timer. Typecheck, 7 test, build lulus (JS 151 KB gzip).

## #2 · 2026-11-21 · Animasi dengan `motion`

Branch: `feat/aldi-frontend-app`

Watermelon UI tidak punya komponen reveal/stagger yang pas (dicari lewat katalog: hasilnya mikro-interaksi seperti Contextual AI Bar, Reveal Copy). Jadi primitif dibangun sendiri di atas `motion`, library yang sama dengan Watermelon, di `src/shared/motion.tsx`:

| Primitif | Dipakai di |
| --- | --- |
| `pageTransition` + `AnimatePresence` | Semua halaman. `/masuk` dan `/daftar` satu kunci (tab bergeser, bukan ganti halaman). Di `/belajar` hanya isi yang berganti, provider sesi tetap hidup supaya foto di memori tidak hilang |
| `WordReveal` | Judul beranda, kata demi kata (pembaca layar mendapat kalimat utuh) |
| `Reveal`, `Stagger`/`StaggerItem` | Bagian beranda saat discroll, langkah pelajar/guru (juga saat ganti tab), konsep materi, kartu tebak & foto, daftar hasil cek, jadwal, portal guru |
| `FillBar` | Batang tebakan vs nilai asli di hasil cek |
| Lainnya | Clip reveal + parallax foto hero, indikator preset waktu `layoutId`, progress bar sisa waktu, centang langkah dan garis penghubung, konfirmasi tebakan, field daftar yang membuka/menutup, skor bergulir dari 0 |

Satu kurva untuk semua gerak masuk (`EASE_OUT` = `[0.22, 1, 0.36, 1]`). Semua mati bila OS meminta `prefers-reduced-motion`. Dial MOTION naik dari 2 ke 3. Bundle JS 149 KB gzip (+5 KB).

Diverifikasi di browser dengan mengukur gaya elemen saat animasi berjalan: judul dan clip hero, stagger saat scroll dan ganti tab, indikator preset, progress bar, batang hasil 50%/62%, foto tetap ada setelah pindah halaman, form daftar membuka. Typecheck, 7 test, build lulus.

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
