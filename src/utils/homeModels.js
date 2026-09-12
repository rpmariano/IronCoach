/* Modelos puros do Início (redesenho 2026-09, ponto 5): o que cada cartão
   mostra, calculado a partir do store, sem JSX — para se poder testar sem
   montar componentes. */
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { mealNutrients } from './nutrition';
import { lisbonTodayISO } from '../lib/utils';

// ─── Datas ──────────────────────────────────────────────────────────────────

/** "Domingo · 6 set" — dia da semana em maiúscula inicial, data curta. */
export function formatDayLabel(dateISO) {
  if (!dateISO) return '';
  const s = format(parseISO(dateISO), 'EEEE · d MMM', { locale: pt });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "28 jul" — para as pontas do trilho da prova. */
export function formatDayMonth(dateISO) {
  if (!dateISO) return '';
  return format(parseISO(dateISO), 'd MMM', { locale: pt });
}

/** "domingo" — para o eyebrow da persiana das refeições. */
export function formatWeekday(dateISO) {
  if (!dateISO) return '';
  return format(parseISO(dateISO), 'EEEE', { locale: pt });
}

// ─── Plano do dia ───────────────────────────────────────────────────────────

const TRAINING_TYPE_LABELS = {
  longo: 'Rodagem longa',
  continuo: 'Corrida contínua',
  regenerativo: 'Regenerativo',
  intervalos: 'Intervalos',
  tempo: 'Tempo',
  fartlek: 'Fartlek',
  subidas: 'Subidas',
  // 'prova' é o tipo que o servidor grava no dia da prova (specs/
  // plano-de-prova.md, "O plano tem de saber da prova"); 'competicao' é a
  // grafia antiga, que ainda existe em planos gravados antes disso.
  prova: 'Prova',
  competicao: 'Prova',
};

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* ── O dia da prova no plano (specs/plano-de-prova.md) ──────────────────────
   O dia da prova deixou de ser um treino qualquer: é um item `corrida` com
   `training_type = 'prova'`. Duas coisas mudam onde ele aparece — o rótulo
   ("Prova", com o nome da prova desse dia quando o há) e o tom, que passa
   ao âmbar reservado à prova. O item NÃO é a prova da agenda (`isRace`,
   injetado no calendário do plano): é a linha do plano de treino que a
   prova ocupa, e é essa que o registo da corrida vem concluir. */

/** É o item do plano que representa a prova? */
export function isRacePlanItem(item) {
  return !!item && item.kind === 'corrida' && (item.training_type === 'prova' || item.training_type === 'competicao');
}

/** A prova agendada nesta data, ou null. Serve para dar nome (e destino) ao
 *  item de prova do plano — por isso não filtra por estado: uma prova já
 *  concluída continua a ser a prova daquele dia. */
export function raceForDate(raceEvents, dateISO) {
  if (!dateISO) return null;
  return (raceEvents || []).find((r) => r && typeof r.date === 'string' && r.date.slice(0, 10) === dateISO) || null;
}

/** Só o nome, para os rótulos. */
export function raceNameForDate(raceEvents, dateISO) {
  return raceForDate(raceEvents, dateISO)?.name || null;
}

/** Título de um item do plano, como o mock: "Rodagem longa · 16 km".
 *  `raceName` é o nome da prova desse dia, quando o item é o da prova. */
export function planItemTitle(item, raceName = null) {
  if (!item) return '';
  if (item.isRace) {
    return ['Prova', item.title, item.target_distance_km ? `${item.target_distance_km} km` : null].filter(Boolean).join(' · ');
  }
  if (isRacePlanItem(item)) {
    return ['Prova', raceName, item.target_distance_km ? `${item.target_distance_km} km` : null].filter(Boolean).join(' · ');
  }
  if (item.kind === 'corrida') {
    const type = item.training_type ? (TRAINING_TYPE_LABELS[item.training_type] || capitalize(item.training_type)) : 'Corrida';
    return [type, item.target_distance_km ? `${item.target_distance_km} km` : null].filter(Boolean).join(' · ');
  }
  if (item.kind === 'ginasio') {
    const cats = item.categories?.length ? item.categories.join('/') : 'Ginásio';
    return [cats, item.target_duration_min ? `${item.target_duration_min} min` : null].filter(Boolean).join(' · ');
  }
  return 'Descanso';
}

export function trainingItems(items = []) {
  return (items || []).filter((i) => i.kind !== 'descanso');
}

/** Título do dia inteiro: os treinos separados por " + ", ou "Descanso". */
export function dayTitle(items = [], raceName = null) {
  const t = trainingItems(items);
  return t.length ? t.map((i) => planItemTitle(i, raceName)).join(' + ') : 'Descanso';
}

/** Estado do dia para o badge: tom e texto. */
export function dayStatus(day, today) {
  const items = day?.items || [];
  const t = trainingItems(items);
  if (items.some((i) => i.isRace && i.status !== 'concluido')) return { label: 'Prova', tone: 'race' };
  // O dia da prova no plano vale o mesmo badge âmbar que a prova da agenda.
  if (items.some((i) => isRacePlanItem(i) && i.status === 'pendente')) return { label: 'Prova', tone: 'race' };
  if (t.length === 0) return { label: 'Descanso', tone: 'neutral' };
  if (t.every((i) => i.status === 'concluido')) return { label: 'Concluído', tone: 'ok' };
  if (t.every((i) => i.status === 'cancelado')) return { label: 'Cancelado', tone: 'neutral' };
  if (day.dateISO < today && t.some((i) => i.status === 'pendente')) return { label: 'Em atraso', tone: 'warn' };
  return { label: 'Plano aceite', tone: 'ok' };
}

/** O treino por registar neste dia (o botão "Registar sessão"), ou null. O
 *  dia da prova não conta: a prova regista-se em modo prova, a partir do hub
 *  ou do cartão da prova, e é esse registo que conclui o item. */
export function pendingSession(day, today) {
  if (!day || day.dateISO > today) return null;
  return trainingItems(day.items).find((i) => !i.isRace && !isRacePlanItem(i) && i.status === 'pendente') || null;
}

// ─── Refeições sugeridas ────────────────────────────────────────────────────

export const MEAL_LABEL_BY_TIPO = {
  'pequeno-almoco': 'Pequeno-almoço',
  'lanche-manha': 'Lanche da manhã',
  almoco: 'Almoço',
  lanche: 'Lanche da tarde',
  jantar: 'Jantar',
  ceia: 'Ceia',
};

const TIPO_BY_LABEL = {
  'pequeno-almoço': 'pequeno-almoco',
  'lanche da manhã': 'lanche-manha',
  'lanche pré-treino': 'lanche-manha',
  almoço: 'almoco',
  'lanche da tarde': 'lanche',
  'lanche pós-treino': 'lanche',
  lanche: 'lanche',
  jantar: 'jantar',
  ceia: 'ceia',
};
const MEAL_SPLIT = /(Pequeno-almoço|Lanche da manhã|Lanche da tarde|Lanche pré-treino|Lanche pós-treino|Lanche|Almoço|Jantar|Ceia):\s*/gi;

/** Divide o texto corrido de uma sugestão pelos nomes das refeições. */
export function parseMealSuggestion(text) {
  if (!text || typeof text !== 'string') return [];
  const clean = text.replace(/^[-*]\s+/gm, '').replace(/\*\*/g, '');
  const parts = [];
  let m;
  const re = new RegExp(MEAL_SPLIT.source, 'gi');
  const matches = [];
  while ((m = re.exec(clean)) !== null) matches.push({ label: m[1], start: m.index, end: m.index + m[0].length });
  if (matches.length === 0) return [{ tipo: null, label: 'Sugestão', texto: clean.trim() }];
  matches.forEach((mt, i) => {
    const texto = clean.slice(mt.end, i + 1 < matches.length ? matches[i + 1].start : undefined).trim().replace(/[\n\r]+/g, ' ');
    const tipo = TIPO_BY_LABEL[mt.label.toLowerCase()] || null;
    parts.push({ tipo, label: tipo ? MEAL_LABEL_BY_TIPO[tipo] : mt.label, texto });
  });
  return parts.filter((p) => p.texto);
}

/** As refeições sugeridas de um dia do plano: estruturadas (meal_macros)
 *  quando existem, texto corrido dividido quando não. */
export function mealsForDay(items = []) {
  const item = (items || []).find((i) => i.meal_macros?.items?.length) || (items || []).find((i) => i.meal_suggestion);
  if (!item) return null;
  const structured = item.meal_macros?.items?.length
    ? item.meal_macros.items.map((r) => ({ tipo: r.tipo, label: MEAL_LABEL_BY_TIPO[r.tipo] || r.tipo, texto: r.texto }))
    : parseMealSuggestion(item.meal_suggestion);
  if (structured.length === 0) return null;
  return {
    kcal: item.meal_macros?.kcal ? Math.round(item.meal_macros.kcal) : null,
    meals: structured,
    racional: typeof item.notes === 'string' && item.notes.trim() ? item.notes.trim() : null,
  };
}

/** A refeição que se mostra fechada no cartão: o almoço, senão a primeira. */
export function previewMeal(mealsModel) {
  if (!mealsModel?.meals?.length) return null;
  return mealsModel.meals.find((m) => m.tipo === 'almoco') || mealsModel.meals[0];
}

// ─── Prova ──────────────────────────────────────────────────────────────────

/** O que o trilho e o cabeçalho do cartão da prova mostram, a partir do
 *  plano calculado por calculateRaceTrainingPlan. Três fases no trilho
 *  (BASE · ESPECÍFICA · TAPER): construção e pico juntam-se na do meio. */
export function buildTrailModel(plan) {
  const byId = Object.fromEntries((plan?.phases || []).map((p) => [p.id, p]));
  const base = byId.base?.weeksCount || 0;
  const build = byId.build?.weeksCount || 0;
  const peak = byId.peak?.weeksCount || 0;
  const taper = byId.taper?.weeksCount || 0;
  const weeks = Math.max(1, plan?.totalWeeks || base + build + peak + taper);
  const phases = [
    { label: 'BASE', to: base },
    { label: 'ESPECÍFICA', to: base + build + peak },
    { label: 'TAPER', to: weeks },
  ];
  const status = plan?.trainingStatus || 'in_progress';
  const current = Math.max(0, Math.min(weeks, plan?.currentWeek || 0));
  let phaseName = plan?.currentPhase?.name || '';
  let weekLabel = `semana ${current} de ${weeks}`;
  if (status === 'not_started') {
    phaseName = 'Antes do arranque';
    weekLabel = plan.daysToStart === 1 ? 'começa amanhã' : `começa em ${plan.daysToStart} dias`;
  } else if (status === 'race_day') {
    phaseName = 'Dia da prova';
    weekLabel = 'é hoje';
  } else if (status === 'completed') {
    phaseName = 'Prova concluída';
    weekLabel = '';
  }
  return {
    weeks,
    current,
    phases,
    startLabel: formatDayMonth(plan?.effectiveStartDate || plan?.planStartDate),
    endLabel: formatDayMonth(plan?.raceDate),
    phaseName,
    weekLabel,
    days: Math.max(0, plan?.daysToRace || 0),
  };
}

// ─── Como estou ─────────────────────────────────────────────────────────────

const litres = (ml) => (Math.round((ml / 1000) * 10) / 10).toFixed(1).replace('.', ',');

/** Os três anéis: calorias (violeta), proteína (rosa), água (ciano). */
export function buildOrbitRings({ meals = [], waterLogs = [], profile = {}, today } = {}) {
  const t = today || lisbonTodayISO();
  const totals = (meals || []).filter((m) => m.date === t).reduce((acc, m) => {
    const n = mealNutrients(m);
    return { calories: acc.calories + (n.calories || 0), protein: acc.protein + (n.protein || 0) };
  }, { calories: 0, protein: 0 });
  const waterMl = (waterLogs || []).filter((w) => w.date === t).reduce((s, w) => s + (w.amount_ml || 0), 0);
  const calGoal = Number(profile?.calorie_goal) || 2000;
  const proteinGoal = Number(profile?.protein_goal) || 150;
  const waterGoal = Number(profile?.water_goal_ml) || 2000;
  return [
    { label: 'Calorias', value: Math.round(totals.calories), target: calGoal, color: 'var(--nutrition)' },
    { label: 'Proteína', value: Math.round(totals.protein), target: proteinGoal, unit: 'g', color: 'var(--body)' },
    { label: 'Água', value: waterMl / 1000, target: waterGoal / 1000, unit: 'L', display: litres(waterMl), targetDisplay: litres(waterGoal), color: 'var(--run)' },
  ];
}

/** Já há algum registo, de qualquer módulo? Sem nenhum é o primeiro dia. */
export function hasAnyRecord({ runs, meals, gymSessions, bodyAssessments } = {}) {
  return [runs, meals, gymSessions, bodyAssessments].some((l) => Array.isArray(l) && l.length > 0);
}
