import type { AiCohortClusterOutput, AiEssayAuditOutput, AiRubricOutput } from './ai.schema.js';

// Data dummy deterministik untuk MockAiProvider. Semuanya harus lolos skema Zod
// di ai.schema.ts (dicek oleh tests/unit/common/ai/mockAi.provider.test.ts).
//
// Variasi audit (dipilih MockAiProvider secara deterministik dari isi foto):
// - MOCK_ESSAY_AUDIT_HIGH  : skor tinggi, tanpa blind spot (tidak memicu jadwal H+3/H+7)
// - MOCK_ESSAY_AUDIT       : skor sedang (dipakai juga sebagai SAMPLE_AUDIT di frontend)
// - MOCK_ESSAY_AUDIT_LOW   : skor rendah, banyak blind spot dan koreksi logika
// Materi kedua (fotosintesis) dipakai bila teks materi menyebut "fotosintesis".

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

export const MOCK_ESSAY_AUDIT_HIGH: AiEssayAuditOutput = {
  actualScore: 91,
  accurateConcepts: [
    {
      concept: 'Homeostasis',
      evidenceFromHandwriting: '"homeostasis: kondisi internal dijaga ~konstan walau lingkungan luar berubah" (judul halaman)',
    },
    {
      concept: 'Reseptor',
      evidenceFromHandwriting: 'Kotak "termoreseptor kulit" di awal diagram, panah ke "hipotalamus"',
    },
    {
      concept: 'Pusat kontrol',
      evidenceFromHandwriting: '"hipotalamus bandingin suhu skrg vs set point 37°C" (ditulis di samping kotak kedua)',
    },
    {
      concept: 'Efektor',
      evidenceFromHandwriting: 'Dua cabang panah: "kelenjar keringat" dan "pembuluh darah melebar (vasodilatasi)"',
    },
    {
      concept: 'Umpan balik negatif',
      evidenceFromHandwriting: 'Panah melingkar kembali ke awal, diberi label "negative feedback = lawan arah perubahan"',
    },
  ],
  blindSpots: [],
  logicCorrections: [],
  encouragingSummary:
    'Luar biasa! Alur reseptor → pusat kontrol → efektor dan alasan mekanismenya disebut negatif sudah lengkap. Pertahankan dengan mencoba menjelaskan contoh lain, misalnya pengaturan kadar glukosa darah.',
};

export const MOCK_ESSAY_AUDIT_LOW: AiEssayAuditOutput = {
  actualScore: 28,
  accurateConcepts: [
    {
      concept: 'Homeostasis',
      evidenceFromHandwriting: '"homeostasis itu keseimbangan tubuh" (satu baris di atas, tanpa penjelasan lanjut)',
    },
  ],
  blindSpots: [
    {
      concept: 'Umpan balik negatif',
      importanceLevel: 'HIGH',
      explanation: 'Mekanisme utama yang menjaga homeostasis belum muncul sama sekali di catatanmu.',
    },
    {
      concept: 'Pusat kontrol',
      importanceLevel: 'HIGH',
      explanation: 'Belum ada bagian yang membandingkan kondisi tubuh dengan titik setel, misalnya hipotalamus untuk suhu.',
    },
    {
      concept: 'Reseptor',
      importanceLevel: 'MEDIUM',
      explanation: 'Belum dijelaskan bagaimana tubuh mendeteksi perubahan suhu atau kadar zat.',
    },
    {
      concept: 'Efektor',
      importanceLevel: 'MEDIUM',
      explanation: 'Belum disebutkan organ yang menjalankan respons, seperti kelenjar keringat atau otot rangka saat menggigil.',
    },
  ],
  logicCorrections: [
    {
      studentStatement: '"kalau panas, suhu badan naik terus sampai dingin sendiri"',
      correction:
        'Suhu tubuh tidak turun dengan sendirinya. Tubuh aktif melawan kenaikan suhu lewat keringat dan pelebaran pembuluh darah, itulah umpan balik negatif.',
    },
    {
      studentStatement: '"homeostasis = semua organ kerja sama" (dicoret lalu ditulis ulang)',
      correction:
        'Kerja sama organ memang terjadi, tetapi inti homeostasis adalah menjaga variabel internal tetap dekat titik setel lewat alur reseptor → pusat kontrol → efektor.',
    },
  ],
  encouragingSummary:
    'Awal yang baik: kamu sudah tahu homeostasis berkaitan dengan keseimbangan. Coba baca ulang bagian alur kontrol, lalu gambar diagram tiga kotak (reseptor, pusat kontrol, efektor) dengan contoh suhu tubuh.',
};

