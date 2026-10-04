import { describe, it, expect, beforeEach } from 'vitest';
import { buildBodyView, bodyPeriodName, resetBodyViewMemo, BODY_DELTA_MIN_SPAN_DAYS } from './body';
import { getEvolutionViewDef } from '../registry';
import { calendarPeriod } from '@formulas/calendarPeriod.ts';

/* Vista do Corpo (2026-10-04, fase 5 — plano §3 Corpo, D1; C1–C5). Períodos
   de calendário em que HOJE CONTA (uma avaliação é um facto fechado), última
   leitura do período com data, ▲/▼ face ao anterior só acima do ruído e com
   ≥14 dias entre leituras, ritmo do peso só com pesagens que cheguem,
   composição só com avaliações válidas. Hoje: domingo, 4 out 2026. */

const HOJE = '2026-10-04';
let seq = 0;
const av = (date, over = {}) => ({ id: `a${seq++}`, date, ...over });

const DADOS = [
  av('2026-07-05', { weight_kg: 80, body_fat_pct: 22 }),
  av('2026-08-02', { weight_kg: 79, body_fat_pct: 21.5 }),
  av('2026-09-01', { weight_kg: 77.8 }),
  av('2026-09-10', { weight_kg: 77.5 }),
  av('2026-09-15', { weight_kg: 77.3 }),
  av('2026-09-20', { weight_kg: 77.0, body_fat_pct: 20, muscle_mass_kg: 58 }),
  av('2026-09-24', { weight_kg: 76.8 }),
  av('2026-09-28', { weight_kg: 76.6 }),
  av('2026-10-01', { weight_kg: 76.4 }),
  av(HOJE, { weight_kg: 76.2 }), // hoje conta
];

const view = (kind, offset = 0, { list = DADOS, profile = {}, gym = [], today = HOJE } = {}) =>
  buildBodyView([list, profile, gym], { kind, offset }, today);
const rowOf = (v, key) => v.rows.find((r) => r.key === key);

beforeEach(() => resetBodyViewMemo());

describe('registo', () => {
  it('regista a vista "corpo" com avaliações, perfil e ginásio', () => {
    const def = getEvolutionViewDef('corpo');
    expect(def).toBeTruthy();
    expect(def.deps({ bodyAssessments: [1], profile: { a: 1 }, gymSessions: [2], meals: [3] })).toEqual([[1], { a: 1 }, [2]]);
  });
});

describe('hoje conta e cada métrica mostra a última leitura do período, com data', () => {
  it('outubro em curso: 1 e 4 out (hoje entra)', () => {
    const v = view('mes');
    expect(v.count).toBe(2);
    expect(rowOf(v, 'weight_kg').last).toEqual({ value: 76.2, date: HOJE });
    expect(v.label.coverage).toBe('em curso · 2 avaliações');
  });

  it('métrica sem leitura no período: sem valor, mas com a última de sempre e a data (C5)', () => {
    const r = rowOf(view('mes'), 'body_fat_pct');
    expect(r.last).toBeNull();
    expect(r.lastBefore).toEqual({ value: 20, date: '2026-09-20' });
  });

  it('esconde as métricas nunca registadas', () => {
    const v = view('mes');
    expect(v.metricKeys).toEqual(['weight_kg', 'body_fat_pct', 'muscle_mass_kg']);
    expect(v.rows.map((r) => r.key)).not.toContain('bone_mass_kg');
  });

  it('semana em curso (28 set – 4 out) com 3 avaliações, a de hoje incluída', () => {
    const v = view('semana');
    expect(v.count).toBe(3);
    expect(v.emptyCurrent).toBe(false);
  });
});

