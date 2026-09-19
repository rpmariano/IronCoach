/* O recorde num treino — CAROL.md §3: "Recorde pessoal (pace, distância,
   carga): comentário imediato dentro do registo, no momento em que é
   guardado."

   As provas já têm as suas conquistas (utils/achievements.js). Um treino que
   bate o melhor ritmo aos 5, 10 ou 21 km, ou que é a corrida mais longa de
   sempre, passava em silêncio. Aqui decide-se se a corrida acabada de gravar
   é um desses, para a confirmação do registo trazer a Carol a dizê-lo (o
   mesmo cartão do primeiro registo — shared/RecordConfirmation, `first`).

   Só conta como recorde o que bate algo que já existia: a primeira corrida
   de 10 km não é um recorde, é a primeira. E com margem — um segundo por km
   no ritmo, meio quilómetro na distância — para não aplaudir o ruído do GPS.
   O ritmo usa a fórmula partilhada com a Carol (@formulas/bestPace), para o
   que ela diz aqui ser o que ela lê no prompt. */

import { computeBestPace } from '@formulas/bestPace.ts';
import { formatPace } from './run';

const ESCALOES = [21, 10, 5]; // o maior primeiro: um recorde aos 21 vale mais
const NOME = { 5: '5 km', 10: '10 km', 21: 'meia maratona' };
const MIN_GANHO_RITMO = 1; // s/km
const MIN_GANHO_DISTANCIA = 0.5; // km
const MIN_CORRIDAS_PARA_DISTANCIA = 3;

const km = (v) => String(Math.round(Number(v) * 10) / 10).replace('.', ',');

/**
 * { title, sub, kind: 'pace'|'distance' } quando `run` é um recorde; null
 * nos outros. `runs` pode ou não já incluir `run` — conta-se sem ele.
 */
export function runRecordMoment(run, runs = []) {
  if (!run) return null;
  const outras = (runs || []).filter((r) => r && r.id !== run.id);

  for (const alvo of ESCALOES) {
    const antes = computeBestPace(outras, alvo);
    const agora = computeBestPace([run], alvo);
    if (antes && agora && antes.pace - agora.pace >= MIN_GANHO_RITMO) {
      const ganho = Math.round(antes.pace - agora.pace);
      return {
        kind: 'pace',
        title: `Recorde ${alvo === 21 ? 'na' : 'nos'} ${NOME[alvo]}.`,
        sub: `${formatPace(agora.pace)} por km, ${ganho} ${ganho === 1 ? 'segundo' : 'segundos'} por km mais rápido do que o teu melhor. O treino está a aparecer.`,
      };
    }
  }

  const dist = Number(run.distance_km);
  if (Number.isFinite(dist) && dist > 0 && outras.length >= MIN_CORRIDAS_PARA_DISTANCIA) {
    const maior = Math.max(...outras.map((r) => Number(r.distance_km) || 0));
    if (dist - maior >= MIN_GANHO_DISTANCIA) {
      return {
        kind: 'distance',
        title: 'A tua corrida mais longa.',
        sub: `${km(dist)} km, mais ${km(dist - maior)} do que alguma vez fizeste. Amanhã é dia de recuperar, não de repetir.`,
      };
    }
  }
  return null;
}
