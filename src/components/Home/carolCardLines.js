/* As frases determinísticas do cartão da Carol no Início (CarolCard.jsx).

   Pedido 2026-09-26: a Carol nunca pode parecer um autómato. O cartão
   juntava o resumo diário (coach-daily-summary), gerado uma vez por dia e
   guardado em cache, com frases fixas escolhidas sem olhar para a hora nem
   para o que o dia é. Daí saíam coisas como o horário pré-prova com a prova
   já corrida, o jantar da véspera às 23:15, «Ainda não registaste água
   hoje.» às 03:53 (ou por cima de um anel que já mostrava 1,5 L), «Corrida
   (continuo, 8 km)» com o valor cru da base de dados, e «Regista uma
   refeição ou um treino» num dia de descanso.

   A regra é a das boas-vindas (utils/carolWelcome.js): uma frase escolhe-se
   pela mesma condição que a torna verdadeira: o dia e a hora de Lisboa, o
   plano, o que já está registado e o check-in. Tudo aqui é puro (dados e
   instante → texto), para os testes percorrerem dias e horas sem montar o
   cartão. Voz de CAROL.md: afirma, frases curtas, sem emoji nem exclamação,
   e nada que ela não saiba. */

import { lisbonParts, pickByDay, carolDay, acordouParaAProva } from '../../utils/carolWelcome';
import { isRacePlanItem, formatWeekday } from '../../utils/homeModels';
import { addDaysISO } from '../../lib/utils';
import { PAIN_ALARM_THRESHOLD } from '@formulas/checkinAlarms.ts';
import { isMealOnlyItem } from '@formulas/mealSuggestions.ts';

/* ── pequenas ferramentas ───────────────────────────────────────────────── */

