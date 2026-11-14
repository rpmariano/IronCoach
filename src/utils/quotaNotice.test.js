import { describe, it, expect } from 'vitest';
import { quotaNotice, isQuotaNoticeActive } from './quotaNotice';

const NOW = Date.UTC(2026, 10, 14, 10, 0);
const MIN = 60 * 1000;

describe('quotaNotice — o aviso expira sozinho (revisão do af9d2cb4)', () => {
  it('limite da hora: vale até agora + retry_after_minutes', () => {
    const n = quotaNotice({ text: 'Tenta outra vez daqui a 12 minutos.', scope: 'hour', retryAfterMinutes: 12, nowMs: NOW, todayISO: '2026-11-14' });
    expect(n).toEqual({ text: 'Tenta outra vez daqui a 12 minutos.', scope: 'hour', until: NOW + 12 * MIN, day: '2026-11-14' });
    expect(isQuotaNoticeActive(n, NOW + 11 * MIN, '2026-11-14')).toBe(true);
    expect(isQuotaNoticeActive(n, NOW + 12 * MIN, '2026-11-14')).toBe(false);
  });

  it('sem os minutos (ou sem scope): uma hora', () => {
    const n = quotaNotice({ text: 'Uma pausa.', scope: null, nowMs: NOW, todayISO: '2026-11-14' });
    expect(n.until).toBe(NOW + 60 * MIN);
  });

  it('limite do dia: até à mudança de dia em Lisboa, mesmo com minutos', () => {
    const n = quotaNotice({ text: 'Por hoje chega.', scope: 'day', retryAfterMinutes: 30, nowMs: NOW, todayISO: '2026-11-14' });
    expect(n.until).toBeNull();
    expect(isQuotaNoticeActive(n, NOW + 10 * 60 * MIN, '2026-11-14')).toBe(true);
    expect(isQuotaNoticeActive(n, NOW + 14 * 60 * MIN, '2026-11-15')).toBe(false);
  });

  it('sem frase não há aviso', () => {
    expect(quotaNotice({ text: '  ', scope: 'hour', nowMs: NOW, todayISO: '2026-11-14' })).toBeNull();
    expect(isQuotaNoticeActive(null, NOW, '2026-11-14')).toBe(false);
  });
});
