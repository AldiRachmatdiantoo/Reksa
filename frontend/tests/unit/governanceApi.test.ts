import { describe, expect, it } from 'vitest';
import { conceptShareLabel, formatMinutes, jolDeltaLabel } from '@/features/governance/governanceApi';

describe('governanceApi helpers', () => {
  it('describes the JOL calibration in words', () => {
    expect(jolDeltaLabel(0)).toBe('tebakannya tepat');
    expect(jolDeltaLabel(-10)).toBe('tebakannya tepat');
    expect(jolDeltaLabel(25)).toBe('meremehkan diri 25 poin');
    expect(jolDeltaLabel(-15)).toBe('terlalu yakin 15 poin');
  });

  it('formats durations in whole minutes', () => {
    expect(formatMinutes(1440)).toBe('24 menit');
    expect(formatMinutes(null)).toBe('-');
  });

  it('describes how many students missed a concept', () => {
    expect(conceptShareLabel({ studentCount: 2, percent: 67 }, 3)).toBe('2 dari 3 siswa (67%)');
  });
});
