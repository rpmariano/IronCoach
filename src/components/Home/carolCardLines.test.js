import { describe, it, expect } from 'vitest';
import { computeRaceEve } from '@formulas/raceEve.ts';
import { expectCarolVoice } from '../../test/carolVoice';
import {
  FRASES, treinoFalado, limparAvisoDoServidor, tipoDoDia, linhaDoTreinoDeHoje, linhaDoDia,
  linhaDeAmanha, linhaDaAgua, momentoDaProva, linhaDaProvaDeHoje, linhaDaVespera, semZero, kmFalado,
} from './carolCardLines';

/* As frases do cartão da Carol no Início (pedido 2026-09-26): cada uma
   escolhe-se pela condição que a torna verdadeira — o dia e a hora de
   Lisboa, o plano, os registos e o check-in. As frases rodam por dia, por
   isso os testes percorrem dias seguidos e as horas dos dois lados da
   meia-noite. Setembro: Lisboa está em UTC+1. */

const at = (isoLocalLisboa) => new Date(`${isoLocalLisboa}+01:00`);
const DIAS = ['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'];
const proximo = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
/** Todas as horas de um dia de Lisboa, de `passo` em `passo` minutos. */
const horasDe = (dia, passo = 30) => Array.from({ length: (24 * 60) / passo }, (_, n) => {
  const m = n * passo;
  return { hora: `${dia}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`, min: m };
});

const LONGO = { kind: 'corrida', training_type: 'longo', target_distance_km: 16, status: 'pendente' };
const INTERVALOS = { kind: 'corrida', training_type: 'intervalos', target_distance_km: 8, status: 'pendente' };
const PERNAS = { kind: 'ginasio', categories: ['Pernas'], target_duration_min: 40, status: 'pendente' };

// O que uma frase de um dia sem treino por fazer nunca pode dizer.
const PRESSUPOE_TREINO = /treino de (hoje|amanhã)|por fazer|antes de treinar|sem puxar|tens uma|o plano pede/i;
// Entre as 23h e as 6h nunca se pede um registo (backlog, CarolCard.jsx:275).
const PEDE_REGISTO = /\bregist(a|ar|es)\b|regista-a|regista-o/i;

describe('o treino dito numa frase (backlog CarolCard.jsx:32)', () => {
  it('fala como as boas-vindas, e não com o enum da base de dados', () => {
    expect(treinoFalado([LONGO], '2026-09-26')).toBe('uma rodagem longa de 16 km');
    expect(treinoFalado([{ kind: 'corrida', training_type: 'continuo', target_distance_km: 8 }], '2026-09-26')).toBe('uma corrida contínua de 8 km');
    expect(treinoFalado([{ kind: 'corrida', training_type: 'longo', target_distance_km: 10.5 }], '2026-09-26')).toBe('uma rodagem longa de 10,5 km');
    expect(treinoFalado([{ kind: 'corrida', target_distance_km: 8 }], '2026-09-26')).toBe('uma corrida de 8 km');
    expect(treinoFalado([{ kind: 'ginasio', target_duration_min: 45 }], '2026-09-26')).toBe('um treino de ginásio de 45 minutos');
    expect(treinoFalado([LONGO, PERNAS], '2026-09-26')).toBe('uma rodagem longa de 16 km e um treino de pernas de 40 minutos');
  });

  it('o descanso e o item da prova não entram', () => {
    expect(treinoFalado([{ kind: 'descanso' }], '2026-09-26')).toBe('');
    expect(treinoFalado([{ kind: 'corrida', training_type: 'prova', target_distance_km: 10 }], '2026-09-26')).toBe('');
  });
});

