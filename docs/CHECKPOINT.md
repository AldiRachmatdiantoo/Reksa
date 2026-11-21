# Checkpoint Frontend REKSA

## #7 · 2026-11-21 · Kelola kelas (FR-09)

Branch: `feat/aldi-classes` (backend: branch `feat/aldi-classes` di repo Reksa)

- **Portal guru** (`/guru`, `src/features/classes/TeacherClasses.tsx`): buat kelas, daftar kelas di kiri dan detail di kanan. Detail berisi kode kelas besar (dibaca "ABCD EFGH") dengan tombol Salin dan Kode baru (dengan konfirmasi), daftar siswa dengan tombol Keluarkan, materi kelas dengan form "Bagikan materi" (memakai `UploadMaterialForm` + `classId`), dan Hapus kelas yang hanya aktif saat kelas kosong. Admin institusi melihat catatan bahwa portalnya menyusul.
- **Kelas siswa** (`/belajar/kelas`, `StudentClassesPage.tsx`): gabung lewat kode (huruf kecil, spasi, dan tanda hubung diterima), pesan error dari `joinErrorMessage` (404 sama untuk kode salah apa pun, 429 setelah 10 percobaan per jam), daftar kelas yang diikuti, keluar kelas dengan konfirmasi. Menu pelajar jadi tiga: Belajar, Materi, Kelas.
- **Materi kelas** di `/belajar/materi`: diberi label "Dari kelas ...", tanpa tombol hapus (`isOwner: false`), tetap bisa dipakai untuk sesi belajar.
- `useLoad` dipindah ke `src/shared/hooks/useLoad.ts` supaya dipakai materi dan kelas.
- Sapaan portal guru memakai nama lengkap (kata pertama sering "Pak" atau "Bu").

Diverifikasi di browser: guru membuat kelas, membagikan materi, siswa gabung (kode salah lalu kode benar huruf kecil), materi muncul di Materi dan bisa dipakai belajar, guru mengeluarkan siswa, membuat kode baru, menghapus kelas. HP 412px tanpa scroll horizontal, desktop 1280px. Typecheck, 17 test, build lulus.

## #6 · 2026-11-21 · Beranda jadi tur gulir "Kenalan dengan REKSA"

Branch: `feat/aldi-landing-story`

- **Tur gulir** (`src/features/landing/StoryTour.tsx`), 7 bab: masalah baca ulang, siapkan materi, tulis dari ingatan, tebak nilai, foto catatan, hasil cek, latihan ulang hari ke-3 dan ke-7. Tiap bab punya contoh tampilan kecil berlabel "Contoh tampilan" yang angkanya sama dengan data contoh aplikasi (rubrik homeostasis, nilai 62, konsep terlewat dari `sampleAudit.ts`).
- Desktop: teks di kiri, contoh tampilan di kanan menempel dan berganti mengikuti bab yang ada di tengah layar, plus penanda kemajuan 1 sampai 7. HP: contoh tampilan muncul di bawah teks tiap bab.
- Section "Cara kerja" (tab pelajar/guru) dan "Cara menilai" diganti tur ini; isi penilaian (coretan dihitung, bacakan hasil, kamera HP atau laptop) masuk ke bab 4 dan 5. Bagian guru kini section sendiri (`#guru`) dengan catatan jujur bahwa portalnya masih dikembangkan.
- Menu atas: Cara kerja, Untuk guru, Tanya jawab. Tombol hero "Kenalan dulu" menggulir ke tur.
- Naskah ditulis hanya dari fitur yang sudah ada; pengingat otomatis jadwal ulang disebut "menyusul".

Diverifikasi di browser: desktop 1280px (panel berganti di bab 3 dan 6, penanda kemajuan ikut), HP 375px tanpa scroll horizontal. Typecheck, 13 test, build lulus.

## #5 · 2026-11-21 · Audit kemudahan pakai, dibandingkan dengan ruangguru.com

Branch: `feat/aldi-materials`

Pembanding: beranda ruangguru.com (dibuka 21 Nov 2026). Yang diambil hanya pola kemudahan pakainya, bukan merek, warna, logo, atau isi: menu utama selalu terlihat, bahasa santai dan langsung, serta bagian "Paling sering ditanyakan". Pola yang sengaja tidak diambil karena tidak cocok untuk REKSA atau tidak jujur untuk produk yang belum rilis: banner promo, pop up pilih jenjang saat pertama buka, katalog paket berharga, testimoni dan profil pengajar.

