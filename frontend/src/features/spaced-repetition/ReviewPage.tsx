import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/core/apiClient';
import { useLoad } from '@/shared/hooks/useLoad';
import { pageTransition, Stagger, StaggerItem } from '@/shared/motion';
import { AppHeader } from '@/shared/ui/AppHeader';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { LoadingBlock, StateBlock } from '@/shared/ui/StateBlock';
import { useStudySession } from '@/features/studio/studySession';
import { formatReviewDay, IMPORTANCE_LABEL, overdueLabel, spacedApi, startReviewErrorMessage, type ScheduleItem } from './spacedApi';

/** Latihan ulang H+3/H+7 untuk konsep yang terlewat (FR-06). */
export function ReviewPage() {
  const { state, reload } = useLoad((signal) => spacedApi.due(signal), []);

  useEffect(() => {
    document.title = 'Latihan ulang · REKSA';
  }, []);

  return (
    <>
      <AppHeader subtitle="Latihan ulang" />
      <motion.main {...pageTransition} className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-headline-lg-mobile text-ink sm:text-headline-lg">Latihan ulang</h1>
          <p className="max-w-prose text-body-lg text-ink-muted text-pretty">
            Konsep yang terlewat saat dicek muncul lagi di sini 3 dan 7 hari kemudian. Tulis ulang dari ingatan selama 5 menit, lalu foto
            catatanmu untuk dicek. Latihan ulang tidak memotong jatah cek harian.
          </p>
        </div>

        {state.status === 'loading' && <LoadingBlock label="Memuat jadwal latihan..." />}
        {state.status === 'error' && (
          <StateBlock icon="cloud_off" tone="danger" title="Jadwal belum bisa dimuat" action={<Button onClick={reload}>Coba lagi</Button>}>
            Periksa koneksimu lalu coba lagi.
          </StateBlock>
        )}
        {state.status === 'ready' && <ReviewLists due={state.data.due} upcoming={state.data.upcoming} onChanged={reload} />}
      </motion.main>
    </>
  );
}

