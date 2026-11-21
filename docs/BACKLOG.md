# Backlog Backend Adli

Tugas Adli menuju MVP (PRD v1.3): `study-sessions`, `essay-scans`, Gemini Stage 2 Vision, dan `backend/tests/unit/`. Tugas Aldi ada di [SISA-ALDI.md](SISA-ALDI.md), backlog UI di [frontend/docs/BACKLOG.md](../frontend/docs/BACKLOG.md).

**Aturan:** setiap habis commit/push, centang `[x]` di sini dan catat di [CHECKPOINT.md](CHECKPOINT.md).

## Selesai

- [x] Variasi data `MockAiProvider` (skor tinggi/sedang/rendah, materi fotosintesis) + simulasi gagal `auditFailureRate` (PR #13, checkpoint #9)
- [x] `study-sessions` FR-01 sampai FR-03: mulai, sesi aktif, detail, JOL, batal; aturan sesi sah FR-02 (PR #13, checkpoint #9)
- [x] `common/utils/imageProcessor.ts`: magic bytes, hapus EXIF/GPS, orientasi, lebar maks. 1600px, WebP, batas piksel (checkpoint #10)
- [x] Kuota scan harian FR-11 (`quota.*`, 00.00 WIB, `FOR UPDATE`, 429 `QUOTA_EXCEEDED`, refund) + `GET /me/quota` (checkpoint #11)
- [x] QR bridge FR-04: `POST /sessions/:id/qr-bridge` + SSE `GET /sessions/:id/qr-bridge/events`, token hash di Redis, sekali pakai (checkpoint #12)
- [x] `POST /scans/upload` (202, login atau QR) + worker audit (retry/timeout, refund, `AUDIT_STALLED`) + `GET /scans/:id` + `POST /scans/:id/retry` (checkpoint #13)
- [x] Saat `DONE`: `ledger_hash`, sesi `COMPLETED`, jadwal H+3/H+7; sesi tidak terkunci setelah audit gagal (checkpoint #13)

## Bisa dikerjakan sekarang

- [ ] Tier efektif dari `users.pro_expires_at` begitu migrasi FR-11 Aldi masuk (sekarang `users.tier`).

## Menunggu review Aldi

- [ ] Review opsi A (migrasi `essay_audit_async`, trigger ledger, `getObject`, worker di `server.ts`) di PR `feat/adli-essay-scans`.
- [ ] Setuju/tidak dengan skor Stage 2 yang dihitung server dari bobot rubrik (lihat `UNTUK-ALDI.md`).

## Perlu disepakati

- [ ] Sesi `SPACED_REVIEW` (FR-06): cara memulai sesi ulang 3 sampai 5 menit dari jadwal Aldi; `POST /sessions` saat ini selalu `INITIAL_BLURTING`.

## Fase 3

- [x] `GeminiAiProvider` Stage 2 (`evaluateHandwritingEssay`) + `geminiClient.ts`: skor dihitung server, pertahanan prompt injection berlapis (checkpoint #14)
- [x] Uji prompt injection: unit dengan model tiruan + test live opt-in `gemini.live.test.ts` (checkpoint #14)
- [ ] Saat Fase 3 dibuka: rangkai `AI_PROVIDER_MODE=gemini` di `ai.factory.ts` (bersama Aldi, Stage 1/3 harus sudah ada), lalu jalankan `RUN_LIVE_AI=1` dan kalibrasi prompt dengan foto tulisan tangan asli (termasuk diagram panah dan *code-switching*).
- [ ] Pastikan paket Gemini yang dipakai tidak melatih model dengan data pengguna (PRD FR-13) sebelum uji live dengan foto asli.

## Frontend (area Aldi, dikerjakan Adli atas persetujuan pengguna)

- [x] Sambungkan Ruang Belajar, Tebak & Foto, Hasil Cek, QR bridge, dan halaman HP `/unggah` ke backend asli (checkpoint #16)
- [x] E2E Playwright + axe-core untuk alur sesi, foto, QR, dan hasil (checkpoint #16)
- [ ] Menunggu Aldi: perbaikan CSP untuk `NumberFlow` dan self-host font teks (lihat `UNTUK-ALDI.md`)
- [ ] E2E masuk CI (butuh job dengan stack Docker penuh; workflow milik Aldi)

## Berjalan terus

- [x] Test loop `AuditWorker` + `RedisAuditQueue`: `audit.queue.ts` 51% → 100% (checkpoint #15)
- [ ] Naikkan branch coverage `study-sessions` (81,6%, gabungan unit + integrasi) ke ≥ 85%.

- [ ] Unit test setiap `*.service.ts` baru, integration test setiap endpoint, uji IDOR; target coverage ≥ 85%.
