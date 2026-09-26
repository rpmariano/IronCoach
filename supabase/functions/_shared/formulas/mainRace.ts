// A prova principal — qual das provas marcadas é "a prova" (2026-09-26).
//
// Vários sítios escolhiam "a próxima prova" só pela data: o chat (fases,
// meteorologia, "Reta Final"), o cartão diário, a modalidade da Vitrina, o
// enquadramento das análises, a véspera e a manhã da prova. Com uma prova de
// treino (b/c) ou uma jornada de taça à frente da principal, era essa que
// tomava o lugar do objetivo — a Carol falava do taper de uma prova de
// preparação e das fases de um macrociclo que não existe. Fase 0 do Troféu
// (correções neutras, valem para todos os atletas, com ou sem taça).
//
// A regra é uma só, para servidor e cliente (via @formulas):
// - race_priority em falta conta como 'a': é o default da coluna
//   (20260809120000_resting_hr_race_priority.sql) e a mesma leitura de
//   detectRaceConflictServer;
// - a PRINCIPAL é a próxima 'a' ainda por correr;
// - o FOCO é a principal quando existe, senão a próxima por data — um atleta
//   só com provas de treino continua a ter "a próxima prova";
// - num dia com mais do que uma prova, a principal ganha; entre iguais, a
//   ordem é a do id, para a escolha nunca depender da ordem do select.

export interface MainRaceCandidate {
  id?: string | null;
  date?: string | null;
  status?: string | null;
  race_priority?: string | null;
}

/** 'a' | 'b' | 'c', com 'a' por omissão (o default da coluna). */
export function racePriorityOf(race: { race_priority?: string | null } | null | undefined): "a" | "b" | "c" {
  const p = race?.race_priority;
  return p === "b" || p === "c" ? p : "a";
}

export function isPrincipalRace(race: { race_priority?: string | null } | null | undefined): boolean {
  return racePriorityOf(race) === "a";
}

const PRIORITY_RANK: Record<string, number> = { a: 0, b: 1, c: 2 };

/** Ordem determinística: principal primeiro, depois b, depois c; entre
 *  iguais, pelo id. Não olha para a data — é para provas do mesmo dia. */
export function compareByPriority(a: MainRaceCandidate, b: MainRaceCandidate): number {
  const d = PRIORITY_RANK[racePriorityOf(a)] - PRIORITY_RANK[racePriorityOf(b)];
  if (d !== 0) return d;
  return String(a.id ?? "").localeCompare(String(b.id ?? ""));
}

