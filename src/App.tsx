import { AnimatePresence, MotionConfig } from 'motion/react';
import { cloneElement, type ReactElement } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useOutlet } from 'react-router-dom';
import { AuthPage } from '@/features/auth/AuthPage';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { ResultPage } from '@/features/audit-result/ResultPage';
import { TeacherPage } from '@/features/governance/TeacherPage';
import { MaterialsPage } from '@/features/materials/MaterialsPage';
import { LandingPage } from '@/features/landing/LandingPage';
import { NotFoundPage } from '@/features/landing/NotFoundPage';
import { CalibratePage } from '@/features/scanner/CalibratePage';
import { StudioPage } from '@/features/studio/StudioPage';
import { StudySessionProvider } from '@/features/studio/studySession';
import { ScrollToTop } from '@/shared/ScrollToTop';
import { ConsentProvider } from '@/shared/consent';
import { ThemeProvider } from '@/shared/theme';
import { CookieNotice } from '@/shared/ui/CookieNotice';

/**
 * Halaman di dalam /belajar berganti dengan animasi keluar-masuk, tapi provider sesi
 * tetap hidup (foto hanya ada di memori, jadi provider tidak boleh ikut dibongkar).
 */
function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  return (
    <AnimatePresence mode="wait" initial={false}>
      {outlet && cloneElement(outlet as ReactElement, { key: location.pathname })}
    </AnimatePresence>
  );
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
        <Route path="/belajar" element={<StudentArea />}>
          <Route index element={<StudioPage />} />
          <Route path="materi" element={<MaterialsPage />} />
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
        <AnimatedOutlet />
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
