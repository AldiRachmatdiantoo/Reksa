import { AnimatePresence, MotionConfig } from 'motion/react';
import { cloneElement, type ReactElement } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useOutlet } from 'react-router-dom';
import { AccountPage } from '@/features/auth/AccountPage';
import { AuthPage } from '@/features/auth/AuthPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { VerifyEmailPage } from '@/features/auth/VerifyEmailPage';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { ResultPage } from '@/features/audit-result/ResultPage';
import { TeacherPage } from '@/features/governance/TeacherPage';
import { VerifyLedgerPage } from '@/features/governance/VerifyLedgerPage';
import { MaterialsPage } from '@/features/materials/MaterialsPage';
import { StudentClassesPage } from '@/features/classes/StudentClassesPage';
import { LegalPage } from '@/features/legal/LegalPage';
import { LandingPage } from '@/features/landing/LandingPage';
import { NotFoundPage } from '@/features/landing/NotFoundPage';
import { CalibratePage } from '@/features/scanner/CalibratePage';
import { ReviewPage } from '@/features/spaced-repetition/ReviewPage';
import { StudioPage } from '@/features/studio/StudioPage';
import { PhoneUploadPage } from '@/features/scanner/PhoneUploadPage';
import { StudySessionProvider } from '@/features/studio/studySession';
import { ScrollToTop } from '@/shared/ScrollToTop';
import { ConsentProvider } from '@/shared/consent';
import { ThemeProvider } from '@/shared/theme';
import { CookieNotice } from '@/shared/ui/CookieNotice';

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
      <Routes location={location} key={routeKey(location.pathname)}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/masuk" element={<AuthPage mode="masuk" />} />
        <Route path="/daftar" element={<AuthPage mode="daftar" />} />
        <Route path="/lupa-password" element={<ForgotPasswordPage />} />
        <Route path="/atur-ulang-password" element={<ResetPasswordPage />} />
        <Route path="/verifikasi-email" element={<VerifyEmailPage />} />
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
    </AnimatePresence>
  );
}

function StudentArea() {
  return (
    <RequireAuth roles={['STUDENT']}>
      <StudySessionProvider>
        <KeyedOutlet />
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
