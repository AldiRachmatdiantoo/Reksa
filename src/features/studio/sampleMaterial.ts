/**
 * Materi contoh. Isinya sama dengan MOCK_RUBRIC di backend
 * (backend/src/common/ai/mockAi.fixtures.ts), supaya alur di frontend dan
 * respons MockAiProvider bercerita tentang materi yang sama.
 * Diganti data dari GET /materials begitu modul `materials` selesai.
 */
export type StudyMaterial = {
  id: string;
  title: string;
  summary: string;
  keyConcepts: { id: string; concept: string; definition: string }[];
};

export const SAMPLE_MATERIAL: StudyMaterial = {
  id: 'contoh-homeostasis',
  title: 'Homeostasis dan Mekanisme Umpan Balik',
  summary:
    'Homeostasis adalah kemampuan tubuh menjaga kondisi internal tetap stabil. Mekanisme utamanya adalah umpan balik negatif yang melibatkan reseptor, pusat kontrol, dan efektor.',
  keyConcepts: [
    {
      id: 'homeostasis',
      concept: 'Homeostasis',
      definition: 'Keadaan lingkungan internal tubuh yang dijaga relatif konstan meskipun lingkungan luar berubah.',
    },
    {
      id: 'reseptor',
      concept: 'Reseptor',
      definition: 'Struktur yang mendeteksi perubahan (stimulus) pada variabel yang diatur, misalnya suhu atau kadar glukosa.',
    },
    {
      id: 'pusat-kontrol',
      concept: 'Pusat kontrol',
      definition: 'Bagian yang membandingkan nilai terukur dengan titik setel dan menentukan respons, misalnya hipotalamus.',
    },
    {
      id: 'efektor',
      concept: 'Efektor',
      definition: 'Organ atau sel yang menjalankan respons untuk mengoreksi penyimpangan, misalnya kelenjar keringat atau otot.',
    },
    {
      id: 'umpan-balik-negatif',
      concept: 'Umpan balik negatif',
      definition: 'Respons yang melawan arah perubahan sehingga variabel kembali mendekati titik setel.',
    },
  ],
};
