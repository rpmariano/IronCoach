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
import { PRE_RACE_HARD_RUN_TYPES } from "./vocabulary.ts";

export interface RunForRecord extends RunForBestPace {
  id?: string | null;
}

export interface PlanItemForRecord {
  planned_date?: string | null;
  kind?: string | null;
  training_type?: string | null;
  status?: string | null;
}

export interface RunRecordContext {
  /** O dia do atleta (AAAA-MM-DD). Sem ele não se sabe se a corrida é de hoje. */
  todayISO?: string | null;
  /** Os itens dos planos aceites; lê-se só o dia a seguir à corrida. */
  planItems?: PlanItemForRecord[] | null;
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
const DAY_MS = 86400000;

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/* "Amanhã" só quando a corrida é mesmo de hoje: um longo de domingo registado
   na segunda já não tem o amanhã de que a frase fala. E se o plano pede para
   amanhã um dos treinos duros que não cabem na véspera de uma prova
   (vocabulary.ts), "recuperar" contradizia-o (specs/carol-frases-contexto.md). */
function fraseDeAmanha(run: RunForRecord, { todayISO, planItems }: RunRecordContext): string | null {
  const dia = String(run.date || "").slice(0, 10);
  if (!todayISO || !/^\d{4}-\d{2}-\d{2}$/.test(dia) || dia !== String(todayISO).slice(0, 10)) return null;
  const amanha = addDays(dia, 1);
  const duroAmanha = (planItems || []).some((i) =>
    i && String(i.planned_date || "").slice(0, 10) === amanha && i.status !== "cancelado"
    && i.kind === "corrida" && PRE_RACE_HARD_RUN_TYPES.includes(String(i.training_type)));
  return duroAmanha ? "Amanhã, só o que está no plano." : "Amanhã é dia de recuperar, não de repetir.";
}

/**
 * `{ title, sub, kind }` quando `run` é um recorde; `null` nos outros.
 * `runs` pode ou não já incluir `run` — conta-se sem ele. `contexto` só
 * mexe no que se diz de amanhã (ver fraseDeAmanha); sem `todayISO` fica
 * por dizer.
 */
export function runRecordMoment(run: RunForRecord | null | undefined, runs: RunForRecord[] = [], contexto: RunRecordContext = {}): RunRecordMoment | null {
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
      const amanha = fraseDeAmanha(run, contexto || {});
      return {
        kind: "distance",
        title: "A tua corrida mais longa.",
        sub: `${km(dist)} km, mais ${km(dist - maior)} do que alguma vez fizeste.${amanha ? ` ${amanha}` : ""}`,
      };
    }
  }
  return null;
}
