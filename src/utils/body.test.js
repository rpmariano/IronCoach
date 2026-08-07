import { describe, it, expect, vi, afterEach } from 'vitest';
import { ageFromBirthDate } from './body';

// Congelar "hoje" — sem isto os testes passam a falhar sozinhos com o tempo.
function comHoje(iso, fn) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  try { fn(); } finally { vi.useRealTimers(); }
}

afterEach(() => vi.useRealTimers());

describe('ageFromBirthDate', () => {
  it('calcula a idade quando o aniversário já passou este ano', () => {
    comHoje('2026-08-07', () => {
      expect(ageFromBirthDate('1990-03-15')).toBe(36);
    });
  });

  it('não conta o ano quando o aniversário ainda não chegou', () => {
    comHoje('2026-08-07', () => {
      expect(ageFromBirthDate('1990-12-25')).toBe(35);
    });
  });

  it('conta o ano no próprio dia do aniversário', () => {
    comHoje('2026-08-07', () => {
      expect(ageFromBirthDate('1990-08-07')).toBe(36);
    });
  });

  it('não conta no dia anterior ao aniversário', () => {
    comHoje('2026-08-07', () => {
      expect(ageFromBirthDate('1990-08-08')).toBe(35);
    });
  });

  it('devolve null sem data ou com data inválida', () => {
    expect(ageFromBirthDate(null)).toBeNull();
    expect(ageFromBirthDate('')).toBeNull();
    expect(ageFromBirthDate('não é uma data')).toBeNull();
  });

  it('rejeita datas absurdas em vez de devolver um número enganador', () => {
    comHoje('2026-08-07', () => {
      expect(ageFromBirthDate('2030-01-01')).toBeNull(); // futuro
      expect(ageFromBirthDate('1850-01-01')).toBeNull(); // 176 anos
    });
  });
});