function ReviewLists({ due, upcoming, onChanged }: { due: ScheduleItem[]; upcoming: ScheduleItem[]; onChanged: () => void }) {
  if (due.length === 0 && upcoming.length === 0) {
    return (
      <StateBlock
        icon="event_available"
        title="Belum ada latihan ulang"
        action={
          <ButtonLink to="/belajar" variant="outline">
            Mulai sesi belajar
          </ButtonLink>
        }
      >
        Jadwal dibuat otomatis setelah catatanmu dicek dan ada konsep yang terlewat.
      </StateBlock>
    );
  }

  return (
    <>
      <section aria-labelledby="due-title" className="flex flex-col gap-4">
        <h2 id="due-title" className="font-title text-title-lg text-ink">
          Jatuh tempo {due.length > 0 && <span className="text-ink-muted">({due.length})</span>}
        </h2>
        {due.length === 0 ? (
          <p className="rounded-lg border border-line-soft bg-card px-5 py-4 text-body-md text-ink-muted">
            Tidak ada yang jatuh tempo hari ini. Latihan berikutnya ada di bawah.
          </p>
        ) : (
          <Stagger as="ul" className="flex flex-col gap-4">
            {due.map((item) => (
              <StaggerItem as="li" key={item.id}>
                <DueCard item={item} onCompleted={onChanged} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>

      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming-title" className="flex flex-col gap-3">
          <h2 id="upcoming-title" className="font-title text-title-lg text-ink">
            Berikutnya
          </h2>
          <ul className="flex flex-col divide-y divide-line-soft rounded-lg border border-line-soft bg-card">
            {upcoming.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <span className="font-mono text-mono-md text-teal tabular-nums">H+{item.intervalDay}</span>
                <span className="min-w-0 flex-1 text-body-md text-ink [overflow-wrap:anywhere]">
                  {item.materialTitle ?? 'Materi tidak tersedia'}
                </span>
                <span className="text-body-sm text-ink-muted">{formatReviewDay(item.nextReviewAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function DueCard({ item, onCompleted }: { item: ScheduleItem; onCompleted: () => void }) {
  const navigate = useNavigate();
  const { beginReview } = useStudySession();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const panelId = `review-${item.id}`;

  const complete = async () => {
    setSaving(true);
    setError('');
    try {
      await spacedApi.complete(item.id);
      onCompleted();
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiError && err.status === 404) onCompleted();
      else setError('Gagal menyimpan. Coba lagi.');
    }
  };

  const startGraded = async () => {
    setStarting(true);
    setStartError('');
    try {
      const session = await spacedApi.start(item.id);
      beginReview(
        session,
        item.blindSpots.map((b) => b.concept),
      );
      navigate('/belajar');
    } catch (err) {
      setStarting(false);
      setStartError(startReviewErrorMessage(err));
    }
  };

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-line-soft bg-card p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-title-md text-ink [overflow-wrap:anywhere]">{item.materialTitle ?? 'Materi tidak tersedia'}</h3>
          <p className="text-body-sm text-ink-muted">
            <span className="font-mono text-teal tabular-nums">H+{item.intervalDay}</span> · jatuh tempo {overdueLabel(item.nextReviewAt)}
          </p>
        </div>
      </header>

      <ul className="flex flex-wrap gap-2" aria-label="Konsep yang dilatih">
        {item.blindSpots.map((spot, i) => (
          <li key={i} className="rounded-md bg-wash px-3 py-1.5 text-body-md text-ink">
            {spot.concept}
          </li>
        ))}
      </ul>

      {startError && (
        <p role="alert" className="rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
          {startError}
        </p>
      )}

      {!open && (
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" disabled={starting} onClick={() => void startGraded()}>
            <Icon name="play_arrow" fill />
            {starting ? 'Menyiapkan...' : 'Mulai latihan 5 menit'}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(true)} aria-expanded={open} aria-controls={panelId}>
            Cocokkan sendiri tanpa foto
          </Button>
        </div>
      )}

      {open && (
        <div id={panelId} className="flex flex-col gap-4">
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-body-md text-ink marker:text-ink-muted">
            <li>Tutup catatan dan materimu.</li>
            <li>Di kertas, tulis apa yang kamu ingat tentang konsep di bawah. Pakai kata-katamu sendiri.</li>
            <li>Setelah selesai, buka penjelasannya dan cocokkan sendiri.</li>
          </ol>
          <ul className="flex flex-col gap-2">
            {item.blindSpots.map((spot, i) => (
              <li key={i} className="flex flex-col gap-1 rounded-md bg-wash px-4 py-3">
                <span className="flex flex-wrap items-center gap-2 text-body-lg text-ink">
                  {spot.concept}
                  {spot.importanceLevel && IMPORTANCE_LABEL[spot.importanceLevel] && (
                    <span className="text-body-sm text-ink-muted">· {IMPORTANCE_LABEL[spot.importanceLevel]}</span>
                  )}
                </span>
                {revealed && spot.explanation && <span className="text-body-md text-ink-muted">{spot.explanation}</span>}
              </li>
            ))}
          </ul>
          <p className="text-body-sm text-ink-muted">Cara ini tidak dicek AI dan tidak masuk riwayat.</p>
          {error && (
            <p role="alert" className="rounded-md bg-danger-wash px-4 py-3 text-body-md text-on-danger-wash">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {!revealed ? (
              <Button variant="outline" onClick={() => setRevealed(true)}>
                <Icon name="visibility" />
                Sudah menulis, lihat penjelasan
              </Button>
            ) : (
              <Button variant="primary" onClick={() => void complete()} disabled={saving}>
                <Icon name="task_alt" />
                {saving ? 'Menyimpan...' : 'Tandai selesai'}
              </Button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
