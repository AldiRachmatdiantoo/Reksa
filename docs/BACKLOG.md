# Backlog Frontend REKSA

Urutan kasar sesuai ketergantungan ke backend. Tandai `✅` saat selesai dan catat di `CHECKPOINT.md`.

## Menunggu endpoint backend

- [x] ✅ **Unggah materi** (`materials`): form PDF/teks, pratinjau rubrik, ganti `SAMPLE_MATERIAL` (checkpoint #4).
- [ ] **Sesi belajar** (`POST /sessions`): simpan durasi fokus dan tebakan nilai ke server, validasi waktu di server.
- [ ] **Unggah foto** (`/scans/upload`): kirim foto, tampilkan sisa kuota harian, tangani 413/415/429.
- [ ] **Hasil cek asli**: ganti `SAMPLE_AUDIT` dengan hasil scan, tambah keadaan "sedang dicek".
- [ ] **QR bridge laptop ke HP**: halaman QR + SSE, desain ada di `design-reference/qr_bridge_*`.
- [ ] **Jadwal ulang** (`spaced-repetition`): daftar sesi jatuh tempo, ganti tanggal H+3/H+7 lokal.
- [x] **Kelola kelas** (FR-09): portal guru dan halaman kelas siswa.
- [ ] **Portal guru** (`governance`): peta blind spot kelas, bukti pemahaman (ledger + signed URL).

## Bisa dikerjakan sekarang

- [ ] `vercel.json`: rewrite `/api/*` ke Render (satu origin untuk cookie `SameSite=Strict`), header keamanan (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`).
- [ ] E2E Playwright + `@axe-core/playwright` di `tests/e2e/` untuk alur daftar, sesi, hasil.
- [ ] CI GitHub Actions: typecheck, test, build.
- [ ] Logo final (saat ini tanda sementara dari desain Figma).

## Pasca-MVP (ditunda)

- [ ] Teman belajar suara (Feynman), `design-reference/teman_belajar_suara_feynman*`
- [ ] Latihan campur topik (interleaving), `design-reference/latihan_campur_topik_*`
- [ ] Mode tanpa internet (PWA), `design-reference/mode_tanpa_internet_*`
