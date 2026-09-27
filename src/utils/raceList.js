import { findRaceRun } from './run';
import { classifyRaceOutcome } from './raceOutcome';
import { achievementsForRace } from './achievements';

/* Todas as provas do atleta, num sítio só (pedido 2026-09-13): até aqui, uma
   prova futura que não fosse "a próxima" só se alcançava navegando o
   calendário até ao dia dela, e as passadas só apareciam no Palmarés — e só
   as concluídas. A lista vive no módulo Corrida do Dashboard e separa as
   provas em três grupos, pela mesma régua do resto da app:

   - próximas: ainda não concluídas e com data de hoje em diante, da mais
     perto para a mais longe;
   - por registar: a data já passou e não estão concluídas — é o que o
     cartão da agenda chama "Registar a prova", sem limite de dias (a agenda
     é o histórico, e registar três semanas depois continua legítimo);
   - concluídas: `status = 'concluida'`, da mais recente para a mais antiga,
     com o tempo e as conquistas quando há corrida ligada (findRaceRun).
     Uma prova fechada à mão sem registo continua aqui, só sem números.

   Nada decide tempos nem conquistas aqui: isso é raceOutcome.js e
   achievements.js, para a lista nunca discordar do hub nem do Palmarés. */

const DAY_MS = 86400000;

function dayOf(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  const day = value.slice(0, 10);
  // "2026-13-45" tem a forma de uma data mas não é: dava "daqui a NaN dias".
  return Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? null : day;
}

export function daysUntil(dateIso, todayIso) {
  return Math.round((Date.parse(`${dateIso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / DAY_MS);
}

/** "hoje", "amanhã", "daqui a 12 dias". */
export function countdownLabel(days) {
  if (days <= 0) return 'hoje';
  if (days === 1) return 'amanhã';
  return `daqui a ${days} dias`;
}

/* Com inscrição no Troféu (specs/trofeu.md §4.3, Fase 3), `cup` é o
   `listing` de useCupListing (cupListingOf em cupCalendar.js): as provas das
   jornadas que não foram promovidas a principal saem das próximas e das por
   registar e vão para `trofeu` (o bloco fixo da lista), pela mesma ordem; as
   entradas das provas de jornadas desta edição ganham `jornada` (o chip
   "J3"), também nas concluídas, que ficam todas onde estavam.

   Sem `cup` (null — quase toda a gente), é o código de sempre e a saída de
   sempre: as mesmas quatro chaves e as mesmas entradas, sem um campo a mais
   (raceList.test.js guarda uma cópia congelada para o provar). */
export function groupRaces({ raceEvents = [], runs = [], profile = {}, today, cup = null } = {}) {
  const base = groupRacesBase({ raceEvents, runs, profile, today });
  if (!cup) return base;
  const withTag = (entry) => {
    const jornada = cup.tag?.(entry.race) ?? null;
    return jornada ? { ...entry, jornada } : entry;
  };
  const fixed = (entry) => !!cup.isFixed?.(entry.race);
  return {
    proximas: base.proximas.filter((e) => !fixed(e)).map(withTag),
    porRegistar: base.porRegistar.filter((e) => !fixed(e)).map(withTag),
    concluidas: base.concluidas.map(withTag),
    total: base.total,
    trofeu: {
      proximas: base.proximas.filter(fixed).map(withTag),
      porRegistar: base.porRegistar.filter(fixed).map(withTag),
    },
  };
}

function groupRacesBase({ raceEvents = [], runs = [], profile = {}, today } = {}) {
  const valid = (raceEvents || []).filter((race) => race?.id && dayOf(race.date));

  const proximas = valid
    .filter((race) => race.status !== 'concluida' && dayOf(race.date) >= today)
    .sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date)))
    .map((race) => ({ race, days: daysUntil(dayOf(race.date), today) }));

  const porRegistar = valid
    .filter((race) => race.status !== 'concluida' && dayOf(race.date) < today)
    .sort((a, b) => dayOf(b.date).localeCompare(dayOf(a.date)))
    .map((race) => ({ race, days: daysUntil(dayOf(race.date), today) }));

  const data = { raceEvents: valid, runs, profile, today };
  const concluidas = valid
    .filter((race) => race.status === 'concluida')
    .sort((a, b) => dayOf(b.date).localeCompare(dayOf(a.date)))
    .map((race) => {
      const run = findRaceRun(runs, race);
      if (!run) return { race, run: null, outcome: null, achievements: [] };
      return {
        race,
        run,
        outcome: classifyRaceOutcome({ race, run, runs, profile, races: valid }),
        achievements: achievementsForRace(data, race.id),
      };
    });

  return { proximas, porRegistar, concluidas, total: valid.length };
}
