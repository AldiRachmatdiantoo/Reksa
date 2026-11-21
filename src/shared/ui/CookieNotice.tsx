import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useState } from 'react';
import { useConsent } from '@/shared/consent';
import { EASE_OUT } from '@/shared/motion';
import { Button } from './Button';
import { Icon } from './Icon';

/**
 * Pop up cookie dari desain Figma (beranda). Tidak modal: halaman tetap bisa dipakai.
 * Pilihannya nyata: "pengaturan tampilan" mengatur apakah tema diingat di perangkat ini.
 */
export function CookieNotice() {
  const { consent, noticeOpen, save } = useConsent();
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState(consent?.preferences ?? false);
  const titleId = useId();
  const detailsId = useId();

  // Dibuka lagi dari tautan pengaturan: tampilkan rincian dengan pilihan terakhir.
  useEffect(() => {
    if (noticeOpen && consent) {
      setPreferences(consent.preferences);
      setShowDetails(true);
    }
  }, [noticeOpen, consent]);

  return (
    <AnimatePresence>
      {noticeOpen && (
        <motion.aside
          key="cookie-notice"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          initial={{ opacity: 0, y: 48, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 24, delay: 0.6 } }}
          exit={{ opacity: 0, y: 32, scale: 0.97, transition: { duration: 0.2, ease: 'easeIn' } }}
          className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-full sm:max-w-md"
        >
          <div className="flex flex-col gap-3.5 rounded-xl border border-line bg-card p-4 shadow-lg sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <motion.span
                  initial={{ rotate: -90, scale: 0.4 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.85 }}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-wash text-teal"
                >
                  <Icon name="cookie" />
                </motion.span>
                <h2 id={titleId} className="font-title text-title-md text-ink">
                  Cookie & privasi
                </h2>
              </div>
              <button
                type="button"
                onClick={() => save(consent?.preferences ?? false)}
                aria-label="Tutup pemberitahuan cookie, pakai yang penting saja"
                className="-mt-1 -mr-1 inline-flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-wash hover:text-ink"
              >
                <Icon name="close" />
              </button>
            </div>

            <p className="text-body-sm text-ink-muted text-pretty">
              REKSA memakai cookie penting supaya kamu tetap masuk dan sesi belajarmu tersimpan. Tidak ada cookie iklan atau pelacak,
              dan foto catatanmu tidak dibagikan ke pihak lain.
            </p>

            <AnimatePresence initial={false}>
              {showDetails && (
                <motion.div
                  id={detailsId}
                  key="details"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-1 rounded-md border border-line-soft bg-wash p-3.5">
                    <div className="flex min-h-11 items-center justify-between gap-3">
                      <span className="text-label-md text-ink">Cookie login & sesi belajar</span>
                      <span className="shrink-0 text-label-md text-teal">Selalu aktif</span>
                    </div>
                    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                      <span className="flex flex-col">
                        <span className="text-label-md text-ink">Ingat pilihan tema</span>
                        <span className="text-label-sm text-ink-muted">Terang atau gelap, disimpan di perangkat ini</span>
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={preferences}
                        onChange={(e) => setPreferences(e.target.checked)}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal ${
                          preferences ? 'bg-teal' : 'bg-line'
                        }`}
                      >
                        <motion.span
                          className="absolute top-0.5 left-0.5 size-5 rounded-full bg-card shadow-sm"
                          animate={{ x: preferences ? 20 : 0 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />
                      </span>
                    </label>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                aria-expanded={showDetails}
                aria-controls={detailsId}
                onClick={() => setShowDetails((v) => !v)}
                className="order-last inline-flex min-h-11 items-center justify-center gap-1 rounded-full px-3 text-label-md text-ink-muted hover:text-teal sm:order-first"
              >
                {showDetails ? 'Sembunyikan pilihan' : 'Atur pilihan'}
                <motion.span animate={{ rotate: showDetails ? 180 : 0 }} className="flex">
                  <Icon name="expand_more" className="text-[20px]" />
                </motion.span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => save(false)}>
                  Hanya penting
                </Button>
                {showDetails ? (
                  <Button variant="primary" onClick={() => save(preferences)}>
                    Simpan pilihan
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => save(true)}>
                    Terima semua
                  </Button>
                )}
              </div>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
