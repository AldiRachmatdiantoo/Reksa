import { motion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { pageTransition } from '@/shared/motion';
import { Brand } from '@/shared/ui/Brand';
import { Icon } from '@/shared/ui/Icon';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { formatVersion, PRIVACY_VERSION, TERMS_VERSION } from './policyVersions';

type Doc = 'privasi' | 'syarat';

const TITLES: Record<Doc, string> = { privasi: 'Kebijakan Privasi', syarat: 'Syarat Layanan' };

/** Halaman publik /privasi dan /syarat (FR-13). Isinya mengikuti perilaku aplikasi yang sebenarnya. */
export function LegalPage({ doc }: { doc: Doc }) {
  const title = TITLES[doc];
  const version = doc === 'privasi' ? PRIVACY_VERSION : TERMS_VERSION;

  useEffect(() => {
    document.title = `${title} · REKSA`;
  }, [title]);

  return (
    <motion.div {...pageTransition} className="flex min-h-dvh flex-col px-4 py-6 sm:px-8">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4">
        <Link to="/" className="inline-flex min-h-11 items-center gap-1.5 rounded-full pr-3 text-label-lg text-ink-muted hover:text-teal">
          <Icon name="arrow_back" />
          Beranda
        </Link>
        <ThemeToggle />
      </div>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-10">
        <Brand />
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-headline-lg-mobile text-ink sm:text-headline-lg">{title}</h1>
          <p className="text-body-md text-ink-muted">
            Versi {version}, berlaku sejak {formatVersion(version)}.
          </p>
        </header>
        <p className="rounded-md bg-wash px-4 py-3 text-body-md text-ink">
          REKSA masih tahap uji coba. Dokumen ini ditulis oleh tim pengembang dan belum ditinjau ahli hukum. Kami akan memperbaruinya
          sebelum REKSA dibuka untuk umum, dan kamu akan diminta menyetujui versi barunya saat masuk.
        </p>
        <div className="flex flex-col gap-8 text-body-lg text-ink">{doc === 'privasi' ? <PrivacyBody /> : <TermsBody />}</div>
        <nav aria-label="Dokumen lain" className="border-t border-line-soft pt-6 text-body-md">
          {doc === 'privasi' ? (
            <Link to="/syarat" className="inline-flex min-h-11 items-center text-teal underline underline-offset-2">
              Baca juga Syarat Layanan
            </Link>
          ) : (
            <Link to="/privasi" className="inline-flex min-h-11 items-center text-teal underline underline-offset-2">
              Baca juga Kebijakan Privasi
            </Link>
          )}
        </nav>
      </main>
    </motion.div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-title text-title-lg text-ink">{title}</h2>
      {children}
    </section>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-6 marker:text-ink-muted">{children}</ul>;
}

function PrivacyBody() {
  return (
    <>
      <Section title="Data yang kami simpan">
        <List>
          <li>Email, nama lengkap, peran (pelajar atau guru), dan tahun lahir.</li>
          <li>Kata sandi, dalam bentuk hash Argon2id. Kami tidak bisa membaca kata sandimu.</li>
          <li>Materi yang kamu unggah dan rubrik yang dibuat darinya.</li>
          <li>Sesi belajar: durasi fokus, tebakan nilaimu sebelum dinilai, dan hasil penilaian.</li>
          <li>Foto catatan tulisan tanganmu. Data lokasi dan info kamera di foto dihapus sebelum disimpan.</li>
          <li>Kelas yang kamu ikuti, jadwal pengulangan, dan catatan persetujuan dokumen ini.</li>
        </List>
        <p>Tidak ada iklan, pelacak iklan, atau analitik pihak ketiga. Cookie yang kami pakai hanya untuk login.</p>
      </Section>

      <Section title="Untuk apa data itu dipakai">
        <List>
          <li>Menilai catatanmu dan menunjukkan konsep yang terlewat.</li>
          <li>Menjadwalkan latihan ulang supaya materinya tidak cepat lupa.</li>
          <li>Menampilkan bukti belajar ke guru kelas yang kamu ikuti.</li>
          <li>Mengirim email akun: verifikasi email dan atur ulang kata sandi.</li>
        </List>
      </Section>

      <Section title="Siapa yang bisa melihat">
        <List>
          <li>Kamu sendiri bisa melihat semua datamu.</li>
          <li>
            Guru hanya melihat data belajar untuk kelas yang kamu ikuti. Kalau kamu keluar dari kelas, guru tidak bisa melihatnya lagi.
          </li>
          <li>Admin sekolah atau institusi hanya melihat angka ringkasan, bukan data per siswa.</li>
          <li>Tim pengembang bisa mengakses basis data untuk perbaikan teknis, dan tidak membuka isi catatanmu tanpa alasan itu.</li>
        </List>
      </Section>

      <Section title="Penyedia AI pihak ketiga">
        <p>
          Untuk menilai catatan, teks materi dan foto catatanmu dikirim ke penyedia AI (Google Gemini). Kami memilih paket dan ketentuan
          penyedia yang tidak memakai data itu untuk melatih model. Selama uji coba, sebagian penilaian masih memakai contoh jawaban buatan,
          bukan AI sungguhan.
        </p>
      </Section>

      <Section title="Berapa lama disimpan">
        <List>
          <li>Foto catatan dan hasil penilaian disimpan selama akunmu aktif dan ikut terhapus bersama akun.</li>
          <li>Arsip "Unduh data saya" dihapus otomatis 24 jam setelah dibuat.</li>
          <li>Log server disimpan paling lama 30 hari dan tidak memuat isi materi, foto, atau token login.</li>
        </List>
      </Section>

      <Section title="Pengguna di bawah 18 tahun">
        <p>
          Kalau umurmu di bawah 18 tahun, kamu perlu izin orang tua atau wali sebelum mendaftar. Saat ini izin itu berupa pernyataan yang
          kamu centang sendiri. Orang tua atau wali boleh meminta datamu diunduh atau dihapus lewat akunmu.
        </p>
      </Section>

      <Section title="Hakmu">
        <List>
          <li>Mengubah nama di halaman Akun.</li>
          <li>Mengunduh semua datamu dalam satu file zip, sekali sehari, dari halaman Akun.</li>
          <li>Menghapus akun beserta semua data dan fotonya dari halaman Akun. Penghapusan ini permanen.</li>
        </List>
      </Section>

      <Section title="Kontak">
        <p>
          Alamat kontak resmi akan dicantumkan di sini sebelum REKSA dibuka untuk umum. Selama uji coba, sampaikan pertanyaan lewat guru
          atau sekolah yang mengajakmu memakai REKSA.
        </p>
      </Section>
    </>
  );
}

function TermsBody() {
  return (
    <>
      <Section title="Tentang REKSA">
        <p>
          REKSA membantu kamu belajar dengan menulis ulang materi dari ingatan di kertas, lalu memeriksa bagian yang terlewat. Hasil
          penilaian dibuat mesin dan bisa salah. Pakai sebagai bahan belajar, bukan nilai resmi.
        </p>
      </Section>

      <Section title="Akunmu">
        <List>
          <li>Satu akun untuk satu orang. Jaga kata sandimu dan jangan bagikan ke orang lain.</li>
          <li>Isi data dengan benar, termasuk tahun lahir.</li>
          <li>Kalau umurmu di bawah 18 tahun, pastikan orang tua atau wali sudah mengizinkan.</li>
        </List>
      </Section>

      <Section title="Yang tidak boleh dilakukan">
        <List>
          <li>Mengunggah foto atau materi yang bukan milikmu tanpa izin, atau yang berisi data pribadi orang lain.</li>
          <li>Mencoba membobol akun lain, mengakali kuota, atau mengganggu kerja server.</li>
          <li>Memakai REKSA untuk menyontek ujian.</li>
        </List>
      </Section>

      <Section title="Paket Gratis dan Pro">
        <p>
          Paket Gratis punya batas foto per hari. Paket Pro membuka batas itu selama masa aktif kode aktivasi yang kamu pakai. Setelah masa
          aktif habis, akun kembali ke paket Gratis dan datamu tetap utuh.
        </p>
      </Section>

      <Section title="Materi dan catatanmu">
        <p>
          Materi dan foto catatan tetap milikmu. Kamu mengizinkan REKSA menyimpan dan memprosesnya hanya untuk menjalankan fitur yang kamu
          pakai, seperti dijelaskan di Kebijakan Privasi.
        </p>
      </Section>

      <Section title="Uji coba">
        <p>
          REKSA masih dalam uji coba. Fitur bisa berubah, dan layanan bisa terhenti sementara. Kami tidak menjamin REKSA selalu bebas
          gangguan.
        </p>
      </Section>

      <Section title="Menghentikan akun">
        <p>Kamu bisa menghapus akun kapan saja dari halaman Akun. Kami bisa menonaktifkan akun yang melanggar syarat ini.</p>
      </Section>
    </>
  );
}
