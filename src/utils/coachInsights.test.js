import { describe, it, expect } from 'vitest';
import { subDays, format } from 'date-fns';
import { detectCoachInsights } from './biEngine';

/* Insights do Geral — factos reais (2026-10-04):
   - ACWR dito como "1,6× o habitual (+60%)", com vírgula;
   - alertas de gordura com a data da avaliação e calados se tiver >30 dias;
   - "Perda de peso demasiado rápida" só com tendência suficiente (contrato
     de weightTrend: ≥3 pesagens em ≥10 dias, declive por dia × 7). */

const iso = (daysAgo) => format(subDays(new Date(), daysAgo), 'yyyy-MM-dd');

describe('detectCoachInsights — ACWR dito como múltiplo do habitual', () => {
  it('1,6× o habitual (+60%), com vírgula e sem "vezes acima"', () => {
    const runs = [
      { date: iso(3), distance_km: 40 },
      { date: iso(10), distance_km: 20 },
      { date: iso(17), distance_km: 20 },
      { date: iso(24), distance_km: 20 },
    ];
    // aguda 40; crónica (40+60)/4 = 25 → 1,6
    const acwr = detectCoachInsights({ runs }, {}).find((i) => i.id === 'acwr_danger');
    expect(acwr).toBeTruthy();
    expect(acwr.message).toContain('1,6× o habitual (+60%)');
    expect(acwr.message).not.toMatch(/vezes acima|1,60|\d\.\d/);
  });

  it('o aviso de cautela usa vírgula decimal', () => {
    const runs = [
      { date: iso(3), distance_km: 42 },
      { date: iso(10), distance_km: 26 },
      { date: iso(17), distance_km: 26 },
      { date: iso(24), distance_km: 26 },
    ];
    const acwr = detectCoachInsights({ runs }, {}).find((i) => i.id === 'acwr_caution');
    expect(acwr.message).toContain('1,40');
    expect(acwr.message).not.toMatch(/\d\.\d/);
  });
});

describe('detectCoachInsights — gordura com data e só se a avaliação for recente', () => {
  it('gordura corporal baixa: diz a data da avaliação', () => {
    const d = iso(5);
    const bf = detectCoachInsights({ bodyAssessments: [{ date: d, weight_kg: 70, body_fat_pct: 5.5 }] }, { gender: 'M' })
      .find((i) => i.id === 'bf_low');
    expect(bf).toBeTruthy();
    const dia = Number(d.slice(8, 10));
    expect(bf.message).toMatch(new RegExp(`^Na avaliação de ${dia} [a-z]{3}, a tua gordura corporal estava em 5,5%`));
  });

  it('avaliação com mais de 30 dias: não alerta (nem gordura corporal nem visceral)', () => {
    const velha = [{ date: iso(31), weight_kg: 70, body_fat_pct: 5, visceral_fat: 16 }];
    const ids = detectCoachInsights({ bodyAssessments: velha }, { gender: 'M' }).map((i) => i.id);
    expect(ids).not.toContain('bf_low');
    expect(ids).not.toContain('visceral_high');
    expect(ids).not.toContain('visceral_alert');
  });

  it('avaliação com exatamente 30 dias ainda conta', () => {
    const ids = detectCoachInsights({ bodyAssessments: [{ date: iso(30), weight_kg: 70, body_fat_pct: 5 }] }, { gender: 'M' }).map((i) => i.id);
    expect(ids).toContain('bf_low');
  });

  it('gordura visceral: a mensagem diz a data', () => {
    const v = detectCoachInsights({ bodyAssessments: [{ date: iso(2), weight_kg: 70, body_fat_pct: 20, visceral_fat: 12 }] }, { gender: 'M' })
      .find((i) => i.id === 'visceral_alert');
    expect(v.message).toMatch(/^Na avaliação de \d{1,2} [a-z]{3}, a tua gordura visceral estava em 12/);
  });
});

describe('detectCoachInsights — "Perda de peso demasiado rápida" usa o contrato do weightTrend', () => {
  it('com 3 pesagens em 12 dias a cair 6 kg, alerta com vírgula decimal', () => {
    const bodyAssessments = [
      { date: iso(12), weight_kg: 80 },
      { date: iso(6), weight_kg: 77 },
      { date: iso(0), weight_kg: 74 },
    ];
    const loss = detectCoachInsights({ bodyAssessments }, { experience_level: 'medio' }).find((i) => i.id === 'weight_loss_fast');
    expect(loss).toBeTruthy();
    expect(loss.message).toContain('~3,5 kg/semana');
    expect(loss.message).toMatch(/^Nas duas semanas até à pesagem de \d{1,2} [a-z]{3} estás a perder/);
    expect(loss.message).not.toMatch(/\d\.\d/);
  });

  it('2 pesagens com 3 dias e −2 kg não chegam: não há alerta (antes: "2 kg/semana")', () => {
    const bodyAssessments = [
      { date: iso(3), weight_kg: 80 },
      { date: iso(0), weight_kg: 78 },
    ];
    expect(detectCoachInsights({ bodyAssessments }, {}).find((i) => i.id === 'weight_loss_fast')).toBeUndefined();
  });

  it('pesagens espaçadas (80 → 74 em 3 meses, nenhuma na janela) não dão alerta', () => {
    const bodyAssessments = [
      { date: iso(90), weight_kg: 80 },
      { date: iso(0), weight_kg: 74 },
    ];
    expect(detectCoachInsights({ bodyAssessments }, {}).find((i) => i.id === 'weight_loss_fast')).toBeUndefined();
  });

  it('pesagens velhas (há 112, 106 e 100 dias, 80 → 74): sem alerta, é um facto de há 3 meses', () => {
    const bodyAssessments = [
      { date: iso(112), weight_kg: 80 },
      { date: iso(106), weight_kg: 77 },
      { date: iso(100), weight_kg: 74 },
    ];
    expect(detectCoachInsights({ bodyAssessments }, { experience_level: 'medio' }).find((i) => i.id === 'weight_loss_fast')).toBeUndefined();
  });

  it('última pesagem há 14 dias ainda alerta (diz a data); há 15 já não', () => {
    const serie = (fim) => [
      { date: iso(fim + 12), weight_kg: 80 },
      { date: iso(fim + 6), weight_kg: 77 },
      { date: iso(fim), weight_kg: 74 },
    ];
    expect(detectCoachInsights({ bodyAssessments: serie(14) }, { experience_level: 'medio' }).find((i) => i.id === 'weight_loss_fast')).toBeTruthy();
    expect(detectCoachInsights({ bodyAssessments: serie(15) }, { experience_level: 'medio' }).find((i) => i.id === 'weight_loss_fast')).toBeUndefined();
  });

  it('3 pesagens em 12 dias mas a perda é lenta: sem alerta', () => {
    const bodyAssessments = [
      { date: iso(12), weight_kg: 80 },
      { date: iso(6), weight_kg: 79.8 },
      { date: iso(0), weight_kg: 79.6 },
    ];
    expect(detectCoachInsights({ bodyAssessments }, {}).find((i) => i.id === 'weight_loss_fast')).toBeUndefined();
  });
});
