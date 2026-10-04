import { describe, it, expect } from 'vitest';
import { runVerdict } from './run';
import { NO_DATA_TEXT } from './shared';

/* Veredicto da Corrida por período (2026-10-04, fase 5). Os testes antigos
   vivem em dashboardVerdicts.test.js; aqui só o que a fase 5 acrescenta:
   período fechado, VDOT período contra período, semana em curso marcada,
   semanas antes do 1.º registo. */

const semanas = (...kms) => kms.map((km, i) => ({ weekLabel: `S${i}`, acuteLoad: km, inProgress: false }));
const comCorrente = (...kms) => kms.map((km, i) => ({ weekLabel: `S${i}`, acuteLoad: km, inProgress: i === kms.length - 1 }));
const seguro = { ratio: 1.1, status: 'safe', hasEnoughData: true, acuteKm: 30, chronicWeeklyKm: 27 };

describe('VDOT: período contra período (não contra a 1.ª corrida de sempre)', () => {
  const sobe = { current: 44.1, previous: 42.9, nCurrent: 3, nPrevious: 4, previousWhere: 'em agosto' };

  it('sobe com ≥3 pontos em cada e ≥0,5: diz de onde e para onde, com os dois períodos', () => {
    const v = runVerdict({ acwr: seguro, weeklyVolume: semanas(30, 30, 30), runCount: 8, vdotCompare: sobe, scope: 'em setembro' });
    expect(v.tone).toBe('ok');
    expect(v.text).toBe('A tua forma aeróbica está a subir. O VDOT médio passou de 42,9 em agosto para 44,1 em setembro.');
  });

  it('com 2 pontos num dos períodos não diz nada sobre a forma', () => {
    const v = runVerdict({ acwr: seguro, weeklyVolume: semanas(30, 30, 30), runCount: 8, vdotCompare: { ...sobe, nPrevious: 2 }, scope: 'em setembro' });
    expect(v.text).not.toContain('forma aeróbica');
  });

  it('uma subida abaixo de 0,5 não é subida', () => {
    const v = runVerdict({ acwr: seguro, weeklyVolume: semanas(30, 30, 30), runCount: 8, vdotCompare: { ...sobe, current: 43.2 }, scope: 'em setembro' });
    expect(v.text).not.toContain('forma aeróbica');
  });

  it('sem comparação (não há anterior), nunca recorre à 1.ª corrida de sempre', () => {
    const v = runVerdict({ acwr: seguro, weeklyVolume: semanas(30, 30, 30), runCount: 8, vdotTrend: [{ vdot: 30 }, { vdot: 40 }] });
    expect(v.text).not.toContain('forma aeróbica');
  });
});

describe('período fechado: só os factos dele', () => {
  it('não fala da carga de hoje (mesmo em perigo), diz o que se correu', () => {
    const v = runVerdict({
      acwr: { ratio: 1.9, status: 'danger', hasEnoughData: true },
      weeklyVolume: semanas(10, 10, 40),
      runCount: 9, km: 62.4, scope: 'em setembro', isCurrent: false,
    });
    expect(v).toEqual({ text: 'Em setembro: 9 corridas e 62,4 km.', tone: 'neutral' });
  });

  it('concorda no singular e na semana passada', () => {
    const v = runVerdict({ weeklyVolume: semanas(10), runCount: 1, km: 5, scope: 'na semana passada', isCurrent: false });
    expect(v.text).toBe('Na semana passada: 1 corrida e 5,0 km.');
  });

  it('sem corridas diz a última, no tempo do período', () => {
    const v = runVerdict({ weeklyVolume: semanas(10), runCount: 0, scope: 'em agosto', isCurrent: false, lastRunDate: '2026-07-20' });
    expect(v.text).toBe('Sem corridas em agosto (a última foi a 20 de julho).');
  });

  it('a intensidade a mais do período ainda avisa', () => {
    const v = runVerdict({
      weeklyVolume: semanas(10), runCount: 8, scope: 'em setembro', isCurrent: false,
      distribution: { lowIntensityPct: 55, highIntensityPct: 45, targetLowPct: 80 },
    });
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('45%');
  });
});

