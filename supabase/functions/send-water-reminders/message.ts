// O texto do lembrete de água — na voz da Carol (specs/carol-omnisciencia-
// omnipresenca.md, ação P.2).
//
// Era "Hora de beber água 💧" / "Já passou algum tempo desde o teu último
// registo de água." — um emoji e uma frase de manual, as duas coisas que
// _shared/carolTone.ts proíbe, no único sítio onde a app fala com o atleta
// fora dela. Agora é ela, com os números dele: quanto bebeu, quanto falta, e
// se está atrás do ritmo do dia.
//
// Determinístico e sem modelo de propósito: corre de hora a hora para todos os
// perfis com lembretes, e o texto tem de caber numa notificação.

import { computeRaceEve, minutesOfDay, RACE_DURATION_FALLBACK_MIN } from "../_shared/formulas/raceEve.ts";

export interface WaterReminderInput {
  totalMl: number;
  goalMl: number;
  hour: number;              // hora atual em Lisboa, 0-23
  startHour: number | null;  // janela de lembretes do atleta
  endHour: number | null;
  afterRace?: boolean;       // raceDayWaterPhase === "depois"
}

export interface WaterReminderMessage {
  title: string;
  body: string;
}

const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 22;
/** Margem antes de dizer "estás atrás": 15 pontos abaixo do ritmo do dia. */
const BEHIND_MARGIN = 0.15;
/** Nas últimas 2 horas da janela, a mensagem passa a ser sobre o que falta. */
const LATE_HOURS = 2;
/** Até aqui, o que falta é um copo. */
const ONE_GLASS_ML = 300;
/** Só com isto ou mais em falta se avisa para não beber tudo antes de dormir. */
const BEDTIME_WARNING_ML = 1000;
/** Depois da chegada prevista, o "Acabaste a prova" vale este tempo. */
export const AFTER_RACE_MINUTES = 120;
/** Depois da chegada estimada, este tempo ainda é "durante a prova". */
export const ARRIVAL_SLACK_MINUTES = 30;
/** Sem tempo-alvo, a chegada estima-se a 7 min/km (a régua do cartão do
 *  Início, momentoDaProva em carolCardLines.js). */
const FALLBACK_MIN_PER_KM = 7;

export interface RaceForWater {
  start_time?: string | null;
  target_time_seconds?: number | null;
  distance_km?: number | string | null;
}

/* O dia da prova (revisão de 2026-09-26): numa maratona às 9h com lembretes
   das 8h às 22h, "Estás atrás na água" chegava a meio da prova — contra o
   próprio horário do dia, que manda parar a água 45 min antes da partida
   (computeRaceEve, waterUntil). Do corte da água à chegada prevista não sai
   lembrete nenhum ("silencio"); nas duas horas a seguir, é o da prova
   acabada ("depois"). Sem hora de partida não há corte a respeitar: null. */
export function raceDayWaterPhase(race: RaceForWater | null | undefined, nowMinutes: number): "silencio" | "depois" | null {
  const s = computeRaceEve({ startTime: race?.start_time ?? null }).schedule;
  if (!s) return null;
  const partida = minutesOfDay(s.start)!;
  let corte = minutesOfDay(s.waterUntil)!;
  if (corte > partida) corte -= 1440;
  const alvo = Number(race?.target_time_seconds);
  const km = Number(String(race?.distance_km ?? "").replace(",", "."));
  const duracao = alvo > 0 ? alvo / 60 : km > 0 ? km * FALLBACK_MIN_PER_KM : RACE_DURATION_FALLBACK_MIN;
  // Folga para quem vai mais lento do que o objetivo: "Acabaste a prova" a
  // quem ainda está a correr era a frase errada no pior momento (revisão
  // pré-deploy de 2026-09-26).
  const chegada = partida + duracao + ARRIVAL_SLACK_MINUTES;
  if (nowMinutes >= corte && nowMinutes < chegada) return "silencio";
  if (nowMinutes >= chegada && nowMinutes < chegada + AFTER_RACE_MINUTES) return "depois";
  return null;
}

/** "900 ml", "1,5 L", "2 L" — como se diz em Portugal. */
export function formatWater(ml: number): string {
  const v = Math.max(0, Math.round(ml));
  if (v < 1000) return `${v} ml`;
  const l = Math.round(v / 100) / 10;
  return `${String(l).replace(".", ",")} L`;
}

