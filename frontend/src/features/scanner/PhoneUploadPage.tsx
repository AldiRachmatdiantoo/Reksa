import { motion } from 'motion/react';
import { ApiError } from '@/core/apiClient';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { pageTransition } from '@/shared/motion';
import { Brand } from '@/shared/ui/Brand';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { StateBlock } from '@/shared/ui/StateBlock';
import { photoProblem, SCAN_ACCEPT, scansApi, uploadErrorMessage } from './scansApi';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
/** Kode error yang tidak tertolong dengan memilih foto lain. */
const FINAL_CODES = new Set(['QR_TOKEN_INVALID', 'SESSION_EXPIRED', 'INVALID_SESSION_STATE', 'QUOTA_EXCEEDED']);

/** Membaca token dari fragment sekali, lalu menghapusnya dari address bar dan riwayat browser. */
function takeTokenFromHash(): string | null {
  const token = window.location.hash.slice(1);
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  return TOKEN_RE.test(token) ? token : null;
}

type Phase = { kind: 'pick' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string; final: boolean };

/**
 * Halaman HP dari QR bridge (PRD FR-04 skenario B): tanpa login, satu tombol kamera.
 * Token QR adalah bukti dari laptop yang sudah login; sekali pakai dan berlaku 5 menit.
 */
export function PhoneUploadPage() {
  const [token] = useState(takeTokenFromHash);
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'Kirim Foto Catatan · REKSA';
  }, []);

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !token) return;
    const problem = photoProblem(file);
    if (problem) {
      setPhase({ kind: 'error', message: problem, final: false });
      return;
    }
    setPhase({ kind: 'sending' });
    try {
      await scansApi.upload(file, { qrToken: token });
      setPhase({ kind: 'sent' });
    } catch (err) {
      const final = err instanceof ApiError && FINAL_CODES.has(err.code);
      setPhase({ kind: 'error', message: uploadErrorMessage(err), final });
    }
  };

  return (
    <motion.main {...pageTransition} className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      <Brand />
      {!token ? (
        <StateBlock icon="qr_code_2" title="Kode QR tidak terbaca">
          Pindai ulang kode QR di layar laptopmu. Tautan ini hanya bisa dibuka dari kode QR.
        </StateBlock>
      ) : phase.kind === 'sent' ? (
        <StateBlock icon="task_alt" title="Foto terkirim">
          Lihat layar laptopmu: hasil cek catatan muncul di sana. Halaman ini boleh ditutup.
        </StateBlock>
      ) : (
        <section aria-labelledby="phone-title" className="flex flex-col gap-4 rounded-lg border border-line-soft bg-card p-5">
          <h1 id="phone-title" className="font-headline text-headline-lg-mobile text-ink">
            Foto catatan kertasmu
          </h1>
          <p className="text-body-md text-ink-muted text-pretty">
            Pastikan seluruh tulisan dan panahmu terlihat jelas dalam satu foto. Lokasi dan info kamera dihapus sebelum foto disimpan.
          </p>

          <input ref={cameraRef} type="file" accept={SCAN_ACCEPT.join(',')} capture="environment" className="sr-only" tabIndex={-1} onChange={onPick} aria-hidden="true" />
          <input ref={galleryRef} type="file" accept={SCAN_ACCEPT.join(',')} className="sr-only" tabIndex={-1} onChange={onPick} aria-hidden="true" />

          {phase.kind === 'error' && (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
              <Icon name="error" className="mt-px text-[20px]" />
              {phase.message}
            </p>
          )}

          {!(phase.kind === 'error' && phase.final) && (
            <div className="flex flex-col gap-2">
              <Button variant="accent" size="lg" disabled={phase.kind === 'sending'} onClick={() => cameraRef.current?.click()}>
                <Icon name="photo_camera" />
                {phase.kind === 'sending' ? 'Mengirim foto...' : 'Buka kamera'}
              </Button>
              <Button variant="outline" size="lg" disabled={phase.kind === 'sending'} onClick={() => galleryRef.current?.click()}>
                <Icon name="image" />
                Pilih dari galeri
              </Button>
            </div>
          )}
        </section>
      )}
    </motion.main>
  );
}
