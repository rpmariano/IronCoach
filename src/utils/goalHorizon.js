import { evaluateGoalHorizon, earliestFeasibleDate } from '@formulas/goalHorizon.ts';
import { todayISO } from '../lib/utils';

/* O horizonte dos objetivos corporais, para mostrar (bug #46): a mesma conta
   que o servidor faz ao receber uma proposta da Carol (coach-chat,
   runUpdateGoals) — @formulas/goalHorizon.ts — lida com o que a app já tem
   no store: a última avaliação corporal, as provas marcadas, o nível e o
   género do perfil. */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2027-01-15" → "15 jan 2027". */
export function formatTargetDate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  return `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

const pt = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

function latestAssessment(bodyAssessments) {
  return [...(bodyAssessments || [])]
    .filter((a) => a?.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] ?? null;
}

/**
 * O resumo do horizonte, ou null sem data-alvo ou sem objetivos corporais.
 *   { weeks, lines: [{ text, ok }], windows: [texto], ok, earliest }
 */
export function goalHorizonSummary({ targetDate, goals, profile, bodyAssessments, raceEvents, today = todayISO() }) {
  if (typeof targetDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null;
  const hasBodyGoals = ['goal_weight_kg', 'goal_body_fat_pct', 'goal_muscle_mass_kg', 'goal_lean_body_mass_kg']
    .some((k) => Number(goals?.[k]) > 0);
  if (!hasBodyGoals) return null;

  const latest = latestAssessment(bodyAssessments);
  const input = {
    today,
    now: { ...(latest || {}), weight_kg: latest?.weight_kg ?? profile?.weight_kg ?? null },
    goals,
    level: profile?.experience_level ?? null,
    gender: profile?.gender ?? null,
    races: (raceEvents || []).filter((r) => r?.status === 'agendada'),
  };
  const h = evaluateGoalHorizon({ ...input, targetDate });
  const lines = h.checks.map((c) => ({
    ok: c.ok,
    text: `${c.label[0].toUpperCase()}${c.label.slice(1)}: ${c.direction === 'perder' ? '−' : '+'}${pt(c.amountKg)} kg` +
      (Number.isFinite(c.perWeekKg) ? ` · ${pt(c.perWeekKg)} kg/semana` : ' · sem semanas com défice até lá') +
      (c.ok ? '' : ` — acima do ritmo seguro (máx. ${pt(c.limitPerWeekKg)} kg/semana)`),
  }));
  const windows = h.windows.map((w) =>
    `Sem défice de ${formatTargetDate(w.from)} a ${formatTargetDate(w.to)}${w.race ? `, antes de ${w.race}` : ', antes da prova A'}`);
  return {
    weeks: Math.round(h.weeks),
    lines,
    windows,
    outOfRange: h.outOfRange,
    ok: h.ok,
    earliest: h.ok || h.outOfRange ? null : earliestFeasibleDate(input),
  };
}