describe('o aviso do servidor sem as frases velhas (backlog CarolCard.jsx:194 e :32)', () => {
  it('tira a frase do plano e as da água; os alertas de saúde ficam', () => {
    const texto = 'Para hoje tens agendado: Corrida (longo, 10.5 km). Registaste 800 ml de água — ainda não é metade da tua meta. '
      + 'A tua gordura corporal (7.5%) está abaixo do limiar de segurança (8%). É risco de RED-S — fala com um profissional de saúde.';
    expect(limparAvisoDoServidor(texto)).toBe('A tua gordura corporal (7.5%) está abaixo do limiar de segurança (8%). É risco de RED-S — fala com um profissional de saúde.');
    expect(limparAvisoDoServidor('Ainda não registaste água hoje.')).toBe('');
    // A redação antiga, com "hidratar-te".
    expect(limparAvisoDoServidor('Ainda não registaste consumo de água hoje. Começa a hidratar-te já.')).toBe('');
    expect(limparAvisoDoServidor('Perda de peso rápida (0.9 kg/semana, 1.3% do peso). Não estás a comer o suficiente para o treino que fazes.'))
      .toBe('Perda de peso rápida (0.9 kg/semana, 1.3% do peso). Não estás a comer o suficiente para o treino que fazes.');
  });

  it('"hidratos" não é água', () => {
    expect(limparAvisoDoServidor('Faltam hidratos ao jantar.')).toBe('Faltam hidratos ao jantar.');
  });

  it('vazio, em branco ou null dá texto vazio', () => {
    for (const v of [null, undefined, '', '   ']) expect(limparAvisoDoServidor(v)).toBe('');
  });
});

describe('o treino de hoje por fazer, à hora a que se lê', () => {
  it('de dia é o que o plano pede; das 19h às 21h o registo; depois, a pergunta — em dias seguidos', () => {
    for (const d of DIAS) {
      for (const { hora, min } of horasDe(d)) {
        const texto = linhaDoTreinoDeHoje({ pendentes: [LONGO], agora: at(hora) });
        const h = Math.floor(min / 60);
        const pool = h < 19 ? FRASES.treinoHoje('uma rodagem longa de 16 km')
          : h < 21 ? FRASES.treinoPorRegistar('uma rodagem longa de 16 km') : FRASES.treinoNaoRegistado;
        expect(pool, `${hora}`).toContain(texto);
        // Depois da meia-noite o treino é o do dia que começou: "hoje", como o chip.
        expect(texto, hora).not.toMatch(/amanhã|agendado|longo/i);
        expectCarolVoice(texto);
      }
    }
  });

  it('com dor acima do alarme no check-in, não se anuncia o treino sem ressalva', () => {
    const checkin = { date: '2026-09-26', pain: 5 };
    expect(linhaDoTreinoDeHoje({ pendentes: [LONGO], agora: at('2026-09-26T10:00:00'), checkin }))
      .toBe('Hoje tens uma rodagem longa de 16 km no plano, mas com a dor de que me falaste quero falar contigo antes de treinares.');
    expect(linhaDoTreinoDeHoje({ pendentes: [LONGO], agora: at('2026-09-26T22:00:00'), checkin })).toBe(FRASES.naoRegistadoComDor);
  });

  it('check-in em baixo: sem puxar, ou falar antes num treino de qualidade', () => {
    const agora = at('2026-09-26T10:00:00');
    expect(linhaDoTreinoDeHoje({ pendentes: [LONGO], agora, checkin: { sleep: 2 } })).toBe(FRASES.treinoEmBaixo('uma rodagem longa de 16 km'));
    expect(linhaDoTreinoDeHoje({ pendentes: [INTERVALOS], agora, checkin: { energy: 1 } })).toBe(FRASES.treinoEmBaixoQualidade('um treino intervalado de 8 km'));
    expect(linhaDoTreinoDeHoje({ pendentes: [LONGO], agora: at('2026-09-26T22:00:00'), checkin: { stress: 5 } })).toBe(FRASES.naoRegistadoCansado);
  });

  it('com parte feita, só se fala do que falta', () => {
    const texto = linhaDoTreinoDeHoje({ pendentes: [PERNAS], feitos: [LONGO], agora: at('2026-09-26T10:00:00') });
    expect(FRASES.treinoPorFazer('um treino de pernas de 40 minutos')).toContain(texto);
    expect(linhaDoTreinoDeHoje({ pendentes: [PERNAS], feitos: [LONGO], agora: at('2026-09-26T22:00:00') }))
      .toBe('Ainda me falta o registo de um treino de pernas de 40 minutos. Aconteceu alguma coisa?');
  });

  it('sem nada por fazer, não há linha', () => {
    expect(linhaDoTreinoDeHoje({ pendentes: [], agora: at('2026-09-26T10:00:00') })).toBeNull();
  });
});

