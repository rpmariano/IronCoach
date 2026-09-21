/* As boas-vindas da Carol — "a sala da Carol" (canvas de design
   "Boas-vindas da Carol", 2026-09-19).

   Antes da Home, na primeira abertura da app dentro de cada uma das quatro
   faixas do dia (hora de Lisboa), a Carol recebe o atleta como uma
   treinadora que o vê entrar: o nome, duas frases dela, e a coisa que
   interessa hoje. No dia de uma prova, a versão da prova aparece UMA vez, na
   primeira abertura do dia, e ocupa o lugar da saudação dessa faixa; as
   faixas seguintes voltam à saudação normal.

   Tudo aqui é puro (data, dados, memória do que já se viu → decisão e texto),
   para os testes não precisarem de relógio nem de browser. As frases saem
   dos dados que a app já tem — check-in, plano aceite, corridas, refeições,
   provas — e nunca inventam: sem dados para dizer algo específico, ela fica
   pela saudação e pelo plano. Voz de CAROL.md: afirma, frases curtas, sem
   emoji nem exclamação. */

import { formatPace } from './run';
import { normalizeGender } from '@formulas/vocabulary.ts';
import { planItemTitle, raceNameForDate } from './homeModels';

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

/**
 * Deve aparecer agora? `seen` é a lista de chaves já mostradas neste
 * dispositivo. Devolve null, ou { variant, key, markKeys } — `markKeys` são
 * as chaves a gravar como vistas (a da prova ocupa também a da faixa).
 */
export function decideWelcome({ now = new Date(), raceEvents = [], seen = [] } = {}) {
  const { slot, key, date } = slotKey(now);
  const vistas = new Set(seen || []);
  // De madrugada, mesmo no dia da prova, é a madrugada: a versão da prova é
  // para quando o dia começa (a partir das 5h), não para as 00:30.
  const race = slot === 'madrugada' ? null : raceToday(raceEvents, date);
  if (race) {
    const raceKey = `${date}:prova`;
    if (!vistas.has(raceKey)) return { variant: 'prova', key: raceKey, markKeys: [raceKey, key], race };
  }
  if (vistas.has(key)) return null;
  return { variant: slot, key, markKeys: [key], race: null };
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

/* ── o que ela diz ──────────────────────────────────────────────────────── */

const GREETING = {
  manha: (n) => `Bom dia${n ? `, ${n}` : ''}.`,
  tarde: (n) => `Boa tarde${n ? `, ${n}` : ''}.`,
  noite: (n) => `Boa noite${n ? `, ${n}` : ''}.`,
  madrugada: (n, g) => (n ? `Ainda ${normalizeGender(g) === 'F' ? 'acordada' : 'acordado'}, ${n}?` : 'Ainda por aqui?'),
  prova: (n) => `É hoje${n ? `, ${n}` : ''}.`,
};

const CTA = { manha: 'Começar o dia', tarde: 'Entrar', noite: 'Ver o meu dia', madrugada: 'Entrar na mesma', prova: 'Vamos a isso' };

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
  if (!t.length) return items.length ? 'Descanso' : null;
  return t.map((i) => planItemTitle(i, raceNameForDate(raceEvents, dateISO))).join(' + ');
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

  if (variant === 'manha') {
    if (checkin && Number(checkin.sleep) >= 4) lines.push('O check-in diz que dormiste bem.');
    else if (checkin && Number(checkin.sleep) > 0 && Number(checkin.sleep) <= 2) lines.push('Dormiste mal, pelo check-in. Hoje não se força nada.');
    else if (!checkin) lines.push('Ainda não fizeste o check-in. Dez segundos, e eu ajusto o dia.');
    if (tituloHoje === 'Descanso') lines.push('Hoje é descanso. A sério.');
    else if (tituloHoje) lines.push(`Hoje tens ${lowerFirst(tituloHoje)}.`);
    if (tituloHoje) chip = { label: 'Hoje', value: tituloHoje, icon: tituloHoje === 'Descanso' ? 'moon' : 'run' };
  }

  if (variant === 'tarde') {
    const feita = corridasHoje[0];
    if (feita && km(feita.distance_km)) lines.push(`Já vi a corrida de hoje: ${km(feita.distance_km)} km.`);
    if (refeicoesHoje === 0) lines.push('Ainda não vi nenhuma refeição hoje. Uma foto chega.');
    else if (!feita && tituloHoje && tituloHoje !== 'Descanso' && !treinoHojeFeito) lines.push(`Ainda tens ${lowerFirst(tituloHoje)} por fazer.`);
    if (refeicoesHoje === 0) chip = { label: 'Por registar', value: 'Refeições de hoje', icon: 'plate' };
    else if (tituloHoje) chip = { label: 'Hoje', value: tituloHoje, icon: tituloHoje === 'Descanso' ? 'moon' : 'run' };
  }

  if (variant === 'noite') {
    const feita = corridasHoje[0];
    const dist = feita ? km(feita.distance_km) : null;
    const ritmo = feita && Number(feita.distance_km) > 0 && Number(feita.duration_seconds) > 0
      ? formatPace(Number(feita.duration_seconds) / Number(feita.distance_km)) : null;
    if (dist) lines.push(`Hoje ficaram ${dist} km${ritmo ? ` a ${ritmo} por km` : ''}.`);
    // CAROL.md §3: um treino não registado pergunta-se, não se dá como falhado.
    else if (tituloHoje && tituloHoje !== 'Descanso' && !treinoHojeFeito && !/^Prova/.test(tituloHoje)) lines.push('Não vi o treino de hoje registado. Aconteceu alguma coisa?');
    if (tituloAmanha === 'Descanso') lines.push('Amanhã é descanso.');
    else if (tituloAmanha) lines.push(`Amanhã tens ${lowerFirst(tituloAmanha)}.`);
    if (tituloAmanha) chip = { label: 'Amanhã', value: tituloAmanha, icon: tituloAmanha === 'Descanso' ? 'moon' : 'run' };
  }

  if (variant === 'madrugada') {
    // Depois da meia-noite, o treino que interessa é o do dia que já começou.
    const depoisDaMeiaNoite = lisbonParts(now).hour < 5;
    const titulo = depoisDaMeiaNoite ? tituloHoje : tituloAmanha;
    const quando = depoisDaMeiaNoite ? 'Hoje' : 'Amanhã';
    if (titulo && titulo !== 'Descanso') lines.push(`${quando} tens ${lowerFirst(titulo)}.`);
    lines.push('A esta hora, o sono vale mais do que qualquer treino.');
    if (titulo) chip = { label: quando, value: titulo, icon: titulo === 'Descanso' ? 'moon' : 'clock' };
  }

  return { variant, greeting: GREETING[variant](nome, data.profile?.gender), lines: lines.slice(0, 2), chip, cta: CTA[variant], race: false };
}
