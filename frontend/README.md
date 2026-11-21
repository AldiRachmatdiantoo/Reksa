# REKSA Frontend

Aplikasi web REKSA untuk pelajar dan guru: sesi fokus menulis dari ingatan, tebak nilai sendiri (kalibrasi metakognisi), foto catatan, lalu lihat bagian yang masih terlewat beserta jadwal latihan ulang H+3 dan H+7.

Backend: repo [`reksa`](https://github.com/AldiRachmatdiantoo/Reksa) (Express + PostgreSQL + Redis).

## Menjalankan

Butuh Node 22 dan backend `reksa` yang sudah jalan.

```bash
npm install
cp .env.example .env.local   # ubah VITE_API_PROXY_TARGET kalau port backend bukan 3000
npm run dev                  # http://localhost:5173
```

Vite memproksi `/api` ke backend supaya browser dan API berada di satu origin. Ini diperlukan karena cookie auth memakai `SameSite=Strict`.

## Perintah lain

| Perintah | Fungsi |
| --- | --- |
| `npm run typecheck` | Cek tipe TypeScript |
| `npm test` | Unit test (Vitest) |
| `npm run build` | Build produksi ke `dist/` |

## Sumber desain

- Desain awal dibuat di Figma Make; ekspor HTML-nya disimpan di `design-reference/` sebagai referensi, tidak dipakai langsung.
- Token warna dan tipografi (`src/theme.css`) diambil dari ekspor yang sama.
- Animasi memakai library [`motion`](https://motion.dev) (sama dengan komponen [Watermelon UI](https://ui.watermelon.sh)). Dari Watermelon diambil pola indikator tab bergeser (*Discrete Tabs*) dan angka bergulir `@number-flow/react` (*Run Widget*). Primitif animasi lain ada di `src/shared/motion.tsx`.
- Ilustrasi di `public/assets/` disediakan pemilik produk.

Status dan rencana: lihat [`docs/CHECKPOINT.md`](docs/CHECKPOINT.md) dan [`docs/BACKLOG.md`](docs/BACKLOG.md).