describe('o dia sem resumo (backlog CarolCard.jsx:275)', () => {
  it('tipoDoDia: o plano e o que já está registado', () => {
    expect(tipoDoDia({ itens: [], comPlano: false })).toBe('semPlano');
    expect(tipoDoDia({ itens: [], comPlano: true })).toBe('semTreino');
    expect(tipoDoDia({ itens: [{ kind: 'descanso' }] })).toBe('descanso');
    expect(tipoDoDia({ itens: [{ kind: 'descanso', categories: ['so-refeicoes'] }] })).toBe('semTreino');
    expect(tipoDoDia({ itens: [LONGO], pendentes: [] })).toBe('feito');
    expect(tipoDoDia({ itens: [LONGO], pendentes: [LONGO] })).toBe('treino');
    expect(tipoDoDia({ itens: [], pendentes: [], provaFeita: true })).toBe('provaFeita');
  });

  it('nenhuma frase pede um registo, a nenhuma hora, nem fala de treino num dia sem ele — em dias seguidos', () => {
    for (const d of DIAS) {
      for (const hora of [`${d}T03:53:00`, `${d}T06:30:00`, `${d}T13:00:00`, `${d}T23:40:00`]) {
        const agora = at(hora);
        const descanso = linhaDoDia({ tipo: 'descanso', agora });
        expect(FRASES.descanso, hora).toContain(descanso);
        const semTreino = linhaDoDia({ tipo: 'semTreino', agora });
        expect(FRASES.semTreino, hora).toContain(semTreino);
        const semPlano = linhaDoDia({ tipo: 'semPlano', agora });
        expect(semPlano).toBe(FRASES.semPlano);
        const feito = linhaDoDia({ tipo: 'feito', feitos: [LONGO], agora });
        expect(FRASES.treinoFeito('uma rodagem longa de 16 km'), hora).toContain(feito);
        for (const t of [descanso, semTreino, semPlano]) expect(t, hora).not.toMatch(PRESSUPOE_TREINO);
        for (const t of [descanso, semTreino, semPlano, feito]) {
          expect(t, hora).not.toMatch(PEDE_REGISTO);
          expect(t).not.toMatch(/Sem nada a assinalar|refeição/);
          expectCarolVoice(t);
        }
      }
    }
  });

  it('um descanso com corrida registada pergunta-se; uma proposta à espera aponta-se', () => {
    expect(FRASES.corridaEmDescanso('8')).toContain(linhaDoDia({ tipo: 'descanso', kmHoje: 8.04, agora: at('2026-09-26T13:00:00') }));
    expect(linhaDoDia({ tipo: 'semPlano', propostas: 1 })).toBe('Deixei-te uma proposta de plano no chat. Vê-a e diz-me se serve.');
    expect(linhaDoDia({ tipo: 'semPlano', propostas: 2 })).toBe('Deixei-te 2 propostas de plano no chat. Vê-as e diz-me qual serve.');
  });

  it('a prova concluída: com a corrida, o balanço; sem ela, a pergunta', () => {
    expect(linhaDoDia({ tipo: 'provaFeita', kmHoje: 10.12 })).toBe('Vi os 10,1 km da prova de hoje. Quero fazer o balanço contigo.');
    expect(linhaDoDia({ tipo: 'provaFeita' })).toBe('A prova de hoje já passou. Conta-me como correu.');
  });
});

describe('o treino de amanhã (backlog CarolCard.jsx:217)', () => {
  it('antes da meia-noite "amanhã"; depois dela, o dia da semana', () => {
    for (const d of DIAS) {
      const amanha = proximo(d);
      const antes = linhaDeAmanha({ itens: [{ ...LONGO, planned_date: amanha }], agora: at(`${d}T23:40:00`) });
      expect(FRASES.amanhaTreino('uma rodagem longa de 16 km')).toContain(antes);
      // 00:40 do dia seguinte: o "amanhã" é o outro, e diz-se pelo nome.
      const depois = linhaDeAmanha({ itens: [LONGO], agora: at(`${amanha}T00:40:00`) });
      expect(depois).toMatch(/^(Segunda-feira|Terça-feira|Quarta-feira|Quinta-feira|Sexta-feira|Sábado|Domingo) tens uma rodagem longa de 16 km\.$/);
      expect(depois).not.toMatch(/amanhã|aponta para/i);
    }
    expect(linhaDeAmanha({ itens: [LONGO], agora: at('2026-09-26T00:40:00') })).toBe('Domingo tens uma rodagem longa de 16 km.');
  });

  it('sem treino amanhã (ou já feito), não há linha', () => {
    expect(linhaDeAmanha({ itens: [{ kind: 'descanso' }], agora: at('2026-09-26T10:00:00') })).toBeNull();
    expect(linhaDeAmanha({ itens: [{ ...LONGO, status: 'concluido' }], agora: at('2026-09-26T10:00:00') })).toBeNull();
  });
});