Perbaikan:
- **Menu pelajar di header** (`AppHeader`): "Belajar" dan "Materi saya" dengan penanda halaman aktif. Di layar di bawah 768px menu pindah ke baris sendiri di bawah header (target ketuk 44px). Sebelumnya halaman materi hanya bisa dicapai lewat tombol di dalam halaman.
- **Beranda**: alur pelajar jadi 4 langkah, diawali "Siapkan materimu" sesuai alur aplikasi yang sebenarnya. Bagian baru "Yang sering ditanyakan" (5 pertanyaan, hanya yang jawabannya sudah benar untuk versi ini), ditaut dari header dan footer.
- Halaman materi: tombol kembali dibuang karena sudah ada menu header.

Diverifikasi di browser: desktop 1280px dan HP 375px, menu aktif benar di /belajar dan /belajar/materi, tidak ada scroll horizontal, tanya jawab bisa dibuka. Typecheck, 13 test, build lulus.

## #4 · 2026-11-21 · Materi belajar dari backend `materials`

Branch: `feat/aldi-materials` (backend: `Reksa` branch `feat/aldi-materials`)

- **Halaman `/belajar/materi`** (`src/features/materials/`): tab Tempel teks / Unggah PDF (pilih atau tarik file, cek PDF dan 10 MB di browser), penghitung karakter 15.000, tombol "Susun konsep kunci" dengan status memuat. Hasilnya pratinjau konsep kunci (bobot 1 sampai 5) dan hubungan sebab-akibat, plus keterangan kalau rubrik diambil dari simpanan.
- **Daftar materi tersimpan**: Pakai materi ini, Buka PDF (signed URL, tab dibuka sebelum request supaya tidak diblokir), Hapus dengan dialog konfirmasi (409 dijelaskan: sudah dipakai sesi). Materi yang sedang dipakai diberi tanda.
- **Ruang belajar memakai materi asli**: tanpa sesi tampil pemilih materi (atau keadaan kosong yang mengarah ke halaman materi), tombol "Ganti materi", dan pesan khusus kalau materi sesi sudah dihapus. Tebak & Foto dan Hasil Cek menampilkan judul materi dari sesi. `sampleMaterial.ts` dihapus; sesi lama yang menyimpan materi contoh dibuang otomatis.
- `apiClient` mendukung body `FormData` (Content-Type diisi browser). Pesan error unggah per status di `uploadErrorMessage` (ditest).

Diverifikasi di browser terhadap backend lokal: unggah teks dan PDF, rubrik tampil, unggah ulang teks yang sama mengembalikan `rubricCached: true`, signed URL mengembalikan file `%PDF-`, hapus lewat dialog, pilih materi lalu timer sampai Tebak & Foto dengan judul yang benar, materi dihapus di tengah sesi menampilkan pesan "Materi ini sudah dihapus", layar sempit tanpa scroll horizontal. Typecheck, 13 test, build lulus.

Catatan: backend masih `AI_PROVIDER_MODE=mock`, jadi isi rubrik selalu contoh homeostasis apa pun materinya. Hasil cek tetap data contoh berlabel.

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

- ~~Materi~~: sejak #4 memakai `/materials` asli.
- Hasil cek: sama dengan `MOCK_ESSAY_AUDIT` di backend (nilai 62). Foto belum diunggah; hanya disimpan sebagai object URL di memori.
- Jadwal H+3/H+7 hanya dihitung di browser, belum tersimpan.

### Diverifikasi

Klik manual di browser terhadap backend lokal: daftar pelajar & guru, salah sandi, login kembali ke halaman asal, cookie tidak terbaca JS (`document.cookie` kosong), tidak ada token di storage, alur timer sampai hasil, keyboard pada tab dan slider, tema gelap, layar 375px tanpa scroll horizontal. `npm run typecheck`, `npm test`, `npm run build` lulus (JS 144 KB gzip).

### Keputusan

- Dari desain Figma dibuang: klaim "Teruji Secara Ilmiah", chip berkilau di atas judul, kuota "3/hari" (PRD hanya menulis "misal"), banner cookie (hanya cookie esensial), chip "Hemat kuota".
- Halaman Figma pasca-MVP (teman belajar suara, latihan campur topik, mode offline, QR bridge) belum dibuat; lihat backlog.
- Logout pindah ke `/` dulu baru memanggil API, supaya guard tidak melempar ke `/masuk`.
