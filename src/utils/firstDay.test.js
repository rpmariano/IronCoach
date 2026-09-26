import { describe, it, expect } from 'vitest';
import { goalFromNotes, knownFacts, firstDayAsk, isFirstDay, firstRunLine, FIRST_RUN_LINE } from './firstDay';
import { expectCarolVoice } from '../test/carolVoice';
import { eventoDaVida } from './carolVida';
import { lisbonParts } from './carolWelcome';

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

/* O contexto primeiro (revisão de 2026-09-26; CAROL.md §8): com uma
   cirurgia, uma lesão ou uma doença na memória dela, quem veio correr mais
   rápido ou voltar de uma pausa ouvia «Primeiro preciso de te ver correr»
   e tinha «Registar uma corrida» no botão — no dia a seguir à cirurgia. O
   acontecimento vem de eventoDaVida, como no Início. */
describe('firstDayAsk — o que ela sabe da vida passa à frente da corrida', () => {
  const cirurgia = [
    { category: 'objetivo_pessoal', note: 'Voltar depois de uma pausa — retomar sem me lesionar.' },
    { category: 'saude', note: 'Cirurgia ao menisco do joelho direito a 2026-09-25; paragem de corrida de 2 semanas.' },
  ];
  const addDias = (iso, n) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  it('dias seguidos, da antevéspera ao fim da recuperação: o pedido só é a corrida fora dela', () => {
    // 2026-09-23 (dois dias antes) até 2026-10-10 (15 dias depois: a nota diz 2 semanas).
    for (let d = -2; d <= 15; d++) {
      const hoje = addDias('2026-09-25', d);
      const vida = eventoDaVida(cirurgia, hoje);
      for (const goal of ['regresso', 'ritmo']) {
        const a = firstDayAsk(goal, 'Rui', { vida });
        if (d >= -1 && d <= 14) {
          expect(a.primary, `${goal} ${hoje}`).toBe('talk');
          expect(a.body).toBe('Não me esqueci da cirurgia. Antes de falarmos de corridas, quero saber como estás: conta-me, e começamos daí.');
          expect(`${a.title} ${a.body}`).not.toMatch(/Regista|te ver correr|hoje|amanhã|mais rápido/);
          expectCarolVoice(`${a.title} ${a.body}`);
        } else {
          expect(a.primary, `${goal} ${hoje}`).toBe('run');
        }
      }
    }
  });

  it('o título: "voltamos com calma" serve; "vamos pôr-te mais rápido" não', () => {
    const vida = eventoDaVida(cirurgia, '2026-09-26');
    expect(firstDayAsk('regresso', 'Rui', { vida }).title).toBe('Rui, voltamos com calma.');
    expect(firstDayAsk('ritmo', 'Rui', { vida }).title).toBe('Rui, uma coisa de cada vez.');
    expect(firstDayAsk('ritmo', '', { vida }).title).toBe('Uma coisa de cada vez.');
  });

  it('os dois lados da meia-noite, pela hora de Lisboa (setembro é UTC+1)', () => {
    const pedido = (instante) => firstDayAsk('regresso', 'Rui', { vida: eventoDaVida(cirurgia, lisbonParts(new Date(instante)).date) }).primary;
    // 23:30 UTC de dia 22 já são 00:30 de dia 23 em Lisboa: ainda fora (antevéspera).
    expect(pedido('2026-09-22T23:30:00Z')).toBe('run');
    // 22:59 UTC de dia 23 são 23:59 em Lisboa (antevéspera); um minuto
    // depois é meia-noite de dia 24, a véspera da cirurgia.
    expect(pedido('2026-09-23T22:59:00Z')).toBe('run');
    expect(pedido('2026-09-23T23:00:00Z')).toBe('talk');
    // O último dia da recuperação acaba à meia-noite de Lisboa.
    expect(pedido('2026-10-09T22:59:00Z')).toBe('talk');
    expect(pedido('2026-10-09T23:00:00Z')).toBe('run');
  });

  it('os outros objetivos não pedem corrida e ficam como estão; uma lesão e uma doença contam como a cirurgia', () => {
    const vida = eventoDaVida(cirurgia, '2026-09-26');
    expect(firstDayAsk('prova', 'Rui', { vida })).toEqual(firstDayAsk('prova', 'Rui'));
    expect(firstDayAsk('saude', 'Rui', { vida })).toEqual(firstDayAsk('saude', 'Rui'));
    expect(firstDayAsk(null, 'Rui', { vida })).toEqual(firstDayAsk(null, 'Rui'));
    const lesao = eventoDaVida([{ note: 'Entorse no tornozelo esquerdo a 2026-09-24.' }], '2026-09-26');
    expect(firstDayAsk('ritmo', 'Rui', { vida: lesao })).toMatchObject({ primary: 'talk', body: expect.stringMatching(/^Não me esqueci da lesão\./) });
    const gripe = eventoDaVida([{ note: 'Gripe desde 2026-09-25, com febre.' }], '2026-09-26');
    expect(firstDayAsk('regresso', 'Rui', { vida: gripe }).body).toMatch(/^Não me esqueci da gripe\./);
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
