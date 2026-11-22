import { AnimatePresence, MotionConfig } from 'motion/react';
import { cloneElement, lazy, Suspense, type ComponentType, type ReactElement } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useOutlet } from 'react-router-dom';
import { AuthPage } from '@/features/auth/AuthPage';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { LandingPage } from '@/features/landing/LandingPage';
import { NotFoundPage } from '@/features/landing/NotFoundPage';
import { StudySessionProvider } from '@/features/studio/studySession';
import { ScrollToTop } from '@/shared/ScrollToTop';
import { ConsentProvider } from '@/shared/consent';
import { ThemeProvider } from '@/shared/theme';
import { CookieNotice } from '@/shared/ui/CookieNotice';
import { LoadingBlock } from '@/shared/ui/StateBlock';

/**
 * Halaman selain beranda dan masuk/daftar dimuat saat dibuka (satu chunk per halaman), supaya
 * pengunjung pertama tidak mengunduh portal guru, PDF, dan studio sekaligus. Sebelumnya satu bundle 646 kB.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- sama dengan batasan tipe React.lazy sendiri.
type AnyComponent = ComponentType<any>;

function page<M extends Record<K, AnyComponent>, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

const AccountPage = page(() => import('@/features/auth/AccountPage'), 'AccountPage');
const ForgotPasswordPage = page(() => import('@/features/auth/ForgotPasswordPage'), 'ForgotPasswordPage');
const ResetPasswordPage = page(() => import('@/features/auth/ResetPasswordPage'), 'ResetPasswordPage');
const VerifyEmailPage = page(() => import('@/features/auth/VerifyEmailPage'), 'VerifyEmailPage');
const ConfirmEmailChangePage = page(() => import('@/features/auth/ConfirmEmailChangePage'), 'ConfirmEmailChangePage');
const ResultPage = page(() => import('@/features/audit-result/ResultPage'), 'ResultPage');
const TeacherPage = page(() => import('@/features/governance/TeacherPage'), 'TeacherPage');
const VerifyLedgerPage = page(() => import('@/features/governance/VerifyLedgerPage'), 'VerifyLedgerPage');
const MaterialsPage = page(() => import('@/features/materials/MaterialsPage'), 'MaterialsPage');
const StudentClassesPage = page(() => import('@/features/classes/StudentClassesPage'), 'StudentClassesPage');
const LegalPage = page(() => import('@/features/legal/LegalPage'), 'LegalPage');
const CalibratePage = page(() => import('@/features/scanner/CalibratePage'), 'CalibratePage');
const PhoneUploadPage = page(() => import('@/features/scanner/PhoneUploadPage'), 'PhoneUploadPage');
const ReviewPage = page(() => import('@/features/spaced-repetition/ReviewPage'), 'ReviewPage');
const HistoryPage = page(() => import('@/features/history/HistoryPage'), 'HistoryPage');
const HistoryDetailPage = page(() => import('@/features/history/HistoryDetailPage'), 'HistoryDetailPage');
const StudioPage = page(() => import('@/features/studio/StudioPage'), 'StudioPage');

const pageFallback = <LoadingBlock label="Memuat halaman..." />;

/**
 * Halaman di dalam /belajar diberi key per path supaya animasi masuk motion.main jalan
 * lagi, tapi provider sesi tetap hidup (foto hanya ada di memori). Sengaja tanpa
 * AnimatePresence bersarang: di build produksi AnimatePresence mode="wait" di dalam
 * AnimatePresence tingkat atas tidak pernah memasang halaman baru, layarnya kosong.
 */
function KeyedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  return outlet ? cloneElement(outlet as ReactElement, { key: location.pathname }) : null;
}

/** Kunci transisi tingkat atas: /masuk dan /daftar satu kunci supaya tab-nya bergeser, bukan halaman diganti. */
function routeKey(pathname: string) {
  const top = pathname.split('/')[1] ?? '';
  return top === 'masuk' || top === 'daftar' ? 'auth' : top;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      {/* Suspense jadi anak langsung AnimatePresence (kuncinya di sini) supaya animasi keluar tetap jalan. */}
      <Suspense key={routeKey(location.pathname)} fallback={pageFallback}>
        <Routes location={location}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/masuk" element={<AuthPage mode="masuk" />} />
          <Route path="/daftar" element={<AuthPage mode="daftar" />} />
          <Route path="/lupa-password" element={<ForgotPasswordPage />} />
          <Route path="/atur-ulang-password" element={<ResetPasswordPage />} />
          <Route path="/verifikasi-email" element={<VerifyEmailPage />} />
          <Route path="/konfirmasi-email" element={<ConfirmEmailChangePage />} />
          <Route path="/privasi" element={<LegalPage doc="privasi" />} />
          <Route path="/syarat" element={<LegalPage doc="syarat" />} />
          {/* Verifikasi publik ledger_hash (FR-07); tautan di PDF bukti belajar (FR-12). */}
          <Route path="/cek-bukti" element={<VerifyLedgerPage />} />
          <Route path="/cek-bukti/:hash" element={<VerifyLedgerPage />} />
          {/* Halaman HP dari QR bridge: tanpa login, token QR di fragment URL (FR-04 skenario B). */}
          <Route path="/unggah" element={<PhoneUploadPage />} />
          <Route
            path="/akun"
            element={
              <RequireAuth roles={['STUDENT', 'EDUCATOR', 'INSTITUTION_ADMIN']}>
                <AccountPage />
              </RequireAuth>
            }
          />
          <Route path="/belajar" element={<StudentArea />}>
            <Route index element={<StudioPage />} />
            <Route path="materi" element={<MaterialsPage />} />
            <Route path="kelas" element={<StudentClassesPage />} />
            <Route path="ulang" element={<ReviewPage />} />
            <Route path="foto" element={<CalibratePage />} />
            <Route path="hasil" element={<ResultPage />} />
            <Route path="riwayat" element={<HistoryPage />} />
            <Route path="riwayat/:submissionId" element={<HistoryDetailPage />} />
          </Route>
          <Route
            path="/guru"
            element={
              <RequireAuth roles={['EDUCATOR', 'INSTITUTION_ADMIN']}>
                <TeacherPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
}

function StudentArea() {
  return (
    <RequireAuth roles={['STUDENT']}>
      <StudySessionProvider>
        {/* Batas sendiri di dalam provider: memuat halaman /belajar berikutnya tidak menyembunyikan sesi yang berjalan. */}
        <Suspense fallback={pageFallback}>
          <KeyedOutlet />
        </Suspense>
      </StudySessionProvider>
    </RequireAuth>
  );
}

export default function App() {
  return (
    // reducedMotion="user": semua animasi motion berhenti jika OS meminta prefers-reduced-motion.
    <MotionConfig reducedMotion="user">
      <ConsentProvider>
        <ThemeProvider>
          <AuthProvider>
            <BrowserRouter>
              <ScrollToTop />
              <AnimatedRoutes />
              <CookieNotice />
            </BrowserRouter>
          </AuthProvider>
        </ThemeProvider>
      </ConsentProvider>
    </MotionConfig>
  );
}
