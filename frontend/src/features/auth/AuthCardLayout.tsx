import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { pageTransition } from '@/shared/motion';
import { Brand } from '@/shared/ui/Brand';
import { Icon } from '@/shared/ui/Icon';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';

/** Kerangka halaman akun publik yang pendek: verifikasi email, lupa dan atur ulang kata sandi. */
export function AuthCardLayout({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <motion.div {...pageTransition} className="flex min-h-dvh flex-col px-4 py-6 sm:px-8">
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/masuk"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full pr-3 text-label-lg text-ink-muted hover:text-teal"
        >
          <Icon name="arrow_back" />
          Halaman masuk
        </Link>
        <ThemeToggle />
      </div>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 py-10">
        <Brand />
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-headline-lg-mobile text-ink sm:text-headline-lg">{title}</h1>
          {intro && <p className="text-body-lg text-ink-muted text-pretty">{intro}</p>}
        </div>
        {children}
      </main>
    </motion.div>
  );
}