describe('a água (backlog CarolCard.jsx:194, :195 e :196)', () => {
  const profile = { water_reminder_enabled: true, water_goal_ml: 2500 };

  it('sem água registada: nada antes das 11h nem a partir das 23h — em dias seguidos, dos dois lados da meia-noite', () => {
    for (const d of DIAS) {
      for (const { hora, min } of horasDe(d)) {
        const texto = linhaDaAgua({ totalMl: 0, profile, agora: at(hora) });
        if (min < 11 * 60 || min >= 23 * 60) expect(texto, hora).toBeNull();
        else {
          expect(FRASES.semAgua, hora).toContain(texto);
          expectCarolVoice(texto);
        }
      }
    }
  });

  it('com a água em dia, não diz nada — mesmo que o resumo da manhã tivesse 0 ml', () => {
    expect(linhaDaAgua({ totalMl: 1500, profile, agora: at('2026-09-26T11:00:00') })).toBeNull();
    expect(linhaDaAgua({ totalMl: 2600, profile, agora: at('2026-09-26T21:00:00') })).toBeNull();
  });

  it('atrás do ritmo da janela dos lembretes: diz quanto vai e quanto devia ir, em litros', () => {
    // 16:00 na janela 8–22 → 8/14 da meta = 1,43 L; 0,8 L é menos de 70%.
    expect(linhaDaAgua({ totalMl: 800, profile, agora: at('2026-09-26T16:00:00') }))
      .toBe('Vais em 0,8 L de água, e a esta hora já devias ir em 1,4 L. Um copo agora.');
    // 800 ml às 11:30 não é "só": está à frente do ritmo.
    expect(linhaDaAgua({ totalMl: 800, profile, agora: at('2026-09-26T11:30:00') })).toBeNull();
    // A janela dele (10–18) muda o ritmo: às 16:00 já devia ir em 1,9 L.
    expect(linhaDaAgua({ totalMl: 800, profile: { ...profile, water_reminder_start_hour: 10, water_reminder_end_hour: 18 }, agora: at('2026-09-26T16:00:00') }))
      .toBe('Vais em 0,8 L de água, e a esta hora já devias ir em 1,9 L. Um copo agora.');
  });

  it('sem lembretes, ou silenciados hoje, não se cobra; silenciados ontem, sim', () => {
    const agora = at('2026-09-26T15:00:00');
    expect(linhaDaAgua({ totalMl: 0, profile: { ...profile, water_reminder_enabled: false }, agora })).toBeNull();
    expect(linhaDaAgua({ totalMl: 0, profile: { ...profile, water_reminder_muted_date: '2026-09-26' }, agora })).toBeNull();
    expect(linhaDaAgua({ totalMl: 0, profile: { ...profile, water_reminder_muted_date: '2026-09-25' }, agora })).not.toBeNull();
  });
});

