// A prova que enquadra as análises (analyze-run, analyze-gym, analyze-meal)
// — 2026-09-26, Fase 0 do Troféu.
//
// Até aqui as três só perguntavam "há alguma prova agendada?" (a primeira por
// data, limit 1) para escolher o enquadramento (planningFrameSection). O sim
// ou não fica igual; o que muda é QUAL prova serve de referência: a próxima
// principal quando existe, senão a próxima (focusRace, @formulas/mainRace.ts
// — a mesma régua do chat e do cartão diário). Com uma prova de treino ou
// uma jornada de taça à frente, o registo julgava-se contra a preparação de
// uma prova que não é o objetivo. O nome e a data vão no enquadramento, que
// até aqui dizia "o objetivo da prova" sem dizer qual.

import { focusRace, isPrincipalRace } from "./formulas/mainRace.ts";

export interface FrameRace {
  id: string;
  name: string | null;
  date: string;
  distance_km: number | string | null;
  race_priority: string | null;
}

const COLUMNS = "id, name, date, distance_km, race_priority";

/** A prova-objetivo a partir de `fromDate` (inclusive — uma prova hoje ainda
 *  enquadra o registo de hoje), ou null. Só provas agendadas, como antes.
 *  Falha fechada: com as duas leituras em erro, "sem prova" — o mesmo que o
 *  `data: null` de antes dava. */
// deno-lint-ignore no-explicit-any
export async function fetchFrameRace(sb: any, userId: string, fromDate: string): Promise<FrameRace | null> {
  const base = () => sb.from("race_events").select(COLUMNS).eq("user_id", userId).eq("status", "agendada").gte("date", fromDate);
  const [principalR, nextR] = await Promise.all([
    base().eq("race_priority", "a").order("date", { ascending: true }).order("id", { ascending: true }).limit(1),
    // 3 e não 1: num dia com duas provas, a principal ganha (focusRace).
    base().order("date", { ascending: true }).order("id", { ascending: true }).limit(3),
  ]);
  if (principalR?.error) console.warn("frameRace: leitura da principal falhou:", principalR.error.message ?? principalR.error);
  if (nextR?.error) console.warn("frameRace: leitura das próximas falhou:", nextR.error.message ?? nextR.error);
  const rows: FrameRace[] = [...(principalR?.data || []), ...(nextR?.data || [])];
  return focusRace(rows, fromDate);
}

/** A frase da prova de referência para o enquadramento — vazia sem prova. */
export function frameRaceSentence(race: FrameRace | null | undefined): string {
  if (!race?.date) return "";
  const km = Number(String(race.distance_km ?? "").replace(",", "."));
  // Até duas casas (2026-09-26, revisão da Fase 0): as distâncias oficiais
  // vêm com todas as casas (21.0975, 1.609) e o prompt das três análises
  // ficava com "21,0975 km". 21,1 / 42,2 / 1,61 é como se diz.
  const details = [race.date, Number.isFinite(km) && km > 0 ? `${String(Number(km.toFixed(2))).replace(".", ",")} km` : null].filter(Boolean).join(", ");
  const name = (race.name || "").trim() || "a prova";
  return `A prova de referência é "${name}" (${details})${isPrincipalRace(race) ? ", a próxima prova principal" : ""}.`;
}
