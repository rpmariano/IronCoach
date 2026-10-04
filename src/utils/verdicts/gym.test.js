import { describe, it, expect } from 'vitest';
import { gymVerdict, gymFrequencyStatus } from './gym';
import { NO_DATA_TEXT } from './shared';
import { expectCarolVoice } from '../../test/carolVoice';

/* Veredicto do Ginásio por período de calendário (2026-10-04, G2). Os testes
   antigos (semanas nominais do filtro) saíram de dashboardVerdicts.test.js: a
   frequência é sobre semanas FECHADAS, só força, e numerador e denominador são
   das mesmas semanas. */

const mes = (over = {}) => ({
  kind: 'mes', isCurrent: false, scope: 'em setembro',
  periodStrength: 8, classes: 0, closedWeeks: 4, strengthInWeeks: 8,
  weeklyLoads: [6200, 7100, 7800, 8400], runCount: 0, ...over,
});

describe('sem dados', () => {
  it('sem nenhum treino diz que não sabe, em tom neutro', () => {
    expect(gymVerdict({})).toEqual({ text: NO_DATA_TEXT, tone: 'neutral' });
    expect(gymVerdict({ periodStrength: 0, classes: 0 })).toEqual({ text: NO_DATA_TEXT, tone: 'neutral' });
  });
});

describe('zero observado é um facto, não "sem dados" (revisão de 2026-10-04)', () => {
  it('mês fechado sem sessões mas com histórico: diz que não houve, em aviso', () => {
    const v = gymVerdict({ kind: 'mes', isCurrent: false, scope: 'em agosto', periodStrength: 0, classes: 0, observedDays: 31, early: 'ok' });
    expect(v.text).toBe('Nenhuma sessão de força em agosto — o alvo são duas por semana.');
    expect(v.tone).toBe('warn');
    expect(v.text).not.toBe(NO_DATA_TEXT);
    expectCarolVoice(v.text);
  });

  it('semana fechada sem sessões: aviso; semana em curso: neutro, "até agora"', () => {
    const fechada = gymVerdict({ kind: 'semana', isCurrent: false, scope: 'em 21 – 27 set', periodStrength: 0, observedDays: 7, early: 'ok' });
    expect(fechada.tone).toBe('warn');
    const curso = gymVerdict({ kind: 'semana', isCurrent: true, scope: 'nesta semana', periodStrength: 0, observedDays: 6, early: 'ok' });
    expect(curso).toEqual({ text: 'Nenhuma sessão de força nesta semana até agora — o alvo são duas por semana.', tone: 'neutral' });
  });

  it('sem nada observado (nunca registou, ou antes do 1.º registo) continua a ser NO_DATA', () => {
    expect(gymVerdict({ periodStrength: 0, observedDays: 0, early: 'ok' })).toEqual({ text: NO_DATA_TEXT, tone: 'neutral' });
  });
});