describe('o dia da prova (backlog CarolCard.jsx:201)', () => {
  const race = (extra = {}) => ({ id: 'r1', name: 'Corrida do Tejo', status: 'agendada', distance_km: 10, start_time: '15:00', target_time_seconds: 2880, ...extra });
  const eveDe = (r) => computeRaceEve({ startTime: r.start_time, weightKg: 70, plannedFinishSeconds: r.target_time_seconds, distanceKm: r.distance_km });

  it('o caso do backlog: partida às 15:00, prova acabada e por registar — nada do horário pré-prova', () => {
    const r = race();
    const { text, action } = linhaDaProvaDeHoje({ race: r, eve: eveDe(r), firstKmPaceLabel: '4.54', agora: at('2026-09-26T19:00:00') });
    expect(FRASES.provaPorRegistar).toContain(text);
    expect(text).not.toMatch(/pequeno-almoço|aquecimento|partida às/);
    expect(action).toMatchObject({ label: 'Registar a prova', raceId: 'r1', registar: true });
  });

  it('antes, só os passos por vir; durante, a meta; depois, o registo — minuto a minuto, em dias seguidos', () => {
    for (const d of DIAS) {
      for (const inicio of ['09:00', '15:00']) {
        const r = race({ start_time: inicio });
        const eve = eveDe(r);
        const partida = Number(inicio.slice(0, 2)) * 60;
        for (const { hora, min } of horasDe(d, 10)) {
          const agora = at(hora);
          const { text, action } = linhaDaProvaDeHoje({ race: r, eve, firstKmPaceLabel: '4.54', agora });
          const momento = momentoDaProva(r, { hour: Math.floor(min / 60), minute: min % 60 });
          expectCarolVoice(text);
          if (momento === 'antes') {
            expect(min, hora).toBeLessThan(partida);
            // Sem artigo: "Hoje é dia de prova: Corrida do Tejo", nunca "Hoje é Corrida do Tejo".
            expect(text, hora).toMatch(/^Hoje é dia de prova: Corrida do Tejo, partida às /);
            // Cada hora dita a seguir a um passo ("às 6:15") ainda está para vir.
            const passos = [...text.replace(/partida às \d+:\d+/, '').replace(/acordas às \d+:\d+/, '').matchAll(/às (\d+):(\d+)/g)];
            for (const [, hh, mm] of passos) expect(Number(hh) * 60 + Number(mm), `${hora}: ${text}`).toBeGreaterThan(min);
            expect(action.label).toBe('Abrir o plano da prova');
          } else {
            expect(min, hora).toBeGreaterThanOrEqual(partida);
            expect(text, hora).not.toMatch(/partida às|pequeno-almoço|aquecimento|chegada às/);
            expect(action).toMatchObject({ label: 'Registar a prova', registar: true });
            if (momento === 'aCorrer') expect(text).toBe(FRASES.provaACorrer);
            else if (min >= 23 * 60) expect(text).toBe(FRASES.provaPorRegistarNoite);
            else expect(FRASES.provaPorRegistar, hora).toContain(text);
          }
        }
      }
    }
  });

  it('de madrugada, antes de ser hora de acordar para ela, a prova pede sono', () => {
    const r = race({ start_time: '09:00' });
    expect(linhaDaProvaDeHoje({ race: r, eve: eveDe(r), agora: at('2026-09-26T00:30:00') }).text)
      .toBe('Hoje é dia de prova: Corrida do Tejo, partida às 9:00. Agora, o que conta é dormir: acordas às 6:00.');
    // Às 04:30, a 4 h 30 da partida, já é hora de acordar: os passos todos.
    expect(linhaDaProvaDeHoje({ race: r, eve: eveDe(r), agora: at('2026-09-26T04:30:00') }).text)
      .toMatch(/^Hoje é dia de prova: Corrida do Tejo, partida às 9:00\. Pequeno-almoço às 6:15, chegada às 8:00, água até às 8:15 e aquecimento às 8:35\./);
  });

  it('a minutos da partida: quanto falta, e o ritmo do km 1', () => {
    const r = race({ start_time: '09:00' });
    expect(linhaDaProvaDeHoje({ race: r, eve: eveDe(r), firstKmPaceLabel: '4.54', agora: at('2026-09-26T08:50:00') }).text)
      .toBe('Hoje é dia de prova: Corrida do Tejo, partida às 9:00, daqui a 10 minutos. O teu plano km a km está no hub da prova: arrancas a 4.54.');
  });

  it('sem objetivo: o botão marca o objetivo (longe da partida), e a frase pede-o só então', () => {
    const r = race({ start_time: '09:00', target_time_seconds: null });
    const cedo = linhaDaProvaDeHoje({ race: r, eve: eveDe(r), agora: at('2026-09-26T06:30:00') });
    expect(cedo.text).toMatch(/Marca o objetivo de tempo na prova/);
    expect(cedo.action.label).toBe('Marcar o objetivo na prova');
    const perto = linhaDaProvaDeHoje({ race: r, eve: eveDe(r), agora: at('2026-09-26T08:30:00') });
    expect(perto.text).not.toMatch(/Marca o objetivo/);
    expect(perto.action.label).toBe('Abrir a prova');
  });

  it('com uma corrida registada depois da partida, pergunta pela prova e leva ao hub', () => {
    const r = race();
    const { text, action } = linhaDaProvaDeHoje({ race: r, eve: eveDe(r), agora: at('2026-09-26T16:30:00'), kmHoje: 10.2 });
    expect(text).toBe('Vi 10,2 km registados hoje. Quero saber como correu a prova.');
    expect(action).toEqual({ label: 'Abrir a prova', raceId: 'r1' });
  });

  it('sem hora marcada: antes das 9h os conselhos; do meio-dia em diante, o registo', () => {
    const r = race({ start_time: null });
    const eve = eveDe(r);
    expect(linhaDaProvaDeHoje({ race: r, eve, agora: at('2026-09-26T07:00:00') }).text).toMatch(/^Hoje é dia de prova: Corrida do Tejo\. Pequeno-almoço 2 h 45 antes da partida/);
    expect(FRASES.provaPorRegistar).toContain(linhaDaProvaDeHoje({ race: r, eve, agora: at('2026-09-26T13:00:00') }).text);
  });
});

