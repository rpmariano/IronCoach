/* A próxima prova, a mesma em todo o lado (revisão de 2026-11-25): o cartão «Para onde vou»
   (Home/RaceCard) e o herói do Início v2 (Home/HomeV2) escolhiam-na cada um à sua maneira, e o v2
   perdia as provas dos últimos 7 dias por registar e não tirava as jornadas fixas do Troféu.

   A partir do dia da prova, ela continua aqui até 7 dias depois enquanto não houver uma corrida
   ligada (specs/prova-concluida.md §3). As jornadas fixas do Troféu futuras saem (vivem na linha do
   Troféu); a de hoje fica, é o dia do «Registar a prova». */

export const DIAS_A_ESPERAR_PELO_REGISTO = 7;

export function diasEntre(a, b) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

/** As provas por fazer ou por registar, por data, até `limit`. `isRegistered(id)` diz se já há
 *  corrida ligada; `cupFixed(race)` (ou null) se é uma jornada fixa do Troféu. */
export function upcomingRaces({ raceEvents = [], today, isRegistered = () => false, cupFixed = null, limit = 5 }) {
  return (raceEvents || [])
    .filter((e) => {
      if (!e?.date) return false;
      if (e.date >= today) return e.status !== 'concluida' && !(e.date > today && cupFixed?.(e));
      return diasEntre(today, e.date) <= DIAS_A_ESPERAR_PELO_REGISTO && !isRegistered(e.id);
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}