describe('G2: semanas fechadas, não as semanas nominais do filtro', () => {
  it('3 sessões em 10 dias (1 semana fechada) não são "3 em 52 semanas": ainda é cedo', () => {
    const v = gymVerdict(mes({ kind: 'trimestre', isCurrent: true, scope: 'neste trimestre', periodStrength: 3, closedWeeks: 1, strengthInWeeks: 2, weeklyLoads: [5000] }));
    expect(v.tone).toBe('neutral');
    expect(v.early).toBe(true);
    expect(v.text).toBe('Só 1 semana fechada neste trimestre — ainda é cedo para conclusões.');
  });

  it('com 2 semanas fechadas continua a ser cedo, com o plural certo', () => {
    const v = gymVerdict(mes({ closedWeeks: 2, strengthInWeeks: 1, weeklyLoads: [100, 0] }));
    expect(v.early).toBe(true);
    expect(v.text).toBe('Só 2 semanas fechadas em setembro — ainda é cedo para conclusões.');
    expectCarolVoice(v.text);
  });

  it('só avalia a frequência com 3+ semanas fechadas, dividindo as sessões DESSAS semanas', () => {
    // 2 sessões em 4 semanas fechadas: 0,5 por semana.
    const v = gymVerdict(mes({ periodStrength: 5, strengthInWeeks: 2 }));
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('Vais ao ginásio a menos');
    expect(v.text).toContain('2 sessões de força em quatro semanas fechadas');
    expect(v.text).not.toContain('corrida');
    expectCarolVoice(v.text);
  });

  it('as sessões fora das semanas fechadas (dias soltos do período) não entram na média', () => {
    // 8 sessões nos dias fechados, mas só 2 nas semanas inteiras.
    const v = gymVerdict(mes({ periodStrength: 8, strengthInWeeks: 2 }));
    expect(v.text).toContain('2 sessões de força em quatro semanas fechadas');
  });

  it('só aulas: não é "ginásio a menos", é que não há carga de força para analisar', () => {
    const v = gymVerdict(mes({ periodStrength: 0, classes: 6, strengthInWeeks: 0 }));
    expect(v.tone).toBe('neutral');
    expect(v.text).toBe('Só fizeste aulas em setembro: sem treino de força não há carga para analisar.');
  });

  it('as aulas não contam para a frequência de força', () => {
    // 4 aulas + 2 sessões de força em 4 semanas continua a ser pouco.
    const v = gymVerdict(mes({ periodStrength: 2, classes: 4, strengthInWeeks: 2 }));
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('2 sessões de força em quatro semanas');
  });

  it('nenhuma sessão nas semanas fechadas, com corrida: diz-o sem dupla negação', () => {
    const v = gymVerdict(mes({ periodStrength: 1, strengthInWeeks: 0, runCount: 5 }));
    expect(v.text).toContain('Nenhuma sessão de força em quatro semanas fechadas segura o volume de corrida');
    expectCarolVoice(v.text);
  });
});

describe('bem e mal, com semanas fechadas', () => {
  it('bem: duas por semana com carga a subir', () => {
    const v = gymVerdict(mes());
    expect(v.tone).toBe('ok');
    expect(v.text).toContain('carga a subir');
    expect(v.text).not.toContain('corrida');
  });

  it('mal: carga a cair duas semanas seguidas (semanas fechadas, com zeros)', () => {
    const v = gymVerdict(mes({ weeklyLoads: [9000, 7400, 5900, 4000] }));
    expect(v.tone).toBe('warn');
    expect(v.text).toMatch(/A carga desceu três semanas seguidas, de 9\s000 para 4\s000 kg/);
    // Um zero é uma semana: a carga desceu até 0.
    const zero = gymVerdict(mes({ weeklyLoads: [9000, 7400, 0, 0], strengthInWeeks: 6 }));
    expect(zero.text).not.toBe(v.text);
  });

  it('uma sessão por semana é pouco, mas não é falta de dados', () => {
    const v = gymVerdict(mes({ periodStrength: 4, strengthInWeeks: 4, weeklyLoads: [4000, 4000, 4000, 4000] }));
    expect(v.tone).toBe('warn');
    expect(v.text).toContain('O alvo são duas');
    expect(v.text).toContain('uma vez por semana em média, em quatro semanas fechadas');
  });

  it('a carga estável com duas por semana: o suficiente, com as semanas à vista', () => {
    const v = gymVerdict(mes({ weeklyLoads: [8000, 8000, 8000, 8000] }));
    expect(v.tone).toBe('ok');
    expect(v.text).toBe('Vais ao ginásio o suficiente: 2 sessões de força por semana em quatro semanas fechadas.');
    expectCarolVoice(v.text);
  });

  /* Revisão de 2026-09-26: 1,5 sessões por semana saía "uma sessão", e um
     atleta só de ginásio ouvia falar de "volume de corrida". */
  describe('o valor real e a corrida só para quem corre', () => {
    const umaEMeia = mes({ periodStrength: 6, strengthInWeeks: 6, weeklyLoads: [4000, 4000, 4000, 4000] });

    it('1,5 por semana diz 1,5, não "uma"', () => {
      const v = gymVerdict(umaEMeia);
      expect(v.tone).toBe('warn');
      expect(v.text).toBe('Vais 1,5 vezes por semana em média, em quatro semanas fechadas. O alvo são duas.');
      expectCarolVoice(v.text);
    });

    it('com corridas registadas, fala do volume de corrida', () => {
      const v = gymVerdict({ ...umaEMeia, runCount: 12 });
      expect(v.text).toContain('1,5 vezes por semana');
      expect(v.text).toContain('volume de corrida');
    });

    it('só ginásio e poucas sessões: não fala de corrida', () => {
      expect(gymVerdict(mes({ strengthInWeeks: 2 })).text).not.toContain('corrida');
      expect(gymVerdict(mes({ strengthInWeeks: 2, runCount: 5 })).text).toContain('não seguram o volume de corrida');
      expect(gymVerdict(mes({ strengthInWeeks: 1, periodStrength: 1, runCount: 5 })).text)
        .toContain('1 sessão de força em quatro semanas fechadas não segura o volume de corrida');
    });

    it('2,5 por semana com carga a subir diz 2,5, não "três"', () => {
      const subir = mes({ periodStrength: 10, strengthInWeeks: 10, weeklyLoads: [6200, 7100, 7800, 8400] });
      const soGinasio = gymVerdict(subir);
      expect(soGinasio.tone).toBe('ok');
      expect(soGinasio.text).toContain('2,5 sessões por semana');
      expect(soGinasio.text).not.toContain('corrida');
      expect(gymVerdict({ ...subir, runCount: 3 }).text).toContain('aguentar o volume de corrida');
    });
  });
});

