import { describe, it, expect } from 'vitest';
import { axisDate, periodRange } from './crossPeriod';

describe('crossPeriod', () => {
  it('axisDate: dia e mês curto, com o ano quando se pede', () => {
    expect(axisDate('2026-09-08')).toBe('8 set');
    expect(axisDate('2025-12-31', true)).toBe('31 dez 2025');
    expect(axisDate(null)).toBe('');
  });
  it('periodRange: o ano só aparece quando o período atravessa anos', () => {
    expect(periodRange('2026-09-08', '2026-11-01')).toBe('8 set – 1 nov');
    expect(periodRange('2025-12-20', '2026-01-10')).toBe('20 dez 2025 – 10 jan 2026');
    expect(periodRange(null, '2026-11-01')).toBe('');
  });
});
