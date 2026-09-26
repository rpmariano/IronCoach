import { describe, it, expect } from 'vitest';
import { eventoDaVida, frasesDaVida } from './carolVida';
import { buildWelcome, WELCOME_PHRASES } from './carolWelcome';
import { expectCarolVoice } from '../test/carolVoice';

/* Pedido 2026-09-26: "a Carol poderia fazer referência ao facto de eu ser
   operado no dia anterior, ela tem conhecimento disso". A nota abaixo é a
   que ela própria escreveu na memória (coach_notes) quando o atleta lhe
   contou da cirurgia. Setembro: Lisboa está em UTC+1. */

const at = (isoLocalLisboa) => new Date(`${isoLocalLisboa}+01:00`);
const NOTA = { category: 'limitacao_fisica', note: 'Cirurgia a rutura do bíceps direito a 2026-09-25; paragem de corrida de pelo menos 2 semanas no pós-operatório.' };
const OUTRAS = [
  { category: 'disponibilidade', note: 'Disponibilidade habitual para corrida e ginásio todos os dias da semana, exceto à segunda-feira.' },
  { category: 'outro', note: 'Prova «Corrida do Tejo» (2026-09-13, 10 km): 51:51; objetivo 55:00 — objetivo batido (3:09 abaixo).' },
  { category: 'limitacao_fisica', note: 'Epicondilite no cotovelo direito — evitar exercícios de tração.' },
];

describe('eventoDaVida — o que ela sabe', () => {
  it('lê a cirurgia, a data, a parte do corpo e a recuperação que ela própria escreveu', () => {
    const e = eventoDaVida([...OUTRAS, NOTA], '2026-09-26');
    expect(e).toMatchObject({ tipo: 'cirurgia', data: '2026-09-25', dias: 1, recupera: 14, a: 'a cirurgia', da: 'da cirurgia', parte: 'o braço' });
  });

  it('conta da véspera ao fim da recuperação, e não fora disso', () => {
    expect(eventoDaVida([NOTA], '2026-09-24')?.dias).toBe(-1);
    expect(eventoDaVida([NOTA], '2026-09-23')).toBeNull();
    expect(eventoDaVida([NOTA], '2026-10-09')?.dias).toBe(14);
    expect(eventoDaVida([NOTA], '2026-10-10')).toBeNull();
  });

  it('sem data escrita, ou sem dizer o que foi, não há acontecimento', () => {
    expect(eventoDaVida(OUTRAS, '2026-09-14')).toBeNull();
    expect(eventoDaVida([{ note: 'Cirurgia ao joelho, ainda sem data.' }], '2026-09-26')).toBeNull();
    expect(eventoDaVida(null, '2026-09-26')).toBeNull();
  });

  it('uma lesão ou uma doença não têm véspera, e dizem-se pelo que são', () => {
    const entorse = eventoDaVida([{ note: 'Entorse no tornozelo esquerdo a 20/09/2026, 10 dias sem correr.' }], '2026-09-22');
    expect(entorse).toMatchObject({ tipo: 'lesao', dias: 2, recupera: 10, parte: 'o tornozelo' });
    expect(eventoDaVida([{ note: 'Entorse no tornozelo a 2026-09-27.' }], '2026-09-26')).toBeNull();
    expect(eventoDaVida([{ note: 'Gripe desde 2026-09-24, febre.' }], '2026-09-25')).toMatchObject({ tipo: 'doenca', a: 'a gripe' });
  });
});

