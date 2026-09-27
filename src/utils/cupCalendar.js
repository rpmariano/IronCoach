import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { racePriorityOf } from '@formulas/mainRace.ts';
import { promotionImpact } from '@formulas/cupRoles.ts';
import { nextCupRound } from '@formulas/cup.ts';
import { countdownLabel, daysUntil } from './raceList';
import { detectRaceConflict } from './planDivergence';

/* A régua comum do calendário do Troféu (specs/trofeu.md §4.3–§4.5, Fase 3).
   2026-09-27.

   PORQUÊ UM SÍTIO SÓ. A mesma jornada aparece no ecrã do Troféu, no bloco
   fixo da lista de Provas, na linha "Troféu · próxima jornada" do "Para onde
   vou", no hub da prova e no cartão diário. Se cada ecrã decidisse o estado
   por si, um dizia "Por registar" e o outro "Já passou" da mesma jornada.
   Aqui vivem o estado (cupRoundStatus), os textos pequenos (datas, horas,
   papéis, razões) e o custo de promover uma jornada a principal — tudo puro;
   os ecrãs só desenham.

   ACESSIBILIDADE (§4.3). O estado diz-se SEMPRE em texto e com um de quatro
   ícones (✓ ▸ ✕ ⋯), nunca só pela cor; cada linha tem uma frase para o
   leitor de ecrã (`ariaLabel`). Os ícones repetem-se de propósito ("Vou" e
   "Feita" são ambos ✓): o texto é que distingue.

   Nada aqui grava nada, e a previsão de tempo nem sequer passa por aqui
   (cupWeek.js; §2.6: não se grava). */

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function dayOf(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? day : null;
}

const fmt = (iso, pattern) => {
  const d = dayOf(iso);
  if (!d) return '';
  try { return format(parseISO(d), pattern, { locale: pt }).replace(/\./g, ''); } catch { return ''; }
};

/** "dom 24 jan" */
export const diaCurto = (iso) => fmt(iso, 'EEE d MMM');

/** "domingo, 24 de janeiro" */
export const dataLonga = (iso) => fmt(iso, "EEEE, d 'de' MMMM");

/** "24 jan" */
export function diaMes(iso) {
  const d = dayOf(iso);
  return d ? `${Number(d.slice(8, 10))} ${MES[Number(d.slice(5, 7)) - 1]}` : '';
}

/** "mudou de 17 para 24 jan" / "mudou de 30 jan para 6 fev" (§4.4). null
 *  sem mudança, ou quando a jornada já passou (`today` dado). */
export function dateChangeLabel(prev, date, today = null) {
  const a = dayOf(prev);
  const b = dayOf(date);
  if (!a || !b || a === b) return null;
  const t = dayOf(today);
  if (t && b < t) return null;
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  return sameMonth
    ? `mudou de ${Number(a.slice(8, 10))} para ${diaMes(b)}`
    : `mudou de ${diaMes(a)} para ${diaMes(b)}`;
}

/** "09:30:00" → "9h30"; "10:00" → "10h". null sem hora. */
export function horaLabel(value) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (!(h >= 0 && h <= 24)) return null;
  return m[2] === '00' ? `${h}h` : `${h}h${m[2]}`;
}

