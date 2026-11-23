import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { authApi, type AuthUser } from '@/features/auth/authApi';
import { useConsent } from '@/shared/consent';
import { Mascot, MASCOT_LABEL } from '@/shared/mascot/Mascot';
import { Button, buttonClass } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { guideFor } from './guideSteps';
import { Spotlight } from './Spotlight';
import { useTypewriter } from './useTypewriter';

type GuideContextValue = { openGuide: () => void };

const GuideContext = createContext<GuideContextValue | null>(null);

/** Halaman setelah login tempat panduan boleh muncul sendiri. */
const GUIDE_PATHS = ['/belajar', '/guru', '/akun'];

/**
 * Panduan sambutan maskot, gaya pendamping di game: maskot di pojok bawah bicara lewat balon teks, halaman tetap
 * terlihat dan bagian yang sedang dijelaskan disorot. Muncul sendiri sekali setelah login pertama
 * (onboardingRequired dari server), bisa dibuka lagi dari halaman Akun. Selesai atau dilewati sama-sama dicatat di
 * server. Menunggu pop up cookie ditutup dan persetujuan syarat selesai, supaya tidak bertumpuk.
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
      <AnimatePresence>{open && user && <GuideBubble key="guide" user={user} onClose={close} />}</AnimatePresence>
    </GuideContext.Provider>
  );
}

export function useGuide() {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error('useGuide harus di dalam GuideProvider');
  return ctx;
}

function GuideBubble({ user, onClose }: { user: AuthUser; onClose: () => void }) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion() ?? false;
  const titleId = useId();
  const nextRef = useRef<HTMLButtonElement>(null);
  const guide = useMemo(() => guideFor(user.role, user.fullName), [user.role, user.fullName]);
  const [index, setIndex] = useState(0);
  const step = guide.steps[index]!;
  const last = index === guide.steps.length - 1;
  const typing = useTypewriter(step.text, !reduceMotion);

  // Balon tidak modal, tapi fokus pindah ke tombol Lanjut supaya Enter/Spasi langsung jalan seperti di game.
  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const go = (delta: number) => setIndex((i) => Math.min(Math.max(i + delta, 0), guide.steps.length - 1));

  const finish = () => {
    onClose();
    if (guide.finish.to) navigate(guide.finish.to);
  };

  /** Pola dialog game: tekan pertama menampilkan seluruh kalimat, tekan berikutnya pindah langkah. */
  const advance = () => {
    if (!typing.done) typing.complete();
    else if (last) finish();
    else go(1);
  };

  return (
    <>
      <Spotlight selector={step.target} />
      <motion.aside
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } }}
        exit={{ opacity: 0, y: 32, transition: { duration: 0.18, ease: 'easeIn' } }}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex items-end gap-1 px-3 pb-3 sm:px-6 sm:pb-6"
      >
        <div className="pointer-events-auto mx-auto flex w-full max-w-2xl items-end gap-1 sm:gap-2">
          {/* Maskot berdiri di samping balon, ganti karakter per langkah. */}
          <div className="relative h-24 w-20 shrink-0 sm:h-36 sm:w-28">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={`${step.mascot}-${index}`}
                initial={{ y: 30, opacity: 0, scale: 0.8 }}
                animate={{ y: 0, opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 320, damping: 16 } }}
                exit={{ y: 20, opacity: 0, transition: { duration: 0.12 } }}
                className="absolute inset-0 flex items-end justify-center"
              >
                <Mascot name={step.mascot} mood={typing.done ? step.mood : 'idle'} className="h-full w-auto drop-shadow-md" />
              </motion.div>
            </AnimatePresence>
          </div>

          <div
            onClick={() => !typing.done && typing.complete()}
            className="relative mb-6 flex min-w-0 flex-1 flex-col gap-2 rounded-xl border-2 border-teal bg-card p-4 shadow-lg sm:mb-10 sm:p-5"
          >
            {/* Ekor balon menunjuk ke maskot. */}
            <span aria-hidden="true" className="absolute bottom-5 -left-[9px] size-4 rotate-45 border-b-2 border-l-2 border-teal bg-card" />
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-teal px-2.5 py-0.5 text-label-md text-on-teal">{MASCOT_LABEL[step.mascot]}</span>
              <div className="flex items-center gap-1">
                <span className="text-label-sm text-ink-muted">
                  {index + 1}/{guide.steps.length}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                  }}
                  className="-my-2 min-h-11 rounded-full px-3 text-label-lg text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  {last ? 'Nanti dulu' : 'Lewati'}
                </button>
              </div>
            </div>
            <h2 id={titleId} className="font-title text-title-md text-ink text-balance">
              {step.title}
            </h2>
            {/* Pembaca layar mendapat kalimat utuh sekali; animasi ketik hanya untuk mata. */}
            <p className="sr-only" aria-live="polite">
              {step.text}
            </p>
            <p aria-hidden="true" className="text-body-md text-ink text-pretty">
              {step.text.slice(0, typing.shown)}
              {/* Sisa kalimat tetap memakan tempat supaya balon tidak melompat-lompat saat teks bertambah. */}
              <span className="invisible">{step.text.slice(typing.shown)}</span>
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <div className="flex items-center gap-2">
                {index > 0 && (
                  <Button
                    variant="ghost"
                    aria-label="Langkah sebelumnya"
                    onClick={(e) => {
                      e.stopPropagation();
                      go(-1);
                    }}
                    className="px-3"
                  >
                    <Icon name="arrow_back" />
                  </Button>
                )}
                <button
                  ref={nextRef}
                  type="button"
                  className={buttonClass(last && typing.done ? 'accent' : 'primary')}
                  onClick={(e) => {
                    e.stopPropagation();
                    advance();
                  }}
                >
                  {last && typing.done ? guide.finish.label : 'Lanjut'}
                  {!(last && typing.done) && (
                    <motion.span
                      aria-hidden="true"
                      animate={typing.done ? { y: [0, 3, 0] } : { y: 0 }}
                      transition={{ duration: 0.9, repeat: Infinity }}
                      className="inline-flex"
                    >
                      <Icon name={typing.done ? 'arrow_drop_down' : 'fast_forward'} className="text-[20px]" />
                    </motion.span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.aside>
    </>
  );
}
