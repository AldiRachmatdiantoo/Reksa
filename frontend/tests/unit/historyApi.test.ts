import { describe, expect, it } from 'vitest';
import { formatGap, tendencyText } from '@/features/history/historyApi';

describe('tendencyText', () => {
  it('names overconfidence when guesses run more than 5 points high', () => {
    expect(tendencyText(12.5)).toContain('12,5 poin di atas');
  });
  it('names underconfidence when guesses run more than 5 points low', () => {
    expect(tendencyText(-8)).toContain('8 poin di bawah');
  });
  it('calls small averages balanced', () => {
    expect(tendencyText(5)).toBe('Tebakanmu tidak condong terlalu tinggi atau terlalu rendah.');
    expect(tendencyText(-3)).toBe('Tebakanmu tidak condong terlalu tinggi atau terlalu rendah.');
  });
});

describe('formatGap', () => {
  it('uses an Indonesian decimal comma and at most one decimal', () => {
    expect(formatGap(10.34)).toBe('10,3');
    expect(formatGap(15)).toBe('15');
  });
});