/** Que fração da janela de lembretes já passou (0 a 1), e quantas horas faltam. */
export function windowProgress(hour: number, startHour: number | null, endHour: number | null): { fraction: number; hoursLeft: number } {
  const end = endHour ?? DEFAULT_END_HOUR;
  // Uma janela de 24 horas (início igual ao fim) conta-se da meia-noite de
  // Lisboa, que é quando o total volta a zero (revisão de 2026-09-26): com
  // início e fim às 8h, às 7h o total era o de sete horas e a janela já ia
  // nas últimas duas — "o dia está a acabar" às sete da manhã.
  const allDay = (startHour ?? DEFAULT_START_HOUR) === end;
  const start = allDay ? 0 : (startHour ?? DEFAULT_START_HOUR);
  const length = allDay ? 24 : ((end - start + 24) % 24) || 24;
  const elapsed = (hour - start + 24) % 24;
  const clamped = Math.min(elapsed, length);
  return { fraction: clamped / length, hoursLeft: length - clamped };
}

/* Revisão de 2026-09-26: dois defeitos misturavam a hora da janela de
   lembretes com a hora do dia.

   1. Com nada registado, o "vai a meio" servia para qualquer hora depois
      dos primeiros 25% da janela — incluindo as últimas duas horas dela,
      onde a mesma frase que fala em "vai a meio" saía ao lado de "Bebe
      agora": tarde de mais para "a meio", cedo de mais para "a acabar".
      Agora são três frases, cada uma na sua fatia da janela.
   2. Nas últimas duas horas da janela, "o dia está a acabar… não tudo antes
      de dormir" pressupõe que são horas tardias do dia real — falso com uma
      janela que acaba às 18h (são só as últimas duas horas DELA) ou que
      atravessa a meia-noite (a 1h da manhã "o dia está a acabar" e "antes
      de dormir" já não fazem sentido nenhum). A frase de deitar só entra a
      partir das 19h de Lisboa; antes disso, diz-se a hora em que os
      lembretes acabam; entre a meia-noite e as 6h, fica só o copo. */
export function waterReminderMessage(input: WaterReminderInput): WaterReminderMessage {
  const total = Math.max(0, Number(input.totalMl) || 0);
  const goal = Math.max(1, Number(input.goalMl) || 2000);
  const remaining = Math.max(0, goal - total);
  const { fraction, hoursLeft } = windowProgress(input.hour, input.startHour, input.endHour);
  const hour = ((Number(input.hour) % 24) + 24) % 24;
  const startHour = input.startHour ?? DEFAULT_START_HOUR;
  const endHour = input.endHour ?? DEFAULT_END_HOUR;
  const title = "Carol";

  // Entre a meia-noite e as 6h o dia de Lisboa acabou de mudar e o total
  // voltou a zero: com uma janela de 24 horas, às 3h saía "já passou metade
  // do dia" (revisão de 2026-09-26). A qualquer total, só o copo.
  if (hour < 6) return { title, body: "Um copo de água agora." };
  if (input.afterRace) return { title, body: "Acabaste a prova. Água agora, aos goles, até ao jantar." };

  if (total === 0) {
    if (hoursLeft <= LATE_HOURS) {
      return { title, body: "Nem um copo de água registado hoje, e o dia está a acabar. Um copo agora e outro ao jantar." };
    }
    if (fraction >= 0.5) {
      return { title, body: "Nem um copo de água registado hoje, e já passou metade do dia. Bebe agora." };
    }
    // "antes de mais nada" só no primeiro lembrete da manhã: a meio da manhã
    // ele já fez muita coisa, e pode ter bebido sem registar.
    const primeiraHora = startHour !== endHour && hour === startHour && hour < 12;
    return { title, body: `Ainda não vejo água registada hoje. Um copo agora${primeiraHora ? ", antes de mais nada" : ""}.` };
  }
  if (hoursLeft <= LATE_HOURS) {
    // Menos de um copo em falta não é aviso nenhum, e "não tudo antes de
    // dormir" só faz sentido com muito por beber (revisão de 2026-09-26).
    if (remaining <= ONE_GLASS_ML) return { title, body: `Faltam ${formatWater(remaining)} para a meta. Um copo e está feito.` };
    if (hour >= 19) {
      const antesDeDormir = remaining >= BEDTIME_WARNING_ML ? " Bebe agora, não tudo antes de dormir." : " Um copo agora.";
      return { title, body: `Faltam ${formatWater(remaining)} para a meta e o dia está a acabar.${antesDeDormir}` };
    }
    return { title, body: `Faltam ${formatWater(remaining)} para a meta e os lembretes acabam às ${endHour}h. Um copo agora.` };
  }
  if (total / goal < fraction - BEHIND_MARGIN) {
    return { title, body: `Estás atrás na água: ${formatWater(total)} de ${formatWater(goal)}. Bebe um copo agora.` };
  }
  return { title, body: `Vais em ${formatWater(total)} de ${formatWater(goal)}. Um copo agora mantém-te no ritmo.` };
}
