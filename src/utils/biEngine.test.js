import { describe, it, expect } from 'vitest';
import { subDays, format } from 'date-fns';
import { detectCoachInsights } from './biEngine';

// Datas relativas a "agora" — daysAgo negativo devolve uma data futura
// (útil para simular uma prova agendada).
const iso = (daysAgo) => format(subDays(new Date(), daysAgo), 'yyyy-MM-dd');

// detectCoachInsights() é o motor por trás da "memória proativa" da Carol:
// corre em useMemo no Dashboard (ver Dashboard.jsx) sobre o estado global
// (runs/gymSessions/meals/bodyAssessments/raceEvents), por isso qualquer
// registo novo faz o React recalcular estes insights automaticamente — sem
// pedido explícito nem refresh manual. O resultado alimenta o botão
// flutuante + persiana (CoachInsightButton/CoachInsightModal). Estes testes
// cobrem os limiares da doutrina, não a UI.
describe('detectCoachInsights', () => {
  it('devolve lista vazia sem dados', () => {
    expect(detectCoachInsights({}, {})).toEqual([]);
  });

  it('não rebenta com dados malformados — devolve lista vazia em vez de atirar erro', () => {
    expect(detectCoachInsights({ runs: null, bodyAssessments: 'x' }, null)).toEqual([]);
  });

  describe('ACWR — carga de treino', () => {
    it('alerta crítico quando a carga aguda triplica a crónica', () => {
      const runs = [
        { date: iso(3), duration_seconds: 6000, effort_rpe: 9 },  // 100min×9 = 900 (semana aguda)
        { date: iso(15), duration_seconds: 3600, effort_rpe: 5 }, // 60min×5 = 300 (base crónica)
      ];
      const insights = detectCoachInsights({ runs }, { experience_level: 'medio' });
      const acwr = insights.find((i) => i.id === 'acwr_danger');
      expect(acwr).toBeTruthy();
      expect(acwr.severity).toBe('critical');
      expect(acwr.module).toBe('corrida');
      expect(acwr.value).toBeCloseTo(3.0, 1);
    });

    it('alerta de cautela quando o rácio fica mesmo acima do limiar de perigo', () => {
      const runs = [
        { date: iso(3), duration_seconds: 3588, effort_rpe: 10 },  // 59.8min×10 = 598 (aguda)
        { date: iso(15), duration_seconds: 10020, effort_rpe: 6 }, // 167min×6 = 1002 (base)
      ];
      // ratio = 598 / ((598+1002)/4) = 598/400 = 1.495 — dentro da janela estreita de cautela
      const insights = detectCoachInsights({ runs }, {});
      const acwr = insights.find((i) => i.id === 'acwr_caution');
      expect(acwr).toBeTruthy();
      expect(acwr.severity).toBe('warning');
    });

    it('não alerta sem histórico suficiente (todas as corridas na última semana)', () => {
      const runs = [
        { date: iso(1), duration_seconds: 6000, effort_rpe: 9 },
        { date: iso(3), duration_seconds: 6000, effort_rpe: 9 },
      ];
      const insights = detectCoachInsights({ runs }, {});
      expect(insights.find((i) => i.id === 'acwr_danger' || i.id === 'acwr_caution')).toBeUndefined();
    });
  });

  describe('Composição corporal', () => {
    it('alerta crítico quando a gordura corporal está abaixo do limiar masculino', () => {
      const bodyAssessments = [{ date: iso(0), weight_kg: 70, body_fat_pct: 5 }];
      const insights = detectCoachInsights({ bodyAssessments }, { gender: 'M' });
      const bf = insights.find((i) => i.id === 'bf_low');
      expect(bf).toBeTruthy();
      expect(bf.severity).toBe('critical');
    });

    it('usa o limiar feminino quando o perfil é F', () => {
      // 15% está acima do limiar masculino (8%) mas abaixo do feminino (16%)
      const bodyAssessments = [{ date: iso(0), weight_kg: 60, body_fat_pct: 15 }];
      expect(detectCoachInsights({ bodyAssessments }, { gender: 'M' }).find((i) => i.id === 'bf_low')).toBeUndefined();
      expect(detectCoachInsights({ bodyAssessments }, { gender: 'F' }).find((i) => i.id === 'bf_low')).toBeTruthy();
    });

    it('alerta de aviso quando a gordura visceral está acima do limiar', () => {
      const bodyAssessments = [{ date: iso(0), weight_kg: 70, body_fat_pct: 20, visceral_fat: 15 }];
      const insights = detectCoachInsights({ bodyAssessments }, { gender: 'M' });
      const visceral = insights.find((i) => i.id === 'visceral_high');
      expect(visceral).toBeTruthy();
      expect(visceral.severity).toBe('warning');
    });

    it('alerta quando a perda de peso semanal excede o máximo seguro do nível', () => {
      // 80kg → 72kg em 9 dias, ~1kg/dia — bem acima do teto de 0,5%/semana (nível médio)
      const bodyAssessments = Array.from({ length: 9 }, (_, i) => ({
        date: iso(9 - i),
        weight_kg: 80 - i,
      }));
      const insights = detectCoachInsights({ bodyAssessments }, { experience_level: 'medio' });
      const loss = insights.find((i) => i.id === 'weight_loss_fast');
      expect(loss).toBeTruthy();
      expect(loss.severity).toBe('warning');
    });

    it('não alerta perda de peso com um único registo (sem tendência calculável)', () => {
      const bodyAssessments = [{ date: iso(0), weight_kg: 70 }];
      const insights = detectCoachInsights({ bodyAssessments }, {});
      expect(insights.find((i) => i.id === 'weight_loss_fast')).toBeUndefined();
    });
  });

  describe('Disponibilidade energética (RED-S)', () => {
    it('alerta crítico com défice calórico sustentado ≥5 dias', () => {
      // 1000 kcal/dia de ingestão, sem exercício, massa magra 50kg → EA=20 (<30 crítico)
      const meals = Array.from({ length: 5 }, (_, i) => ({
        date: iso(i + 1),
        meal_items: [{ quantity_grams: 500, calories_per_100g: 200 }],
      }));
      const bodyAssessments = [{ date: iso(1), weight_kg: 65, lean_body_mass_kg: 50 }];
      const insights = detectCoachInsights({ meals, bodyAssessments, runs: [], gymSessions: [] }, {});
      const reds = insights.find((i) => i.id === 'reds_risk');
      expect(reds).toBeTruthy();
      expect(reds.severity).toBe('critical');
    });

    it('não alerta com ingestão calórica suficiente', () => {
      const meals = Array.from({ length: 5 }, (_, i) => ({
        date: iso(i + 1),
        meal_items: [{ quantity_grams: 1200, calories_per_100g: 200 }], // 2400 kcal/dia
      }));
      const bodyAssessments = [{ date: iso(1), weight_kg: 65, lean_body_mass_kg: 50 }];
      const insights = detectCoachInsights({ meals, bodyAssessments, runs: [], gymSessions: [] }, {});
      expect(insights.find((i) => i.id === 'reds_risk')).toBeUndefined();
    });
  });

  describe('Volume para prova', () => {
    it('alerta quando o volume semanal médio é insuficiente para a próxima prova', () => {
      const runs = [1, 8, 15, 22].map((daysAgo) => ({
        date: iso(daysAgo),
        distance_km: 10,
        duration_seconds: 3600,
      }));
      const raceEvents = [{
        status: 'agendada',
        date: iso(-30), // daqui a 30 dias
        distance_km: 42,
        name: 'Maratona Teste',
      }];
      const insights = detectCoachInsights({ runs, raceEvents }, {});
      const vol = insights.find((i) => i.id === 'race_volume');
      expect(vol).toBeTruthy();
      expect(vol.severity).toBe('warning');
      expect(vol.title).toContain('Maratona Teste');
      expect(vol.value).toBeCloseTo(10, 0);
    });

    it('alerta sobre a reta final quando faltam poucos dias para a prova', () => {
      const raceEvents = [{
        id: 'ev-1',
        status: 'agendada',
        date: iso(-5), // daqui a 5 dias
        distance_km: 21,
        name: 'Meia Maratona',
      }];
      const insights = detectCoachInsights({ runs: [], raceEvents }, {});
      const finalWeek = insights.find((i) => i.id === 'race_final_week_ev-1');
      expect(finalWeek).toBeTruthy();
      expect(finalWeek.severity).toBe('warning');
      expect(finalWeek.title).toContain('Reta Final');
      expect(finalWeek.message).toContain('Meia Maratona');
    });

    it('alerta sobre a fase de polimento (tapering)', () => {
      const raceEvents = [{
        id: 'ev-2',
        status: 'agendada',
        date: iso(-12), // daqui a 12 dias para meia maratona
        distance_km: 21,
        name: 'Meia Maratona',
      }];
      const insights = detectCoachInsights({ runs: [], raceEvents }, {});
      const taper = insights.find((i) => i.id === 'race_tapering_ev-2');
      expect(taper).toBeTruthy();
      expect(taper.title).toContain('Polimento');
    });

    it('não alerta quando não há provas futuras agendadas', () => {
      const runs = [{ date: iso(1), distance_km: 5, duration_seconds: 1800 }];
      const insights = detectCoachInsights({ runs, raceEvents: [] }, {});
      expect(insights.find((i) => i.id === 'race_volume')).toBeUndefined();
    });
  });

  describe('desgaste das sapatilhas', () => {
    const shoe = (over = {}) => ({
      id: 'shoe-1', brand: 'Nike', model: 'Pegasus 40',
      initial_km: 0, lifespan_km: 700, status: 'ativa', ...over,
    });
    const runsWith = (km) => [{ date: iso(1), shoe_id: 'shoe-1', distance_km: km }];

    it('não diz nada sobre um par ainda em bom estado', () => {
      const insights = detectCoachInsights({ shoes: [shoe()], runs: runsWith(200) }, { weight_kg: 70 });
      expect(insights.find((i) => i.id.startsWith('shoe_wear_'))).toBeUndefined();
    });

    it('não gasta um insight no patamar intermédio (75%) — isso é só a barra do armário', () => {
      const insights = detectCoachInsights({ shoes: [shoe()], runs: runsWith(550) }, { weight_kg: 70 });
      expect(insights.find((i) => i.id.startsWith('shoe_wear_'))).toBeUndefined();
    });

    it('avisa quando o par está perto do fim', () => {
      const insights = detectCoachInsights({ shoes: [shoe()], runs: runsWith(650) }, { weight_kg: 70 });
      const found = insights.find((i) => i.id === 'shoe_wear_shoe-1');
      expect(found).toBeTruthy();
      expect(found.severity).toBe('info');
      expect(found.message).toContain('Nike Pegasus 40');
    });

    it('sobe a severidade quando a vida útil já foi excedida', () => {
      const insights = detectCoachInsights({ shoes: [shoe()], runs: runsWith(800) }, { weight_kg: 70 });
      const found = insights.find((i) => i.id === 'shoe_wear_shoe-1');
      expect(found.severity).toBe('warning');
      expect(found.title).toBe('Sapatilhas fora de prazo');
    });

    it('o peso do atleta antecipa o aviso no mesmo par e nos mesmos km', () => {
      const runs = runsWith(600);
      const leve = detectCoachInsights({ shoes: [shoe()], runs }, { weight_kg: 60 });
      const pesado = detectCoachInsights({ shoes: [shoe()], runs }, { weight_kg: 95 });
      expect(leve.find((i) => i.id === 'shoe_wear_shoe-1')).toBeUndefined();
      expect(pesado.find((i) => i.id === 'shoe_wear_shoe-1').severity).toBe('warning');
    });

    it('ignora pares aposentados', () => {
      const insights = detectCoachInsights(
        { shoes: [shoe({ status: 'aposentada' })], runs: runsWith(900) }, { weight_kg: 70 },
      );
      expect(insights.find((i) => i.id.startsWith('shoe_wear_'))).toBeUndefined();
    });

    it('avisa só sobre o par mais gasto, para não enterrar os outros insights', () => {
      const shoes = [shoe({ id: 'a' }), shoe({ id: 'b' })];
      const runs = [
        { date: iso(1), shoe_id: 'a', distance_km: 690 },
        { date: iso(1), shoe_id: 'b', distance_km: 660 },
      ];
      const found = detectCoachInsights({ shoes, runs }, { weight_kg: 70 })
        .filter((i) => i.id.startsWith('shoe_wear_'));
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe('shoe_wear_a');
    });

    it('não avisa sobre um par sem vida útil definida, por muitos km que leve', () => {
      const insights = detectCoachInsights(
        { shoes: [shoe({ lifespan_km: null })], runs: runsWith(2000) }, { weight_kg: 70 },
      );
      expect(insights.find((i) => i.id.startsWith('shoe_wear_'))).toBeUndefined();
    });
  });

  it('ordena os insights por severidade: critical > warning > info', () => {
    const runs = [
      { date: iso(3), duration_seconds: 6000, effort_rpe: 9 },
      { date: iso(15), duration_seconds: 3600, effort_rpe: 5 },
    ];
    const bodyAssessments = [{ date: iso(0), weight_kg: 70, body_fat_pct: 20, visceral_fat: 15 }];
    const insights = detectCoachInsights({ runs, bodyAssessments }, { gender: 'M' });
    expect(insights.length).toBeGreaterThanOrEqual(2);
    const order = { critical: 0, warning: 1, info: 2 };
    for (let i = 1; i < insights.length; i++) {
      expect(order[insights[i].severity]).toBeGreaterThanOrEqual(order[insights[i - 1].severity]);
    }
  });
});
