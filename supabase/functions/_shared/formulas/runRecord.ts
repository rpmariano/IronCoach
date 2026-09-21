// O recorde num treino — CAROL.md §3: "Recorde pessoal (pace, distância,
// carga): comentário imediato dentro do registo, no momento em que é
// guardado."
//
// @contexto Migrado de src/utils/runRecord.js (specs/formulas-checklist.md
// Fase F; specs/carol-omnisciencia-omnipresenca.md, ação 5.3) — era a única
// régua do recorde, e só existia no cliente (RunRegistration.jsx, para a
// confirmação do registo). O analyze-run tinha a sua própria conta, mais
// crua (o pace mínimo de qualquer distância, sem escalão nem margem), que
// podia discordar desta. Agora as duas leem daqui.
//
// As provas já têm as suas conquistas (utils/achievements.js). Um treino que
// bate o melhor ritmo aos 5, 10 ou 21 km, ou que é a corrida mais longa de
// sempre, passava em silêncio fora do cliente. Aqui decide-se se uma corrida
// é um desses.
//
// Só conta como recorde o que bate algo que já existia: a primeira corrida
// de 10 km não é um recorde, é a primeira. E com margem — um segundo por km
// no ritmo, meio quilómetro na distância — para não aplaudir o ruído do GPS.
// O ritmo usa a fórmula partilhada (computeBestPace), para o que se diz aqui
// ser o que a Carol lê no prompt.

import { computeBestPace, type BestPaceBucket, type RunForBestPace } from "./bestPace.ts";
import { formatPaceMinKm } from "./paceFormat.ts";

export interface RunForRecord extends RunForBestPace {
  id?: string | null;
}

export interface RunRecordMoment {
  kind: "pace" | "distance";
  title: string;
  sub: string;
}

const ESCALOES: BestPaceBucket[] = [21, 10, 5]; // o maior primeiro: um recorde aos 21 vale mais
const NOME: Record<BestPaceBucket, string> = { 5: "5 km", 10: "10 km", 21: "meia maratona" };
const MIN_GANHO_RITMO = 1; // s/km
const MIN_GANHO_DISTANCIA = 0.5; // km
const MIN_CORRIDAS_PARA_DISTANCIA = 3;

const km = (v: number | string | null | undefined) => String(Math.round(Number(v) * 10) / 10).replace(".", ",");

/**
 * `{ title, sub, kind }` quando `run` é um recorde; `null` nos outros.
 * `runs` pode ou não já incluir `run` — conta-se sem ele.
 */
export function runRecordMoment(run: RunForRecord | null | undefined, runs: RunForRecord[] = []): RunRecordMoment | null {
  if (!run) return null;
  const outras = (runs || []).filter((r) => r && (!run.id || r.id !== run.id));

  for (const alvo of ESCALOES) {
    const antes = computeBestPace(outras, alvo);
    const agora = computeBestPace([run], alvo);
    // A tolerância da fórmula (5 km aceita 4,0–6,5) serve os KPIs; um recorde
    // "nos 5 km" com 4 km corridos não é recorde. Pela corrida inteira, pelo
    // menos 95% da distância.
    const curta = agora?.source === "run" && Number(run.distance_km) < alvo * 0.95;
    if (antes && agora && !curta && antes.pace - agora.pace >= MIN_GANHO_RITMO) {
      const ganho = Math.round(antes.pace - agora.pace);
      return {
        kind: "pace",
        title: `Recorde ${alvo === 21 ? "na" : "nos"} ${NOME[alvo]}.`,
        sub: `${formatPaceMinKm(agora.pace)} por km, ${ganho} ${ganho === 1 ? "segundo" : "segundos"} por km mais rápido do que o teu melhor. O treino está a aparecer.`,
      };
    }
  }

  const dist = Number(run.distance_km);
  if (Number.isFinite(dist) && dist > 0 && outras.length >= MIN_CORRIDAS_PARA_DISTANCIA) {
    const maior = Math.max(...outras.map((r) => Number(r.distance_km) || 0));
    if (dist - maior >= MIN_GANHO_DISTANCIA) {
      return {
        kind: "distance",
        title: "A tua corrida mais longa.",
        sub: `${km(dist)} km, mais ${km(dist - maior)} do que alguma vez fizeste. Amanhã é dia de recuperar, não de repetir.`,
      };
    }
  }
  return null;
}
