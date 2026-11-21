# Catatan untuk Aldi

Dari: Adli
Terakhir diperbarui: 21 November 2026

File ini adalah jalur Adli → Aldi, pasangan dari [`UNTUK-ADLI.md`](UNTUK-ADLI.md). Tulis di sini apa pun yang butuh tindakan atau perlu diketahui Aldi, lalu kirim lewat PR. Sesi Claude milik Aldi membaca file ini setiap kali mulai.

**Cara pakai**
- Tambahkan entri baru **di paling atas** bagiannya, lengkap dengan tanggal.
- Jangan hapus entri lama; tandai statusnya saja: `⏳ menunggu`, `🔧 dikerjakan`, `✅ selesai`.
- Aldi yang mengubah status menjadi `✅` setelah permintaan beres.

---

## Permintaan

Hal yang butuh perubahan di area Aldi (migrasi database, `nginx.conf`, Docker, `config/`, kontrak di fitur Aldi, dan sebagainya).

<!--
Contoh format:

### ⏳ 2026-11-25 — Kolom `concealed_at` di `study_sessions`
**Butuh untuk:** fitur mode penyembunyian materi (FR-02)
**Detail:** TIMESTAMPTZ nullable, diisi saat timer mulai.
**Mendesak?** Ya, memblokir integration test sessions.
-->

### ⏳ 2026-11-21 — Usulan: satukan `reksa-frontend` ke `frontend/` (monorepo)
**Butuh untuk:** satu tempat untuk menjalankan, menguji, dan me-review frontend + backend; kontrak API dan UI berubah dalam satu PR.
**Yang sudah saya lakukan** di branch `feat/adli-frontend-monorepo` (belum di-merge, menyentuh area kamu, jadi butuh persetujuanmu):
- *Subtree merge* `reksa-frontend` `main` (`b6e1792`, 15 commit, riwayat tetap utuh) ke `frontend/`. Tidak ada file yang bentrok: `frontend/Dockerfile`, `nginx.conf`, `.dockerignore` milikmu tidak berubah.
- Dicek lokal: `npm ci` + `npm run build` + 22 test frontend lulus, `npm audit --audit-level=high` 0, Semgrep (aturan CI) 0 temuan, `docker build frontend` jalan sebagai non-root.
- `CLAUDE.md` §1 dan `frontend/AGENTS.md` diberi catatan monorepo.
**Yang perlu kamu putuskan / lakukan kalau setuju:**
- Semua branch `reksa-frontend` (`feat/aldi-account`, `-classes`, `-frontend-app`, `-landing-story`, `-materials`) sudah ada di `main` repo itu, jadi tidak ada pekerjaan yang tertinggal. Commit baru di repo lama sebelum PR ini di-merge bisa ditarik dengan `git subtree pull --prefix=frontend https://github.com/AldiRachmatdiantoo/reksa-frontend main`, lalu repo lama diarsipkan.
- Vercel: *Root Directory* proyek diganti ke `frontend` (rencana `vercel.json` ikut pindah ke `frontend/`).
- Kalau tidak setuju, PR cukup ditutup; tidak ada yang berubah di repo mana pun.
**Mendesak?** Tidak. Kerja `study-sessions` ada di PR terpisah (`feat/adli-sessions`).

## Kabar & progres

Hal yang perlu Aldi ketahui tapi tidak butuh tindakan (fitur selesai, perubahan kontrak di area Adli, keputusan desain).

_Belum ada kabar._

## Pertanyaan

_Belum ada pertanyaan._
