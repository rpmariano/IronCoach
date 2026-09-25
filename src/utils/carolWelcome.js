/* As boas-vindas da Carol — "a sala da Carol" (canvas de design
   "Boas-vindas da Carol", 2026-09-19).

   Antes da Home, na primeira abertura da app dentro de cada uma das quatro
   faixas do dia (hora de Lisboa), a Carol recebe o atleta como uma
   treinadora que o vê entrar: o nome, duas frases dela, e a coisa que
   interessa hoje. No dia de uma prova, a versão da prova aparece UMA vez, na
   primeira abertura do dia, e ocupa o lugar da saudação dessa faixa; as
   faixas seguintes voltam à saudação normal. Na véspera, o mesmo com a
   versão da véspera. Entre duas saudações de faixa passam pelo menos 2 h
   (WELCOME_MIN_GAP_MS); a prova e a véspera não esperam.

   Tudo aqui é puro (data, dados, memória do que já se viu → decisão e texto),
   para os testes não precisarem de relógio nem de browser. As frases saem
   dos dados que a app já tem — check-in, plano aceite, corridas, refeições,
   provas — e nunca inventam: sem dados para dizer algo específico, ela fica
   pela saudação e pelo plano. Voz de CAROL.md: afirma, frases curtas, sem
   emoji nem exclamação. */

import { formatPace } from './run';
import { normalizeGender } from '@formulas/vocabulary.ts';
import { planItemTitle, raceNameForDate, hasAnyRecord } from './homeModels';
import { isMealOnlyItem, MEAL_ONLY_DAY_LABEL } from '@formulas/mealSuggestions.ts';

export const WELCOME_SLOTS = ['manha', 'tarde', 'noite', 'madrugada'];

/** Data e hora de Lisboa de um instante: { date: 'YYYY-MM-DD', hour, minute, weekday }. */
export function lisbonParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** A faixa de uma hora: manhã 5–12, tarde 12–19, noite 19–23, madrugada 23–5. */
export function slotForHour(hour) {
  if (hour >= 5 && hour < 12) return 'manha';
  if (hour >= 12 && hour < 19) return 'tarde';
  if (hour >= 19 && hour < 23) return 'noite';
  return 'madrugada';
}

/** A chave da faixa em que se está. A madrugada é UMA faixa mesmo passando a
 *  meia-noite: das 0h às 5h pertence à noite do dia anterior (23h de sábado e
 *  2h de domingo dão a mesma chave). */
export function slotKey(now = new Date()) {
  const { date, hour } = lisbonParts(now);
  const slot = slotForHour(hour);
  const slotDate = slot === 'madrugada' && hour < 5 ? addDays(date, -1) : date;
  return { slot, key: `${slotDate}:${slot}`, date, hour };
}

/** A prova de hoje (dia de Lisboa), por concluir. */
export function raceToday(raceEvents, dateISO) {
  return (raceEvents || []).find((r) => r && typeof r.date === 'string'
    && r.date.slice(0, 10) === dateISO && r.status !== 'concluida') || null;
}

/** O intervalo mínimo entre duas saudações de faixa (ação P.11): quem abriu
 *  a app às 11h50 não volta a ser saudado às 12h05 só porque a tarde
 *  começou. A prova e a véspera passam sempre. */
export const WELCOME_MIN_GAP_MS = 2 * 60 * 60 * 1000;

/**
 * Deve aparecer agora? `seen` é a lista de chaves já mostradas; `lastShownAt`
 * (epoch ms, ou null) é quando apareceram as últimas boas-vindas, em
 * qualquer dispositivo. Devolve null, ou { variant, key, markKeys } —
 * `markKeys` são as chaves a gravar como vistas (a da prova e a da véspera
 * ocupam também a da faixa).
 *
 * Uma faixa adiada pelo intervalo mínimo não se gasta: devolve-se null sem
 * chave nenhuma, e a saudação dela aparece na primeira abertura depois do
 * intervalo, se ainda for a mesma faixa.
 */
