import { addDaysISO } from '../lib/utils';

/* "O que falta para começar" — modelo puro (2026-10-04).
   Os critérios são os da lista do OverviewDashboard; vivem aqui para o Início
   e a Evolução › Geral dizerem sempre o mesmo.

   Refeições: 7 dias FECHADOS distintos com refeições, nos últimos 7 dias
   fechados (ontem para trás). Hoje não conta — o dia ainda está a decorrer e
   um dia a meio contava como "feito" sem o estar. 7 refeições no mesmo dia
   são 1 dia, não 7. */
export function buildGettingStarted({ profile, raceEvents, runs, meals, todayISO }) {
  const fim = addDaysISO(todayISO, -1);
  const inicio = addDaysISO(todayISO, -7);
  const dias = new Set();
  for (const m of meals || []) {
    const d = typeof m?.date === 'string' ? m.date.slice(0, 10) : null;
    if (d && d >= inicio && d <= fim) dias.add(d);
  }
  const nRuns = runs?.length || 0;
  return [
    { key: 'perfil', label: 'Perfil preenchido', done: !!(profile?.experience_level && (profile?.weight_kg || profile?.height_cm)) },
    { key: 'prova', label: 'Marcar uma prova', done: (raceEvents?.length || 0) > 0 },
    { key: 'corridas', label: 'Registar 3 corridas', done: nRuns >= 3, progress: `${Math.min(nRuns, 3)} de 3` },
    { key: 'refeicoes', label: 'Registar 1 semana de refeições', done: dias.size >= 7, progress: `${Math.min(dias.size, 7)} de 7` },
  ];
}

export function isGettingStartedComplete(items) {
  return Array.isArray(items) && items.length > 0 && items.every((i) => i.done);
}
