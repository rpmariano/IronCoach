import { useMemo } from 'react';
import { useAppStore } from '../store';
import { calculateReadinessIndex } from './biEngine';
import { todayISO } from '../lib/utils';

/* A prontidão no Design v2 (P2 da 2.ª crítica, 2026-11-28): uma só fonte e uma só frase. O hub, a
   Evolução › Geral e o cartão da prova diziam-na de três maneiras («Prontidão Alta (72%)»,
   «Prontidão Alta» com o número no anel, «Preparação Adequada» do motor do plano) e, no hub, com
   um número calculado sem o treino de hoje. Agora todos usam calculateReadinessIndex com as mesmas
   entradas que o Geral sempre usou, e a mesma frase: «Prontidão alta, 72%» / «Prontidão a calibrar». */

/** Há treino previsto hoje num plano aceite em vigor? undefined quando não se sabe (o Geral de sempre). */
export function trainingTodayOf(coachPlans, coachPlanItems, today = todayISO()) {
  const comTreino = new Set((coachPlanItems || []).filter((i) => (i?.kind === 'corrida' || i?.kind === 'ginasio') && i.status !== 'cancelado').map((i) => i.plan_id));
  const emVigor = (coachPlans || []).filter((p) => p?.status === 'aceite' && comTreino.has(p.id)
    && String(p.period_start || '').slice(0, 10) <= today && String(p.period_end || '').slice(0, 10) >= today);
  if (!emVigor.length) return undefined;
  const aceites = new Set(emVigor.map((p) => p.id));
  return (coachPlanItems || []).some((i) => i && aceites.has(i.plan_id) && i.planned_date === today
    && (i.kind === 'corrida' || i.kind === 'ginasio') && i.status !== 'cancelado');
}

const NIVEL = { high: 'alta', medium: 'média', low: 'baixa' };

/** A frase única: «Prontidão alta, 72%», ou «Prontidão a calibrar» quando ainda não há dados. */
export function readinessTextV2(readiness) {
  if (!readiness || readiness.calibrating || !Number.isFinite(Number(readiness.score))) return 'Prontidão a calibrar';
  return `Prontidão ${NIVEL[readiness.level] || 'baixa'}, ${Math.round(Number(readiness.score))}%`;
}

/** A prontidão de uma prova com os dados do store, com as entradas do Geral. */
export function useRaceReadinessV2(race) {
  const runs = useAppStore((s) => s.runs);
  const meals = useAppStore((s) => s.meals);
  const bodyAssessments = useAppStore((s) => s.bodyAssessments);
  const gymSessions = useAppStore((s) => s.gymSessions);
  const profile = useAppStore((s) => s.profile);
  const dailyCheckins = useAppStore((s) => s.dailyCheckins);
  const coachPlans = useAppStore((s) => s.coachPlans);
  const coachPlanItems = useAppStore((s) => s.coachPlanItems);
  const goalHistory = useAppStore((s) => s.goalHistory);
  return useMemo(() => {
    if (!race) return null;
    try {
      return calculateReadinessIndex(runs || [], meals || [], bodyAssessments || [], gymSessions || [], profile || {}, race,
        dailyCheckins || [], trainingTodayOf(coachPlans, coachPlanItems), goalHistory);
    } catch {
      return null;
    }
  }, [race, runs, meals, bodyAssessments, gymSessions, profile, dailyCheckins, coachPlans, coachPlanItems, goalHistory]);
}
