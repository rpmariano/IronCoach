// A corrida que registou uma prova — fórmula pura, a mesma na app
// (src/utils/run.js findRaceRun) e no servidor (proactiveTriggers.ts
// findRaceRunServer, usada pelo coach-proactive-tick).
//
// A regra (specs/prova-concluida.md §1): `runs.race_id` é a ligação real e
// manda sempre. A coincidência de data com uma competição sem ligação fica
// como recurso, e só numa prova já marcada como concluída — é o caso dos
// registos antigos, anteriores a essa coluna. Numa prova ainda agendada,
// uma competição sem race_id no mesmo dia é uma "prova fora da agenda".
//
// O desempate (2026-09-29, revisão pré-deploy de cf15c71): com duas ou mais
// corridas possíveis — duas ligadas à mesma prova, ou duas competições sem
// ligação no dia de uma prova antiga — ganhava a primeira da lista, e a
// ordem da lista não é fixa (a app carrega por data, sem desempate, e junta
// as corridas novas no fim). A corrida escolhida trocava entre recargas e
// entre dispositivos, e com ela a chave do balanço
// (`race_after:<prova>:<corrida>`) e a corrida guardada com a cópia local
// do balanço: o aviso "O balanço da prova" podia reaparecer, e a Carol
// pedir o balanço outra vez (chamada paga). Agora ganha a mais antiga —
// `created_at`, depois `id` —, em qualquer ordem, dos dois lados. É a
// mesma ordem com que o trigger da BD passa um treino para outra corrida
// do dia (migration 20260928205037).

export interface RaceRunLike {
  id?: string | null;
  date?: string | null;
  race_id?: string | null;
  kind?: string | null;
  created_at?: string | null;
}

export interface RaceLike {
  id?: string | null;
  status?: string | null;
  date?: string | null;
}

/** Instante de criação; sem ele (ou ilegível), fica para o fim. */
function createdMs(r: RaceRunLike): number {
  const ms = Date.parse(r?.created_at ?? "");
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

/** A mais antiga da lista — `created_at`, depois `id` —, ou null. */
export function oldestRun<T extends RaceRunLike>(list: T[]): T | null {
  let best: T | null = null;
  for (const r of list) {
    if (!r) continue;
    if (!best) { best = r; continue; }
    const a = createdMs(r);
    const b = createdMs(best);
    if (a < b || (a === b && String(r.id ?? "") < String(best.id ?? ""))) best = r;
  }
  return best;
}

/** A corrida desta prova, ou null. A mesma em qualquer ordem de `runs`. */
export function pickRaceRun<T extends RaceRunLike>(runs: T[] | null | undefined, race: RaceLike | null | undefined): T | null {
  if (!race?.id) return null;
  const list = runs || [];
  const linked = oldestRun(list.filter((r) => r?.race_id === race.id));
  if (linked) return linked;
  if (race.status !== "concluida") return null;
  return oldestRun(list.filter((r) => !r?.race_id && r?.kind === "competicao" && r?.date === race.date));
}
