import { describe, it, expect } from 'vitest';
import {
  aggregateCosts, daysInclusive, percentile, pricingAt, pricingStats, rowCostUsd, suggestedPrice, tokensOf,
} from './aiCosts';

/* Auditoria de custos de 2026-09-27 — ver o cabeçalho de aiCosts.js. */

describe('rowCostUsd', () => {
  it('cobra o raciocínio como output e a cache a preço de cache', () => {
    const row = {
      created_at: '2026-09-27T12:00:00Z',
      meta: { input_tokens: 1_000_000, cached_tokens: 400_000, output_tokens: 100_000, thoughts_tokens: 200_000 },
    };
    // 600k × 0,75 + 400k × 0,075 + 300k × 3,75 (por milhão)
    expect(rowCostUsd(row)).toBeCloseTo(0.45 + 0.03 + 1.125, 10);
  });

  it('a partir de 2027 usa a tabela padrão', () => {
    const row = { created_at: '2027-01-02T00:00:00Z', meta: { input_tokens: 1_000_000, output_tokens: 1_000_000, thoughts_tokens: 0 } };
    expect(rowCostUsd(row)).toBeCloseTo(1.5 + 7.5, 10);
    expect(pricingAt('2026-12-31').input).toBe(0.75);
  });

  it('linha antiga sem thoughts_tokens é marcada como legado', () => {
    expect(tokensOf({ input_tokens: 10, output_tokens: 1 }).legacy).toBe(true);
    expect(tokensOf({ input_tokens: 10, output_tokens: 1, thoughts_tokens: 0 }).legacy).toBe(false);
  });

  it('cache maior que o input não gera custo negativo', () => {
    expect(rowCostUsd({ created_at: '2026-09-01', meta: { input_tokens: 10, cached_tokens: 50, thoughts_tokens: 0 } })).toBeGreaterThanOrEqual(0);
  });
});

describe('aggregateCosts', () => {
  const rows = [
    { user_id: 'a', event: 'coach-chat', created_at: '2026-09-10T10:00:00', meta: { input_tokens: 1000, output_tokens: 100, thoughts_tokens: 50 } },
    { user_id: 'a', event: 'analyze-meal', created_at: '2026-09-11T10:00:00', meta: { input_tokens: 500, output_tokens: 50, thoughts_tokens: 0 } },
    { user_id: 'b', event: 'analyze-meal', created_at: '2026-09-11T11:00:00', meta: { input_tokens: 200, output_tokens: 20 } },
    { user_id: 'b', event: 'analyze-meal', created_at: '2026-09-11T12:00:00', meta: {} }, // sem tokens: ignorada
  ];
  const users = [
    { id: 'a', display_name: 'Ana', created_at: '2026-01-01T00:00:00' },
    { id: 'b', display_name: 'Bruno', created_at: '2026-09-11T08:00:00' },
  ];
  const agg = aggregateCosts(rows, { period: { start: '2026-09-01', end: '2026-09-30' }, users });

  it('soma totais, módulos, funções e dias', () => {
    expect(agg.total.calls).toBe(3);
    expect(agg.total.thoughts).toBe(50);
    expect(agg.total.legacyCalls).toBe(1);
    expect(agg.perModule.map(m => m.key).sort()).toEqual(['Carol', 'Nutrição']);
    expect(agg.perEvent.find(e => e.key === 'analyze-meal').calls).toBe(2);
    expect(agg.perDay.map(d => d.day)).toEqual(['2026-09-10', '2026-09-11']);
    expect(agg.periodDays).toBe(30);
  });

  it('projeta o custo mensal só sobre os dias em que a conta existia', () => {
    const a = agg.perUser.find(u => u.userId === 'a');
    const b = agg.perUser.find(u => u.userId === 'b');
    expect(a.name).toBe('Ana');
    expect(a.activeDays).toBe(2);
    expect(a.exposureDays).toBe(30);
    expect(b.exposureDays).toBe(20); // 11 a 30 de setembro
    expect(b.monthlyCost).toBeCloseTo((b.cost / 20) * 30.44, 12);
    expect(agg.perUser[0].userId).toBe('a'); // ordenado por custo
  });
});

describe('preço sugerido', () => {
  it('percentil por interpolação', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([], 0.9)).toBe(0);
    expect(daysInclusive('2026-09-01', '2026-09-01')).toBe(1);
  });

  it('margem, comissão e IVA', () => {
    const p = suggestedPrice(1, { margin: 0.5, commission: 0.2, vat: 0.23 });
    expect(p.net).toBeCloseTo(1 / (0.8 * 0.5), 12);
    expect(p.gross).toBeCloseTo(p.net * 1.23, 12);
    expect(suggestedPrice(1, { margin: 1, commission: 0 })).toBeNull();
  });

  it('estatísticas ignoram linhas sem utilizador', () => {
    const s = pricingStats([{ userId: 'a', monthlyCost: 2 }, { userId: 'b', monthlyCost: 4 }, { userId: '—', monthlyCost: 100 }]);
    expect(s).toMatchObject({ users: 2, mean: 3, median: 3, max: 4 });
  });
});
