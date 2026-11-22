import { useEffect } from 'react';
import { ButtonLink } from '@/shared/ui/Button';
import { StateBlock } from '@/shared/ui/StateBlock';

export function NotFoundPage() {
  useEffect(() => {
    document.title = 'Halaman tidak ditemukan · REKSA';
  }, []);
  return (
    <main className="flex min-h-dvh items-center px-4 py-16">
      <StateBlock
        icon="travel_explore"
        title="Halaman ini tidak ada"
        action={
          <ButtonLink to="/" variant="primary">
            Kembali ke beranda
          </ButtonLink>
        }
      >
        Alamatnya mungkin salah ketik atau halamannya sudah dipindah.
      </StateBlock>
    </main>
  );
}
