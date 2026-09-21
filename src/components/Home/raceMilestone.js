/* Os marcos da contagem para a prova — a Carol diz o que cada um quer dizer.

   O número grande do cartão da prova conta todos os dias por igual. Alguns
   dias não são iguais: aos 100 dias há tempo, aos 30 a forma está a ser
   feita, aos 7 já não se ganha nada. Nesses dias, e só nesses, ela diz uma
   frase dentro do cartão. A véspera e a manhã da prova têm as suas (as
   boas-vindas e a notificação) — ficam fora daqui.

   Na voz de CAROL.md, e sem prometer o que o plano não diz: nada de "o taper
   começa hoje" — isso é o motor do plano que decide, não o calendário. */

const FRASE = {
  100: 'Faltam 100 dias. Parece muito; é o tempo certo para construir sem pressa.',
  50: 'Cinquenta dias. Daqui para a frente, cada semana conta.',
  30: 'Um mês. A forma que vais ter no dia está a ser feita agora.',
  14: 'Duas semanas. O que te vai levar lá já está feito; agora é afinar.',
  7: 'Uma semana. Já não se ganha forma, só se perde frescura. Descansa a sério.',
  3: 'Três dias. Dorme, come o que conheces e não inventes nada.',
};

export const RACE_MILESTONES = Object.keys(FRASE).map(Number);

/** A frase do marco de hoje, ou null. */
export function raceMilestoneLine(daysToRace) {
  return FRASE[daysToRace] || null;
}

const key = (userId, raceId, days) => `ironcoach_race_milestone_${userId || 'anon'}_${raceId}_${days}`;

/** A chave deste momento em coach_impressions (kind 'moment', ação 5.1) — a
 *  mesma na escrita (RaceCard) e na leitura (wasMilestoneSeen). */
export const milestoneMomentKey = (raceId, days) => `milestone:${raceId}:${days}`;

/* Visto neste telemóvel (localStorage) ou em qualquer outro: `shown` é o
   impressionShown do store (chaves `kind:key`), opcional. */
export function wasMilestoneSeen(userId, raceId, days, shown = null, storage = globalThis.localStorage) {
  if (shown?.has(`moment:${milestoneMomentKey(raceId, days)}`)) return true;
  try { return storage?.getItem(key(userId, raceId, days)) === '1'; } catch { return true; }
}

export function markMilestoneSeen(userId, raceId, days, storage = globalThis.localStorage) {
  try { storage?.setItem(key(userId, raceId, days), '1'); } catch { /* sem storage */ }
}
