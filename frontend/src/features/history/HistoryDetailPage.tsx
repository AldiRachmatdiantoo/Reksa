import { motion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { ApiError } from '@/core/apiClient';
import { AuditResult, useScanPolling } from '@/features/audit-result/ResultPage';
import { auditFailureText } from '@/features/scanner/scansApi';
import { pageTransition } from '@/shared/motion';
import { AppHeader } from '@/shared/ui/AppHeader';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { LoadingBlock, StateBlock } from '@/shared/ui/StateBlock';

/** Membuka satu hasil cek lama dari Riwayat. Server hanya menjawab foto milik sendiri. */
export function HistoryDetailPage() {
  const { submissionId = '' } = useParams();
  const location = useLocation();
  const materialTitle = (location.state as { materialTitle?: string | null } | null)?.materialTitle ?? '';
  const { scan, error, slow, restart } = useScanPolling(submissionId);

  useEffect(() => {
    document.title = 'Hasil cek lama · REKSA';
  }, []);

  const shell = (content: ReactNode) => (
    <>
      <AppHeader subtitle="Riwayat" />
      <motion.main {...pageTransition} className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        {content}
      </motion.main>
    </>
  );

  const back = (
    <ButtonLink to="/belajar/riwayat" variant="outline">
      <Icon name="arrow_back" />
      Kembali ke riwayat
    </ButtonLink>
  );

  if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
    return shell(
      <StateBlock icon="search_off" title="Hasil cek ini tidak ditemukan" action={back}>
        Mungkin tautannya salah atau kamu masuk dengan akun lain.
      </StateBlock>,
    );
  }

  if (scan?.auditStatus === 'FAILED') {
    return shell(
      <StateBlock icon="report" tone="danger" title="Catatan ini belum berhasil dicek" action={back}>
        {auditFailureText(scan.errorCode)}
      </StateBlock>,
    );
  }

  if (scan?.auditStatus === 'DONE' && scan.result) {
    return <AuditResult scan={scan} materialTitle={materialTitle ?? ''} from="history" />;
  }

  if (!scan && !error) return shell(<LoadingBlock label="Memuat hasil cek..." />);

  return shell(
    <StateBlock
      icon={slow ? 'hourglass_top' : 'fact_check'}
      title={slow ? 'Pengecekan lebih lama dari biasanya' : 'Catatan ini sedang dicek'}
      action={
        slow ? (
          <Button variant="outline" onClick={restart}>
            <Icon name="refresh" />
            Periksa lagi
          </Button>
        ) : (
          back
        )
      }
    >
      <span aria-live="polite">{error ? 'Koneksi sempat terputus. REKSA terus mencoba.' : 'Hasilnya muncul di sini begitu selesai.'}</span>
    </StateBlock>,
  );
}
