/* Os marcos da contagem para a prova — a Carol diz o que cada um quer dizer.

   O número grande do cartão da prova conta todos os dias por igual. Alguns
   dias não são iguais: aos 100 dias há tempo, aos 30 a forma está a ser
   feita, aos 7 já não se ganha nada. Nesses dias, e só nesses, ela diz uma
   frase dentro do cartão. A véspera e a manhã da prova têm as suas (as
   boas-vindas e a notificação) — ficam fora daqui.

   Na voz de CAROL.md, e sem prometer o que o plano não diz: nada de "o taper
   começa hoje" — isso é o motor do plano que decide, não o calendário.

   Cada frase escolhe-se pela condição que a torna verdadeira (pedido
   2026-09-26). Três casos em que o marco dizia uma coisa e o resto da app
   outra:
   - aos 100 dias, «é o tempo certo para construir sem pressa» a um
     iniciante com uma maratona, enquanto o hub da mesma prova diz «tempo
     insuficiente». O «tempo certo» só com a viabilidade lida e sem esse
     alerta; com ele, ela diz que é menos do que queria; sem a viabilidade,
     uma frase que não afirma nem uma coisa nem outra;
   - aos 14, 7 e 3 dias, o discurso do polimento («descansa a sério») numa
     prova B ou C a meio de um bloco que ainda tem intervalos e o longo
     nessa semana. O polimento é só das provas principais: nas outras, estes
     três marcos não existem;
   - aos 7 dias, «descansa a sério» com o plano a ter treinos nessa semana.
     Com plano, é o plano que manda; sem plano, o que fazer diz-se sem ele. */

const FRASE = {
  100: 'Faltam 100 dias. Parece muito; é o tempo certo para construir sem pressa.',
  50: 'Cinquenta dias. Daqui para a frente, cada semana conta.',
  30: 'Um mês. A forma que vais ter no dia está a ser feita agora.',
  14: 'Duas semanas. O que te vai levar lá já está feito; agora é afinar.',
  7: 'Uma semana. Já não se ganha forma, só se perde frescura. Faz o que está no plano, e nada a mais.',
  3: 'Três dias. Dorme, come o que conheces e não inventes nada.',
};

/* Aos 100 dias, quando o hub da prova diz que o tempo não chega (a mesma
   leitura: calculateRaceTrainingPlan → viability.flags). */
const CEM_DIAS_CURTO = 'Faltam 100 dias. Para esta distância é menos do que eu queria; cada semana tem de contar.';
/* Aos 100 dias, sem a viabilidade lida (ou com uma ultra a um iniciante,
   onde o problema não é o tempo): nem «tempo certo» nem «pouco». Também não
   «começa aqui» — quem já treina para ela há meses não está a começar. */
const CEM_DIAS = 'Faltam 100 dias. Isto constrói-se uma semana de cada vez.';
/* Aos 7 dias, sem plano aceite: o que fazer, sem apontar para um plano que não há. */
const SETE_DIAS_SEM_PLANO = 'Uma semana. Já não se ganha forma, só se perde frescura. Treinos curtos e leves, e nada a mais.';

/* Os marcos do polimento: só numa prova principal (race_priority 'a'). */
const POLIMENTO = new Set([14, 7, 3]);

export const RACE_MILESTONES = [100, 50, 30, 14, 7, 3];

/**
 * A frase do marco de hoje, ou null.
 *
 * @param {number} daysToRace
 * @param {object} [contexto]
 *   prioridade — race_priority da prova ('a' | 'b' | 'c'). Por omissão 'a',
 *                o valor por omissão da coluna (e o de detectRaceConflict).
 *   flags      — viability.flags da prova, as mesmas do hub
 *                (calculateRaceTrainingPlan). null = não lidas: aos 100
 *                dias sai a frase que não afirma nada sobre o tempo.
 *   comPlano   — há um plano aceite a cobrir os dias até à prova. Por
 *                omissão false: sem saber, não se aponta para um plano.
 */
export function raceMilestoneLine(daysToRace, { prioridade = 'a', flags = null, comPlano = false } = {}) {
  if (!Object.prototype.hasOwnProperty.call(FRASE, daysToRace)) return null;
  if (POLIMENTO.has(daysToRace) && String(prioridade || 'a').toLowerCase() !== 'a') return null;
  if (daysToRace === 100) {
    if (!Array.isArray(flags)) return CEM_DIAS;
    if (flags.includes('tempo_insuficiente')) return CEM_DIAS_CURTO;
    // A vermelho no hub por outra razão: «o tempo certo» não se diz por cima.
    if (flags.includes('ultra_para_iniciante')) return CEM_DIAS;
    return FRASE[100];
  }
  if (daysToRace === 7 && !comPlano) return SETE_DIAS_SEM_PLANO;
  return FRASE[daysToRace];
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
