import type { AiCohortClusterOutput, AiEssayAuditOutput, AiRubricOutput } from './ai.schema.js';

// Data dummy deterministik untuk MockAiProvider. Semuanya harus lolos skema Zod
// di ai.schema.ts (dicek oleh tests/unit/common/ai/mockAi.provider.test.ts).
// Adli: tambahkan variasi data di sini sesuai kebutuhan tampilan UI.

export const MOCK_RUBRIC: AiRubricOutput = {
  materialTitle: 'Homeostasis dan Mekanisme Umpan Balik',
  summary:
    'Homeostasis adalah kemampuan tubuh menjaga kondisi internal tetap stabil. Mekanisme utamanya adalah umpan balik negatif yang melibatkan reseptor, pusat kontrol, dan efektor.',
  keyConcepts: [
    {
      id: 'homeostasis',
      concept: 'Homeostasis',
      definition: 'Keadaan lingkungan internal tubuh yang dijaga relatif konstan meskipun lingkungan luar berubah.',
      weight: 5,
    },
    {
      id: 'reseptor',
      concept: 'Reseptor',
      definition: 'Struktur yang mendeteksi perubahan (stimulus) pada variabel yang diatur, misalnya suhu atau kadar glukosa.',
      weight: 3,
    },
    {
      id: 'pusat-kontrol',
      concept: 'Pusat kontrol',
      definition: 'Bagian yang membandingkan nilai terukur dengan titik setel dan menentukan respons, misalnya hipotalamus.',
      weight: 4,
    },
    {
      id: 'efektor',
      concept: 'Efektor',
      definition: 'Organ atau sel yang menjalankan respons untuk mengoreksi penyimpangan, misalnya kelenjar keringat atau otot.',
      weight: 3,
    },
    {
      id: 'umpan-balik-negatif',
      concept: 'Umpan balik negatif',
      definition: 'Respons yang melawan arah perubahan sehingga variabel kembali mendekati titik setel.',
      weight: 5,
    },
  ],
  causalRelations: [
    {
      fromConceptId: 'reseptor',
      toConceptId: 'pusat-kontrol',
      relation: 'Reseptor mengirim sinyal perubahan ke pusat kontrol.',
    },
    {
      fromConceptId: 'pusat-kontrol',
      toConceptId: 'efektor',
      relation: 'Pusat kontrol mengaktifkan efektor ketika nilai menyimpang dari titik setel.',
    },
    {
      fromConceptId: 'efektor',
      toConceptId: 'umpan-balik-negatif',
      relation: 'Respons efektor membalik arah perubahan, membentuk umpan balik negatif.',
    },
    {
      fromConceptId: 'umpan-balik-negatif',
      toConceptId: 'homeostasis',
      relation: 'Umpan balik negatif mengembalikan kondisi ke titik setel sehingga homeostasis terjaga.',
    },
  ],
};

export const MOCK_ESSAY_AUDIT: AiEssayAuditOutput = {
  actualScore: 62,
  accurateConcepts: [
    {
      concept: 'Homeostasis',
      evidenceFromHandwriting: '"homeostasis = tubuh jaga kondisi dalam tetap stabil" (baris pertama, dilingkari)',
    },
    {
      concept: 'Efektor',
      evidenceFromHandwriting: 'Panah dari "otak" ke "kelenjar keringat → keringat keluar → suhu turun"',
    },
  ],
  blindSpots: [
    {
      concept: 'Umpan balik negatif',
      importanceLevel: 'HIGH',
      explanation:
        'Kamu menuliskan contoh berkeringat, tetapi belum menjelaskan bahwa respons ini melawan arah perubahan sehingga suhu kembali ke titik setel.',
    },
    {
      concept: 'Reseptor',
      importanceLevel: 'MEDIUM',
      explanation: 'Belum disebutkan bagian yang pertama kali mendeteksi kenaikan suhu (termoreseptor di kulit).',
    },
  ],
  logicCorrections: [
    {
      studentStatement: '"otak langsung bikin keringat"',
      correction:
        'Hipotalamus bertindak sebagai pusat kontrol: ia menerima sinyal dari reseptor dulu, baru kemudian mengaktifkan kelenjar keringat sebagai efektor.',
    },
  ],
  encouragingSummary:
    'Kerangka besarnya sudah kamu tangkap, terutama peran efektor. Fokuskan latihan berikutnya pada urutan reseptor → pusat kontrol → efektor dan alasan mekanismenya disebut "negatif".',
};

export const MOCK_COHORT_CLUSTERS: AiCohortClusterOutput = {
  totalStudentsAnalyzed: 32,
  clusters: [
    {
      label: 'Arah respons umpan balik negatif',
      memberConcepts: ['Umpan balik negatif', 'Titik setel'],
      affectedStudentCount: 23,
      failureRatePercent: 72,
      severity: 'HIGH',
      remediationSuggestion:
        'Tambahkan diagram siklus suhu tubuh dengan panah yang menunjukkan respons berlawanan arah dengan perubahan, lalu minta siswa menjelaskan ulang dengan contoh kadar glukosa.',
    },
    {
      label: 'Peran reseptor dalam alur kontrol',
      memberConcepts: ['Reseptor', 'Pusat kontrol'],
      affectedStudentCount: 13,
      failureRatePercent: 41,
      severity: 'MEDIUM',
      remediationSuggestion:
        'Gunakan analogi termostat ruangan untuk membedakan sensor (reseptor) dari pengendali (pusat kontrol).',
    },
  ],
  curriculumRecommendation:
    'Mayoritas siswa hafal contoh homeostasis tetapi belum memahami mekanisme umpan balik negatif. Sisipkan satu sesi latihan menggambar diagram alur reseptor → pusat kontrol → efektor sebelum masuk ke sistem endokrin.',
};
