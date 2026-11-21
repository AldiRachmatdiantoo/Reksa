# Checkpoint Frontend REKSA

## #12 · 2026-11-22 · Latihan ulang (FR-06)

Branch: `feat/aldi-spaced-review`.

- Halaman `/belajar/ulang` (`features/spaced-repetition/ReviewPage.tsx`) dan menu **Ulang** di header pelajar.
- Kartu jatuh tempo: buka latihan, tulis di kertas, lihat penjelasan, tandai selesai. Daftar "Berikutnya" untuk jadwal yang belum jatuh tempo.
- Teks "Pengingat otomatis menyusul" di Hasil Cek dan tur beranda diganti tautan ke menu Ulang.
- Unit test `spacedApi.test.ts`, E2E `review.spec.ts`.

## #11 · 2026-11-22 · Privasi (FR-13) dan kode aktivasi Pro (FR-11)

Branch: `feat/aldi-privacy-pro`.

- **Daftar:** `ConsentFields` (tahun lahir, izin wali jika mungkin di bawah 18, persetujuan dokumen). Validasi klien di `features/auth/consent.ts` sama dengan backend.
- **Halaman publik** `/privasi` dan `/syarat` (`features/legal/LegalPage.tsx`), versi di `policyVersions.ts`. Tautan di footer beranda.
- **`ConsentGate`:** dipasang di `RequireAuth`; muncul jika `user.consentRequired`.
- **Akun:** `AccountDataSections.tsx` berisi Paket + kode aktivasi, Unduh data saya, Hapus akun. Varian tombol baru `danger`.
- **E2E baru** `tests/e2e/account-privacy.spec.ts` (halaman dokumen, daftar sebagai pelajar di bawah 18, unduh data, batas sekali sehari, hapus akun). Helper `registerStudent` mengirim `birthYear` dan `acceptTerms`.

Diverifikasi: typecheck, 33 unit, E2E 6/6 di stack Docker, axe lulus di semua halaman baru.

## #10 · 2026-11-21 · Perbaikan build produksi di balik nginx

Branch: `fix/aldi-docker-build-bugs`.

- **Navigasi `/belajar`:** pindah menu (Belajar, Materi, Kelas) tidak lagi membuat layar kosong di build produksi. `AnimatedOutlet` diganti `KeyedOutlet` (outlet ber-key, tanpa `AnimatePresence` bersarang). Animasi masuk tetap dari `motion.main` tiap halaman.
- **CSP:** hash `<style>` NumberFlow ditambahkan di `nginx.conf`; timer dan skor tampil normal. Hash ini berubah kalau NumberFlow di-upgrade.
- **Font:** Plus Jakarta Sans, Radio Canada Big, Spline Sans Mono di-self-host (`@fontsource`, diimpor di `main.tsx`), `<link>` Google dihapus dari `index.html`. `vite.config.ts` tidak menjadikan font `data:` URI.
- **`.gitattributes` LFS dihapus** (aturan bawaan ekspor, tidak pernah dipakai).
- **E2E baru** `tests/e2e/navigation.spec.ts`; CI menjalankan unit test dan E2E (job `e2e`).
- **Kontras beranda (desktop):** bab "Cara kerja" yang belum aktif dipudarkan ke 35% sehingga teksnya 1,7:1 (gagal WCAG AA). Sekarang bab aktif ditandai warna label saja, teks tetap penuh. Diaudit axe di setiap posisi gulir.
- **Hasil Cek tanpa sesi:** penanda langkah disembunyikan; sebelumnya langkah 1 dan 2 tampil centang padahal belum dikerjakan.
- **Sapu semua halaman** (desktop dan HP, anonim, pelajar, guru) di stack Docker: tidak ada pelanggaran CSP, error JavaScript, atau halaman melebar; font termuat; axe lulus. Job CI `e2e` disimulasikan dari stack kosong dengan `.env` acak: 4/4 lulus.

Diverifikasi: E2E 4/4 lulus di stack Docker (termasuk stack bersih seperti CI), typecheck, 33 unit test, build.

## #9 · 2026-11-21 · Alur belajar tersambung ke backend asli + E2E (dikerjakan Adli)

Branch: `feat/adli-frontend-scans` (repo Reksa, monorepo). Area frontend milik Aldi; dikerjakan Adli atas persetujuan pengguna, rinciannya di `../../docs/UNTUK-ALDI.md`.

