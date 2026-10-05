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

const view = (kind, offset = 0, { list = DADOS, profile = {}, gym = [], today = HOJE, goals = [] } = {}) =>
  buildBodyView([list, profile, gym, goals], { kind, offset }, today);
const rowOf = (v, key) => v.rows.find((r) => r.key === key);

beforeEach(() => resetBodyViewMemo());

describe('registo', () => {
  it('regista a vista "corpo" com avaliações, perfil, ginásio e histórico de objetivos', () => {
    const def = getEvolutionViewDef('corpo');
    expect(def).toBeTruthy();
    expect(def.deps({ bodyAssessments: [1], profile: { a: 1 }, gymSessions: [2], meals: [3], goalHistory: [4] })).toEqual([[1], { a: 1 }, [2], [4]]);
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
    expect(v.verdict.text).toBe('Tenho sete pesagens na semana passada, de 80,0 a 78,2 kg; nas duas semanas até à última havia 7, em 6 dias — para a tendência eram precisos pelo menos 10 dias entre a primeira e a última.');
    expect(v.verdict.text).not.toContain('três pesagens');
    // Período fechado: nada de "o que falta" (já não se completa).
    expect(v.weight.need).toBeNull();
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

  /* 2026-10-05: duas pesagens dizem o facto (a estimativa) e o que falta em
     concreto — nunca "preciso de três pesagens" ao lado de um gráfico com direção. */
  it('só 2 pesagens no histórico: o facto, "estimativa pouco fiável" e quando chega a 3.ª', () => {
    const list = [av('2026-10-01', { weight_kg: 76.4 }), av(HOJE, { weight_kg: 76.2 })];
    const v = view('mes', 0, { list }).verdict;
    expect(v.tone).toBe('neutral');
    // −0,2 kg fica abaixo do ruído da balança: "quase não mexeu", não "desceste".
    expect(v.text).toBe('Entre a primeira e a última pesagem o peso quase não mexeu: 76,4 e 76,2 kg, em 3 dias. Com só duas pesagens é uma estimativa pouco fiável — mais uma pesagem entre 11 e 15 out e passo a dar-te a tendência a sério.');
    expect(v.text).not.toContain('três pesagens');
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

/* 2026-10-05: barras do resumo = caminho até ao objetivo; estimativa com
   poucas pesagens; o que falta em concreto; onde estão os dados (C4/C6). */
describe('caminho até ao objetivo (barras)', () => {
  it('sem objetivo: sem `progress`', () => {
    expect(rowOf(view('mes'), 'weight_kg').progress).toBeNull();
  });

  it('com objetivo e sem histórico dos objetivos do corpo: desde a 1.ª leitura dos últimos 90 dias, aproximado', () => {
    const p = rowOf(view('mes', 0, { profile: { goal_weight_kg: 74 } }), 'weight_kg').progress;
    // 5 jul fica a 91 dias: parte de 79 (2 ago) → 76,2 (hoje) a caminho de 74: 2,8 de 5 = 56%.
    expect(p).toMatchObject({ start: { date: '2026-08-02', value: 79 }, remaining: 2.2, pct: 56, approx: 'sem_historico' });
  });

  /* Revisão de 2026-10-05: com a 1.ª leitura de sempre do lado errado (2024),
     a barra dizia "objetivo atingido" a 77,3 kg com objetivo 76. */
  it('uma leitura antiga do outro lado do objetivo não conta: 79,4 → 77,3, objetivo 76', () => {
    const list = [av('2024-05-01', { weight_kg: 72, body_fat_pct: 16 }), av('2026-07-12', { weight_kg: 79.4, body_fat_pct: 24.5 }), av(HOJE, { weight_kg: 77.3, body_fat_pct: 23 })];
    const v = view('mes', 0, { list, profile: { goal_weight_kg: 76, goal_body_fat_pct: 18 } });
    expect(rowOf(v, 'weight_kg').progress).toMatchObject({ reached: false, away: false, remaining: 1.3, pct: 62, start: { date: '2026-07-12', value: 79.4 } });
    expect(rowOf(v, 'body_fat_pct').progress).toMatchObject({ reached: false, away: false, remaining: 5, pct: 23 });
  });

  it('com o dia no histórico de objetivos: parte da leitura desse dia', () => {
    const goals = [{ valid_from: '2026-09-15T09:00:00Z', goal_weight_kg: 74 }];
    const p = rowOf(view('mes', 0, { profile: { goal_weight_kg: 74 }, goals }), 'weight_kg').progress;
    expect(p.start).toEqual({ date: '2026-09-15', value: 77.3 });
    expect(p.pct).toBe(33); // 1,1 de 3,3
    expect(p.approx).toBe('antes_do_historico');
  });

  it('métrica sem leitura no período: sem barra, mesmo com objetivo', () => {
    expect(rowOf(view('mes', 0, { profile: { goal_body_fat_pct: 18 } }), 'body_fat_pct').progress).toBeNull();
  });
});

describe('peso sem tendência: estimativa e o que falta', () => {
  it('2 pesagens: estimativa da 1.ª à última, sem linha cheia; o que falta só no período em curso', () => {
    const list = [av('2026-09-20', { weight_kg: 77.3 }), av('2026-10-02', { weight_kg: 76.2 })];
    const w = view('ano', 0, { list }).weight;
    expect(w.sufficient).toBe(false);
    expect(w.line).toEqual([]);
    expect(w.estimate).toMatchObject({ n: 2, diff: -1.1, days: 12 });
    expect(w.need).toEqual({ more: 1, start: HOJE, from: HOJE, until: HOJE, fresh: false });
    expect(view('ano', 0, { list }).verdict.text).toBe('Desceste 1,1 kg em 12 dias (≈0,6 kg por semana). Com só duas pesagens é uma estimativa pouco fiável — mais uma pesagem até 4 out e passo a dar-te a tendência a sério.');
    // Fechado: o facto, sem pedido.
    const q3 = view('trimestre', -1, { list: [av('2026-09-02', { weight_kg: 77.3 }), av('2026-09-14', { weight_kg: 76.2 })] });
    expect(q3.weight.need).toBeNull();
    expect(q3.verdict.text).toBe('No 3.º trimestre, desceste 1,1 kg em 12 dias (≈0,6 kg por semana). Com só duas pesagens é uma estimativa pouco fiável.');
  });

  it('com tendência não há estimativa nem "falta"', () => {
    const w = view('mes', -1).weight;
    expect(w.estimate).toBeNull();
    expect(w.need).toBeNull();
    expect(w.line.length).toBeGreaterThan(0);
  });

  it('semana com 1 pesagem: as de antes contam e diz-se quantas faltam e até quando', () => {
    const list = [av('2026-09-22', { weight_kg: 77 }), av('2026-09-29', { weight_kg: 76.2 })];
    const v = view('semana', 0, { list, today: '2026-09-30' });
    expect(v.weight.need).toEqual({ more: 1, start: '2026-09-30', from: '2026-10-02', until: '2026-10-06', fresh: false });
    expect(v.verdict.text).toBe('Nesta semana só há uma pesagem, de 76,2 kg; para a tendência preciso de mais uma, a última entre 2 e 6 out.');
  });
});

describe('onde estão os dados (limiares C4/C6)', () => {
  it('composição: com 1 avaliação com gordura no mês, aponta o trimestre que tem 2', () => {
    const list = [av('2026-08-02', { weight_kg: 79, body_fat_pct: 21.5 }), av('2026-09-20', { weight_kg: 77, body_fat_pct: 20 })];
    expect(view('mes', -1, { list }).compositionWider).toEqual({ kind: 'trimestre', offset: -1, n: 2, where: 'no 3.º trimestre' });
    // Semana em curso: o 1.º maior com 2 é o ano (o trimestre out – dez não tem nenhuma).
    expect(view('semana', 0, { list }).compositionWider).toMatchObject({ kind: 'ano', offset: 0, n: 2 });
    // Com 2 no próprio período não há para onde apontar.
    expect(view('trimestre', -1, { list }).compositionWider).toBeNull();
  });

  it('período vazio: a avaliação anterior', () => {
    const list = [av('2026-07-28', { weight_kg: 79 }), av('2026-10-02', { weight_kg: 77 })];
    expect(view('mes', -1, { list }).lastBeforeISO).toBe('2026-07-28');
  });
});
