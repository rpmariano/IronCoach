import { describe, it, expect } from 'vitest';
import { goalFromNotes, knownFacts, firstDayAsk, isFirstDay, firstRunLine, FIRST_RUN_LINE } from './firstDay';
import { expectCarolVoice } from '../test/carolVoice';

/* A Home no primeiro dia lembra-se do arranque: as notas que o Onboarding
   grava (objetivo_pessoal, disponibilidade) e o perfil. */

const notas = [
  { category: 'objetivo_pessoal', note: 'Correr mais rápido — sem prova, foco em ritmo.' },
  { category: 'disponibilidade', note: 'No arranque declarou 38 km por semana, 5 dias por semana.' },
];

describe('goalFromNotes', () => {
  it('lê o objetivo pelo título que o arranque escreve', () => {
    expect(goalFromNotes(notas)).toBe('ritmo');
    expect(goalFromNotes([{ category: 'objetivo_pessoal', note: 'Voltar depois de uma pausa — retomar sem me lesionar.' }])).toBe('regresso');
  });

  it('sem nota, ou com uma nota escrita à mão, não inventa', () => {
    expect(goalFromNotes([])).toBeNull();
    expect(goalFromNotes([{ category: 'objetivo_pessoal', note: 'Quero perder 3 kg' }])).toBeNull();
  });
});

describe('knownFacts', () => {
  it('só o que foi dito: nível, km, dias, restrições', () => {
    expect(knownFacts({ profile: { experience_level: 'medio', dietary_restrictions: ['sem_lactose'] }, coachNotes: notas }))
      .toEqual(['Corres há 1 a 3 anos', '38 km por semana', '5 dias por semana', 'Sem lactose']);
  });

  it('sem nada dito, nada mostrado', () => {
    expect(knownFacts({ profile: {}, coachNotes: [] })).toEqual([]);
  });
});

describe('firstDayAsk', () => {
  it('cada objetivo pede a sua primeira coisa', () => {
    expect(firstDayAsk('prova', 'Rui')).toMatchObject({ title: 'Rui, falta a data da prova.', primary: 'race' });
    expect(firstDayAsk('ritmo', 'Rui').primary).toBe('run');
    expect(firstDayAsk('saude', 'Rui').primary).toBe('meal');
    expect(firstDayAsk('regresso', 'Rui').primary).toBe('run');
  });

  it('sem objetivo: o texto do mock, escolher a prova', () => {
    expect(firstDayAsk(null, 'Rui')).toMatchObject({ title: 'Olá, Rui. Vamos escolher a tua prova.', primary: 'talk' });
    expect(firstDayAsk(null, '').title).toBe('Olá. Vamos escolher a tua prova.');
  });

  it('a voz dela: sem exclamações', () => {
    for (const g of ['prova', 'ritmo', 'saude', 'regresso', null]) {
      const a = firstDayAsk(g, 'Rui');
      expectCarolVoice(`${a.title} ${a.body}`);
    }
  });
});

/* O primeiro dia é para quem ainda não tem nada (pedido 2026-09-26): o
   caminho principal do arranque acaba com um plano aceite no chat, e o
   cartão do primeiro dia negava-o ("Antes de te dar volume, quero ver as
   primeiras saídas") e escondia o "O que faço hoje". */
describe('isFirstDay', () => {
  const janela = { start: '2026-09-26', days: 7 };

  it('sem registos, sem prova e sem plano: é o primeiro dia', () => {
    expect(isFirstDay({})).toBe(true);
    expect(isFirstDay({ plans: [{ id: 'p0', status: 'recusado' }] })).toBe(true);
  });

  it('com o plano do arranque aceite, já não é — o Início mostra o treino de hoje', () => {
    expect(isFirstDay({ planWindow: janela, plans: [{ id: 'p1', status: 'aceite' }] })).toBe(false);
  });

  it('com a proposta por decidir também não — ela já escreveu o plano', () => {
    expect(isFirstDay({ plans: [{ id: 'p1', status: 'proposto' }] })).toBe(false);
  });

  it('o que já contava continua a contar: dados a chegar, registos, prova', () => {
    expect(isFirstDay({ dataPending: true })).toBe(false);
    expect(isFirstDay({ hasRecords: true })).toBe(false);
    expect(isFirstDay({ hasUpcomingRace: true })).toBe(false);
  });
});

describe('firstDayAsk — sem "hoje" do lado errado da meia-noite', () => {
  it('quem veio correr mais rápido: "preciso de te ver correr", não "como corres hoje"', () => {
    const a = firstDayAsk('ritmo', 'Rui');
    expect(a.body).toBe('Primeiro preciso de te ver correr. Regista as próximas corridas e falamos do teu ritmo de base.');
    expect(a.body).not.toMatch(/hoje/);
  });
});

/* A linha que leva ao registo de corrida no primeiro dia: sem "eu ajusto o
   plano" (não há plano no primeiro dia) e com "hoje" só de dia, pela hora
   de Lisboa. Setembro é UTC+1: os instantes escrevem-se com +01:00, e
   percorrem-se dias seguidos, hora a hora, dos dois lados da meia-noite. */
describe('firstRunLine', () => {
  const dias = ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'];
  const lisboa = (dia, h, m = 15) => new Date(`${dia}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+01:00`);

  it('dias seguidos, hora a hora: "hoje" das 6h às 23h, sem "hoje" de madrugada', () => {
    for (const dia of dias) {
      for (let h = 0; h < 24; h++) {
        const linha = firstRunLine(lisboa(dia, h));
        const deDia = h >= 6 && h < 23;
        expect(linha, `${dia} ${h}h`).toBe(deDia ? FIRST_RUN_LINE.dia : FIRST_RUN_LINE.noite);
        expect(linha).not.toMatch(/ajusto o plano/);
        expect(linha).toMatch(/fico a saber por onde começar/);
      }
    }
  });

  it('os dois lados da meia-noite e das fronteiras, ao minuto', () => {
    expect(firstRunLine(lisboa('2026-09-26', 22, 59))).toMatch(/hoje/);
    expect(firstRunLine(lisboa('2026-09-26', 23, 0))).not.toMatch(/hoje/);
    expect(firstRunLine(lisboa('2026-09-26', 23, 59))).not.toMatch(/hoje/);
    expect(firstRunLine(lisboa('2026-09-27', 0, 0))).not.toMatch(/hoje/);
    expect(firstRunLine(lisboa('2026-09-27', 5, 59))).not.toMatch(/hoje/);
    expect(firstRunLine(lisboa('2026-09-27', 6, 0))).toMatch(/hoje/);
  });

  it('conta a hora de Lisboa, não a UTC: 23:30 UTC já é 00:30 em Lisboa', () => {
    expect(firstRunLine(new Date('2026-09-26T23:30:00Z'))).toBe(FIRST_RUN_LINE.noite);
    // 05:30 UTC são 06:30 em Lisboa: já é de dia.
    expect(firstRunLine(new Date('2026-09-27T05:30:00Z'))).toBe(FIRST_RUN_LINE.dia);
  });

  it('na voz dela', () => {
    expectCarolVoice(FIRST_RUN_LINE.dia);
    expectCarolVoice(FIRST_RUN_LINE.noite);
  });
});
