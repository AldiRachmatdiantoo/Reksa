import type { Role } from '@/features/auth/authApi';
import type { MascotMood, MascotName } from '@/shared/mascot/Mascot';

export type GuideStep = {
  mascot: MascotName;
  mood: MascotMood;
  title: string;
  text: string;
  /**
   * Selector CSS elemen yang sedang dijelaskan; disorot seperti tutorial game. Elemen yang tidak ada di
   * halaman saat itu (mis. menu pelajar di portal guru) dilewati tanpa sorotan.
   */
  target?: string;
};

const studentNav = (href: string) => `nav[aria-label="Menu pelajar"] a[href="${href}"]`;
const section = (titleId: string) => `section[aria-labelledby="${titleId}"]`;

export type Guide = {
  steps: GuideStep[];
  /** Tombol utama di langkah terakhir dan tujuannya. null = cukup tutup panduan. */
  finish: { label: string; to: string | null };
};

/** Nama depan untuk sapaan. Nama kosong atau hanya spasi jadi sapaan tanpa nama. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}

function greeting(name: string, roleText: string, place: string): GuideStep {
  return {
    mascot: 'risa',
    mood: 'cheer',
    title: name ? `Halo, ${name}! Aku Risa.` : 'Halo! Aku Risa.',
    text: `Kamu masuk sebagai ${roleText}. Sebelum mulai, aku jelasin dulu apa saja yang bisa kamu lakukan di ${place}. Sebentar saja kok.`,
  };
}

const REOPEN_NOTE = 'Panduan ini bisa kamu buka lagi kapan saja dari halaman Akun.';

/** Isi panduan per peran. Nama menu dan batas di sini harus sama dengan yang ada di aplikasi. */
export function guideFor(role: Role, fullName: string): Guide {
  const name = firstName(fullName);

  if (role === 'STUDENT') {
    return {
      steps: [
        greeting(name, 'pelajar', 'sini'),
        {
          mascot: 'risa',
          mood: 'idle',
          title: 'Mulai dari Beranda',
          target: studentNav('/belajar/beranda'),
          text: 'Beranda berisi pintasan ke semua bagian REKSA, lengkap dengan keterangan singkat isinya. Bingung mau ke mana? Buka Beranda dulu.',
        },
        {
          mascot: 'risu',
          mood: 'idle',
          title: 'Mulai dari Materi',
          target: studentNav('/belajar/materi'),
          text: 'Aku Risu. Unggah PDF atau tempel teks bahan bacaanmu di menu Materi. Aku susun konsep kuncinya, jadi catatanmu nanti bisa dicek. Paket gratis bisa 3 materi baru per hari.',
        },
        {
          mascot: 'rasi',
          mood: 'idle',
          title: 'Fokus, lalu tulis dari ingatan',
          target: studentNav('/belajar'),
          text: 'Aku Rasi. Di menu Belajar, pasang timer fokus lalu tulis ulang yang kamu ingat di kertas, tanpa melihat materinya.',
        },
        {
          mascot: 'risa',
          mood: 'think',
          title: 'Tebak nilaimu, lalu foto catatanmu',
          text: 'Tebak dulu seberapa banyak yang kamu kuasai, lalu foto tulisanmu. Aku cek per konsep: yang penting maksudnya benar, kata-katanya tidak harus sama. Paket gratis bisa 3 foto per hari.',
        },
        {
          mascot: 'rasi',
          mood: 'happy',
          title: 'Ulang supaya tidak lupa',
          target: studentNav('/belajar/ulang'),
          text: 'Setelah dicek, jadwal ulang hari ke-3 dan ke-7 muncul di menu Ulang. Semua hasilmu tersimpan di Riwayat. Punya kode kelas dari guru? Masukkan di menu Kelas.',
        },
        {
          mascot: 'risa',
          mood: 'happy',
          title: 'Siap mulai?',
          text: `Langkah pertamamu: tambahkan satu materi. ${REOPEN_NOTE}`,
        },
      ],
      finish: { label: 'Tambah materi pertama', to: '/belajar/materi' },
    };
  }

  if (role === 'EDUCATOR') {
    return {
      steps: [
        greeting(name, 'guru', 'Portal Guru'),
        {
          mascot: 'risu',
          mood: 'idle',
          title: 'Buat kelas dan bagikan materi',
          target: section('classes-title'),
          text: 'Aku Risu. Buat kelas, bagikan kodenya ke siswa, lalu bagikan materi yang perlu mereka pelajari.',
        },
        {
          mascot: 'rasi',
          mood: 'idle',
          title: 'Bukti belajar siswa',
          target: section('ledger-title'),
          text: 'Aku Rasi. Lihat setiap catatan siswa yang sudah dicek: lama fokus, tebakan nilai dibanding skor, dan foto aslinya. Datanya dikunci dengan hash.',
        },
        {
          mascot: 'risa',
          mood: 'think',
          title: 'Peta bagian sulit',
          target: section('cohort-title'),
          text: 'Lihat berapa banyak siswa yang melewatkan tiap konsep, tanpa menampilkan nama siswa. Cocok untuk menentukan bahan pertemuan berikutnya.',
        },
        {
          mascot: 'risa',
          mood: 'happy',
          title: 'Siap mulai?',
          text: `Mulai dengan membuat kelas pertamamu. ${REOPEN_NOTE}`,
        },
      ],
      finish: { label: 'Mulai', to: null },
    };
  }

  return {
    steps: [
      greeting(name, 'admin institusi', 'Portal Institusi'),
      {
        mascot: 'risu',
        mood: 'idle',
        title: 'Undang pengajar',
        target: section('invites-title'),
        text: 'Aku Risu. Buat kode undangan lalu bagikan ke guru. Satu kode bisa dipakai beberapa guru selama 7 hari.',
      },
      {
        mascot: 'rasi',
        mood: 'idle',
        title: 'Pantau kelas',
        target: section('inst-classes-title'),
        text: 'Aku Rasi. Lihat daftar pengajar dan kelas yang ada di institusimu.',
      },
      {
        mascot: 'risa',
        mood: 'think',
        title: 'Konsep yang paling sering terlewat',
        target: section('inst-concepts-title'),
        text: 'Lihat konsep yang paling sering terlewat di seluruh institusi, dihitung dari hasil cek terakhir setiap siswa.',
      },
      {
        mascot: 'risa',
        mood: 'happy',
        title: 'Siap mulai?',
        text: `Mulai dengan membuat kode undangan pengajar. ${REOPEN_NOTE}`,
      },
    ],
    finish: { label: 'Mulai', to: null },
  };
}