function dayOf(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

/** A prova de um dia (a véspera e a manhã): com mais do que uma, a principal. */
export function pickRaceOfDay<T extends MainRaceCandidate>(races: T[] | null | undefined, day: string): T | null {
  const same = (races || []).filter((r) => r && dayOf(r.date) === day);
  if (!same.length) return null;
  return [...same].sort(compareByPriority)[0];
}

/** As provas ainda por correr (a partir de hoje, sem as concluídas), por
 *  data e, no mesmo dia, pela prioridade. */
function upcoming<T extends MainRaceCandidate>(races: T[] | null | undefined, todayISO: string): T[] {
  return (races || [])
    .filter((r) => r && r.status !== "concluida" && !!dayOf(r.date) && dayOf(r.date)! >= todayISO)
    .sort((a, b) => dayOf(a.date)!.localeCompare(dayOf(b.date)!) || compareByPriority(a, b));
}

/** A próxima prova PRINCIPAL ('a') ainda por correr, ou null. */
export function nextPrincipalRace<T extends MainRaceCandidate>(races: T[] | null | undefined, todayISO: string): T | null {
  return upcoming(races, todayISO).find(isPrincipalRace) ?? null;
}

/** A próxima prova por data (com a principal à frente num empate de dia). */
export function nextRaceByDate<T extends MainRaceCandidate>(races: T[] | null | undefined, todayISO: string): T | null {
  return upcoming(races, todayISO)[0] ?? null;
}

/** A prova que é o objetivo: a próxima principal; sem nenhuma, a próxima. */
export function focusRace<T extends MainRaceCandidate>(races: T[] | null | undefined, todayISO: string): T | null {
  return nextPrincipalRace(races, todayISO) ?? nextRaceByDate(races, todayISO);
}

/** Junta a próxima principal (lida à parte) a uma lista limitada de provas
 *  por data — o chat lê 5 e o cartão diário 3, e com três provas de treino à
 *  frente a principal ficava de fora. Sem repetir, e pela ordem da data. */
export function withPrincipal<T extends MainRaceCandidate>(races: T[] | null | undefined, principal: T | null | undefined): T[] {
  const list = [...(races || [])];
  if (principal && !list.some((r) => r?.id != null && r.id === principal.id)) list.push(principal);
  return list.sort((a, b) => (dayOf(a.date) ?? "").localeCompare(dayOf(b.date) ?? "") || compareByPriority(a, b));
}

/** A prova do momento: a mais próxima quando é hoje ou amanhã (o dia e a
 *  véspera são dela, principal ou não — uma prova de treino amanhã precisa da
 *  meteorologia de amanhã); fora disso, o objetivo (focusRace). */
export function raceOfTheMoment<T extends MainRaceCandidate>(races: T[] | null | undefined, todayISO: string): T | null {
  const nearest = nextRaceByDate(races, todayISO);
  const tomorrow = new Date(Date.parse(`${todayISO}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  if (nearest && dayOf(nearest.date)! <= tomorrow) return nearest;
  return focusRace(races, todayISO);
}

/** As provas ainda por correr ANTES do objetivo — as de treino e as jornadas
 *  que vêm primeiro. Continuam a ser provas; só não são o objetivo.
 *  Estritamente antes do DIA do objetivo (2026-09-26, revisão da Fase 0):
 *  com `<=`, uma segunda prova no mesmo dia (outra 'a', ou uma b/c no dia da
 *  principal) entrava em 'provas_antes_do_objetivo', e o prompt dizia que
 *  era "preparação a caminho dele" — incoerente para uma prova do próprio
 *  dia. */
export function racesBeforeFocus<T extends MainRaceCandidate>(races: T[] | null | undefined, todayISO: string): T[] {
  const focus = focusRace(races, todayISO);
  if (!focus) return [];
  return upcoming(races, todayISO).filter((r) => r !== focus && dayOf(r.date)! < dayOf(focus.date)!);
}

/** A seleção inteira que o chat e o cartão diário fazem sobre as duas
 *  leituras de race_events (as N primeiras por data + a próxima principal
 *  à parte), numa função pura para se poder testar sem o handler (2026-09-26,
 *  revisão da Fase 0: só o bloco de contexto estava testado, não a junção
 *  nem a escolha feita sobre ela):
 *  - `upcoming`: a lista junta (withPrincipal), é a que vai para o contexto;
 *  - `focus`: o objetivo (focusRace) — fases, "proxima_prova", prontidão;
 *  - `nearest`: a mais próxima por data (nextRaceByDate) — plano do dia e
 *    véspera, principal ou não;
 *  - `before`: as provas antes do objetivo (racesBeforeFocus);
 *  - `moment`: a prova do momento (raceOfTheMoment) — a meteorologia.
 *  As linhas têm de trazer `status`, senão as concluídas não saem. */
export function selectRaces<T extends MainRaceCandidate>(
  firstRaces: T[] | null | undefined,
  principal: T | null | undefined,
  todayISO: string,
): { upcoming: T[]; focus: T | null; nearest: T | null; before: T[]; moment: T | null } {
  const upcoming = withPrincipal(firstRaces || [], principal ?? null);
  return {
    upcoming,
    focus: focusRace(upcoming, todayISO),
    nearest: nextRaceByDate(upcoming, todayISO),
    before: racesBeforeFocus(upcoming, todayISO),
    moment: raceOfTheMoment(upcoming, todayISO),
  };
}
