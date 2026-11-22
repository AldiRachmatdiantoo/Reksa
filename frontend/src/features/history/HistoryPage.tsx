import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/core/apiClient';
import { useAuth } from '@/features/auth/AuthProvider';
import { isEffectivePro } from '@/features/auth/authApi';
import { useLoad } from '@/shared/hooks/useLoad';
import { pageTransition } from '@/shared/motion';
import { AppHeader } from '@/shared/ui/AppHeader';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { LoadingBlock, StateBlock } from '@/shared/ui/StateBlock';
import { CalibrationTrend } from './CalibrationTrend';
import { formatHistoryDate, historyApi, type HistoryItem } from './historyApi';

/** Riwayat hasil cek (FR-05) dan tren kalibrasi untuk Pro (FR-11). */
export function HistoryPage() {
  const auth = useAuth();
  const isPro = auth.status === 'authenticated' && isEffectivePro(auth.user);

  useEffect(() => {
    document.title = 'Riwayat · REKSA';
  }, []);

  return (
    <>
      <AppHeader subtitle="Riwayat" />
      <motion.main {...pageTransition} className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-headline-lg-mobile text-ink sm:text-headline-lg">Riwayat</h1>
          <p className="max-w-prose text-body-lg text-ink-muted text-pretty">
            Semua catatan yang pernah kamu kirim untuk dicek, yang terbaru di atas.
          </p>
        </div>

        <section aria-labelledby="trend-title" className="flex flex-col gap-4 rounded-lg border border-line-soft bg-card p-5 sm:p-6">
          <h2 id="trend-title" className="font-title text-title-lg text-ink">
            Tren tebakan nilai
          </h2>
          {isPro ? <TrendSection /> : <ProNotice />}
        </section>

        <section aria-labelledby="list-title" className="flex flex-col gap-4">
          <h2 id="list-title" className="font-title text-title-lg text-ink">
            Catatan yang dicek
          </h2>
          <HistoryList />
        </section>
      </motion.main>
    </>
  );
}

function TrendSection() {
  const { state, reload } = useLoad((signal) => historyApi.calibration(signal), []);
  if (state.status === 'loading') return <LoadingBlock label="Memuat tren..." />;
  if (state.status === 'error') {
    // Pro kedaluwarsa di antara dua permintaan: server menolak, tampilkan keterangan yang sama.
    if (state.error instanceof ApiError && state.error.status === 403) return <ProNotice />;
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-body-md text-ink-muted">Tren belum bisa dimuat.</p>
        <Button variant="outline" onClick={reload}>
          Coba lagi
        </Button>
      </div>
    );
  }
  return <CalibrationTrend trend={state.data} />;
}

function ProNotice() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-md text-ink-muted text-pretty">
        Grafik selisih antara tebakan nilai dan hasil cek dari sesi ke sesi khusus untuk paket Pro. Nilai dan tebakan tiap catatan tetap
        bisa kamu lihat di daftar di bawah.
      </p>
      <ButtonLink to="/akun" variant="outline" className="self-start">
        Lihat paket Pro
      </ButtonLink>
    </div>
  );
}

function HistoryList() {
  const [extra, setExtra] = useState<HistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const { state, reload } = useLoad((signal) => historyApi.list(null, signal), []);

  if (state.status === 'loading') return <LoadingBlock label="Memuat riwayat..." />;
  if (state.status === 'error') {
    return (
      <StateBlock icon="cloud_off" tone="danger" title="Riwayat belum bisa dimuat" action={<Button onClick={reload}>Coba lagi</Button>}>
        Periksa koneksimu lalu coba lagi.
      </StateBlock>
    );
  }

  const items = [...state.data.items, ...extra];
  const next = cursor === undefined ? state.data.nextCursor : cursor;

  if (items.length === 0) {
    return (
      <StateBlock
        icon="history"
        title="Belum ada catatan yang dicek"
        action={
          <ButtonLink to="/belajar" variant="outline">
            Mulai sesi belajar
          </ButtonLink>
        }
      >
        Setelah kamu mengirim foto catatan, hasilnya tersimpan di sini.
      </StateBlock>
    );
  }

  const loadMore = async () => {
    if (!next) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await historyApi.list(next);
      setExtra((e) => [...e, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <ul className="flex flex-col divide-y divide-line-soft rounded-lg border border-line-soft bg-card">
        {items.map((item) => (
          <li key={item.submissionId}>
            <HistoryRow item={item} />
          </li>
        ))}
      </ul>
      {moreError && (
        <p role="alert" className="text-body-md text-danger">
          Gagal memuat lagi. Coba sekali lagi.
        </p>
      )}
      {next && (
        <Button variant="outline" className="self-center" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? 'Memuat...' : 'Muat lebih banyak'}
        </Button>
      )}
    </>
  );
}

function statusText(item: HistoryItem): { text: string; tone: string } {
  if (item.auditStatus === 'DONE' && item.actualScore !== null) {
    return { text: `Nilai ${item.actualScore}% · tebakan ${item.predictedJolScore}%`, tone: 'text-ink' };
  }
  if (item.auditStatus === 'FAILED') return { text: 'Belum berhasil dicek', tone: 'text-danger' };
  return { text: 'Sedang dicek', tone: 'text-ink-muted' };
}

function HistoryRow({ item }: { item: HistoryItem }) {
  const status = statusText(item);
  return (
    <Link
      to={`/belajar/riwayat/${item.submissionId}`}
      state={{ materialTitle: item.materialTitle, sessionType: item.sessionType }}
      className="flex min-h-11 items-center gap-4 px-5 py-4 transition-colors hover:bg-wash focus-visible:bg-wash"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-title-md text-ink [overflow-wrap:anywhere]">{item.materialTitle ?? 'Materi tidak tersedia'}</span>
        <span className="flex flex-wrap gap-x-2 text-body-sm text-ink-muted">
          <span>{formatHistoryDate(item.createdAt)}</span>
          <span aria-hidden="true">·</span>
          <span>{item.sessionType === 'SPACED_REVIEW' ? 'Latihan ulang' : 'Sesi belajar'}</span>
          {item.auditStatus === 'DONE' && item.blindSpotCount > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{item.blindSpotCount} konsep terlewat</span>
            </>
          )}
        </span>
        <span className={`text-body-md ${status.tone}`}>{status.text}</span>
      </div>
      <Icon name="chevron_right" className="text-ink-muted" />
    </Link>
  );
}
