import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { EASE_OUT } from '@/shared/motion';
import { Button } from './Button';
import { Icon } from './Icon';

type ConfirmDialogProps = {
  open: boolean;
  icon?: string;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Pop up konfirmasi untuk aksi yang menghapus progres.
 * Memakai <dialog> bawaan (showModal): fokus terkunci di dalam, Esc menutup, halaman belakang inert.
 * Fokus awal di tombol batal, karena itu pilihan yang aman.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  return <AnimatePresence>{props.open && <DialogPanel key="dialog" {...props} />}</AnimatePresence>;
}

function DialogPanel({ icon = 'help', title, children, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // Esc: biarkan React yang menutup supaya animasi keluar tetap jalan.
    const onCancelEvent = (e: Event) => {
      e.preventDefault();
      onCancel();
    };
    dialog.addEventListener('cancel', onCancelEvent);
    return () => dialog.removeEventListener('cancel', onCancelEvent);
  }, [onCancel]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="fixed inset-0 m-0 grid h-dvh max-h-none w-full max-w-none place-items-center bg-transparent p-4 backdrop:bg-transparent"
    >
      <motion.div
        aria-hidden="true"
        onClick={onCancel}
        className="absolute inset-0 bg-black/45 dark:bg-black/65"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        className="relative flex w-full max-w-md flex-col gap-4 rounded-xl border border-line bg-card p-6 shadow-lg"
        initial={{ opacity: 0, y: 24, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 320, damping: 26 } }}
        exit={{ opacity: 0, y: 12, scale: 0.97, transition: { duration: 0.16, ease: 'easeIn' } }}
      >
        <motion.span
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.08, ease: EASE_OUT }}
          className="flex size-12 items-center justify-center rounded-full bg-teal-wash text-teal"
        >
          <Icon name={icon} className="text-[26px]" />
        </motion.span>
        <div className="flex flex-col gap-2">
          <h2 id={titleId} className="font-headline text-headline-md text-ink text-balance">
            {title}
          </h2>
          <div id={bodyId} className="text-body-md text-ink-muted text-pretty">
            {children}
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel} autoFocus>
            {cancelLabel}
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </motion.div>
    </dialog>
  );
}
