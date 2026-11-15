import { findRaceRun, formatDuration, formatPace } from './run';

/* Bug #117 (2026-11-09, o Rui no Calendário): «Porque aparece duas vezes a mesma prova?». No dia
   da Cascais Oeiras Lisboa (8-11) o Calendário mostrava o cartão da prova (concluída) e, por
   baixo, o cartão da corrida com que ela foi registada (kind 'competicao', race_id da prova) — a
   mesma prova duas vezes, e duas marcas no dia da grelha. Na base de dados não há duplicados.

   Agora a prova é um cartão só: a corrida ligada a uma prova que se vê nesse dia não tem cartão nem
   marca próprios; o resultado (tempo e ritmo) vai no cartão da prova, com «Ver registo». */

/** Os ids das corridas que pertencem às provas dadas: as ligadas por race_id e a que o cartão da
 *  prova abre em «Ver registo» (findRaceRun — inclui o recurso por data das provas antigas). */
export function raceLinkedRunIds(races, runs) {
  const ids = new Set();
  const raceIds = new Set((races || []).map((r) => r?.id).filter(Boolean));
  for (const run of runs || []) {
    if (run?.id && run.race_id && raceIds.has(run.race_id)) ids.add(run.id);
  }
  for (const race of races || []) {
    const picked = findRaceRun(runs || [], race);
    if (picked?.id) ids.add(picked.id);
  }
  return ids;
}

/** As corridas do dia sem as que já estão nas provas desse dia. */
export function runsWithoutRaceRuns(runs, races) {
  if (!races?.length) return runs || [];
  const linked = raceLinkedRunIds(races, runs);
  return (runs || []).filter((r) => !linked.has(r?.id));
}

/** «Resultado: 47:12 · 4:43/km» — o tempo oficial se o houver, senão o do relógio. */
export function raceResultLine(run) {
  if (!run) return null;
  const seconds = Number(run.details?.official_time_seconds) || Number(run.duration_seconds) || 0;
  if (!seconds) return null;
  const km = Number(run.distance_km);
  const pace = km > 0 ? `${formatPace(seconds / km)}/km` : null;
  return `Resultado: ${[formatDuration(seconds), pace].filter(Boolean).join(' · ')}`;
}
