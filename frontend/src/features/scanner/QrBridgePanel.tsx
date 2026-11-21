import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { sessionErrorMessage, sessionsApi } from '@/features/studio/sessionsApi';
import { useNow } from '@/shared/hooks/useNow';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';

type Props = {
  sessionId: string;
  /** Dipanggil saat HP selesai mengunggah foto (event SSE `uploaded`). */
  onUploaded: (submissionId: string) => void;
};

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; qrDataUrl: string; link: string; expiresAt: number }
  | { kind: 'expired' }
  | { kind: 'error'; message: string };

/** Tautan halaman unggah di HP. Token di fragment (#), jadi tidak terkirim ke server mana pun dan tidak masuk log. */
export function uploadLinkFor(origin: string, qrToken: string): string {
  return `${origin}/unggah#${qrToken}`;
}

/**
 * Laptop/desktop (PRD FR-04 skenario B): tampilkan QR, lalu tunggu foto dari HP lewat SSE.
 * Token berlaku 5 menit dan sekali pakai; meminta kode baru membatalkan kode lama.
 */
export function QrBridgePanel({ sessionId, onUploaded }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;
  const now = useNow(state.kind === 'ready', 1000);

  useEffect(() => {
    let cancelled = false;
    let events: EventSource | null = null;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const { qrToken, expiresInSec } = await sessionsApi.issueQr(sessionId);
        const link = uploadLinkFor(window.location.origin, qrToken);
        const qrDataUrl = await QRCode.toDataURL(link, { margin: 1, width: 240, errorCorrectionLevel: 'M' });
        if (cancelled) return;
        setState({ kind: 'ready', qrDataUrl, link, expiresAt: Date.now() + expiresInSec * 1000 });

        events = new EventSource(sessionsApi.qrEventsUrl(sessionId), { withCredentials: true });
        events.addEventListener('uploaded', (e) => {
          const { submissionId } = JSON.parse((e as MessageEvent<string>).data) as { submissionId: string };
          events?.close();
          onUploadedRef.current(submissionId);
        });
        events.addEventListener('timeout', () => {
          events?.close();
          if (!cancelled) setState({ kind: 'expired' });
        });
        // Koneksi putus: EventSource menyambung ulang sendiri (server mengirim `retry`). Kalau server
        // menolak (mis. 404/429), statusnya CLOSED dan kita tampilkan pesan.
        events.onerror = () => {
          if (events?.readyState === EventSource.CLOSED && !cancelled) {
            setState({ kind: 'error', message: 'Sambungan ke laptop terputus. Minta kode baru.' });
          }
        };
      } catch (err) {
        if (!cancelled) setState({ kind: 'error', message: sessionErrorMessage(err) });
      }
    })();

    return () => {
      cancelled = true;
      events?.close();
    };
  }, [sessionId, attempt]);

  const secondsLeft = state.kind === 'ready' ? Math.max(0, Math.ceil((state.expiresAt - now) / 1000)) : 0;
  const expiredByClock = state.kind === 'ready' && secondsLeft === 0;

  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-line-soft bg-wash p-5 text-center" aria-live="polite">
      {state.kind === 'loading' && <p className="text-body-md text-ink-muted">Menyiapkan kode QR...</p>}

      {state.kind === 'ready' && !expiredByClock && (
        <>
          <img src={state.qrDataUrl} width={240} height={240} alt="Kode QR untuk membuka halaman unggah foto di HP" className="rounded-sm bg-white p-2" />
          <ol className="flex max-w-xs list-decimal flex-col gap-1 pl-5 text-left text-body-md text-ink">
            <li>Buka kamera HP dan arahkan ke kode ini.</li>
            <li>Ketuk tautan yang muncul, lalu foto catatanmu.</li>
            <li>Halaman ini lanjut sendiri begitu foto masuk.</li>
          </ol>
          <p className="font-mono text-mono-md text-ink-muted tabular-nums">
            Berlaku {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} lagi
          </p>
        </>
      )}

      {(state.kind === 'expired' || expiredByClock) && (
        <>
          <Icon name="qr_code_2" className="text-[40px] text-ink-muted" />
          <p className="text-body-md text-ink">Kode QR sudah habis waktunya.</p>
        </>
      )}

      {state.kind === 'error' && (
        <p role="alert" className="flex items-start gap-2 text-body-md text-on-danger-wash">
          <Icon name="error" className="mt-px text-[20px]" />
          {state.message}
        </p>
      )}

      {(state.kind === 'expired' || state.kind === 'error' || expiredByClock) && (
        <Button variant="outline" onClick={() => setAttempt((a) => a + 1)}>
          <Icon name="refresh" />
          Buat kode baru
        </Button>
      )}
    </div>
  );
}