export const MOCK_RUBRIC_FOTOSINTESIS: AiRubricOutput = {
  materialTitle: 'Fotosintesis',
  summary:
    'Fotosintesis adalah proses tumbuhan hijau mengubah energi cahaya menjadi energi kimia. Reaksi terang di membran tilakoid menghasilkan ATP dan NADPH yang dipakai siklus Calvin di stroma untuk menyusun glukosa.',
  keyConcepts: [
    {
      id: 'klorofil',
      concept: 'Klorofil',
      definition: 'Pigmen hijau di kloroplas yang menyerap cahaya, terutama spektrum merah dan biru.',
      weight: 3,
    },
    {
      id: 'reaksi-terang',
      concept: 'Reaksi terang',
      definition: 'Tahap di membran tilakoid yang memakai cahaya untuk memecah air, melepas O2, dan menghasilkan ATP serta NADPH.',
      weight: 5,
    },
    {
      id: 'siklus-calvin',
      concept: 'Siklus Calvin',
      definition: 'Tahap di stroma yang memfiksasi CO2 memakai ATP dan NADPH untuk membentuk gula.',
      weight: 5,
    },
    {
      id: 'fotolisis-air',
      concept: 'Fotolisis air',
      definition: 'Pemecahan molekul air oleh energi cahaya yang menghasilkan elektron, ion H+, dan oksigen.',
      weight: 4,
    },
  ],
  causalRelations: [
    {
      fromConceptId: 'klorofil',
      toConceptId: 'reaksi-terang',
      relation: 'Cahaya yang diserap klorofil menggerakkan reaksi terang.',
    },
    {
      fromConceptId: 'fotolisis-air',
      toConceptId: 'reaksi-terang',
      relation: 'Fotolisis air menyediakan elektron pengganti bagi reaksi terang dan melepas oksigen.',
    },
    {
      fromConceptId: 'reaksi-terang',
      toConceptId: 'siklus-calvin',
      relation: 'ATP dan NADPH dari reaksi terang dipakai siklus Calvin untuk menyusun glukosa.',
    },
  ],
};

export const MOCK_ESSAY_AUDIT_FOTOSINTESIS: AiEssayAuditOutput = {
  actualScore: 70,
  accurateConcepts: [
    {
      concept: 'Klorofil',
      evidenceFromHandwriting: 'Gambar daun dengan label "klorofil serap cahaya (merah & biru)"',
    },
    {
      concept: 'Siklus Calvin',
      evidenceFromHandwriting: '"Calvin cycle di stroma: CO2 → glukosa" (ditulis dalam kotak, campuran bahasa Inggris)',
    },
    {
      concept: 'Reaksi terang',
      evidenceFromHandwriting: 'Panah "cahaya → ATP + NADPH" di sisi kiri halaman',
    },
  ],
  blindSpots: [
    {
      concept: 'Fotolisis air',
      importanceLevel: 'HIGH',
      explanation: 'Belum dijelaskan bahwa oksigen yang dilepas tumbuhan berasal dari pemecahan air, bukan dari CO2.',
    },
  ],
  logicCorrections: [
    {
      studentStatement: '"O2 dari CO2 yang dipecah"',
      correction: 'Oksigen hasil fotosintesis berasal dari fotolisis air pada reaksi terang. Atom O dari CO2 masuk ke glukosa.',
    },
  ],
  encouragingSummary:
    'Pembagian dua tahap fotosintesis sudah tepat dan diagrammu jelas. Tambahkan asal-usul oksigen (fotolisis air) supaya alurnya lengkap.',
};

/** Audit Stage 2 untuk materi homeostasis, urut dari skor tertinggi. */
export const MOCK_ESSAY_AUDIT_VARIANTS: readonly AiEssayAuditOutput[] = [
  MOCK_ESSAY_AUDIT_HIGH,
  MOCK_ESSAY_AUDIT,
  MOCK_ESSAY_AUDIT_LOW,
];
