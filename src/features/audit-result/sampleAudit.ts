/**
 * Bentuk hasil audit sama dengan AiEssayAuditOutputSchema di backend
 * (backend/src/common/ai/ai.schema.ts). Isinya MOCK_ESSAY_AUDIT dari
 * MockAiProvider. Diganti respons POST /scans/upload begitu modul
 * `essay-scans` selesai.
 */
export type ImportanceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type EssayAudit = {
  actualScore: number;
  accurateConcepts: { concept: string; evidenceFromHandwriting: string }[];
  blindSpots: { concept: string; importanceLevel: ImportanceLevel; explanation: string }[];
  logicCorrections: { studentStatement: string; correction: string }[];
  encouragingSummary: string;
};

export const SAMPLE_AUDIT: EssayAudit = {
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
