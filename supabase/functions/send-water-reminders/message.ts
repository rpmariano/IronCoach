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

export interface WaterReminderInput {
  totalMl: number;
  goalMl: number;
  hour: number;              // hora atual em Lisboa, 0-23
  startHour: number | null;  // janela de lembretes do atleta
  endHour: number | null;
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

/** "900 ml", "1,5 L", "2 L" — como se diz em Portugal. */
export function formatWater(ml: number): string {
  const v = Math.max(0, Math.round(ml));
  if (v < 1000) return `${v} ml`;
  const l = Math.round(v / 100) / 10;
  return `${String(l).replace(".", ",")} L`;
}

/** Que fração da janela de lembretes já passou (0 a 1), e quantas horas faltam. */
export function windowProgress(hour: number, startHour: number | null, endHour: number | null): { fraction: number; hoursLeft: number } {
  const start = startHour ?? DEFAULT_START_HOUR;
  const end = endHour ?? DEFAULT_END_HOUR;
  const length = ((end - start + 24) % 24) || 24;
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
  const endHour = input.endHour ?? DEFAULT_END_HOUR;
  const title = "Carol";

  if (total === 0) {
    if (hoursLeft <= LATE_HOURS) {
      return { title, body: "Nem um copo de água registado hoje, e o dia está a acabar. Um copo agora e outro ao jantar." };
    }
    if (fraction >= 0.5) {
      return { title, body: "Nem um copo de água registado hoje, e já passou metade do dia. Bebe agora." };
    }
    return { title, body: "Ainda não vejo água registada hoje. Um copo agora." };
  }
  if (hoursLeft <= LATE_HOURS) {
    if (hour >= 0 && hour < 6) return { title, body: "Um copo de água agora." };
    if (hour >= 19) {
      return { title, body: `Faltam ${formatWater(remaining)} para a meta e o dia está a acabar. Bebe agora, não tudo antes de dormir.` };
    }
    return { title, body: `Faltam ${formatWater(remaining)} para a meta e os lembretes acabam às ${endHour}h. Um copo agora.` };
  }
  if (total / goal < fraction - BEHIND_MARGIN) {
    return { title, body: `Estás atrás na água: ${formatWater(total)} de ${formatWater(goal)}. Bebe um copo agora.` };
  }
  return { title, body: `Vais em ${formatWater(total)} de ${formatWater(goal)}. Um copo agora mantém-te no ritmo.` };
}
