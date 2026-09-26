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
import { planItemTitle, raceForDate, raceNameForDate, hasAnyRecord, isRacePlanItem } from './homeModels';
import { isMealOnlyItem, MEAL_ONLY_DAY_LABEL } from '@formulas/mealSuggestions.ts';
import { PAIN_ALARM_THRESHOLD } from '@formulas/checkinAlarms.ts';
import { eventoDaVida, frasesDaVida } from './carolVida';

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

/** Depois da meia-noite do dia da prova, já é hora de acordar para ela?
 *  Das 4h, para uma partida até 6 h depois (ou sem hora marcada); antes das
 *  4h, só a menos de 4 h da partida (um trail às 6h acorda-se às 3h), ou com
 *  ela já a decorrer (uma prova da meia-noite). Quem está acordado às 4h30
 *  antes de uma prova às 18h ainda não se deitou. */
export function acordouParaAProva(race, now = new Date()) {
  if (!race) return false;
  const { hour, minute } = lisbonParts(now);
  if (hour >= 5) return false;
  const hora = race.start_time ? String(race.start_time).slice(0, 5) : null;
  const [hh, mm] = hora ? hora.split(':').map(Number) : [];
  const falta = hora ? (hh * 60 + mm) - (hour * 60 + minute) : null;
  if (hour >= 4) return falta == null || falta <= 6 * 60;
  return falta != null && falta <= 4 * 60;
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
  // para quando o dia começa (a partir das 5h), não para as 00:30. Menos
  // para quem já acordou para ela (acordouParaAProva): a quem abre a app às
  // 4h40 no dia da maratona não se pergunta se ainda está acordado.
  const provaHoje = raceToday(raceEvents, date);
  const race = slot === 'madrugada' && !acordouParaAProva(provaHoje, now) ? null : provaHoje;
  if (race) {
    const raceKey = `${date}:prova`;
    // Vista ainda de madrugada, a da prova ocupa também a manhã desse dia:
    // senão, às 7h vinha um segundo "Bom dia" a anunciar a mesma partida.
    const ocupa = slot === 'madrugada' ? [key, `${date}:manha`] : [key];
    if (!vistas.has(raceKey)) return { variant: 'prova', key: raceKey, markKeys: [raceKey, ...ocupa], race };
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
  // Sem género no perfil, a frase não tem género: "Ainda acordado, Ana?"
  // denuncia que ninguém olhou para ela (pedido 2026-09-26).
  madrugada: (n, g) => {
    if (!n) return 'Ainda a pé?';
    const genero = normalizeGender(g);
    if (genero === 'F') return `Ainda acordada, ${n}?`;
    if (genero === 'M') return `Ainda acordado, ${n}?`;
    return `Ainda a pé, ${n}?`;
  },
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

/** "a", "a e b", "a, b e c". */
const juntar = (l) => (l.length <= 1 ? (l[0] || '') : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`);
/** Números pequenos por extenso, como se dizem. */
const extenso = (n) => ['', 'uma', 'duas', 'três', 'quatro', 'cinco'][n] || String(n);

/* O treino dito numa frase, e não o rótulo do chip: "Hoje tens uma rodagem
   longa de 16 km", e não "Hoje tens rodagem longa · 16 km" — o separador
   de ecrã e o "21.0975 km" do servidor a meio de uma frase eram o que mais
   soava a gerado. Todas começam por artigo, para caberem depois de "tens",
   "pede" ou "por fazer". */
const CORRIDA_FALADA = {
  longo: 'uma rodagem longa',
  continuo: 'uma corrida contínua',
  rodagem: 'uma rodagem',
  recuperacao: 'uma corrida de recuperação',
  regenerativo: 'uma corrida regenerativa',
  tempo: 'um treino de ritmo',
  fartlek: 'um fartlek',
  intervalos: 'um treino intervalado',
  subidas: 'um treino de subidas',
  trail: 'uma corrida em trilho',
  tecnico: 'um treino em trilho técnico',
};
// Séries, ritmo, fartlek e subidas não se fazem "sem puxar": puxar é o treino.
const TREINOS_DE_QUALIDADE = new Set(['tempo', 'fartlek', 'intervalos', 'subidas']);

// As aulas (GymRegistration, CLASS_TYPES) dizem-se pelo nome delas; os
// grupos musculares, em minúsculas, menos as siglas.
const AULA_FALADA = {
  hiit: 'um HIIT',
  'rpm/cycling': 'uma aula de RPM',
  pilates: 'uma aula de pilates',
  yoga: 'uma aula de ioga',
  'body pump': 'uma aula de Body Pump',
  zumba: 'uma aula de zumba',
  crossfit: 'um treino de CrossFit',
  'treino funcional': 'um treino funcional',
  'natação': 'um treino de natação',
};
const GRUPO_FALADO = { 'core/abdominais': 'core', 'full body': 'corpo inteiro' };

function itemFalado(item) {
  if (item.kind === 'ginasio') {
    const cats = (item.categories || []).map((c) => String(c).trim()).filter((c) => c && c.toLowerCase() !== 'outro');
    const min = Math.round(Number(item.target_duration_min));
    const duracao = min > 0 ? ` de ${min} minutos` : '';
    const aula = cats.map((c) => AULA_FALADA[c.toLowerCase()]).find(Boolean);
    if (aula) return `${aula}${duracao}`;
    const grupos = cats.map((c) => GRUPO_FALADO[c.toLowerCase()] || (/^[A-Z0-9]{2,}$/.test(c) ? c : c.toLowerCase()));
    return `um treino de ${grupos.length ? juntar([...new Set(grupos)]) : 'ginásio'}${duracao}`;
  }
  const base = CORRIDA_FALADA[item.training_type] || 'uma corrida';
  const k = km(item.target_distance_km);
  return k ? `${base} de ${k} km` : base;
}

/** O rótulo do chip, como no resto da app, mas com a distância arredondada
 *  e com vírgula — como o chip da prova. */
function tituloDoChip(items, raceName) {
  return items.map((i) => planItemTitle({ ...i, target_distance_km: km(i.target_distance_km) }, raceName)).join(' + ');
}

/* ── o dia, como ela o vê (pedido 2026-09-26) ───────────────────────────────
   Às 03:53 de um sábado de descanso, a madrugada disse "Vai dormir. O treino
   de amanhã começa a fazer-se agora.": um treino que não existia, e
   "amanhã" num dia que o chip, por baixo, já dava como "Hoje". As frases
   escolhiam-se pelo dia do calendário, sem olhar para o plano — e o mesmo
   acontecia de manhã ("Isso conta para o treino de hoje." por cima de "Hoje
   é descanso."). Agora cada frase parte do que o dia é, e cada conjunto de
   frases só serve os dias em que é verdade. É o que faz a diferença entre
   uma treinadora e um gerador de frases. */

/**
 * O que um dia é, para a Carol (dia de Lisboa, plano aceite e agenda de provas):
 * - tipo: 'prova' (por fazer) | 'provaFeita' | 'treino' (há treino por
 *   fazer) | 'feito' (o treino todo feito) | 'descanso' | 'semTreino' (só
 *   refeições sugeridas) | 'semPlano';
 * - titulo: o rótulo do chip ("Rodagem longa · 16 km", "Descanso"), ou null;
 * - falado / feitoFalado: o treino por fazer / já feito, dito numa frase;
 * - prova: a prova do dia, por concluir; provaFeita: a prova do dia, concluída;
 * - corrida: há uma corrida por fazer (e não só ginásio);
 * - qualidade: o treino por fazer é de qualidade (ritmo, séries, fartlek, subidas).
 */
export function carolDay(dateISO, data = {}) {
  const raceEvents = data.raceEvents || [];
  const items = planFor(dateISO, data);
  const treino = trainingOf(items);
  const agenda = raceForDate(raceEvents, dateISO);
  const provaFeita = agenda?.status === 'concluida' ? agenda : null;
  const itemDaProva = treino.find((i) => isRacePlanItem(i) && i.status !== 'concluido') || null;
  const semProva = treino.filter((i) => !isRacePlanItem(i));
  const pendentes = semProva.filter((i) => i.status !== 'concluido');
  const feitos = semProva.filter((i) => i.status === 'concluido');
  const prova = provaFeita ? null : (agenda || (itemDaProva ? { name: raceNameForDate(raceEvents, dateISO) } : null));

  let tipo;
  if (prova) tipo = 'prova';
  else if (provaFeita && !pendentes.length) tipo = 'provaFeita';
  else if (!items.length) tipo = 'semPlano';
  else if (!treino.length) tipo = items.every(isMealOnlyItem) ? 'semTreino' : 'descanso';
  else if (!pendentes.length) tipo = 'feito';
  else tipo = 'treino';

  let titulo = null;
  if (treino.length) titulo = tituloDoChip(treino, raceNameForDate(raceEvents, dateISO));
  else if (tipo === 'descanso') titulo = 'Descanso';
  else if (tipo === 'semTreino') titulo = MEAL_ONLY_DAY_LABEL;

  return {
    tipo,
    titulo,
    falado: juntar(pendentes.map(itemFalado)),
    feitoFalado: juntar(feitos.map(itemFalado)),
    prova,
    provaFeita,
    corrida: pendentes.some((i) => i.kind === 'corrida'),
    qualidade: pendentes.some((i) => i.kind === 'corrida' && TREINOS_DE_QUALIDADE.has(i.training_type)),
  };
}

/** O dia, para a resposta ao check-in (utils/checkinReply.js): o mesmo que
 *  as boas-vindas veem, mais a véspera de uma prova. */
export function checkinDay(dateISO, data = {}) {
  const { tipo, corrida } = carolDay(dateISO, data);
  return {
    tipo,
    corrida,
    vespera: !!raceToday(data.raceEvents, addDays(dateISO, 1)),
    // O que ela sabe da vida dele (utils/carolVida.js): uma cirurgia, uma lesão.
    vida: eventoDaVida(data.coachNotes, dateISO),
  };
}

const semTreino = (dia) => dia.tipo === 'descanso' || dia.tipo === 'semTreino';

const horaDe = (race) => (race?.start_time ? String(race.start_time).slice(0, 5) : null);
/** "09:30" → "9:30", como se diz — na frase e no chip. */
const semZero = (hora) => hora.replace(/^0/, '');
const partida = (race) => { const h = horaDe(race); return h ? `, partida às ${semZero(h)}` : ''; };
/** Minutos de agora até uma hora "HH:MM" do mesmo dia (negativo se já passou). */
const minutosAte = (hora, hour, minute) => {
  const [hh, mm] = hora.split(':').map(Number);
  return (hh * 60 + mm) - (hour * 60 + minute);
};

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
   exclamação nem aplauso automático.

   Pedido 2026-09-26: cada situação tem as variantes do tipo de dia em que é
   verdade. Os conjuntos "SemTreino" servem os dias sem treino por fazer —
   descanso, só refeições, sem plano, ou o treino já feito — e nenhuma das
   frases deles fala de um treino por fazer; os "Prova", a manhã da prova;
   os "Qualidade", os treinos que não se fazem sem puxar. */
export const WELCOME_PHRASES = {
  checkinFalta: [
    'Ainda não me disseste como dormiste. Diz-me e eu ajusto o treino de hoje.',
    'Como dormiste? Conta-me no check-in e eu acerto o treino contigo.',
    'Antes de mais: como acordaste? Dez segundos no check-in e eu ajusto o treino.',
  ],
  checkinFaltaSemTreino: [
    'Ainda não me disseste como dormiste. Conta-me, leva dez segundos.',
    'Como dormiste? Conta-me no check-in.',
    'Antes de mais: como acordaste? Conta-me no check-in.',
  ],
  // À tarde (pedido 2026-09-23): quem saltou o da manhã, ou só abriu a app
  // depois do meio-dia, ainda vai a tempo de acertar o resto do dia.
  checkinFaltaTarde: [
    'Ainda não sei como estás hoje. Dez segundos no check-in e eu acerto o resto do dia.',
    'Falta o check-in de hoje. Diz-me como dormiste e como te sentes, e eu ajusto o resto do dia.',
    'Ainda vais a tempo do check-in de hoje. Com ele, afino o treino de logo.',
  ],
  checkinFaltaTardeSemTreino: [
    'Ainda não sei como estás hoje. Conta-me, leva dez segundos.',
    'Falta o check-in de hoje. Diz-me como dormiste e como te sentes.',
    'Ainda vais a tempo do check-in de hoje. Conta-me como estás.',
  ],
  dormiuBem: ['Disseste-me que dormiste bem. É assim que se começa um dia de treino.', 'Noite boa, pelo que me disseste. Hoje há margem para cumprir tudo.', 'Dormiste bem. Isso conta para o treino de hoje.'],
  dormiuBemSemTreino: ['Disseste-me que dormiste bem. Gosto de ouvir isso.', 'Noite boa, pelo que me disseste. O corpo agradece.', 'Dormiste bem. É assim que se recupera.'],
  dormiuBemProva: ['Dormiste bem. É assim que se chega a uma partida.'],
  dormiuMal: ['Dormiste mal, pelo que me disseste. Hoje não se força nada, e está tudo bem.', 'Noite fraca. Hoje o treino é para cumprir, não para puxar.', 'Com pouco sono, o treino de hoje faz-se sem puxar. Cumprir já é ganhar.'],
  dormiuMalQualidade: ['Dormiste mal, pelo que me disseste. Fala comigo antes do treino de hoje.'],
  dormiuMalSemTreino: ['Dormiste mal, pelo que me disseste. Hoje leva o dia com calma, e esta noite cama mais cedo.', 'Noite fraca. Hoje é para recuperar, sem culpas.', 'Dormiste pouco. Esta noite deitas-te mais cedo, combinado?'],
  dormiuMalProva: ['Dormir mal na noite antes da prova é normal. Não estraga a corrida.'],
  energiaBaixa: ['Acordaste com pouca energia, pelo que me disseste. O treino de hoje faz-se sem puxar.'],
  energiaBaixaQualidade: ['Acordaste com pouca energia, pelo que me disseste. Fala comigo antes do treino de hoje.'],
  energiaBaixaSemTreino: ['Acordaste com pouca energia, pelo que me disseste. Hoje é para recuperar.'],
  energiaBaixaProva: ['Pouca energia ao acordar, no dia da prova, é comum. O aquecimento trata disso.'],
  // Uma dor acima do alarme do check-in passa à frente do sono — e do treino.
  dorForte: ['Com a dor de que me falaste, hoje nada de impacto. Fala comigo antes de treinar.'],
  dorForteSemTreino: ['A dor de que me falaste não se ignora. Quero falar contigo sobre ela.'],
  dorForteProva: ['Com a dor de que me falaste, quero falar contigo antes da partida.'],
  dorVespera: ['Com a dor de que me falaste, quero falar contigo antes da prova.'],
  descansoHoje: ['Hoje é descanso. A sério.', 'Dia de descanso. É hoje que o corpo assimila o trabalho da semana.', 'Hoje não se treina. O descanso está no plano de propósito, aproveita-o.'],
  semTreinoHoje: ['Hoje não há treino planeado.', 'O plano não pede treino hoje.', 'Hoje não tens treino no plano.'],
  treinoHoje: (t) => [`Hoje tens ${t}. Vamos a isso.`, `Para hoje, o plano pede ${t}.`, `Hoje o plano é ${t}. Quero ver como te sai.`],
  treinoFeito: (t) => [`Hoje já fizeste ${t}.`, 'O treino de hoje já está feito.', 'Já vi o treino de hoje registado.'],
  corridaFeita: (k, n = 1) => (n > 1
    ? [`Já vi as ${extenso(n)} corridas de hoje, ${k} km ao todo.`, `Hoje já levas ${k} km, em ${extenso(n)} corridas.`, `${k} km já feitos hoje, em ${extenso(n)} corridas.`]
    : [`Já vi os ${k} km de hoje.`, `${k} km já feitos hoje.`, `Hoje já levas ${k} km.`]),
  // CAROL.md §3: um descanso não respeitado não passa em silêncio — mas
  // pergunta-se, não se ralha.
  corridaEmDescanso: (k) => [`Hoje era descanso e vi ${k} km registados. Como está o corpo?`, `Hoje era dia de descanso e correste ${k} km. Como estão as pernas?`, `Vi ${k} km num dia de descanso. Conta-me como está o corpo.`],
  semRefeicoes: ['Ainda não vi nenhuma refeição hoje. Uma foto chega.', 'Nenhuma refeição registada hoje. Tira uma foto ao próximo prato.', 'Ainda não sei o que comeste hoje. Uma foto e eu trato do resto.'],
  treinoPorFazer: (t) => [`Ainda tens ${t} por fazer. Ainda vais bem a tempo.`, `Ainda te falta ${t}.`, `Hoje ainda falta ${t}. Conto contigo.`],
  treinoPorFazerSemPuxar: (t) => [`Ainda tens ${t} por fazer. Hoje, sem puxar.`],
  treinoPorFazerQualidade: (t) => [`Ainda tens ${t} por fazer. Pelo que me disseste hoje, fala comigo antes.`],
  corridaDoDia: (k, r) => [`Hoje ficaram ${k} km${r}.`, `O dia fecha com ${k} km${r}.`, `${k} km registados hoje${r}.`],
  // Antes das 21h o treino ainda pode estar a acontecer: diz-se o que falta,
  // sem perguntar o que correu mal.
  treinoPorRegistar: (t) => [`Ainda tens ${t} por registar.`, 'Ainda não vi o treino de hoje registado.', 'Falta-me o registo do treino de hoje.'],
  treinoNaoRegistado: ['Não vi o treino de hoje registado. Aconteceu alguma coisa?', 'O treino de hoje ainda não apareceu. Correu tudo bem?', 'Falta-me o registo do treino de hoje. Conta-me o que se passou.'],
  treinoNaoRegistadoParte: (t) => [`Ainda me falta o registo de ${t}. Aconteceu alguma coisa?`],
  // O check-in já explica o treino que não apareceu: não se pergunta outra vez.
  treinoNaoRegistadoComDor: ['Hoje não vi treino registado, e com a dor de que me falaste faz sentido. Como estás agora?'],
  treinoNaoRegistadoCansado: ['Hoje não vi treino registado, e pelo que me contaste faz sentido.'],
  restoNaoRegistadoComDor: ['O resto do treino de hoje não apareceu, e com a dor de que me falaste faz sentido. Como estás agora?'],
  restoNaoRegistadoCansado: ['O resto do treino de hoje não apareceu, e pelo que me contaste faz sentido.'],
  provaAntes: (h) => [`A partida é às ${h}. Até lá, poupa as pernas.`],
  provaACorrer: ['Quando cortares a meta, regista a corrida. Quero fazer o balanço contigo.'],
  provaPorRegistar: ['Ainda não vi a prova de hoje registada. Como correu?', 'Já cortaste a meta? Regista a prova e fazemos o balanço.', 'Falta-me o registo da prova de hoje. Quero saber como correu.'],
  provaComCorrida: (k) => [`Vi ${k} km registados hoje. Quero saber como correu a prova.`],
  provaFeita: (k) => [`Vi os ${k} km da prova de hoje. Quero fazer o balanço contigo.`],
  provaRegistada: ['A prova de hoje já está registada. Quero fazer o balanço contigo.'],
  amanhaDescanso: ['Amanhã é descanso.', 'Amanhã descansas. O corpo agradece.', 'Amanhã o plano pede descanso. Aproveita-o.'],
  amanhaSemTreino: ['Amanhã não há treino planeado.', 'Amanhã o plano não pede treino.', 'Amanhã não tens treino no plano.'],
  amanhaTreino: (t) => [`Amanhã tens ${t}.`, `Para amanhã, o plano pede ${t}.`, `Amanhã o plano é ${t}. Chega lá com energia.`],
  amanhaDepoisDaDor: (t) => [`Amanhã o plano tem ${t}, mas antes falamos da dor.`],
  quando: (q, t) => [`${q} tens ${t}.`, `${q}, o plano pede ${t}.`, `${q} o plano é ${t}.`],
  // A madrugada (pedido 2026-09-26): a frase do sono é a do dia que aí vem —
  // o de hoje depois da meia-noite, o de amanhã antes dela, com a mesma
  // palavra que o chip — e só fala de treino quando o há.
  sono: (q) => [`Vai dormir. O treino de ${q} rende mais com uma noite inteira.`, 'A esta hora, o sono vale mais do que qualquer treino.', 'O melhor treino a esta hora é dormir.'],
  sonoDescanso: (q) => [`${q.charAt(0).toUpperCase()}${q.slice(1)} é descanso, e o descanso começa por dormir. Vai deitar-te.`, 'Dia de descanso não é noite em claro. Vai dormir.', `${q.charAt(0).toUpperCase()}${q.slice(1)} não há treino, mas o sono conta na mesma. Vai deitar-te.`],
  sonoProva: ['Vai dormir. A esta hora, a prova prepara-se na cama.', 'Já não há nada a preparar a esta hora, a não ser o sono. Vai deitar-te.', 'Cada hora que dormires agora nota-se na prova. Vai dormir.'],
  sonoLivre: ['A esta hora, o que mais conta é dormir. Vai deitar-te.', 'Vai dormir. O resto fica para quando acordares.', 'Nada do que falta fazer vale uma noite mal dormida. Vai dormir.'],
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
   da semana. Nunca inventa: sem dados, não há frase. `kmHoje`: os km de
   hoje, para a semana não repetir a corrida de hoje ("8 km já feitos hoje."
   seguido de "Esta semana já levas 8 km."). */
function dataLine(variant, data, hoje, kmHoje = 0) {
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
  const soHoje = kmHoje > 0 && km(semanaKm) === km(kmHoje);
  const semanaLine = km(semanaKm) && dow > 0 && !soHoje ? pickByDay(WELCOME_PHRASES.semana(km(semanaKm)), hoje, 'semana') : null;
  const ordem = variant === 'manha' ? [provaLine, ontemLine] : [semanaLine, provaLine];
  return ordem.find(Boolean) || null;
}

function runsOn(runs, dateISO) {
  return (runs || []).filter((r) => String(r?.date).slice(0, 10) === dateISO);
}

/**
 * O texto das boas-vindas: { greeting, lines: [≤2], chip: {label, value, icon} | null, cta }.
 * `data`: { profile, dailyCheckins, coachPlans, coachPlanItems, runs, meals, raceEvents }.
 */
export function buildWelcome(variant, data = {}, now = new Date()) {
  const nome = String(data.profile?.display_name || data.profile?.full_name || '').trim().split(/\s+/)[0] || '';
  const { date: hoje, hour, minute } = lisbonParts(now);
  const amanha = addDays(hoje, 1);
  const raceEvents = data.raceEvents || [];
  const lines = [];
  let chip = null;
  const P = WELCOME_PHRASES;
  const pick = (pool, situation) => pickByDay(pool, hoje, situation);

  const diaHoje = carolDay(hoje, data);
  const diaAmanha = carolDay(amanha, data);
  const corridasHoje = runsOn(data.runs, hoje);
  const kmHoje = corridasHoje.reduce((s, r) => s + (Number(r.distance_km) || 0), 0);
  const kHoje = km(kmHoje);
  const checkin = (data.dailyCheckins || []).find((c) => String(c?.date).slice(0, 10) === hoje) || null;
  const sono = Number(checkin?.sleep) || 0;
  const energia = Number(checkin?.energy) || 0;
  const dorForte = (Number(checkin?.pain) || 0) >= PAIN_ALARM_THRESHOLD;
  const stressAlto = (Number(checkin?.stress) || 0) >= 4;
  const semEnergia = energia > 0 && energia <= 2;
  const emBaixo = (sono > 0 && sono <= 2) || semEnergia;
  const refeicoesHoje = (data.meals || []).filter((m) => String(m?.date).slice(0, 10) === hoje).length;
  // O que ela sabe da vida dele (pedido 2026-09-26): uma cirurgia, uma lesão,
  // uma doença que ele lhe contou, com data. Nos dias à volta disso, é a
  // primeira coisa que ela diz — antes do plano e do check-in.
  const vida = eventoDaVida(data.coachNotes, hoje);

  /* Em que ponto está a prova de hoje: 'antes' da partida, 'aCorrer' (a
     meta estimada pelo objetivo, ou 7 min/km; sem distância, 3 h), ou
     'depois'. Sem hora marcada: antes das 9h, entre as 9h e o meio-dia, e
     depois — a maioria das provas de estrada parte entre as 8h e as 10h. */
  const momentoDaProva = (race) => {
    const hora = horaDe(race);
    if (!hora) return hour >= 12 ? 'depois' : hour >= 9 ? 'aCorrer' : 'antes';
    const falta = minutosAte(hora, hour, minute);
    if (falta > 0) return 'antes';
    const duracao = Number(race?.target_time_seconds) > 0 ? race.target_time_seconds / 60
      : Number(race?.distance_km) > 0 ? Number(race.distance_km) * 7 : 180;
    return -falta < duracao ? 'aCorrer' : 'depois';
  };
  /* Já depois da partida: com uma corrida registada, pergunta-se pela prova;
     a correr, fica o pedido para quando cortar a meta; depois, o registo. */
  const linhaDepoisDaPartida = (race) => {
    if (kHoje) return pick(P.provaComCorrida(kHoje), 'provaComCorrida');
    return momentoDaProva(race) === 'aCorrer' ? P.provaACorrer[0] : pick(P.provaPorRegistar, 'provaPorRegistar');
  };

  if (variant === 'prova') {
    const race = raceToday(raceEvents, hoje) || {};
    const dist = km(race.distance_km);
    const hora = horaDe(race);
    const falta = hora ? minutosAte(hora, hour, minute) : null;
    const momento = momentoDaProva(race);
    // "O que ensaiámos" e "o trabalho está feito" só com um plano feito para
    // esta prova; o ensaio da alimentação, só da meia para cima.
    const comPlano = (data.coachPlans || []).some((p) => p?.status === 'aceite' && race.id && p.race_id === race.id)
      || planFor(hoje, data).some(isRacePlanItem);
    lines.push(`${race.name || 'A tua prova'}${partida(race)}.`);
    if (momento !== 'antes') lines.push(linhaDepoisDaPartida(race));
    else if (falta != null && falta > 4 * 60) lines.push(comPlano ? 'Até à partida, poupa as pernas. O trabalho está feito.' : 'Até à partida, poupa as pernas.');
    else if (comPlano) {
      lines.push(Number(race.distance_km) >= 21
        ? 'Come o que ensaiámos e sai de casa com tempo. O trabalho está feito.'
        : 'Sai de casa com tempo. O trabalho está feito.');
    } else lines.push('Sai de casa com tempo. Depois, quero saber como correu.');
    // O nome já está na primeira linha: o chip diz a hora, ou só que é o dia.
    chip = { label: dist ? `${dist} km` : 'Hoje', value: hora ? `Partida às ${semZero(hora)}` : 'Dia de prova', icon: 'trophy' };
    // Com a prova acabada, "É hoje" já não é a saudação: é a da hora do dia.
    const acabou = momento === 'depois' || (momento === 'aCorrer' && kHoje);
    const faixa = slotForHour(hour);
    const greeting = acabou && faixa !== 'madrugada' ? GREETING[faixa](nome) : GREETING.prova(nome);
    return { variant, greeting, lines, chip, cta: momento === 'antes' ? CTA.prova : 'Entrar', race: true };
  }

  if (variant === 'vespera') {
    /* A véspera (ação P.11): a prova de amanhã e o que o plano pede HOJE, em
       vez de uma frase de manual ("dorme bem, prepara o equipamento") — o
       plano já é o que ela decidiu para a véspera. Sem plano para hoje, fica
       só a prova. Uma dor acima do alarme passa à frente de tudo. */
    const race = raceToday(raceEvents, amanha) || {};
    const dist = km(race.distance_km);
    const hora = horaDe(race);
    lines.push(`${race.name || 'A tua prova'}${partida(race)}.`);
    if (dorForte) lines.push(P.dorVespera[0]);
    else if (diaHoje.tipo === 'descanso') lines.push('Hoje é descanso.');
    else if (diaHoje.tipo === 'semTreino') lines.push('Hoje não há treino planeado.');
    else if (diaHoje.tipo === 'feito') lines.push(diaHoje.feitoFalado ? `Hoje já fizeste ${diaHoje.feitoFalado}.` : 'O treino de hoje já está feito.');
    else if (diaHoje.tipo === 'treino') {
      if (kHoje) lines.push(pick(P.corridaFeita(kHoje, corridasHoje.length), 'corridaFeita'));
      // Às 21h já não se manda ninguém correr na véspera — nem se dá o treino
      // como falhado: pode só não estar registado.
      else if (hour >= 21) lines.push('Ainda não vi o treino de hoje registado. Se ficou por fazer, amanhã é que conta.');
      else lines.push(`Hoje ainda tens ${diaHoje.falado}.`);
    }
    chip = { label: dist ? `${dist} km` : 'Amanhã', value: hora ? `Partida às ${semZero(hora)}` : 'Dia de prova', icon: 'trophy' };
    return { variant, greeting: GREETING.vespera(nome), lines, chip, cta: CTA.vespera, race: false };
  }

  const chipFor = (label, dia, icon = 'run') => ({ label, value: dia.titulo, icon: semTreino(dia) ? 'moon' : dia.tipo === 'provaFeita' ? 'trophy' : icon });
  const chipDaProva = (label, race) => ({ label, value: horaDe(race) ? `Partida às ${semZero(horaDe(race))}` : (race?.name || 'Dia de prova'), icon: 'trophy' });
  const chipDaProvaFeita = () => (diaHoje.titulo ? chipFor('Hoje', diaHoje) : { label: 'Hoje', value: diaHoje.provaFeita.name || 'Prova', icon: 'trophy' });
  const comTreino = diaHoje.tipo === 'treino';
  const provaHoje = diaHoje.tipo === 'prova';
  // Já depois da partida, ou com a prova feita, a noite passada já não
  // interessa: nem o check-in se pede, nem o sono se comenta.
  const provaEmCurso = (provaHoje && momentoDaProva(diaHoje.prova) !== 'antes') || diaHoje.tipo === 'provaFeita';
  /** O conjunto do tipo de dia de hoje: prova, treino (de qualidade ou não), ou sem treino. */
  const doDia = (base) => {
    if (provaHoje && P[`${base}Prova`]) return P[`${base}Prova`];
    if (comTreino) return diaHoje.qualidade && P[`${base}Qualidade`] ? P[`${base}Qualidade`] : P[base];
    return P[`${base}SemTreino`] || P[base];
  };
  let action = null;

  /* A corrida de hoje, se a houver: a prova concluída diz-se como prova (com
     os km da corrida dela, não os do dia); num descanso, pergunta-se; num
     dia normal, os km de todas as corridas do dia, não só da primeira. */
  const linhaDaCorrida = (normal) => {
    if (!corridasHoje.length || !kHoje) return null;
    if (diaHoje.provaFeita) {
      const daProva = corridasHoje.find((r) => r?.race_id && r.race_id === diaHoje.provaFeita.id);
      return pick(P.provaFeita(km(daProva?.distance_km) || kHoje), 'provaFeita');
    }
    // Dia de prova com uma corrida registada, mas a prova por concluir: pode
    // ter sido ela, registada como corrida normal.
    if (provaHoje) return pick(P.provaComCorrida(kHoje), 'provaComCorrida');
    if (diaHoje.tipo === 'descanso') return pick(P.corridaEmDescanso(kHoje), 'corridaEmDescanso');
    return normal();
  };
  /* A prova de hoje, fora da versão da prova: antes da partida, a hora;
     depois, o que falta (a meta, ou o registo); feita, o balanço. */
  const linhaDaProvaDeHoje = () => {
    if (diaHoje.tipo === 'provaFeita') return linhaDaCorrida(() => null) || P.provaRegistada[0];
    const hora = horaDe(diaHoje.prova);
    if (momentoDaProva(diaHoje.prova) === 'antes') {
      return hora ? pick(P.provaAntes(semZero(hora)), 'provaAntes') : `Hoje é ${diaHoje.prova.name ? `a prova: ${diaHoje.prova.name}` : 'dia de prova'}.`;
    }
    return linhaDepoisDaPartida(diaHoje.prova);
  };
  const chipDeHoje = () => (provaHoje ? chipDaProva('Hoje', diaHoje.prova) : diaHoje.tipo === 'provaFeita' ? chipDaProvaFeita() : null);

  if (variant === 'manha') {
    if (provaEmCurso) {
      lines.push(linhaDaProvaDeHoje());
      chip = chipDeHoje();
    } else {
      if (checkin) {
        if (dorForte) lines.push(pick(doDia('dorForte'), 'dorForte'));
        else if (sono > 0 && sono <= 2) lines.push(pick(doDia('dormiuMal'), 'dormiuMal'));
        else if (semEnergia) lines.push(pick(doDia('energiaBaixa'), 'energiaBaixa'));
        // Com o stress em cima, "há margem para cumprir tudo" desdizia o cartão do check-in.
        else if (sono >= 4 && !stressAlto) lines.push(pick(doDia('dormiuBem'), 'dormiuBem'));
      } else if (!isFirstDay(data, hoje)) {
        // O check-in é o cartão "Como estás hoje?" do Início: a frase diz o que
        // é e o botão abre-o (pedido 2026-09-23 — "nem sei a que se refere").
        // No primeiro dia o Início não mostra esse cartão — não se pede.
        lines.push(pick(comTreino ? P.checkinFalta : P.checkinFaltaSemTreino, 'checkinFalta'));
        action = 'checkin';
      }
      if (provaHoje) {
        lines.push(`Hoje é ${diaHoje.prova.name ? `a prova: ${diaHoje.prova.name}` : 'dia de prova'}${partida(diaHoje.prova)}.`);
        chip = chipDeHoje();
      } else {
        if (diaHoje.tipo === 'descanso') lines.push(pick(P.descansoHoje, 'descansoHoje'));
        else if (diaHoje.tipo === 'semTreino') lines.push(pick(P.semTreinoHoje, 'semTreinoHoje'));
        else if (diaHoje.tipo === 'feito') lines.push(diaHoje.feitoFalado ? pick(P.treinoFeito(diaHoje.feitoFalado), 'treinoFeito') : P.treinoFeito('')[1]);
        else if (comTreino) lines.push(pick(P.treinoHoje(diaHoje.falado), 'treinoHoje'));
        if (diaHoje.titulo) chip = chipFor('Hoje', diaHoje);
      }
    }
  }

  if (variant === 'tarde') {
    // O check-in que faltar volta a pedir-se à tarde — à noite já não, porque
    // já não há treino do dia para ajustar. Só promete afinar o treino se
    // ainda houver treino por fazer.
    if (!checkin && !provaEmCurso && !isFirstDay(data, hoje)) {
      lines.push(pick(comTreino && !corridasHoje.length ? P.checkinFaltaTarde : P.checkinFaltaTardeSemTreino, 'checkinFaltaTarde'));
      action = 'checkin';
    }
    if (provaHoje || diaHoje.tipo === 'provaFeita') {
      lines.push(linhaDaProvaDeHoje());
      chip = chipDeHoje();
    } else {
      // Só cabem duas linhas: com o check-in por fazer e sem refeições, a das
      // refeições ganha à da corrida (o chip "Por registar" fala delas).
      const cabeCorrida = !(action === 'checkin' && refeicoesHoje === 0);
      const corrida = linhaDaCorrida(() => pick(P.corridaFeita(kHoje, corridasHoje.length), 'corridaFeita'));
      if (cabeCorrida && corrida) lines.push(corrida);
      if (refeicoesHoje === 0) lines.push(pick(P.semRefeicoes, 'semRefeicoes'));
      else if (!corridasHoje.length && comTreino) {
        // O check-in de hoje manda no que se diz do treino por fazer.
        if (dorForte) lines.push(P.dorForte[0]);
        else if (emBaixo || stressAlto) lines.push(pick(diaHoje.qualidade ? P.treinoPorFazerQualidade(diaHoje.falado) : P.treinoPorFazerSemPuxar(diaHoje.falado), 'treinoPorFazer'));
        else lines.push(pick(P.treinoPorFazer(diaHoje.falado), 'treinoPorFazer'));
      }
      if (refeicoesHoje === 0) chip = { label: 'Por registar', value: 'Refeições de hoje', icon: 'plate' };
      else if (diaHoje.titulo) chip = chipFor('Hoje', diaHoje);
    }
  }

  if (variant === 'noite') {
    const corrida = linhaDaCorrida(() => {
      const segundos = corridasHoje.reduce((s, r) => s + (Number(r.duration_seconds) || 0), 0);
      const todasComTempo = corridasHoje.every((r) => Number(r.duration_seconds) > 0);
      const ritmo = todasComTempo && segundos > 0 ? formatPace(segundos / kmHoje) : null;
      return pick(P.corridaDoDia(kHoje, ritmo ? ` a ${ritmo} por km` : ''), 'corridaDoDia');
    });
    if (corrida) lines.push(corrida);
    else if (provaHoje || diaHoje.tipo === 'provaFeita') lines.push(linhaDaProvaDeHoje());
    else if (comTreino) {
      // CAROL.md §3: um treino não registado pergunta-se, não se dá como
      // falhado — não antes das 21h, e não quando o check-in já o explicou.
      const parte = !!diaHoje.feitoFalado;
      if (dorForte) lines.push(parte ? P.restoNaoRegistadoComDor[0] : P.treinoNaoRegistadoComDor[0]);
      else if (hour < 21) lines.push(pick(P.treinoPorRegistar(diaHoje.falado), 'treinoPorRegistar'));
      else if (emBaixo) lines.push(parte ? P.restoNaoRegistadoCansado[0] : P.treinoNaoRegistadoCansado[0]);
      else if (parte) lines.push(P.treinoNaoRegistadoParte(diaHoje.falado)[0]);
      else lines.push(pick(P.treinoNaoRegistado, 'treinoNaoRegistado'));
    }
    if (diaAmanha.tipo === 'prova') {
      lines.push(`Amanhã é ${diaAmanha.prova.name ? `a prova: ${diaAmanha.prova.name}` : 'dia de prova'}${partida(diaAmanha.prova)}.`);
      chip = chipDaProva('Amanhã', diaAmanha.prova);
    } else {
      if (diaAmanha.tipo === 'descanso') lines.push(pick(P.amanhaDescanso, 'amanhaDescanso'));
      else if (diaAmanha.tipo === 'semTreino') lines.push(pick(P.amanhaSemTreino, 'amanhaSemTreino'));
      // Com uma dor por falar, o treino de amanhã não se anuncia sem ressalva.
      else if (diaAmanha.tipo === 'treino') lines.push(dorForte ? P.amanhaDepoisDaDor(diaAmanha.falado)[0] : pick(P.amanhaTreino(diaAmanha.falado), 'amanhaTreino'));
      if (diaAmanha.titulo) chip = chipFor('Amanhã', diaAmanha);
    }
  }

  if (variant === 'madrugada') {
    // Depois da meia-noite, o dia que interessa é o que já começou — e diz-se
    // "hoje", como o chip. Antes dela, é o de amanhã.
    const depoisDaMeiaNoite = hour < 5;
    const dia = depoisDaMeiaNoite ? diaHoje : diaAmanha;
    const quando = depoisDaMeiaNoite ? 'Hoje' : 'Amanhã';
    const q = quando.toLowerCase();
    // Com uma cirurgia ou uma lesão por perto, a frase do sono é sobre isso.
    const sonoDaVida = frasesDaVida(vida, { momento: 'sono', depoisDaMeiaNoite });
    const dormir = (pool, situation) => (sonoDaVida ? pick(sonoDaVida, 'sonoDaVida') : pick(pool, situation));
    if (dia.tipo === 'prova') {
      // Uma prova à meia-noite, a menos de 4 h, já não é para ir dormir.
      const hora = horaDe(dia.prova);
      const ate = hora && !depoisDaMeiaNoite ? (24 * 60 - (hour * 60 + minute)) + minutosAte(hora, 0, 0) : null;
      if (ate != null && ate <= 4 * 60) {
        lines.push(`${dia.prova.name || 'A tua prova'}${partida(dia.prova)}.`);
        lines.push('Sai de casa com tempo. Depois, quero saber como correu.');
      } else {
        lines.push(`${quando} é ${dia.prova.name ? `a prova: ${dia.prova.name}` : 'dia de prova'}${partida(dia.prova)}.`);
        lines.push(dormir(P.sonoProva, 'sonoProva'));
      }
      chip = chipDaProva(quando, dia.prova);
    } else if (dia.tipo === 'treino') {
      lines.push(pick(P.quando(quando, dia.falado), 'quando'));
      lines.push(dormir(P.sono(q), 'sono'));
      chip = chipFor(quando, dia, 'clock');
    } else if (dia.tipo === 'descanso') {
      lines.push(dormir(P.sonoDescanso(q), 'sonoDescanso'));
      chip = chipFor(quando, dia);
    } else {
      // Só refeições, sem plano, ou o treino (ou a prova) já feito: dormir,
      // sem treino nenhum na frase.
      lines.push(dormir(P.sonoLivre, 'sonoLivre'));
      if (dia.titulo) chip = chipFor(quando, dia, 'clock');
    }
  }

  // O acontecimento da vida dele vai à frente: das duas linhas, a primeira é
  // essa, e a segunda a primeira do dia (o check-in, a corrida, o plano). O
  // chip continua a dizer o plano. No dia da prova, a prova manda.
  if (variant !== 'madrugada' && !provaHoje && diaHoje.tipo !== 'provaFeita') {
    const daVida = frasesDaVida(vida, { momento: 'dia', variant });
    if (daVida) lines.unshift(pick(daVida, 'vida'));
  }

  // Sobra uma linha? Um número do atleta, se houver (nunca de madrugada:
  // aí a única coisa a dizer é que vá dormir; nem no dia da prova, que só
  // fala dela).
  if (lines.length < 2 && variant !== 'madrugada' && !provaHoje && diaHoje.tipo !== 'provaFeita') {
    const extra = dataLine(variant, data, hoje, kmHoje);
    if (extra) lines.push(extra);
  }

  if (action === 'checkin') {
    return { variant, greeting: GREETING[variant](nome, data.profile?.gender), lines: lines.slice(0, 2), chip, cta: 'Fazer o check-in', action, race: false };
  }
  return { variant, greeting: GREETING[variant](nome, data.profile?.gender), lines: lines.slice(0, 2), chip, cta: CTA[variant], race: false };
}
