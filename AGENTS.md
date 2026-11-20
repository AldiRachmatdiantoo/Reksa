# reksa-frontend

Frontend REKSA: aplikasi web belajar aktif (fokus, tulis ulang dari ingatan, tebak nilai, cek catatan). Pemilik: Aldi. Backend ada di repo terpisah `reksa` (Express + Prisma); kontrak API-nya dirangkum di `reksa/PRD.md` §8.3.

Sebelum kerja: baca `docs/CHECKPOINT.md` (posisi terakhir) dan `docs/BACKLOG.md` (yang belum dikerjakan).

## Stack

- Vite 8, React 19, TypeScript, Tailwind CSS 4 (`@theme inline` di `src/index.css`, token dari `src/theme.css`)
- react-router-dom 7, motion 12, `@number-flow/react` (angka timer dan skor)
- Vitest + happy-dom untuk unit test di `tests/unit/`
- Ikon: Material Symbols Outlined (font Google), bukan Lucide

## Perintah

- `npm run dev`: dev server di `http://localhost:5173`, `/api` diproksi ke `VITE_API_PROXY_TARGET` (lihat `.env.example`)
- `npm run typecheck`, `npm test`, `npm run build` (menghasilkan `dist/`)
- Install pakai `npm`. Kalau npm 10 gagal dengan error arborist `edgesOut`, pakai `npx -y npm@11 install`.

## Struktur

- `src/core/apiClient.ts`: satu-satunya pintu ke backend. Cookie `HttpOnly` (`credentials: 'include'`), refresh token single-flight saat 401, tanpa refresh untuk `/auth/login`, `/auth/register`, `/auth/refresh`.
- `src/shared/`: UI dasar (`ui/`), hook (`hooks/`), tema terang/gelap (`theme.tsx`).
- `src/features/<fitur>/`: `auth`, `landing`, `studio` (sesi fokus), `scanner` (tebak nilai + foto), `audit-result` (hasil cek), `governance` (portal guru).
- `design-reference/`: ekspor HTML dari Figma Make. Referensi visual saja, tidak di-import.
- `public/assets/`: dua ilustrasi dari pemilik produk.

## Aturan wajib

- Token tidak boleh disimpan di `localStorage`/`sessionStorage`. Semua auth lewat cookie dari backend. `sessionStorage` hanya untuk state sesi belajar (tanpa data rahasia).
- Jangan tambahkan atribusi AI di commit atau PR.
- Branch `feat/aldi-*` atau `fix/aldi-*`, lewat pull request, tidak commit ke `main`.
- Data contoh (materi, hasil cek) wajib diberi label "contoh" di UI sampai endpoint aslinya ada. Jangan tampilkan angka, testimoni, atau klaim yang tidak nyata.
- Bahasa UI: Bahasa Indonesia, nada santai untuk pelajar SMA/mahasiswa. Hindari em dash di teks UI.
- Warna: teal untuk struktur, ember (oranye) satu aksen per layar. Radius pill hanya di tombol. Blur hanya di header lengket.
- Setiap komponen interaktif harus jalan dengan keyboard dan punya target sentuh minimal 44px.