describe('▲/▼ face ao período anterior (R5): ruído e 14 dias', () => {
  /* 2026-10-04, revisão (corpo-delta-ruido-14dias): os 14 dias são do
     HISTÓRICO da métrica (1.ª → última leitura), não entre as duas leituras
     comparadas — numa semana estas nunca passam de 13 dias. */
  it('histórico da métrica com menos de 14 dias: sem diferença (e diz-se porquê)', () => {
    const list = [av('2026-09-25', { weight_kg: 77 }), av('2026-10-02', { weight_kg: 76 })];
    const v = view('mes', 0, { list });
    expect(rowOf(v, 'weight_kg').cmp).toBeNull();
    expect(rowOf(v, 'weight_kg').withheld).toBe('span');
    expect(v.withheldSpan).toBe(true);
  });

  it('semana em curso vs semana passada: há ▲/▼ (4 out vs 24 set, −0,6 kg acima do ruído)', () => {
    const r = rowOf(view('semana'), 'weight_kg');
    expect(r.withheld).toBeNull();
    expect(r.prevLast).toEqual({ value: 76.8, date: '2026-09-24' });
    expect(r.cmp.direction).toBe('down');
    expect(r.cmp.diff).toBeCloseTo(-0.6, 5);
    expect(r.cmp.spanDays).toBe(10);
  });

  it('outubro em curso vs setembro: −0,4 kg fica abaixo do ruído → "igual"', () => {
    const v = view('mes');
    expect(rowOf(v, 'weight_kg').cmp.direction).toBe('flat');
    expect(v.withheldSpan).toBe(false);
    expect(v.anyFlat).toBe(true);
  });

  it('setembro vs agosto: −2,4 kg; sem objetivo, o peso fica neutro', () => {
    const r = rowOf(view('mes', -1), 'weight_kg');
    expect(r.last).toEqual({ value: 76.6, date: '2026-09-28' });
    expect(r.prevLast).toEqual({ value: 79, date: '2026-08-02' });
    expect(r.cmp.diff).toBeCloseTo(-2.4, 5);
    expect(r.cmp.direction).toBe('down');
    expect(r.cmp.tone).toBe('neutral');
    expect(r.cmp.spanDays).toBeGreaterThanOrEqual(BODY_DELTA_MIN_SPAN_DAYS);
  });

  it('com objetivo de peso abaixo, descer é bom; acima, é mau', () => {
    expect(rowOf(view('mes', -1, { profile: { goal_weight_kg: 72 } }), 'weight_kg').cmp.tone).toBe('good');
    expect(rowOf(view('mes', -1, { profile: { goal_weight_kg: 82 } }), 'weight_kg').cmp.tone).toBe('bad');
  });

  it('gordura −1,5 pontos: acima do ruído (1) e no bom sentido', () => {
    const r = rowOf(view('mes', -1), 'body_fat_pct');
    expect(r.cmp.direction).toBe('down');
    expect(r.cmp.tone).toBe('good');
  });

  it('abaixo do limiar de ruído é "igual" (flat), não uma seta', () => {
    const list = [av('2026-08-01', { body_fat_pct: 20 }), av('2026-09-15', { body_fat_pct: 20.6 })];
    const v = view('mes', -1, { list });
    expect(rowOf(v, 'body_fat_pct').cmp.direction).toBe('flat');
    expect(rowOf(v, 'body_fat_pct').cmp.tone).toBe('neutral');
    expect(v.anyFlat).toBe(true);
  });

  it('nome do anterior: "setembro", "semana passada", "jul – set", "2025"', () => {
    expect(bodyPeriodName(calendarPeriod('mes', HOJE, -1), HOJE)).toBe('setembro');
    expect(bodyPeriodName(calendarPeriod('semana', HOJE, -1), HOJE)).toBe('semana passada');
    expect(bodyPeriodName(calendarPeriod('trimestre', HOJE, -1), HOJE)).toBe('jul – set');
    expect(bodyPeriodName(calendarPeriod('ano', HOJE, -1), HOJE)).toBe('2025');
    expect(view('mes').prevName).toBe('setembro');
  });
});