describe('as boas-vindas à volta da cirurgia', () => {
  const data = (extra = {}) => ({
    profile: { display_name: 'Rui Mariano', gender: 'M' },
    coachPlans: [{ id: 'p', status: 'aceite' }],
    coachPlanItems: ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'].map((d, i) => ({ id: `i${i}`, plan_id: 'p', planned_date: d, kind: 'descanso', status: 'pendente' })),
    runs: [{ date: '2026-09-01', distance_km: 5 }], meals: [], raceEvents: [], dailyCheckins: [],
    coachNotes: [...OUTRAS, NOTA],
    ...extra,
  });

  it('o caso do ecrã: sábado, 03:53, a noite a seguir à cirurgia', () => {
    const w = buildWelcome('madrugada', data(), at('2026-09-26T03:53:00'));
    expect(w.greeting).toBe('Ainda acordado, Rui?');
    expect(w.lines).toEqual(['Acabaste de passar por uma cirurgia: o que o corpo mais pede agora é sono. Vai descansar, e de manhã contas-me como correu.']);
    expect(w.chip).toMatchObject({ label: 'Hoje', value: 'Descanso' });
  });

  it('o bom dia a seguir pergunta pela cirurgia antes de tudo', () => {
    const w = buildWelcome('manha', data(), at('2026-09-26T08:30:00'));
    expect(frasesDaVida(eventoDaVida([NOTA], '2026-09-26'), { variant: 'manha' })).toContain(w.lines[0]);
    expect(w.lines[0]).toMatch(/cirurgia/);
    // A segunda linha continua a ser a do dia: o check-in por fazer.
    expect(w.action).toBe('checkin');
    expect(w.lines).toHaveLength(2);
  });

  it('na véspera e no próprio dia, ela sabe que é amanhã / hoje', () => {
    expect(buildWelcome('tarde', data({ meals: [{ date: '2026-09-24' }] }), at('2026-09-24T15:00:00')).lines[0]).toMatch(/^Amanhã é a cirurgia\./);
    expect(buildWelcome('manha', data(), at('2026-09-25T08:00:00')).lines[0]).toMatch(/^Hoje é o dia da cirurgia\./);
    expect(buildWelcome('noite', data(), at('2026-09-25T20:00:00')).lines[0]).toMatch(/^Hoje foi o dia da cirurgia\./);
    // Às 23h40 da véspera, a madrugada fala da cirurgia de amanhã; depois da meia-noite, não se diz "amanhã".
    expect(buildWelcome('madrugada', data(), at('2026-09-24T23:40:00')).lines.join(' ')).toMatch(/^Amanhã é a cirurgia\./);
    expect(buildWelcome('madrugada', data(), at('2026-09-25T01:00:00')).lines.join(' ')).toMatch(/^Hoje é o dia da cirurgia\./);
  });

  it('durante a recuperação, de manhã, ela não se esquece; à noite, o sono é pela recuperação', () => {
    for (const d of ['2026-09-30', '2026-10-01', '2026-10-02']) {
      const w = buildWelcome('manha', data({ dailyCheckins: [{ date: d, sleep: 3 }] }), at(`${d}T08:00:00`));
      expect(w.lines[0], d).toMatch(/recupera/);
      expect(w.lines.join(' ')).not.toMatch(/amanhã/i);
    }
    const noite = buildWelcome('madrugada', data(), at('2026-09-28T23:30:00'));
    expect(frasesDaVida(eventoDaVida([NOTA], '2026-09-28'), { momento: 'sono' })).toContain(noite.lines[0]);
  });

  it('acabada a recuperação, volta tudo ao normal', () => {
    const w = buildWelcome('madrugada', data({ coachPlanItems: [{ id: 'x', plan_id: 'p', planned_date: '2026-10-20', kind: 'descanso' }] }), at('2026-10-20T03:53:00'));
    expect(w.lines.join(' ')).not.toMatch(/cirurgia|recupera/);
    expect(WELCOME_PHRASES.sonoDescanso('hoje')).toContain(w.lines[0]);
  });

  it('a voz dela em todos os momentos: sem exclamações nem género', () => {
    const e = eventoDaVida([NOTA], '2026-09-26');
    for (const dias of [-1, 0, 1, 2, 5]) {
      for (const variant of ['manha', 'tarde', 'noite']) {
        for (const f of frasesDaVida({ ...e, dias }, { variant }) || []) {
          expectCarolVoice(f);
          expect(f).not.toMatch(/(?<!\p{L})(operado|descansado|tranquilo|cansado|pronto)(?!\p{L})/u);
        }
      }
      for (const depoisDaMeiaNoite of [true, false]) for (const f of frasesDaVida({ ...e, dias }, { momento: 'sono', depoisDaMeiaNoite }) || []) expectCarolVoice(f);
    }
  });
});
