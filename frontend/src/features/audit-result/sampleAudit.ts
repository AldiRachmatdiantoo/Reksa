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
      concept: 'Suhu tubuh tetap pas',
      evidenceFromHandwriting: '"tubuh jaga suhunya biar nggak kepanasan" (baris pertama, dilingkari)',
    },
    {
      concept: 'Keringat keluar',
      evidenceFromHandwriting: 'Panah dari "otak" ke "keringat keluar → suhu turun"',
    },
  ],
  blindSpots: [
    {
      concept: 'Keringat mendinginkan tubuh',
      importanceLevel: 'HIGH',
      explanation: 'Kamu sudah menulis soal berkeringat, tapi belum menjelaskan kenapa keringat bikin tubuh dingin lagi.',
    },
    {
      concept: 'Kulit merasakan panas',
      importanceLevel: 'MEDIUM',
      explanation: 'Belum ada bagian yang pertama kali merasakan tubuh mulai panas, yaitu kulit.',
    },
  ],
  logicCorrections: [
    {
      studentStatement: '"otak langsung bikin keringat"',
      correction: 'Kulit merasakan panas dulu dan memberi tahu otak. Baru setelah itu otak menyuruh tubuh berkeringat.',
    },
  ],
  encouragingSummary:
    'Gambaran besarnya sudah kamu tangkap. Latihan berikutnya, tulis urutannya: kulit merasakan panas, otak memberi perintah, keringat keluar, lalu tubuh jadi dingin lagi.',
};