describe('estado vazio do período em curso', () => {
  it('"Sem corridas nesta semana (a última foi a …)" e não "zero corridas"', () => {
    const v = runVerdict({
      acwr: { ratio: 0, status: 'unknown', hasEnoughData: false, historyWeeks: 1 },
      weeklyVolume: semanas(0, 12, 0), runCount: 0, scope: 'nesta semana', lastRunDate: '2026-09-12',
    });
    expect(v.text).toContain('Sem corridas nesta semana (a última foi a 12 de setembro)');
    expect(v.text).not.toContain('zero');
  });

  it('sem nenhuma corrida em 12 semanas mas com histórico antigo: diz-o com o scope', () => {
    expect(runVerdict({ runCount: 0, weeklyVolume: semanas(0, 0), scope: 'em outubro', lastRunDate: '2026-03-02' }).text)
      .toBe('Sem corridas em outubro (a última foi a 2 de março).');
  });

  it('sem corridas em lado nenhum: não sabe', () => {
    expect(runVerdict({ runCount: 0, weeklyVolume: semanas(0, 0) }).text).toBe(NO_DATA_TEXT);
  });

  it('as corridas registadas dizem onde: "três corridas registadas nesta semana"', () => {
    const v = runVerdict({
      acwr: { ratio: 0, status: 'unknown', hasEnoughData: false, historyWeeks: 2 },
      weeklyVolume: semanas(0, 5, 8), runCount: 3, scope: 'nesta semana',
    });
    expect(v.text).toContain('três corridas registadas nesta semana');
  });
});

describe('semanas fechadas (R10)', () => {
  it('com a semana em curso marcada, ao domingo ela continua fora (hoje não conta)', () => {
    // 10, 14, 18, 22 fechadas = 3 subidas; a corrente (30) não entra, nem ao domingo.
    const v = runVerdict({ acwr: seguro, weeklyVolume: comCorrente(10, 14, 18, 22, 3), runCount: 12, today: '2026-10-04' });
    expect(v.text).toContain('três semanas seguidas');
  });

  it('a semana em curso pequena não desfaz a subida nem inventa uma descida', () => {
    const v = runVerdict({ acwr: { ...seguro, status: 'safe' }, weeklyVolume: comCorrente(40, 40, 40, 2), runCount: 12, today: '2026-10-04' });
    expect(v.text).not.toContain('aquém');
  });

  it('duas semanas fechadas a descer, com a corrente a meio: "ficaste aquém"', () => {
    const v = runVerdict({ acwr: { ratio: 0.95, status: 'safe', hasEnoughData: true }, weeklyVolume: comCorrente(42, 35, 28, 4), runCount: 8, today: '2026-10-04' });
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('Ficaste aquém duas semanas seguidas');
    expect(v.text).toContain('28,0');
  });

  it('semanas inteiras antes do 1.º registo (null) não contam como zeros: quem começou há 3 semanas não "sobe três semanas seguidas" a partir do nada', () => {
    const w = [
      { acuteLoad: null, inProgress: false }, { acuteLoad: null, inProgress: false }, { acuteLoad: null, inProgress: false },
      { acuteLoad: 8, inProgress: false }, { acuteLoad: 12, inProgress: false }, { acuteLoad: 15, inProgress: false },
      { acuteLoad: 2, inProgress: true },
    ];
    const v = runVerdict({ acwr: seguro, weeklyVolume: w, runCount: 6, today: '2026-10-04' });
    // 8 → 12 → 15 são 2 subidas (a de "0 → 8" não existe), por isso não chega às três.
    expect(v.text).not.toContain('três semanas seguidas');
  });
});
