import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { authApi, type AuthUser } from '@/features/auth/authApi';
import { useConsent } from '@/shared/consent';
import { Mascot } from '@/shared/mascot/Mascot';
import { Button } from '@/shared/ui/Button';
import { guideFor } from './guideSteps';

type GuideContextValue = { openGuide: () => void };

const GuideContext = createContext<GuideContextValue | null>(null);

/** Halaman setelah login tempat panduan boleh muncul sendiri. */
const GUIDE_PATHS = ['/belajar', '/guru', '/akun'];

/**
 * Panduan sambutan maskot. Muncul sendiri sekali setelah login pertama (onboardingRequired dari server), bisa
 * dibuka lagi dari halaman Akun. Selesai atau dilewati sama-sama dicatat di server, jadi tidak muncul lagi di
 * perangkat lain. Menunggu pop up cookie ditutup dan persetujuan syarat selesai, supaya tidak bertumpuk.
 */
export function GuideProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { noticeOpen } = useConsent();
  const { pathname } = useLocation();
  const [manual, setManual] = useState(false);
  // Ditutup di tab ini. Kalau request ke server gagal, panduan baru muncul lagi di login berikutnya.
  const [dismissed, setDismissed] = useState(false);
  const [ready, setReady] = useState(false);

  const user = auth.status === 'authenticated' ? auth.user : null;
  const auto =
    user != null &&
    user.onboardingRequired &&
    !user.consentRequired &&
    !dismissed &&
    !noticeOpen &&
    GUIDE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Jeda singkat supaya halaman tujuan sempat tampil dulu, baru maskot menyapa.
  useEffect(() => {
    if (!auto) {
      setReady(false);
      return;
    }
    const t = window.setTimeout(() => setReady(true), 700);
    return () => window.clearTimeout(t);
  }, [auto]);

  const openGuide = useCallback(() => setManual(true), []);
  const value = useMemo(() => ({ openGuide }), [openGuide]);

  const { updateUser } = auth;
  const close = useCallback(() => {
    setManual(false);
    setDismissed(true);
    if (user?.onboardingRequired) {
      authApi
        .completeOnboarding()
        .then(updateUser)
        .catch(() => undefined);
    }
  }, [user?.onboardingRequired, updateUser]);

  const open = user != null && (manual || (auto && ready));

  return (
    <GuideContext.Provider value={value}>
      {children}
      <AnimatePresence>{open && user && <GuideDialog key="guide" user={user} onClose={close} />}</AnimatePresence>
    </GuideContext.Provider>
  );
}

export function useGuide() {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error('useGuide harus di dalam GuideProvider');
  return ctx;
}

function GuideDialog({ user, onClose }: { user: AuthUser; onClose: () => void }) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const guide = useMemo(() => guideFor(user.role, user.fullName), [user.role, user.fullName]);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const step = guide.steps[index]!;
  const last = index === guide.steps.length - 1;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // Esc sama dengan "Lewati": biarkan React menutup supaya animasi keluar tetap jalan.
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [onClose]);

  const go = (delta: number) => {
    setDirection(delta);
    setIndex((i) => Math.min(Math.max(i + delta, 0), guide.steps.length - 1));
  };

  const finish = () => {
    onClose();
    if (guide.finish.to) navigate(guide.finish.to);
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="fixed inset-0 m-0 grid h-dvh max-h-none w-full max-w-none place-items-center bg-transparent p-4 backdrop:bg-transparent"
    >
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-black/45 dark:bg-black/65"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        className="relative flex max-h-full w-full max-w-lg flex-col overflow-x-hidden overflow-y-auto rounded-xl border border-line bg-card shadow-lg"
        initial={{ opacity: 0, y: 32, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 26 } }}
        exit={{ opacity: 0, y: 16, scale: 0.97, transition: { duration: 0.16, ease: 'easeIn' } }}
      >
        <div className="relative flex h-36 shrink-0 items-end justify-center overflow-hidden bg-teal-wash pt-4 sm:h-48">
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={index}
              custom={direction}
              variants={{
                enter: (d: number) => ({ x: d * 120, opacity: 0, rotate: d * 8 }),
                center: { x: 0, opacity: 1, rotate: 0 },
                exit: (d: number) => ({ x: d * -120, opacity: 0, rotate: d * -8 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className="h-full"
            >
              <Mascot name={step.mascot} mood={step.mood} className="h-full w-auto" />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex flex-col gap-5 p-6">
          <div className="flex flex-col gap-2" aria-live="polite">
            <p className="text-label-md text-ink-muted">
              Langkah {index + 1} dari {guide.steps.length}
            </p>
            <h2 id={titleId} className="font-headline text-headline-md text-ink text-balance">
              {step.title}
            </h2>
            <p id={bodyId} className="text-body-md text-ink-muted text-pretty">
              {step.text}
            </p>
          </div>

          <div aria-hidden="true" className="flex gap-1.5">
            {guide.steps.map((_, i) => (
              <motion.span
                key={i}
                className={`h-1.5 rounded-full ${i === index ? 'bg-teal' : i < index ? 'bg-teal/40' : 'bg-line'}`}
                animate={{ width: i === index ? 24 : 8 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            ))}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            {last ? (
              <Button variant="ghost" onClick={onClose}>
                Nanti dulu
              </Button>
            ) : (
              <Button variant="ghost" onClick={onClose}>
                Lewati panduan
              </Button>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {index > 0 && (
                <Button variant="outline" onClick={() => go(-1)}>
                  Kembali
                </Button>
              )}
              {last ? (
                <Button variant="accent" onClick={finish} autoFocus>
                  {guide.finish.label}
                </Button>
              ) : (
                <Button variant="primary" onClick={() => go(1)} autoFocus>
                  Lanjut
                </Button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </dialog>
  );
}