/** 7400 → "7,4 km"; 8000 → "8 km". Uma casa, vírgula. */
export function kmLabel(km) {
  const n = Number(km);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${String(Math.round(n * 10) / 10).replace('.', ',')} km`;
}

const INTENT_TEXT = { atacar: 'atacar', controlar: 'controlar', trote: 'em trote', saltar: 'saltar' };

/** O papel em texto: atacar, controlar, em trote, saltar. null se não for um. */
export const intentLabel = (intent) => INTENT_TEXT[intent] ?? null;

// O papel no passado (a linha de uma jornada feita).
const INTENT_DONE_TEXT = { atacar: 'Atacada', controlar: 'Controlada', trote: 'Em trote' };

/** "J3" — a inicial do rótulo da competição e o número. */
export function roundChip(roundNo, roundLabel = 'Jornada') {
  const initial = String(roundLabel || 'Jornada').trim().charAt(0).toUpperCase() || 'J';
  return `${initial}${roundNo ?? ''}`;
}

/** Porque é que a jornada tem este papel, na 2.ª pessoa (para o ecrã). A
 *  mesma razão que a Carol lê no bloco (seriesBlock.ts, roleReasonText), dita
 *  ao atleta. null nas razões sem papel (sem data, passada, não vai…). */
export function roleReasonLabel(role, view) {
  if (!role) return null;
  const p = role.principal;
  const pName = p?.name ? String(p.name).slice(0, 80) : 'prova principal';
  const P = p ? `${pName} (${diaMes(p.date)})` : 'prova principal';
  const n = Math.abs(role.offsetDays ?? 0);
  const refRound = role.refRoundId ? (view?.rounds || []).find((r) => r.id === role.refRoundId) : null;
  const ref = refRound ? (refRound.chip || roundChip(refRound.round_no, view?.roundLabel)) : null;
  switch (role.reason) {
    case 'e_principal': return 'é a tua prova principal';
    case 'dia_da_principal': return `é o dia da tua ${P}`;
    case 'encostada_a_principal':
      return `a ${n} ${n === 1 ? 'dia' : 'dias'} ${(role.offsetDays ?? 0) < 0 ? 'antes' : 'depois'} da tua ${P}`;
    case 'polimento_da_principal': return `estás no polimento da ${P}`;
    case 'recuperacao_da_principal': return `ainda a recuperar da ${P}`;
    case 'recuperacao_da_maratona': return `é a primeira depois da ${P}`;
    case 'par_curto': return ref ? `a ${role.gapDays} dias da ${ref}, que atacas` : `a ${role.gapDays} dias da tua prova principal`;
    case 'recuperacao_da_jornada': return ref ? `ainda a recuperar da ${ref}` : 'ainda a recuperar da tua prova principal';
    case 'progressao': return `controlar para ganhar ritmo; atacas 1 em ${role.every}`;
    case 'progressao_atacar': return `é a vez de atacar (1 em ${role.every})`;
    case 'livre': return 'fora das janelas das tuas principais';
    default: return null;
  }
}

// ── O estado de uma jornada ────────────────────────────────────────────────

const STATES = {
  cancelada: { icon: '✕', label: 'Cancelada', color: 'var(--text-4)' },
  feita: { icon: '✓', label: 'Feita', color: 'var(--ok)' },
  nao_fui: { icon: '✕', label: 'Não fui', color: 'var(--text-3)' },
  por_registar: { icon: '⋯', label: 'Por registar', color: 'var(--warn)' },
  passada_nao_vou: { icon: '✕', label: 'Não vou', color: 'var(--text-3)' },
  ja_passou: { icon: '⋯', label: 'Já passou', color: 'var(--text-3)' },
  por_confirmar: { icon: '⋯', label: 'Data por confirmar', color: 'var(--text-4)' },
  proxima: { icon: '▸', label: 'Próxima', color: 'var(--race)' },
  vou: { icon: '✓', label: 'Vou', color: 'var(--ok)' },
  nao_vou: { icon: '✕', label: 'Não vou', color: 'var(--danger)' },
  nao_sei: { icon: '⋯', label: 'Ainda não sei', color: 'var(--text-3)' },
  por_decidir: { icon: '⋯', label: 'Por decidir', color: 'var(--text-4)' },
};

/** Os ícones que a régua usa — e só estes (§4.3). */
export const CUP_STATUS_ICONS = Object.freeze(['✓', '▸', '✕', '⋯']);

const ordinal = (n) => `${Number(n)}.º`;
const positive = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null; };

/** O lugar de uma jornada feita: o oficial confirmado ("29.º M45", "41.º na
 *  geral") ou, sem ele, o que o próprio registou do diploma. Nunca o dorsal. */
export function roundPlaceLabel(round) {
  const res = round?.result;
  if (res) {
    const cat = positive(res.category_position);
    if (cat) return `${ordinal(cat)} ${res.category_code ? String(res.category_code) : 'no escalão'}`;
    const pos = positive(res.position);
    if (pos) return `${ordinal(pos)} na geral`;
  }
  const own = positive(round?.run?.details?.age_group_position);
  return own ? `${ordinal(own)} no escalão (registado por ti)` : null;
}

// A principal que cai no dia da jornada (a proposta de defaultDecision, ou a
// colisão que o servidor gravou).
function collisionOf(round) {
  const byServer = round?.participation?.decision_source === 'colisao';
  const bySuggestion = round?.suggestion?.reason === 'principal';
  if (!byServer && !bySuggestion) return null;
  return { name: round?.suggestion?.principal?.name || null };
}

function baseFutureKey(decision) {
  if (decision === 'vou') return 'vou';
  if (decision === 'nao_vou') return 'nao_vou';
  if (decision === 'nao_sei') return 'nao_sei';
  return 'por_decidir';
}

function futureDetail(key, round) {
  const parts = [];
  if (key === 'vou') {
    parts.push(intentLabel(round.intent));
    if (round.date_status === 'provavel') parts.push('à espera da data confirmada');
    if (round.race && racePriorityOf(round.race) === 'a') parts.push('principal');
  } else if (key === 'nao_vou') {
    if (round.participation?.intent === 'saltar') parts.push('saltar');
    const c = collisionOf(round);
    if (c?.name && round.suggestion?.reason === 'principal') parts.push(`é o dia da tua ${c.name}`);
  } else if (key === 'por_decidir') {
    const c = collisionOf(round);
    if (c) parts.push(c.name ? `é o dia da tua ${c.name} (principal)` : 'é o dia de uma prova principal');
  }
  return parts.filter(Boolean);
}

/** A data da linha: "dom 24 jan", "dom 6 dez (provável)", "adiada", "data
 *  por anunciar". `long` para a frase do leitor de ecrã. */
export function roundDateText(round, today = null, { long = false } = {}) {
  const d = dayOf(round?.date);
  if (round?.date_status === 'adiada') return 'adiada';
  if (!d) return 'data por anunciar';
  const text = long ? dataLonga(d) : diaCurto(d);
  const t = dayOf(today);
  return round?.date_status === 'provavel' && (!t || d >= t) ? `${text} (provável)` : text;
}

/** O estado de uma jornada da vista (useCup.js), pela ordem da régua (a
 *  primeira que bate). `ctx`: { today, nextRoundId, roundLabel }.
 *
 *  Devolve { key, icon, label, color, detail, actions, ariaLabel }:
 *  - `detail`: o texto a seguir ao `label`, partes separadas por " · " ('' sem nada);
 *  - `actions`: 'registar' e/ou 'nao_fui' — só em jornadas que já passaram;
 *  - `ariaLabel`: uma frase por linha, para o leitor de ecrã. */
export function cupRoundStatus(round, ctx = {}) {
  if (!round) return null;
  const today = dayOf(ctx.today) ?? '';
  const roundLabel = ctx.roundLabel || 'Jornada';
  const day = dayOf(round.date);
  const past = !!day && !!today && day < today;
  const decision = round.participation?.decision ?? null;

  let key;
  let parts = [];
  let actions = [];
  if (round.date_status === 'cancelada') key = 'cancelada';
  else if (round.done) {
    key = 'feita';
    parts = [INTENT_DONE_TEXT[round.intent] ?? null, roundPlaceLabel(round)];
  } else if (decision === 'nao_fui') key = 'nao_fui';
  else if (past && round.race) {
    key = 'por_registar';
    actions = round.run ? ['registar'] : ['registar', 'nao_fui'];
  } else if (past && decision === 'nao_vou') key = 'passada_nao_vou';
  else if (past && round.date_status === 'confirmada') {
    key = 'ja_passou';
    actions = ['registar', 'nao_fui'];
  } else if (past) key = 'por_confirmar';
  else if (ctx.nextRoundId && round.id === ctx.nextRoundId) {
    key = 'proxima';
    const base = baseFutureKey(decision);
    const when = round.date_status === 'adiada'
      ? 'adiada'
      : day ? countdownLabel(daysUntil(day, today)) : 'data por anunciar';
    parts = [STATES[base].label, base === 'vou' ? intentLabel(round.intent) : null, when];
  } else {
    key = baseFutureKey(decision);
    parts = futureDetail(key, round);
  }

  const s = STATES[key];
  const detailParts = parts.filter(Boolean);
  const name = round.name ? String(round.name) : null;
  const head = [`${roundLabel} ${round.round_no ?? ''}`.trim(), name, roundDateText(round, today, { long: true })].filter(Boolean).join(', ');
  return {
    key,
    icon: s.icon,
    label: s.label,
    color: s.color,
    detail: detailParts.join(' · '),
    actions,
    ariaLabel: `${head}. ${s.label}${detailParts.length ? `: ${detailParts.join(', ')}` : ''}.`,
  };
}

// ── A lista de Provas com inscrição (§4.3, "bloco fixo por edição") ───────

/** Quem fica no bloco do Troféu e quem leva o chip "J3", a partir da vista do
 *  inscrito (useCupForHome). Pura, para groupRaces e "Para onde vou".
 *
 *  - `isFixed(race)`: a prova de uma jornada DESTA edição que não foi
 *    promovida a principal — sai das linhas normais e vai para o bloco. Uma
 *    promovida fica nas linhas (é uma principal). Enquanto a vista ou o
 *    catálogo estão a chegar (`pending`: há pista de inscrição), qualquer
 *    prova com `cup_round_id` conta — é o que evita o cartão a piscar. Com o
 *    catálogo em erro, nenhuma (as provas voltam a aparecer como normais).
 *  - `tag(race)`: { roundId, roundNo, chip, roundLabel } para as provas das
 *    jornadas desta edição, com a vista pronta; senão null.
 *
 *  null sem vista e sem pista: groupRaces fica exatamente como era. */
export function cupListingOf(view, pending = false) {
  if (!view && !pending) return null;
  const status = view ? (view.catalogReady ? 'ready' : view.catalogStatus === 'erro' ? 'erro' : 'loading') : 'loading';
  const byRound = status === 'ready' ? new Map((view.rounds || []).map((r) => [r.id, r])) : null;
  const roundLabel = view?.roundLabel || 'Jornada';
  const isFixed = (race) => {
    if (!race?.cup_round_id || racePriorityOf(race) === 'a') return false;
    if (status === 'ready') return byRound.has(race.cup_round_id);
    return status === 'loading';
  };
  const tag = (race) => {
    if (!byRound || !race?.cup_round_id) return null;
    const r = byRound.get(race.cup_round_id);
    if (!r) return null;
    return { roundId: r.id, roundNo: r.round_no ?? null, chip: r.chip || roundChip(r.round_no, roundLabel), roundLabel };
  };
  return { view: view || null, loading: status === 'loading', isFixed, tag };
}

/** A jornada que o bloco da lista e a linha do "Para onde vou" mostram como
 *  "a próxima", sem repetir uma prova que já está à vista noutra linha
 *  (revisão da Fase 3): a régua de nextCupRound, mas a saltar as jornadas
 *  cuja prova `shown(race)` diz que já aparece — uma promovida a principal
 *  (fica nas linhas normais, é uma principal) e, no cartão, a do próprio dia
 *  (fica no carrossel, com o "Registar a prova"). null sem catálogo, ou
 *  quando todas as que faltam já estão à vista. */
export function nextRoundApart(view, shown = () => false) {
  if (!view?.catalogReady) return null;
  const rounds = (view.rounds || []).filter((r) => !(r.race && shown(r.race)));
  return nextCupRound(rounds, view.today);
}

// ── Promover a principal (§4.3): o custo antes de gravar ──────────────────

/** A entrada de cupRoundRoles/promotionImpact a partir da vista. */
export function cupRolesInputOf(view, { raceEvents, runs, profile, today } = {}) {
  return {
    edition: view?.edition ?? null,
    rounds: view?.rounds ?? [],
    participations: view?.participations ?? [],
    categories: view?.categories ?? [],
    courses: view?.courses ?? [],
    overrides: view?.overrides ?? [],
    races: raceEvents ?? [],
    runs: runs ?? [],
    profile: profile ?? null,
    seasonGoal: view?.enrollment?.season_goal ?? null,
    todayISO: today ?? view?.today ?? '',
  };
}

function listJoin(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** O que muda se a jornada `roundId` passar a principal, dito ANTES de
 *  gravar (CupPromoteDialog). null sem inscrição ou sem prova da jornada.
 *
 *  `lines` são os textos do diálogo, prontos: o taper e a recuperação de uma
 *  principal; as outras jornadas que mudam de papel; as principais de fora
 *  que ficam perto (e o plano aceite em cuja janela ela cai) — essas mandam
 *  sempre; e que se pode voltar atrás. */
export function promotionPreview(view, roundId, { raceEvents = [], coachPlans = [], profile = null, runs = [], today } = {}) {
  if (!view?.enrollment || !roundId) return null;
  const day = dayOf(today) ?? view.today;
  const imp = promotionImpact(cupRolesInputOf(view, { raceEvents, runs, profile, today: day }), roundId);
  if (!imp) return null;
  const label = view.roundLabel || 'Jornada';
  const l = label.toLowerCase();
  const byId = new Map((view.rounds || []).map((r) => [r.id, r]));

  const changes = imp.changes.map((c) => {
    const r = byId.get(c.roundId);
    return { roundId: c.roundId, chip: r?.chip || roundChip(r?.round_no, label), dateLabel: diaMes(r?.date), from: c.from, to: c.to };
  });
  const near = imp.near.map((r) => ({ id: r.id ?? null, name: r.name || 'prova principal', dateLabel: diaMes(r.date) }));

  // Um plano aceite em cuja janela a jornada cai passa a ter duas principais:
  // o Início vai mostrar o race_conflict (e a Carol pede para escolherem).
  let planConflict = null;
  const simulated = (raceEvents || []).map((r) => (r?.id === imp.raceId ? { ...r, race_priority: 'a' } : r));
  for (const plan of coachPlans || []) {
    const c = detectRaceConflict({ coachPlans: [plan], raceEvents: simulated, today: day });
    if (c?.races?.some((r) => r.id === imp.raceId)) {
      planConflict = { id: c.target?.id ?? null, targetName: c.target?.name || 'a tua prova-objetivo', dateLabel: diaMes(c.target?.date) };
      break;
    }
  }

  const lines = [
    `Uma prova principal muda o treino à volta dela: ${imp.taperDays} dias de afinação antes e ${imp.recoveryDays} de recuperação depois.`,
  ];
  const changeText = (c) => `${c.chip} (${c.dateLabel}) de ${intentLabel(c.from) ?? 'sem papel'} para ${intentLabel(c.to) ?? 'sem papel'}`;
  lines.push(
    changes.length === 0
      ? `Nenhuma outra ${l} muda de papel.`
      : `${changes.length === 1 ? 'Muda' : 'Mudam'} de papel: ${changes.map(changeText).join('; ')}.`,
  );
  const others = [...near];
  if (planConflict && !others.some((n) => n.id != null && n.id === planConflict.id)) {
    others.push({ id: planConflict.id, name: planConflict.targetName, dateLabel: planConflict.dateLabel });
  }
  if (others.length) {
    const names = listJoin(others.map((o) => (o.dateLabel ? `${o.name} (${o.dateLabel})` : o.name)));
    lines.push(
      others.length === 1
        ? `A tua ${names} também é principal e fica perto demais: as principais de fora mandam. Se promoveres esta ${l}, a Carol vai pedir-te para escolherem juntos.`
        : `As tuas ${names} também são principais e ficam perto demais: as principais de fora mandam. Se promoveres esta ${l}, a Carol vai pedir-te para escolherem juntos.`,
    );
  }
  lines.push('Podes voltar a pô-la como secundária quando quiseres.');

  return {
    raceId: imp.raceId,
    taperDays: imp.taperDays,
    recoveryDays: imp.recoveryDays,
    changes,
    near,
    planConflict,
    lines,
  };
}