describe('a véspera da prova (backlog CarolCard.jsx:215)', () => {
  const race = { id: 'r1', name: 'Corrida do Tejo', status: 'agendada', distance_km: 10, start_time: '09:00', target_time_seconds: 2880 };
  const eve = computeRaceEve({ startTime: '09:00', weightKg: 70, plannedFinishSeconds: 2880, distanceKm: 10 });

  it('o caso do backlog: às 23:15 o jantar e a hora de deitar já passaram', () => {
    expect(linhaDaVespera({ race, eve, agora: at('2026-09-26T23:15:00') }))
      .toBe('Amanhã é dia de prova: Corrida do Tejo (10 km), partida às 9:00. Deita-te já: acordas às 6:00.');
  });

  it('só os passos por vir, minuto a minuto; antes da meia-noite "amanhã", depois o dia da semana', () => {
    for (const d of DIAS) {
      for (const { hora, min } of horasDe(d, 10)) {
        const texto = linhaDaVespera({ race, eve, agora: at(hora) });
        expectCarolVoice(texto);
        if (min < 5 * 60) expect(texto, hora).toMatch(/^(Segunda-feira|Terça-feira|Quarta-feira|Quinta-feira|Sexta-feira|Sábado|Domingo) é dia de prova: Corrida do Tejo/);
        else expect(texto, hora).toMatch(/^Amanhã é dia de prova: Corrida do Tejo \(10 km\), partida às 9:00\./);
        if (min >= 22 * 60) {
          expect(texto, hora).toMatch(/Deita-te já: acordas às 6:00\.$/);
          expect(texto, hora).not.toMatch(/jantar/i);
        } else {
          if (min >= 19 * 60 + 30) expect(texto, hora).not.toMatch(/jantar/i);
          else expect(texto, hora).toMatch(/Jantar até às 19:30 \(140-280 g de hidratos\)/);
          expect(texto, hora).toMatch(/deitar às 22:00, acordar às 6:00, pequeno-almoço às 6:15 e chegada às 8:00\.$/i);
        }
      }
    }
  });

  it('sem hora marcada, pede-a; à noite já não manda jantar', () => {
    const semHora = computeRaceEve({ startTime: null, weightKg: 70, distanceKm: 10 });
    const r = { ...race, start_time: null };
    expect(linhaDaVespera({ race: r, eve: semHora, agora: at('2026-09-26T12:00:00') }))
      .toBe('Amanhã é dia de prova: Corrida do Tejo (10 km). Sem hora de partida marcada não consigo dar horas: marca-a na prova. Jantar de hidratos complexos, pouca fibra, e 8 h de sono.');
    expect(linhaDaVespera({ race: r, eve: semHora, agora: at('2026-09-26T22:30:00') })).toMatch(/Esta noite, 8 h de sono\.$/);
  });

  it('distância com vírgula, sem as casas do servidor', () => {
    const r = { ...race, distance_km: 21.0975 };
    expect(linhaDaVespera({ race: r, eve, agora: at('2026-09-26T12:00:00') })).toMatch(/Corrida do Tejo \(21,1 km\)/);
  });
});

describe('ferramentas', () => {
  it('semZero e kmFalado', () => {
    expect(semZero('06:15')).toBe('6:15');
    expect(semZero('09:30:00')).toBe('9:30');
    expect(semZero('15:00')).toBe('15:00');
    expect(kmFalado(21.0975)).toBe('21,1');
    expect(kmFalado(null)).toBeNull();
    expect(kmFalado(0)).toBeNull();
  });
});
