import { describe, it, expect } from 'vitest';
import {
  aggregateCosts, daysInclusive, percentile, pricingFor, pricingStats, rowCostUsd, suggestedPrice, tokensOf,
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

  it('preço por modelo real, do prefixo mais específico para o geral', () => {
    const row = (model) => ({ model, created_at: '2026-09-27', meta: { input_tokens: 1_000_000, output_tokens: 1_000_000, thoughts_tokens: 0 } });
    expect(rowCostUsd(row('gemini-3-flash'))).toBeCloseTo(0.5 + 3.0, 10);
    expect(rowCostUsd(row('gemini-3.5-flash'))).toBeCloseTo(1.5 + 9.0, 10);
    expect(rowCostUsd(row('gemini-2.5-flash-lite-preview-06-17'))).toBeCloseTo(0.1 + 0.4, 10);
    expect(pricingFor('models/gemini-3.1-pro', '2026-09-27').input).toBe(2.0);
    expect(pricingFor('gemini-3.8-flash', '2026-09-27')).toMatchObject({ input: 0.75, output: 3.75, cached: 0.075, confirmed: true });
    expect(pricingFor(null, '2026-09-27')).toMatchObject({ input: 0.75, confirmed: false });
    expect(pricingFor('gemini-30-flash', '2026-09-27').confirmed).toBe(false);
    // Variante lite desconhecida não herda o preço confirmado do Flash.
    expect(pricingFor('gemini-3.8-flash-lite', '2026-09-27').confirmed).toBe(false);
  });

  it('a linha Flash 3.x duplica a 01-01-2027, por data da chamada', () => {
    const row = (created_at) => ({ model: 'gemini-3.8-flash', created_at, meta: { input_tokens: 1_000_000, output_tokens: 1_000_000, thoughts_tokens: 0 } });
    expect(rowCostUsd(row('2026-12-31T23:00:00Z'))).toBeCloseTo(0.75 + 3.75, 10);
    expect(rowCostUsd(row('2027-01-01T00:00:00Z'))).toBeCloseTo(1.5 + 7.5, 10);
    expect(pricingFor('gemini-3.7-flash', '2027-02-01').cached).toBe(0.15);
    expect(pricingFor(null, '2027-02-01')).toMatchObject({ input: 1.5, confirmed: false });
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