describe('Semana: as sessões da semana contra o alvo de 2', () => {
  const semana = (over = {}) => ({ kind: 'semana', isCurrent: false, scope: 'na semana passada', periodStrength: 2, closedWeeks: 1, strengthInWeeks: 2, ...over });

  it('semana fechada com 2 sessões: alvo cumprido', () => {
    const v = gymVerdict(semana());
    expect(v.tone).toBe('ok');
    expect(v.text).toBe('Duas sessões de força na semana passada: o alvo de duas está cumprido.');
    expectCarolVoice(v.text);
  });

  it('semana fechada com 1 sessão: aquém, com o alvo dito', () => {
    const v = gymVerdict(semana({ periodStrength: 1 }));
    expect(v.tone).toBe('warn');
    expect(v.text).toBe('Só uma sessão de força na semana passada; o alvo são duas.');
  });

  it('semana em curso com 1 sessão: não se avalia, a semana ainda não acabou', () => {
    const v = gymVerdict(semana({ isCurrent: true, scope: 'nesta semana', periodStrength: 1 }));
    expect(v.tone).toBe('neutral');
    expect(v.text).toContain('a semana ainda não acabou');
  });

  it('semana em curso que já tem 2: diz que o alvo está cumprido', () => {
    const v = gymVerdict(semana({ isCurrent: true, scope: 'nesta semana', periodStrength: 3 }));
    expect(v.tone).toBe('ok');
    expect(v.text).toContain('Três sessões de força nesta semana');
  });

  it('não depende das semanas fechadas nem do "cedo" de 3 semanas', () => {
    expect(gymVerdict(semana({ closedWeeks: 0, strengthInWeeks: 0 })).early).toBeUndefined();
  });
});

describe('gymFrequencyStatus', () => {
  it('1,7 ou mais está no alvo; abaixo, aquém; sem número, nada', () => {
    expect(gymFrequencyStatus(2)).toBe('ok');
    expect(gymFrequencyStatus(1.7)).toBe('ok');
    expect(gymFrequencyStatus(1.5)).toBe('below');
    expect(gymFrequencyStatus(null)).toBeNull();
  });
});

describe('a voz da Carol', () => {
  it('nenhuma frase leva emoji, exclamação ou "talvez"', () => {
    const frases = [
      gymVerdict(mes()).text,
      gymVerdict(mes({ strengthInWeeks: 2 })).text,
      gymVerdict(mes({ closedWeeks: 1 })).text,
      gymVerdict(mes({ weeklyLoads: [9000, 7000, 5000, 3000] })).text,
    ];
    for (const f of frases) expectCarolVoice(f);
  });
});
