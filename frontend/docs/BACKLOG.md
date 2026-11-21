# Backlog Frontend REKSA

Urutan kasar sesuai ketergantungan ke backend. Tandai `✅` saat selesai dan catat di `CHECKPOINT.md`.

## Menunggu endpoint backend

- [x] ✅ **Unggah materi** (`materials`): form PDF/teks, pratinjau rubrik, ganti `SAMPLE_MATERIAL` (checkpoint #4).
- [ ] **Sesi belajar** (`POST /sessions`): simpan durasi fokus dan tebakan nilai ke server, validasi waktu di server. ✅ Endpoint backend siap (PR #13), kontraknya di `docs/UNTUK-ALDI.md` repo induk; tinggal disambungkan.
- [ ] **Unggah foto** (`/scans/upload`): kirim foto, tampilkan sisa kuota harian, tangani 413/415/422/429. Input foto wajib `accept="image/jpeg,image/png,image/webp"` (HEIC tidak diterima server). ✅ Endpoint backend siap (`POST /scans/upload` 202, `GET /me/quota`); kontrak lengkap di `docs/UNTUK-ALDI.md` repo induk.
- [ ] **Hasil cek asli**: ganti `SAMPLE_AUDIT` dengan hasil scan, tambah keadaan "sedang dicek". ✅ Backend siap: poll `GET /scans/:id` tiap 2 detik (maks. 90 detik), `result.jolDelta`, `POST /scans/:id/retry` saat `FAILED`.
- [ ] **QR bridge laptop ke HP**: halaman QR + SSE, desain ada di `design-reference/qr_bridge_*`. ✅ Token + SSE backend siap (`POST /sessions/:id/qr-bridge`, `GET /sessions/:id/qr-bridge/events`, alur di `docs/UNTUK-ALDI.md`); unggah dari HP lewat `POST /scans/upload` dengan `qrToken` sudah siap.
- [ ] **Jadwal ulang** (`spaced-repetition`): daftar sesi jatuh tempo, ganti tanggal H+3/H+7 lokal.
- [x] **Kelola kelas** (FR-09): portal guru dan halaman kelas siswa.
- [x] **Akun dasar** (FR-14): verifikasi email, lupa dan atur ulang kata sandi, halaman Akun (checkpoint #8).
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