export function decideWelcome({ now = new Date(), raceEvents = [], seen = [], lastShownAt = null } = {}) {
  const { slot, key, date } = slotKey(now);
  const vistas = new Set(seen || []);
  // De madrugada, mesmo no dia da prova, é a madrugada: a versão da prova é
  // para quando o dia começa (a partir das 5h), não para as 00:30.
  const race = slot === 'madrugada' ? null : raceToday(raceEvents, date);
  if (race) {
    const raceKey = `${date}:prova`;
    if (!vistas.has(raceKey)) return { variant: 'prova', key: raceKey, markKeys: [raceKey, key], race };
  }
  // A véspera (ação P.11): uma vez no dia anterior, também fora da
  // madrugada — às 23h a madrugada já fala do treino de amanhã, que é a prova.
  const eve = slot === 'madrugada' ? null : raceToday(raceEvents, addDays(date, 1));
  if (eve) {
    const eveKey = `${date}:vespera`;
    if (!vistas.has(eveKey)) return { variant: 'vespera', key: eveKey, markKeys: [eveKey, key], race: eve };
  }
  if (vistas.has(key)) return null;
  // Um relógio adiantado noutro dispositivo (lastShownAt no futuro) não cala
  // as boas-vindas: só conta o que já aconteceu.
  const since = lastShownAt == null ? null : now.getTime() - lastShownAt;
  if (since != null && since >= 0 && since < WELCOME_MIN_GAP_MS) return null;
  return { variant: slot, key, markKeys: [key], race: null };
}

/**
 * Ao voltar à app (App.jsx, visibilitychange), o que fazer com as boas-vindas:
 * - 'skip': há uma camada aberta — o momento do badge, uma persiana, um
 *   diálogo. Não se toca em nada, e a cancela não fecha: fechá-la ('pending',
 *   para ler as impressões) desmontava o momento do badge, e o tryWelcome, já
 *   sem o ver, saudava no lugar dele (revisão pré-deploy de 2026-09-25). A
 *   saudação fica para o próximo regresso, como no próprio tryWelcome;
 * - 'try': decidir já (sem utilizador carregado, ou sem nada a saudar aqui);
 * - 'refresh': há uma saudação possível — ler as impressões primeiro, com a
 *   cancela em 'pending'.
 */
export function welcomeReturnAction({ busy, userLoaded, localDecision }) {
  if (busy) return 'skip';
  if (!userLoaded || !localDecision) return 'try';
  return 'refresh';
}

/* ── memória por dispositivo ────────────────────────────────────────────── */

const storageKey = (userId) => `ironcoach_welcome_seen_${userId || 'anon'}`;
const MAX_KEYS = 12;