describe('peso: ritmo com dados que cheguem (C1/C2), estável, perigo só para perda', () => {
  it('setembro: 4 pesagens nos 14 dias até 28 set → ritmo calculado, sem perigo', () => {
    const w = view('mes', -1).weight;
    expect(w.latest).toEqual({ date: '2026-09-28', weight: 76.6 });
    expect(w.sufficient).toBe(true);
    expect(w.rate).toBeLessThan(0);
    expect(w.loss.isTooFast).toBe(false);
  });

  it('2 pesagens a 3 dias (sem mais histórico): sem ritmo', () => {
    const list = [av('2026-10-01', { weight_kg: 80 }), av(HOJE, { weight_kg: 80.6 })];
    const w = view('mes', 0, { list }).weight;
    expect(w.sufficient).toBe(false);
    expect(w.rate).toBeNull();
  });

  /* 2026-10-04, revisão (C1/C2): o ritmo é o do fim do período, com as
     pesagens de antes — só com as do período, a semana nunca tinha ritmo. */
  it('semana em curso: ritmo com o histórico (5 pesagens em 14 dias até 4 out)', () => {
    const w = view('semana').weight;
    expect(w.points).toHaveLength(3);
    expect(w.trend.pointsInWindow).toBe(5);
    expect(w.trend.spanDays).toBe(14);
    expect(w.sufficient).toBe(true);
    expect(w.rate).toBeCloseTo(-0.4, 1);
    expect(w.recent).toBe(true);
    // A linha entra pela esquerda com o ponto de antes do período.
    expect(w.line.map((p) => p.date)).toEqual(['2026-09-24', '2026-09-28', '2026-10-01', HOJE]);
  });

  it('outubro em curso a 4 out: o veredicto já tem ritmo, sem pedir pesagens', () => {
    const v = view('mes').verdict;
    expect(v.text).toBe('O peso desce 0,4 kg por semana. Sem gordura medida, não sei se é gordura ou massa magra.');
    expect(v.text).not.toContain('Preciso');
  });

  it('semana fechada com 7 pesagens diárias e nada antes: pede espaço, não "três pesagens"', () => {
    const list = ['21', '22', '23', '24', '25', '26', '27'].map((d, i) => av(`2026-09-${d}`, { weight_kg: 80 - i * 0.3 }));
    const v = view('semana', -1, { list });
    expect(v.weight.sufficient).toBe(false);
    expect(v.verdict.text).toContain('Tenho sete pesagens na semana passada');
    expect(v.verdict.text).toContain('nas duas semanas até à última há 7, em 6 dias');
    expect(v.verdict.text).not.toContain('três pesagens');
  });

  it('ano em curso com pesagens só de março: passado, com a data, e aviso em vez de perigo', () => {
    const list = ['2026-03-01', '2026-03-05', '2026-03-09', '2026-03-13'].map((d, i) => av(d, { weight_kg: 80 - i * 1.3 }));
    const v = view('ano', 0, { list });
    expect(v.weight.recent).toBe(false);
    expect(v.weight.loss.isTooFast).toBe(true);
    expect(v.verdict.tone).toBe('warn');
    expect(v.verdict.text.startsWith('Até 13 mar perdias peso depressa demais')).toBe(true);
  });

  it('|ritmo| < 0,05 kg/semana com dados suficientes → estável', () => {
    const list = ['2026-09-14', '2026-09-19', '2026-09-24', '2026-09-28'].map((d) => av(d, { weight_kg: 75 }));
    const w = view('mes', -1, { list }).weight;
    expect(w.sufficient).toBe(true);
    expect(w.stable).toBe(true);
  });

  it('perder 1,5 kg/semana é demasiado depressa (em % do peso); ganhar o mesmo não', () => {
    const desce = ['2026-09-14', '2026-09-19', '2026-09-24', '2026-09-28'].map((d, i) => av(d, { weight_kg: 80 - i * 1.05 }));
    const sobe = ['2026-09-14', '2026-09-19', '2026-09-24', '2026-09-28'].map((d, i) => av(d, { weight_kg: 80 + i * 1.05 }));
    const a = view('mes', -1, { list: desce });
    const b = view('mes', -1, { list: sobe });
    expect(a.weight.loss.isTooFast).toBe(true);
    expect(b.weight.loss).toBeNull();
    // Num período fechado, o veredicto conta a história em aviso, não em perigo.
    expect(a.verdict.tone).toBe('warn');
    expect(b.verdict.tone).not.toBe('danger');
  });
});

describe('composição só com avaliações válidas (C3)', () => {
  it('setembro: só a de 20 set tem gordura', () => {
    const c = view('mes', -1).composition;
    expect(c.dates).toEqual(['2026-09-20']);
  });

  it('trimestre jul – set: 3 avaliações com gordura', () => {
    const c = view('trimestre', -1).composition;
    expect(c.dates).toEqual(['2026-07-05', '2026-08-02', '2026-09-20']);
  });
});