/** "09:30" ou "09:30:00" → 570; null se não for uma hora. */
function minutosDe(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** "06:15" → "6:15", como se diz, e como o chip das boas-vindas escreve. */
export const semZero = (hhmm) => String(hhmm).slice(0, 5).replace(/^0(?=\d:)/, '');

/** 21.0975 → "21,1"; null sem distância. */
export function kmFalado(v) {
  const n = Number(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

/** 800 → "0,8 L", a grafia do anel da Água. */
const litros = (ml) => `${String(Math.round(ml / 100) / 10).replace('.', ',')} L`;
/** "a", "a e b", "a, b e c". */
const juntar = (l) => (l.length <= 1 ? (l[0] || '') : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`);
const maiuscula = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const ehTreino = (i) => !!i && (i.kind === 'corrida' || i.kind === 'ginasio');

// Séries, ritmo, fartlek e subidas não se fazem "sem puxar": puxar é o treino
// (o mesmo conjunto que as boas-vindas usam).
const TREINOS_DE_QUALIDADE = new Set(['tempo', 'fartlek', 'intervalos', 'subidas']);

/* O treino dito numa frase, com a voz das boas-vindas: "uma rodagem longa
   de 16 km", e não "Corrida (longo, 16 km)" nem "Rodagem longa · 16 km" (o
   rótulo do chip a meio de uma frase era o que mais soava a gerado). Em vez
   de copiar o dicionário de carolWelcome.js, pede-se a carolDay que fale
   destes itens: uma treinadora não diz o mesmo treino de duas maneiras. Os
   itens da prova ficam de fora (a prova diz-se pela frase dela). */
const PLANO_DO_CARTAO = 'cartao-da-carol';
export function treinoFalado(items, dateISO) {
  const treino = (items || []).filter(ehTreino);
  if (!treino.length) return '';
  return carolDay(dateISO, {
    coachPlans: [{ id: PLANO_DO_CARTAO, status: 'aceite' }],
    coachPlanItems: treino.map((i) => ({ ...i, plan_id: PLANO_DO_CARTAO, planned_date: dateISO, status: 'pendente' })),
  }).falado;
}

/* ── as frases ──────────────────────────────────────────────────────────────
   Cada conjunto só serve a situação em que todas as frases dele são
   verdadeiras, e a frase escolhe-se pelo dia (pickByDay): igual durante o
   dia, outra no seguinte, como nas boas-vindas. */
export const FRASES = {
  treinoHoje: (t) => [`Hoje tens ${t}.`, `Para hoje, o plano pede ${t}.`, `Hoje o plano é ${t}.`],
  treinoPorFazer: (t) => [`Ainda tens ${t} por fazer.`, `O dia ainda não acabou: tens ${t} por fazer.`],
  // Das 19h às 21h o treino ainda pode estar a acontecer: diz-se o que falta
  // registar, sem perguntar o que correu mal.
  treinoPorRegistar: (t) => [`Ainda tens ${t} por registar.`, 'Ainda não vi o treino de hoje registado.', 'Falta-me o registo do treino de hoje.'],
  // CAROL.md §3: um treino não registado pergunta-se, não se dá como falhado.
  treinoNaoRegistado: ['Não vi o treino de hoje registado. Aconteceu alguma coisa?', 'O treino de hoje ainda não apareceu. Correu tudo bem?', 'Falta-me o registo do treino de hoje. Conta-me o que se passou.'],
  parteNaoRegistada: (t) => `Ainda me falta o registo de ${t}. Aconteceu alguma coisa?`,
  // O check-in já explica o treino que não apareceu: não se pergunta outra vez.
  naoRegistadoComDor: 'Não vi o treino de hoje registado, e com a dor de que me falaste faz sentido. Como estás agora?',
  restoNaoRegistadoComDor: 'O resto do treino de hoje não apareceu, e com a dor de que me falaste faz sentido. Como estás agora?',
  naoRegistadoCansado: 'Não vi o treino de hoje registado, e pelo que me contaste faz sentido.',
  restoNaoRegistadoCansado: 'O resto do treino de hoje não apareceu, e pelo que me contaste faz sentido.',
  treinoComDor: (t) => `Hoje tens ${t} no plano, mas com a dor de que me falaste quero falar contigo antes de treinares.`,
  treinoEmBaixo: (t) => `Hoje tens ${t}. Pelo que me disseste no check-in, faz-se sem puxar.`,
  treinoEmBaixoQualidade: (t) => `Hoje tens ${t}. Pelo que me disseste no check-in, fala comigo antes de treinares.`,
  treinoFeito: (t) => (t
    ? [`Hoje já fizeste ${t}.`, 'O treino de hoje está feito.', 'Já vi o treino de hoje registado. O resto do dia é para recuperar.']
    : ['O treino de hoje está feito.', 'Já vi o treino de hoje registado. O resto do dia é para recuperar.']),
  descanso: ['Hoje é dia de descanso.', 'Hoje o plano é descansar.', 'Hoje não há treino: é dia de descanso.'],
  // CAROL.md §3: um descanso não respeitado não passa em silêncio, mas
  // pergunta-se, não se ralha.
  corridaEmDescanso: (k) => [`Hoje era dia de descanso e vi ${k} km registados. Como está o corpo?`, `Hoje era dia de descanso e correste ${k} km. Como estão as pernas?`],
  semTreino: ['Hoje não há treino no plano.', 'O plano não pede treino hoje.', 'Hoje não tens treino no plano.'],
  amanhaTreino: (t) => [`Amanhã tens ${t}.`, `Para amanhã, o plano pede ${t}.`, `Amanhã o plano é ${t}.`],
  // "vi" e não "bebeste": a app só sabe o que foi registado.
  semAgua: ['Ainda não vi água registada hoje.', 'Ainda não vi água registada hoje. Um copo agora, e regista-o.', 'Hoje ainda não vi nenhum copo de água registado. Começa já por um.'],
  aguaAtras: (vais, devias) => `Vais em ${vais} de água, e a esta hora já devias ir em ${devias}. Um copo agora.`,
  provaACorrer: 'Quando cortares a meta, regista a prova. Quero fazer o balanço contigo.',
  provaComCorrida: (k) => `Vi ${k} km registados hoje. Quero saber como correu a prova.`,
  provaPorRegistar: ['Já cortaste a meta? Regista a prova e fazemos o balanço.', 'Ainda não vi a prova de hoje registada. Quero saber como correu.', 'Falta-me o registo da prova de hoje. Regista-a e fazemos o balanço.'],
  // Às 23h não se pede um registo: fica para amanhã.
  provaPorRegistarNoite: 'Ainda não vi a prova de hoje registada. Regista-a amanhã, com calma; agora, descansa.',
  provaFeita: (k) => `Vi os ${k} km da prova de hoje. Quero fazer o balanço contigo.`,
  provaFeitaSemCorrida: 'A prova de hoje já passou. Conta-me como correu.',
  semPlano: 'Ainda não temos plano. Diz-me o que queres preparar e monto-o contigo.',
  propostaPorVer: (n) => (n === 1
    ? 'Deixei-te uma proposta de plano no chat. Vê-a e diz-me se serve.'
    : `Deixei-te ${n} propostas de plano no chat. Vê-as e diz-me qual serve.`),
};

/* ── o aviso do servidor ────────────────────────────────────────────────────
   O `warnings` do coach-daily-summary é texto determinístico (nunca passa
   pelo modelo): a frase do plano, a da água, e os alertas de RED-S e de
   perda de peso. As duas primeiras ficam velhas assim que o resumo entra em
   cache: o plano sai em enum cru e não sabe do treino registado depois; a
   água é a das 07:30 às 16:00. O cartão tira-as e escreve-as ele, a partir
   do que o store tem agora; os alertas de saúde ficam, que são do servidor. */
const FRASE_DO_PLANO = /^Para hoje tens agendado:/;
// "hidrata" e não "hidrat": "hidratos" são hidratos de carbono, não água.
// Sem \b antes de "água": em JavaScript o \b é só ASCII e nunca casa entre
// um espaço e um "á".
const FALA_DE_AGUA = /água|\bagua\b|\bhidrata/i;

/** O aviso do servidor sem a frase do plano nem as da água. */
export function limparAvisoDoServidor(text) {
  if (typeof text !== 'string' || !text.trim()) return '';
  // Frases acabadas em ponto e espaço: "10.5 km" e "(ACWR 1.62)" não cortam.
  return text.trim().split(/(?<=\.)\s+/)
    .filter((f) => !FRASE_DO_PLANO.test(f) && !FALA_DE_AGUA.test(f))
    .join(' ')
    .trim();
}

/* ── o dia ──────────────────────────────────────────────────────────────── */

/**
 * O que o dia é, para o cartão: 'provaFeita' | 'treino' (há treino por
 * fazer) | 'feito' | 'descanso' | 'semTreino' (só refeições, ou um dia vazio
 * dentro do plano) | 'semPlano'. Os mesmos nomes de carolDay, com o que o
 * cartão já sabe: o que foi registado sem ficar ligado ao item do plano.
 */
export function tipoDoDia({ itens = [], pendentes = [], provaFeita = false, comPlano = false }) {
  if (provaFeita && !pendentes.length) return 'provaFeita';
  if (!itens.length) return comPlano ? 'semTreino' : 'semPlano';
  if (!itens.some(ehTreino)) return itens.every(isMealOnlyItem) ? 'semTreino' : 'descanso';
  return pendentes.length ? 'treino' : 'feito';
}

/**
 * O treino de hoje por fazer, dito à hora a que se lê e com o check-in de
 * hoje: de dia o que o plano pede (sem puxar, ou falando antes, se o
 * check-in o pedir); das 19h às 21h o que falta registar; depois, a
 * pergunta. Entre a meia-noite e as 5h o dia de Lisboa já é o novo, e o
 * treino dele diz-se "hoje", como o chip do plano logo abaixo.
 */
export function linhaDoTreinoDeHoje({ pendentes = [], feitos = [], agora = new Date(), checkin = null }) {
  if (!pendentes.length) return null;
  const { date: hoje, hour } = lisbonParts(agora);
  const t = treinoFalado(pendentes, hoje);
  if (!t) return pendentes.some(isRacePlanItem) ? 'Hoje é dia de prova.' : null;
  const pick = (pool, s) => pickByDay(pool, hoje, s);
  const dor = (Number(checkin?.pain) || 0) >= PAIN_ALARM_THRESHOLD;
  const sono = Number(checkin?.sleep) || 0;
  const energia = Number(checkin?.energy) || 0;
  const emBaixo = (sono > 0 && sono <= 2) || (energia > 0 && energia <= 2) || (Number(checkin?.stress) || 0) >= 4;
  const qualidade = pendentes.some((i) => i.kind === 'corrida' && TREINOS_DE_QUALIDADE.has(i.training_type));
  const parte = feitos.length > 0;

  if (hour >= 19) {
    if (dor) return parte ? FRASES.restoNaoRegistadoComDor : FRASES.naoRegistadoComDor;
    if (hour < 21) return pick(FRASES.treinoPorRegistar(t), 'cartaoTreinoPorRegistar');
    if (emBaixo) return parte ? FRASES.restoNaoRegistadoCansado : FRASES.naoRegistadoCansado;
    return parte ? FRASES.parteNaoRegistada(t) : pick(FRASES.treinoNaoRegistado, 'cartaoTreinoNaoRegistado');
  }
  if (dor) return FRASES.treinoComDor(t);
  if (emBaixo) return qualidade ? FRASES.treinoEmBaixoQualidade(t) : FRASES.treinoEmBaixo(t);
  if (parte) return pick(FRASES.treinoPorFazer(t), 'cartaoTreinoPorFazer');
  return pick(FRASES.treinoHoje(t), 'cartaoTreinoHoje');
}

/**
 * O dia sem treino por fazer, para quando o resumo não trouxe recapitulação
 * (o modelo falhou, ou ainda não houve resumo hoje). Substitui o antigo «Sem
 * nada a assinalar por agora. Regista uma refeição ou um treino…», que pedia
 * um treino num dia de descanso e uma refeição às 03:53. Nenhuma destas
 * frases pede um registo, a nenhuma hora.
 */
export function linhaDoDia({ tipo, feitos = [], kmHoje = 0, propostas = 0, agora = new Date() }) {
  const { date: hoje } = lisbonParts(agora);
  const pick = (pool, s) => pickByDay(pool, hoje, s);
  const k = kmFalado(kmHoje);
  if (tipo === 'provaFeita') return k ? FRASES.provaFeita(k) : FRASES.provaFeitaSemCorrida;
  if (tipo === 'feito') return pick(FRASES.treinoFeito(treinoFalado(feitos, hoje)), 'cartaoTreinoFeito');
  if (tipo === 'descanso') return k ? pick(FRASES.corridaEmDescanso(k), 'cartaoCorridaEmDescanso') : pick(FRASES.descanso, 'cartaoDescanso');
  if (tipo === 'semTreino') return pick(FRASES.semTreino, 'cartaoSemTreino');
  // Sem plano aceite: com uma proposta à espera, é para ela que se aponta
  // (o banner do cartão do plano diz o mesmo); sem nenhuma, oferece-se.
  return propostas > 0 ? FRASES.propostaPorVer(propostas) : FRASES.semPlano;
}

/** O treino de amanhã. Entre a meia-noite e as 5h, "amanhã" é ambíguo para
 *  quem ainda não dormiu: diz-se o dia da semana. */
export function linhaDeAmanha({ itens = [], agora = new Date() }) {
  const { date: hoje, hour } = lisbonParts(agora);
  const amanha = addDaysISO(hoje, 1);
  const t = treinoFalado((itens || []).filter((i) => i.status !== 'concluido'), amanha);
  if (!t) return null;
  if (hour < 5) return `${maiuscula(formatWeekday(amanha))} tens ${t}.`;
  return pickByDay(FRASES.amanhaTreino(t), hoje, 'cartaoAmanha');
}

/* ── a água ─────────────────────────────────────────────────────────────── */

const LEMBRETES_INICIO = 8;
const LEMBRETES_FIM = 22;

/**
 * A linha da água, sempre a partir dos registos de hoje (dia de Lisboa) e
 * nunca do texto do resumo. Só a quem ligou os lembretes de água e não os
 * silenciou hoje; só das 11h às 23h (antes, um aviso de água é uma
 * notificação de madrugada; depois, é pedir um registo a quem vai dormir). Com
 * alguma água registada, só fala se estiver abaixo de 70% do que a esta
 * hora já devia ir, na janela dos lembretes dele: 800 ml às 11:30 não é
 * "só" (o antigo «Só registaste 800 ml de água.» julgava sem olhar à hora).
 */
export function linhaDaAgua({ totalMl = 0, profile = null, agora = new Date() }) {
  const meta = profile?.water_reminder_enabled ? Number(profile?.water_goal_ml) || 0 : 0;
  if (meta <= 0) return null;
  const { date: hoje, hour, minute } = lisbonParts(agora);
  if (profile?.water_reminder_muted_date === hoje) return null;
  if (hour < 11 || hour >= 23) return null;
  if (!(totalMl > 0)) return pickByDay(FRASES.semAgua, hoje, 'cartaoSemAgua');
  const hora = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const ini = hora(profile?.water_reminder_start_hour);
  const fim = hora(profile?.water_reminder_end_hour);
  // Uma janela que atravessa a meia-noite (ou por preencher) conta como a de omissão.
  const [a, b] = ini != null && fim != null && ini < fim ? [ini, fim] : [LEMBRETES_INICIO, LEMBRETES_FIM];
  const fracao = Math.min(1, Math.max(0, (hour * 60 + minute - a * 60) / ((b - a) * 60)));
  const esperado = meta * fracao;
  if (totalMl >= esperado * 0.7) return null;
  const vais = litros(totalMl);
  const devias = litros(esperado);
  return vais === devias ? null : FRASES.aguaAtras(vais, devias);
}

/* ── a prova ────────────────────────────────────────────────────────────── */

/**
 * Em que ponto está a prova de hoje: 'antes' da partida, 'aCorrer' (até à
 * meta estimada pelo objetivo, ou a 7 min/km; sem distância, 3 h), ou
 * 'depois'. Sem hora marcada: antes das 9h, entre as 9h e o meio-dia, e
 * depois. É a mesma régua das boas-vindas (buildWelcome, momentoDaProva),
 * para o cartão e a saudação nunca discordarem sobre se a prova já acabou.
 */
export function momentoDaProva(race, { hour, minute }) {
  const inicio = minutosDe(race?.start_time);
  if (inicio == null) return hour >= 12 ? 'depois' : hour >= 9 ? 'aCorrer' : 'antes';
  const passou = hour * 60 + minute - inicio;
  if (passou < 0) return 'antes';
  const duracao = Number(race?.target_time_seconds) > 0 ? race.target_time_seconds / 60
    : Number(race?.distance_km) > 0 ? Number(race.distance_km) * 7 : 180;
  return passou < duracao ? 'aCorrer' : 'depois';
}

/**
 * A frase do dia da prova e o botão dela: { text, action }. Antes da
 * partida, só os passos por vir (o pequeno-almoço das 06:15 não se manda
 * tomar às 08:00); de madrugada, antes de ser hora de acordar para ela,
 * dormir; já na prova, o pedido para quando cortar a meta; depois, o registo
 * e o balanço, e nunca mais o horário pré-prova. `action.registar` abre o
 * registo da prova, em vez do hub.
 */
export function linhaDaProvaDeHoje({ race, eve, firstKmPaceLabel = null, agora = new Date(), kmHoje = 0 }) {
  const { date: hoje, hour, minute } = lisbonParts(agora);
  const agoraMin = hour * 60 + minute;
  const raceId = race?.id;
  const nome = race?.name ? `: ${race.name}` : '';
  const abrir = { label: 'Abrir a prova', raceId };
  const registar = { label: 'Registar a prova', raceId, registar: true };

  const momento = momentoDaProva(race, { hour, minute });
  if (momento !== 'antes') {
    // Com uma corrida registada hoje, a prova pode ter sido ela, gravada como
    // corrida normal: pergunta-se pela prova, e o botão leva ao hub, não a
    // um segundo registo.
    const k = kmFalado(kmHoje);
    if (k) return { text: FRASES.provaComCorrida(k), action: abrir };
    if (momento === 'aCorrer') return { text: FRASES.provaACorrer, action: registar };
    if (hour >= 23) return { text: FRASES.provaPorRegistarNoite, action: registar };
    return { text: pickByDay(FRASES.provaPorRegistar, hoje, 'cartaoProvaPorRegistar'), action: registar };
  }

  const s = eve?.schedule || null;
  const inicio = s ? minutosDe(s.start) : null;
  const falta = inicio != null ? inicio - agoraMin : null;
  const plano = firstKmPaceLabel ? ` O teu plano km a km está no hub da prova: arrancas a ${firstKmPaceLabel}.` : '';
  // Sem objetivo não há plano km a km. Longe da partida pede-se o objetivo;
  // a menos de uma hora dela já não é altura (e o botão deixa de o oferecer).
  const pedeObjetivo = !firstKmPaceLabel && (falta == null || falta > 60);
  const objetivo = pedeObjetivo ? ' Marca o objetivo de tempo na prova para teres o plano km a km no hub.' : '';
  const action = firstKmPaceLabel ? { label: 'Abrir o plano da prova', raceId }
    : pedeObjetivo ? { label: 'Marcar o objetivo na prova', raceId } : abrir;

  if (!s) return { text: `Hoje é dia de prova${nome}. Pequeno-almoço 2 h 45 antes da partida, água aos goles até 45 min antes.${plano}${objetivo}`, action };

  const cabeca = `Hoje é dia de prova${nome}, partida às ${semZero(s.start)}`;
  // De madrugada, antes de ser hora de acordar para ela (a mesma regra das
  // boas-vindas), a única coisa a fazer pela prova é dormir.
  if (hour < 5 && !acordouParaAProva(race, agora)) {
    const acorda = minutosDe(s.wake);
    const quando = acorda > agoraMin && acorda < 12 * 60 ? `: acordas às ${semZero(s.wake)}` : '';
    return { text: `${cabeca}. Agora, o que conta é dormir${quando}.`, action };
  }
  // Todos os passos antecedem a partida: um que no relógio fique depois dela
  // (numa partida à 01:00 o pequeno-almoço é às 22:15) é da véspera.
  const quandoE = (hhmm) => { const m = minutosDe(hhmm); return m > inicio ? m - 1440 : m; };
  const passos = [[s.breakfast, 'pequeno-almoço às'], [s.arrival, 'chegada às'], [s.waterUntil, 'água até às'], [s.warmup, 'aquecimento às']]
    .map(([h, rotulo]) => ({ t: quandoE(h), txt: `${rotulo} ${semZero(h)}` }))
    .filter((p) => p.t > agoraMin)
    .sort((x, y) => x.t - y.t)
    .map((p) => p.txt);
  if (!passos.length) return { text: `${cabeca}, daqui a ${falta} ${falta === 1 ? 'minuto' : 'minutos'}.${plano}`, action };
  // Os passos numa frase à parte, como na véspera: "dia de prova: X, partida
  // às 9:00: chegada às …" eram dois dois-pontos na mesma frase.
  return { text: `${cabeca}. ${maiuscula(juntar(passos))}.${plano}${objetivo}`, action };
}

/**
 * A véspera da prova, só com os passos por vir: às 23:15 o jantar e a hora
 * de deitar já passaram, e o que há a dizer é que se deite. Os passos
 * contam-se a partir da meia-noite da véspera, para uma partida ao fim da
 * tarde (deitar e jantar já no próprio dia da prova) não os dar como
 * passados. Entre a meia-noite e as 5h diz-se o dia da semana, e não
 * "amanhã".
 */
export function linhaDaVespera({ race, eve, agora = new Date() }) {
  const { date: hoje, hour, minute } = lisbonParts(agora);
  const amanha = addDaysISO(hoje, 1);
  const quando = hour < 5 ? maiuscula(formatWeekday(amanha)) : 'Amanhã';
  const nome = race?.name ? `: ${race.name}` : '';
  const k = kmFalado(race?.distance_km);
  const dist = k ? ` (${k} km)` : '';
  const s = eve?.schedule || null;
  if (!s) {
    const noite = hour >= 21 ? 'Esta noite, 8 h de sono.' : 'Jantar de hidratos complexos, pouca fibra, e 8 h de sono.';
    return `${quando} é dia de prova${nome}${dist}. Sem hora de partida marcada não consigo dar horas: marca-a na prova. ${noite}`;
  }
  const agoraMin = hour * 60 + minute;
  const inicio = 1440 + minutosDe(s.start);
  const quandoE = (hhmm) => { const m = minutosDe(hhmm); return m + 1440 <= inicio ? m + 1440 : m; };
  const cabeca = `${quando} é dia de prova${nome}${dist}, partida às ${semZero(s.start)}`;
  if (agoraMin >= quandoE(s.bed)) return `${cabeca}. Deita-te já: acordas às ${semZero(s.wake)}.`;
  const hidratos = eve.dinnerCarbsG ? ` (${eve.dinnerCarbsG.low}-${eve.dinnerCarbsG.high} g de hidratos)` : '';
  const passos = [
    [s.dinnerBy, `jantar até às ${semZero(s.dinnerBy)}${hidratos}`],
    [s.bed, `deitar às ${semZero(s.bed)}`],
    [s.wake, `acordar às ${semZero(s.wake)}`],
    [s.breakfast, `pequeno-almoço às ${semZero(s.breakfast)}`],
    [s.arrival, `chegada às ${semZero(s.arrival)}`],
  ]
    .map(([h, txt]) => ({ t: quandoE(h), txt }))
    .filter((p) => p.t > agoraMin)
    .sort((x, y) => x.t - y.t)
    .map((p) => p.txt);
  return `${cabeca}. ${maiuscula(juntar(passos))}.`;
}