export function readSeen(userId, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(storageKey(userId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export function markSeen(userId, keys, storage = globalThis.localStorage) {
  try {
    const list = [...readSeen(userId, storage), ...keys].filter((k, i, a) => a.indexOf(k) === i).slice(-MAX_KEYS);
    storage?.setItem(storageKey(userId), JSON.stringify(list));
  } catch { /* sem storage: volta a aparecer, não faz mal */ }
}

/* Quando apareceram as últimas boas-vindas neste dispositivo (ação P.11),
   para o intervalo mínimo. As dos outros dispositivos chegam pelas
   impressões (store: lastWelcomeAt); esta cobre o caso de a impressão não
   ter chegado a gravar-se. Separado de markSeen: uma faixa dada como vista
   por uma notificação não é uma saudação. */
const shownAtKey = (userId) => `ironcoach_welcome_shown_at_${userId || 'anon'}`;

export function readShownAt(userId, storage = globalThis.localStorage) {
  try {
    const n = Number(storage?.getItem(shownAtKey(userId)));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

export function markShownAt(userId, at = Date.now(), storage = globalThis.localStorage) {
  try { storage?.setItem(shownAtKey(userId), String(at)); } catch { /* sem storage: fica o das impressões */ }
}

/* ── o que ela diz ──────────────────────────────────────────────────────── */

const GREETING = {
  manha: (n) => `Bom dia${n ? `, ${n}` : ''}.`,
  tarde: (n) => `Boa tarde${n ? `, ${n}` : ''}.`,
  noite: (n) => `Boa noite${n ? `, ${n}` : ''}.`,
  madrugada: (n, g) => (n ? `Ainda ${normalizeGender(g) === 'F' ? 'acordada' : 'acordado'}, ${n}?` : 'Ainda por aqui?'),
  prova: (n) => `É hoje${n ? `, ${n}` : ''}.`,
  vespera: (n) => `Amanhã é dia de prova${n ? `, ${n}` : ''}.`,
};

const CTA = { manha: 'Começar o dia', tarde: 'Entrar', noite: 'Ver o meu dia', madrugada: 'Entrar na mesma', prova: 'Vamos a isso', vespera: 'Ver o meu dia' };

const km = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.round(n * 10) / 10).replace('.', ',');
};

/** Os itens do plano ACEITE para um dia, sem os cancelados. */
function planFor(dateISO, { coachPlans = [], coachPlanItems = [] }) {
  const aceites = new Set((coachPlans || []).filter((p) => p?.status === 'aceite').map((p) => p.id));
  return (coachPlanItems || []).filter((i) => i && aceites.has(i.plan_id)
    && String(i.planned_date).slice(0, 10) === dateISO && i.status !== 'cancelado');
}

function trainingOf(items) {
  return items.filter((i) => i.kind === 'corrida' || i.kind === 'ginasio');
}

function titleOf(items, raceEvents, dateISO) {
  const t = trainingOf(items);
  if (!t.length) {
    if (!items.length) return null;
    // Um dia só com refeições sugeridas não é descanso decidido.
    return items.every(isMealOnlyItem) ? MEAL_ONLY_DAY_LABEL : 'Descanso';
  }
  return t.map((i) => planItemTitle(i, raceNameForDate(raceEvents, dateISO))).join(' + ');
}

const semTreino = (titulo) => titulo === 'Descanso' || titulo === MEAL_ONLY_DAY_LABEL;

/** O primeiro dia do Início (Home.jsx): sem registos nem prova marcada. */
function isFirstDay(data, hoje) {
  const provaMarcada = (data.raceEvents || []).some((e) => e?.status !== 'concluida' && String(e?.date).slice(0, 10) >= hoje);
  return !hasAnyRecord(data) && !provaMarcada;
}

/* ── variantes (pedido 2026-09-23) ──────────────────────────────────────────
   As frases eram sempre as mesmas: a mesma situação, a mesma frase, todos os
   dias. Cada situação tem agora um conjunto, e a frase escolhe-se pelo dia —
   igual durante o dia (abrir a app duas vezes não a troca), diferente de um
   dia para o outro. A voz é a de CAROL.md: afirma, frases curtas, sem
   exclamação nem aplauso automático. */
export const WELCOME_PHRASES = {
  checkinFalta: [
    'Ainda não me disseste como dormiste. Diz-me e eu ajusto o treino de hoje.',
    'Como dormiste? Conta-me no check-in e eu acerto o dia contigo.',
    'Antes de mais: como acordaste? Três perguntas no check-in e eu ajusto o treino.',
  ],
  // À tarde (pedido 2026-09-23): quem saltou o da manhã, ou só abriu a app
  // depois do meio-dia, ainda vai a tempo de acertar o resto do dia.
  checkinFaltaTarde: [
    'Ainda não sei como estás hoje. Três perguntas no check-in e eu acerto o resto do dia.',
    'Falta o check-in de hoje. Diz-me como dormiste e como te sentes, e eu ajusto o que falta.',
    'Ainda vais a tempo do check-in de hoje. Com ele, afino o treino que falta.',
  ],
  dormiuBem: ['O check-in diz que dormiste bem.', 'Noite boa, pelo que me disseste. Hoje há margem para cumprir tudo.', 'Dormiste bem. Isso conta para o treino de hoje.'],
  dormiuMal: ['Dormiste mal, pelo check-in. Hoje não se força nada.', 'Noite fraca. Hoje o treino é para cumprir, não para puxar.', 'Com pouco sono, hoje o treino é mais leve.'],
  descansoHoje: ['Hoje é descanso. A sério.', 'Dia de descanso. É hoje que o treino da semana assenta.', 'Hoje não se treina. O descanso está no plano de propósito.'],
  semTreinoHoje: ['Hoje não há treino planeado.', 'O plano não pede treino hoje.', 'Hoje não tens treino no plano.'],
  treinoHoje: (t) => [`Hoje tens ${t}.`, `O treino de hoje: ${t}.`, `Para hoje, o plano pede ${t}.`],
  corridaFeita: (k) => [`Já vi a corrida de hoje: ${k} km.`, `Corrida de hoje registada: ${k} km.`, `${k} km já feitos hoje.`],
  semRefeicoes: ['Ainda não vi nenhuma refeição hoje. Uma foto chega.', 'Nenhuma refeição registada hoje. Tira uma foto ao próximo prato.', 'Ainda não sei o que comeste hoje. Uma foto e eu trato do resto.'],
  treinoPorFazer: (t) => [`Ainda tens ${t} por fazer.`, `Ainda falta o treino de hoje: ${t}.`, `O treino de hoje continua por fazer: ${t}.`],
  corridaDoDia: (k, r) => [`Hoje ficaram ${k} km${r}.`, `Fecho do dia: ${k} km${r}.`, `${k} km registados hoje${r}.`],
  treinoNaoRegistado: ['Não vi o treino de hoje registado. Aconteceu alguma coisa?', 'O treino de hoje ainda não apareceu. Correu tudo bem?', 'Falta-me o registo do treino de hoje. Conta-me o que se passou.'],
  amanhaDescanso: ['Amanhã é descanso.', 'Amanhã descansas.', 'Amanhã o plano pede descanso.'],
  amanhaSemTreino: ['Amanhã não há treino planeado.', 'Amanhã o plano não pede treino.', 'Amanhã não tens treino no plano.'],
  amanhaTreino: (t) => [`Amanhã tens ${t}.`, `Amanhã: ${t}.`, `Para amanhã, ${t}.`],
  quando: (q, t) => [`${q} tens ${t}.`, `${q}: ${t}.`, `${q} o plano pede ${t}.`],
  sono: ['A esta hora, o sono vale mais do que qualquer treino.', 'Vai dormir. O treino de amanhã começa a fazer-se agora.', 'O melhor treino a esta hora é dormir.'],
  faltamDias: (n, nome) => [`Faltam ${n} dias para a prova: ${nome}.`, `${nome} está a ${n} dias.`, `A prova é daqui a ${n} dias: ${nome}.`],
  ontem: (k) => [`Ontem ficaram ${k} km.`, `Ontem fizeste ${k} km.`, `Ainda conto os ${k} km de ontem.`],
  semana: (k) => [`Esta semana já levas ${k} km.`, `${k} km nesta semana, até agora.`, `A semana vai em ${k} km.`],
};

const dayIndex = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);
const saltOf = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);

/** Uma frase do conjunto, pelo dia: igual durante o dia, outra no seguinte. */
export function pickByDay(pool, dateISO, situation = '') {
  if (!pool?.length) return null;
  const i = (dayIndex(dateISO) + saltOf(situation)) % pool.length;
  return pool[(i + pool.length) % pool.length];
}

/* Uma frase com os números do atleta, para quando o plano e o check-in não
   enchem as duas linhas: dias até à próxima prova, a corrida de ontem, os km
   da semana. Nunca inventa: sem dados, não há frase. */
function dataLine(variant, data, hoje) {
  const nextRace = (data.raceEvents || [])
    .filter((r) => r?.date && r.status !== 'concluida' && String(r.date).slice(0, 10) > hoje)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  const diasProva = nextRace ? dayIndex(String(nextRace.date).slice(0, 10)) - dayIndex(hoje) : null;
  const provaLine = nextRace?.name && diasProva > 1 && diasProva <= 90
    ? pickByDay(WELCOME_PHRASES.faltamDias(diasProva, nextRace.name), hoje, 'faltamDias') : null;
  const ontem = runsOn(data.runs, addDays(hoje, -1)).reduce((s, r) => s + (Number(r.distance_km) || 0), 0);
  const ontemLine = km(ontem) ? pickByDay(WELCOME_PHRASES.ontem(km(ontem)), hoje, 'ontem') : null;
  // Segunda-feira da semana de hoje (dia da semana em UTC da data de Lisboa).
  const dow = (new Date(`${hoje}T00:00:00Z`).getUTCDay() + 6) % 7;
  const segunda = addDays(hoje, -dow);
  const semanaKm = (data.runs || [])
    .filter((r) => { const d = String(r?.date).slice(0, 10); return d >= segunda && d <= hoje; })
    .reduce((s, r) => s + (Number(r.distance_km) || 0), 0);
  const semanaLine = km(semanaKm) && dow > 0 ? pickByDay(WELCOME_PHRASES.semana(km(semanaKm)), hoje, 'semana') : null;
  const ordem = variant === 'manha' ? [provaLine, ontemLine] : [semanaLine, provaLine];
  return ordem.find(Boolean) || null;
}

function runsOn(runs, dateISO) {
  return (runs || []).filter((r) => String(r?.date).slice(0, 10) === dateISO);
}

// Só a primeira letra de uma palavra normal: "HIIT" fica "HIIT", não "hIIT".
function lowerFirst(s) {
  if (!s || /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2}/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * O texto das boas-vindas: { greeting, lines: [≤2], chip: {label, value, icon} | null, cta }.
 * `data`: { profile, dailyCheckins, coachPlans, coachPlanItems, runs, meals, raceEvents }.
 */
export function buildWelcome(variant, data = {}, now = new Date()) {
  const nome = String(data.profile?.display_name || data.profile?.full_name || '').trim().split(/\s+/)[0] || '';
  const { date: hoje } = lisbonParts(now);
  const amanha = addDays(hoje, 1);
  const raceEvents = data.raceEvents || [];
  const lines = [];
  let chip = null;

  const planoHoje = planFor(hoje, data);
  const planoAmanha = planFor(amanha, data);
  const tituloHoje = titleOf(planoHoje, raceEvents, hoje);
  const tituloAmanha = titleOf(planoAmanha, raceEvents, amanha);
  const treinoHojeFeito = trainingOf(planoHoje).length > 0 && trainingOf(planoHoje).every((i) => i.status === 'concluido');
  const corridasHoje = runsOn(data.runs, hoje);
  const checkin = (data.dailyCheckins || []).find((c) => String(c?.date).slice(0, 10) === hoje) || null;
  const refeicoesHoje = (data.meals || []).filter((m) => String(m?.date).slice(0, 10) === hoje).length;

  if (variant === 'prova') {
    const race = raceToday(raceEvents, hoje) || {};
    const dist = km(race.distance_km);
    const hora = race.start_time ? String(race.start_time).slice(0, 5) : null;
    // Aberta depois da partida, já não é hora de sair de casa: é hora do balanço.
    const { hour, minute } = lisbonParts(now);
    const [hh, mm] = hora ? hora.split(':').map(Number) : [null, null];
    const depoisDaPartida = hora != null && (hour * 60 + minute) >= (hh * 60 + mm);
    lines.push(`${race.name || 'A tua prova'}${hora ? `, partida às ${hora.replace(/^0/, '')}` : ''}.`);
    lines.push(depoisDaPartida
      ? 'Quando cortares a meta, regista a corrida. Quero fazer o balanço contigo.'
      : 'Come o que ensaiámos e sai de casa com tempo. O trabalho está feito.');
    chip = { label: dist ? `${dist} km` : 'Hoje', value: hora ? `Partida às ${hora}` : (race.name || 'Dia de prova'), icon: 'trophy' };
    return { variant, greeting: GREETING.prova(nome), lines, chip, cta: depoisDaPartida ? 'Entrar' : CTA.prova, race: true };
  }

  if (variant === 'vespera') {
    /* A véspera (ação P.11): a prova de amanhã e o que o plano pede HOJE, em
       vez de uma frase de manual ("dorme bem, prepara o equipamento") — o
       plano já é o que ela decidiu para a véspera. Sem plano para hoje, fica
       só a prova. */
    const race = raceToday(raceEvents, amanha) || {};
    const dist = km(race.distance_km);
    const hora = race.start_time ? String(race.start_time).slice(0, 5) : null;
    lines.push(`${race.name || 'A tua prova'}${hora ? `, partida às ${hora.replace(/^0/, '')}` : ''}.`);
    if (tituloHoje === 'Descanso') lines.push('Hoje é descanso.');
    else if (tituloHoje === MEAL_ONLY_DAY_LABEL) lines.push('Hoje não há treino planeado.');
    else if (tituloHoje && treinoHojeFeito) lines.push(`O treino de hoje já está feito: ${lowerFirst(tituloHoje)}.`);
    else if (tituloHoje) lines.push(`Hoje ainda tens ${lowerFirst(tituloHoje)}.`);
    chip = { label: dist ? `${dist} km` : 'Amanhã', value: hora ? `Partida às ${hora}` : (race.name || 'Dia de prova'), icon: 'trophy' };
    return { variant, greeting: GREETING.vespera(nome), lines, chip, cta: CTA.vespera, race: false };
  }

  const P = WELCOME_PHRASES;
  const pick = (pool, situation) => pickByDay(pool, hoje, situation);
  const chipFor = (label, titulo, icon = 'run') => ({ label, value: titulo, icon: semTreino(titulo) ? 'moon' : icon });
  let action = null;

  if (variant === 'manha') {
    if (checkin && Number(checkin.sleep) >= 4) lines.push(pick(P.dormiuBem, 'dormiuBem'));
    else if (checkin && Number(checkin.sleep) > 0 && Number(checkin.sleep) <= 2) lines.push(pick(P.dormiuMal, 'dormiuMal'));
    else if (!checkin && !isFirstDay(data, hoje)) {
      // O check-in é o cartão "Como estás hoje?" do Início: a frase diz o que
      // é e o botão abre-o (pedido 2026-09-23 — "nem sei a que se refere").
      // No primeiro dia o Início não mostra esse cartão — não se pede.
      lines.push(pick(P.checkinFalta, 'checkinFalta'));
      action = 'checkin';
    }
    if (tituloHoje === 'Descanso') lines.push(pick(P.descansoHoje, 'descansoHoje'));
    else if (tituloHoje === MEAL_ONLY_DAY_LABEL) lines.push(pick(P.semTreinoHoje, 'semTreinoHoje'));
    else if (tituloHoje) lines.push(pick(P.treinoHoje(lowerFirst(tituloHoje)), 'treinoHoje'));
    if (tituloHoje) chip = chipFor('Hoje', tituloHoje);
  }

  if (variant === 'tarde') {
    // O check-in que faltar volta a pedir-se à tarde — à noite já não, porque
    // já não há treino do dia para ajustar.
    if (!checkin && !isFirstDay(data, hoje)) {
      lines.push(pick(P.checkinFaltaTarde, 'checkinFaltaTarde'));
      action = 'checkin';
    }
    const feita = corridasHoje[0];
    // Só cabem duas linhas: com o check-in por fazer e sem refeições, a das
    // refeições ganha à da corrida (o chip "Por registar" fala delas).
    const cabeCorrida = !(action === 'checkin' && refeicoesHoje === 0);
    if (cabeCorrida && feita && km(feita.distance_km)) lines.push(pick(P.corridaFeita(km(feita.distance_km)), 'corridaFeita'));
    if (refeicoesHoje === 0) lines.push(pick(P.semRefeicoes, 'semRefeicoes'));
    else if (!feita && tituloHoje && !semTreino(tituloHoje) && !treinoHojeFeito) lines.push(pick(P.treinoPorFazer(lowerFirst(tituloHoje)), 'treinoPorFazer'));
    if (refeicoesHoje === 0) chip = { label: 'Por registar', value: 'Refeições de hoje', icon: 'plate' };
    else if (tituloHoje) chip = chipFor('Hoje', tituloHoje);
  }

  if (variant === 'noite') {
    const feita = corridasHoje[0];
    const dist = feita ? km(feita.distance_km) : null;
    const ritmo = feita && Number(feita.distance_km) > 0 && Number(feita.duration_seconds) > 0
      ? formatPace(Number(feita.duration_seconds) / Number(feita.distance_km)) : null;
    if (dist) lines.push(pick(P.corridaDoDia(dist, ritmo ? ` a ${ritmo} por km` : ''), 'corridaDoDia'));
    // CAROL.md §3: um treino não registado pergunta-se, não se dá como falhado.
    else if (tituloHoje && !semTreino(tituloHoje) && !treinoHojeFeito && !/^Prova/.test(tituloHoje)) lines.push(pick(P.treinoNaoRegistado, 'treinoNaoRegistado'));
    if (tituloAmanha === 'Descanso') lines.push(pick(P.amanhaDescanso, 'amanhaDescanso'));
    else if (tituloAmanha === MEAL_ONLY_DAY_LABEL) lines.push(pick(P.amanhaSemTreino, 'amanhaSemTreino'));
    else if (tituloAmanha) lines.push(pick(P.amanhaTreino(lowerFirst(tituloAmanha)), 'amanhaTreino'));
    if (tituloAmanha) chip = chipFor('Amanhã', tituloAmanha);
  }

  if (variant === 'madrugada') {
    // Depois da meia-noite, o treino que interessa é o do dia que já começou.
    const depoisDaMeiaNoite = lisbonParts(now).hour < 5;
    const titulo = depoisDaMeiaNoite ? tituloHoje : tituloAmanha;
    const quando = depoisDaMeiaNoite ? 'Hoje' : 'Amanhã';
    if (titulo && !semTreino(titulo)) lines.push(pick(P.quando(quando, lowerFirst(titulo)), 'quando'));
    lines.push(pick(P.sono, 'sono'));
    if (titulo) chip = chipFor(quando, titulo, 'clock');
  }

  // Sobra uma linha? Um número do atleta, se houver (nunca de madrugada:
  // aí a única coisa a dizer é que vá dormir).
  if (lines.length < 2 && variant !== 'madrugada') {
    const extra = dataLine(variant, data, hoje);
    if (extra) lines.push(extra);
  }

  if (action === 'checkin') {
    return { variant, greeting: GREETING[variant](nome, data.profile?.gender), lines: lines.slice(0, 2), chip, cta: 'Fazer o check-in', action, race: false };
  }
  return { variant, greeting: GREETING[variant](nome, data.profile?.gender), lines: lines.slice(0, 2), chip, cta: CTA[variant], race: false };
}