describe('cobertura, "desde" e primeiro período (R7)', () => {
  it('jul – set começa antes do 1.º registo: "desde 5 jul · 8 avaliações"', () => {
    const v = view('trimestre', -1);
    expect(v.label.coverage).toBe('desde 5 jul · 8 avaliações');
    expect(v.firstPeriod).toBe(true);
  });

  it('um período antes da 1.ª avaliação', () => {
    const v = view('trimestre', -2);
    expect(v.beforeFirst).toBe(true);
    expect(v.label.coverage).toBe('antes da primeira avaliação');
    expect(v.count).toBe(0);
  });
});

describe('período a começar (R8)', () => {
  it('segunda 5 out sem avaliação: vazio, acabado de começar, com o resumo da semana passada', () => {
    const v = view('semana', 0, { today: '2026-10-05' });
    expect(v.emptyCurrent).toBe(true);
    expect(v.justStarted).toBe(true);
    expect(v.previousSummary).toEqual({
      name: 'semana passada',
      range: '28 set – 4 out',
      count: 3,
      lastWeight: { value: 76.2, date: HOJE },
    });
    expect(v.verdict.text).toBe('Ainda sem avaliações nesta semana. A última pesagem foi a 4 out: 76,2 kg.');
  });

  it('uma pesagem feita hoje, segunda, já enche a semana', () => {
    const v = view('semana', 0, { today: '2026-10-05', list: [...DADOS, av('2026-10-05', { weight_kg: 76 })] });
    expect(v.emptyCurrent).toBe(false);
    expect(v.count).toBe(1);
  });
});

describe('veredicto coerente com o período', () => {
  it('setembro (fechado) fala no passado e diz "em setembro"', () => {
    const v = view('mes', -1).verdict;
    expect(v.text.startsWith('Em setembro, ')).toBe(true);
    expect(v.text).toMatch(/desceu|esteve/);
  });

  it('só 2 pesagens no histórico: diz o que falta, sem tendência inventada', () => {
    const list = [av('2026-10-01', { weight_kg: 76.4 }), av(HOJE, { weight_kg: 76.2 })];
    const v = view('mes', 0, { list }).verdict;
    expect(v.tone).toBe('neutral');
    expect(v.text).toContain('Tenho duas pesagens em outubro');
    expect(v.text).toContain('três pesagens');
  });

  it('trimestre fechado diz-se pelo número ("No 3.º trimestre"), não "Em jul – set 2026"', () => {
    expect(view('trimestre', -1).where).toBe('no 3.º trimestre');
    expect(view('trimestre', -1).verdict.text.startsWith('No 3.º trimestre, ')).toBe(true);
    expect(view('trimestre', -5).where).toBe('no 3.º trimestre de 2025');
  });

  it('período antes da 1.ª avaliação: diz-o com a data, não o "não tenho dados" genérico', () => {
    expect(view('trimestre', -2).verdict).toEqual({ text: 'Este trimestre é anterior à tua primeira avaliação (5 jul).', tone: 'neutral' });
  });
});

describe('eixo dos gráficos', () => {
  it('período em curso: até hoje; fechado: até ao fim', () => {
    const q = view('trimestre');
    expect(q.axisEnd).toBe(HOJE);
    expect(q.axisToToday).toBe(true);
    const s = view('mes', -1);
    expect(s.axisEnd).toBe('2026-09-30');
    expect(s.axisToToday).toBe(false);
  });

  it('período que começa hoje: o período inteiro (um eixo de um dia não tem largura)', () => {
    const v = view('semana', 0, { today: '2026-10-05', list: [...DADOS, av('2026-10-05', { weight_kg: 76 })] });
    expect(v.axisEnd).toBe('2026-10-11');
  });
});

describe('Dia = avaliação (D1)', () => {
  it('devolve todas as avaliações por ordem cronológica, sem período', () => {
    const shuffled = [DADOS[3], DADOS[0], DADOS[9], DADOS[5]];
    const v = view('dia', 0, { list: shuffled });
    expect(v.assessments.map((a) => a.date)).toEqual(['2026-07-05', '2026-09-10', '2026-09-20', HOJE]);
    expect(v.period).toBeUndefined();
  });
});