- **Sesi belajar dari server** (`studio/sessionsApi.ts`, `studySession.tsx`): `POST /sessions` (preset 15/25/45 → `FOCUS_SPRINT_15_3`/`CLASSIC_25_5`/`DEEP_45_10`), timer dari `startedAt` server, "Ulangi" dan "Mulai sesi baru" membatalkan sesi di server, sesi aktif dipulihkan dari `GET /sessions/active` (tab/perangkat lain), 409 `ACTIVE_SESSION_EXISTS` → dialog "Lanjutkan sesi itu" / "Batalkan sesi itu, mulai baru", sesi kedaluwarsa ditampilkan. sessionStorage tetap hanya cache tampilan (tanpa token, tanpa foto).
- **Tebak & Foto** (`CalibratePage.tsx`): JOL disimpan lewat `PATCH /sessions/:id/jol` (catatan "fokus singkat" bila `SHORT_FOCUS`), sisa kuota dari `GET /me/quota`, foto dikirim ke `POST /scans/upload`, HEIC dikeluarkan dari pilihan (`accept="image/jpeg,image/png,image/webp"`). Di laptop ada **"Pakai kamera HP"** (`QrBridgePanel.tsx`): QR (`qrcode`, data URL), SSE `uploaded`/`timeout`, hitung mundur 5 menit, kode baru.
- **Halaman HP `/unggah`** (`PhoneUploadPage.tsx`, rute publik): token dibaca dari fragment `#` lalu dihapus dari address bar, kamera/galeri, pesan jelas untuk token habis/terpakai.
- **Hasil Cek** (`ResultPage.tsx`): `SAMPLE_AUDIT` dan label "Hasil contoh" diganti hasil asli `GET /scans/:id` (poll 2 detik sampai 90 detik, keadaan "sedang dicek", "lebih lama dari biasanya"), keadaan gagal + "Cek ulang (sisa n)" / "Tinggalkan sesi ini", selisih JOL dari server, foto dari signed URL, jadwal H+3/H+7 hanya bila ada blind spot. `sampleAudit.ts` tinggal dipakai untuk tipe.
- `apiClient`: `ApiError.details` (mis. `activeSessionId`, `quota`).
- **Ikon Material Symbols di-self-host** (`@fontsource-variable/material-symbols-outlined`, varian `fill` 1,1 MB) karena CSP nginx `font-src 'self'` memblokir Google Fonts sehingga di Docker ikon tampil sebagai kata (`dark_mode`, `arrow_back`); axe juga menggagalkannya (WCAG 2.5.3). Di `npm run dev` tidak terlihat karena tanpa CSP.
- **E2E** `tests/e2e/` (Playwright 1.59 + `@axe-core/playwright` 4.14, cara jalan di `tests/e2e/README.md`): golden path, QR bridge dua perangkat, pulihkan sesi; audit WCAG 2.1 A/AA di setiap halaman yang dilewati.

Diverifikasi: 3 E2E lulus terhadap stack Docker lewat nginx `:8080`, screenshot halaman QR dan hasil dicek manual, typecheck, 33 unit test, build, `npm audit` 0.

**Masih rusak di stack nginx (area Aldi, diperbaiki di checkpoint #10):** angka `NumberFlow` tampil sebagai deretan `0123456789...` dan melebarkan halaman (CSP `style-src 'self'` memblokir style inline), dan font teks (Plus Jakarta Sans, Radio Canada Big, Spline Sans Mono) tidak termuat dari Google Fonts. Usulan perbaikan di `UNTUK-ALDI.md`.

## #8 · 2026-11-21 · Akun dasar (FR-14)

Branch: `feat/aldi-account` (backend: branch `feat/aldi-account` di repo Reksa)

- **Halaman publik** dengan kerangka bersama `AuthCardLayout`: `/verifikasi-email` (otomatis memeriksa token, lalu terverifikasi, tautan tidak bisa dipakai, atau server tidak terhubung), `/lupa-password` (pesan netral setelah kirim), `/atur-ulang-password` (kata sandi baru + ketik ulang, setelah berhasil sesi di tab ini dikeluarkan).
- Token dari tautan email dibaca sekali lalu dihapus dari address bar (`tokenFromUrl.ts`), supaya tidak tertinggal di riwayat browser. Verifikasi dijaga `useRef` agar StrictMode tidak mengirim token sekali pakai dua kali.
- **`/akun`** (semua peran): email dengan status verifikasi, ubah nama, ganti kata sandi (perangkat ini tetap masuk, perangkat lain dikeluarkan). Dibuka dari nama di header (desktop) atau ikon akun (HP).
- `VerifyEmailNotice`: pemberitahuan + tombol "Kirim tautan baru" untuk akun yang belum verifikasi, tampil di `/akun` dan di form gabung kelas. Hilang begitu terverifikasi.
- `AuthProvider.updateUser` untuk memperbarui user tanpa memuat ulang. `AuthUser.emailVerified` ditambahkan. Aturan kata sandi dipindah ke `PasswordRules.tsx` dan dipakai di daftar, reset, dan ganti kata sandi.
- Tautan "Lupa kata sandi?" di halaman masuk. `joinErrorMessage` menampilkan pesan backend untuk 403 `EMAIL_NOT_VERIFIED`.

Diverifikasi di browser bersama Mailpit: kirim ulang tautan, buka tautan (token hilang dari URL), tautan yang sama ditolak saat dipakai ulang, ubah nama, kata sandi lama salah, lupa kata sandi sampai masuk dengan kata sandi baru, ganti kata sandi lalu muat ulang tetap masuk, siswa baru ditolak gabung kelas lalu bisa setelah verifikasi. HP dan desktop 1280px. Typecheck, 22 test, build lulus.

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
