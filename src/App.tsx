import { MotionConfig } from 'motion/react';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import { AuthPage } from '@/features/auth/AuthPage';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { ResultPage } from '@/features/audit-result/ResultPage';
import { TeacherPage } from '@/features/governance/TeacherPage';
import { LandingPage } from '@/features/landing/LandingPage';
import { NotFoundPage } from '@/features/landing/NotFoundPage';
import { CalibratePage } from '@/features/scanner/CalibratePage';
import { StudioPage } from '@/features/studio/StudioPage';
import { StudySessionProvider } from '@/features/studio/studySession';
import { ScrollToTop } from '@/shared/ScrollToTop';
import { ThemeProvider } from '@/shared/theme';

function StudentArea() {
  return (
    <RequireAuth roles={['STUDENT']}>
      <StudySessionProvider>
        <Outlet />
      </StudySessionProvider>
    </RequireAuth>
  );
}

export default function App() {
  return (
    // reducedMotion="user": semua animasi motion berhenti jika OS meminta prefers-reduced-motion.
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/masuk" element={<AuthPage mode="masuk" />} />
              <Route path="/daftar" element={<AuthPage mode="daftar" />} />
              <Route path="/belajar" element={<StudentArea />}>
                <Route index element={<StudioPage />} />
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
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
