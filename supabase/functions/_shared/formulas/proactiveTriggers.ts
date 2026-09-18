// Os momentos em que a Carol fala primeiro, avaliados no servidor
// (specs/carol-omnisciencia-omnipresenca.md, ação P.3).
//
// A decisão vivia só no cliente (src/utils/coachProactive.js,
// pickProactiveTrigger): só corria quando o atleta abria o Coach. Esta é a
// mesma régua para o servidor, que corre de hora a hora sem a app aberta. As
// CHAVES têm de ser exatamente as do cliente — é por elas que o
// coach_proactive_log sabe que uma mensagem já foi entregue, venha de onde
// vier. Um teste no cliente (src/utils/proactiveParity.test.js) compara as
// duas funções com os mesmos dados.
//
// Prioridade, como no cliente: manhã da prova > véspera > depois da prova >
// silêncio.

export const SILENCE_DAYS = 3;
export const RACE_AFTER_DAYS_WITH_RUN = 7;
export const RACE_AFTER_DAYS_WITHOUT_RUN = 3;

export type ProactiveTriggerName = "race_morning" | "race_eve" | "race_after" | "silence";

export interface TriggerRace {
  id: string;
  name?: string | null;
  date: string;
  status?: string | null;
  distance_km?: number | string | null;
}

export interface TriggerRun {
  id?: string | null;
  date?: string | null;
  race_id?: string | null;
  kind?: string | null;
  created_at?: string | null;
}

export interface ServerProactiveCandidate {
  trigger: ProactiveTriggerName;
  key: string;
  raceId: string | null;
  raceName: string | null;
  hasRun: boolean;
  /** Só no silêncio: dias desde o último registo. */
  silenceDays: number | null;
  /** O dia do acontecimento: a prova, ou o último registo no silêncio. Se a
   *  Carol já falou depois dele, a conversa provavelmente já aconteceu. */
  anchorDate: string | null;
  /** No balanço com corrida: quando a corrida foi registada. O balanço
   *  acontece depois disso — se a Carol já falou depois, já o fez. */
  anchorAt: string | null;
}

const DAY_MS = 86400000;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`)) / DAY_MS);
}

/** A mesma regra de src/utils/run.js findRaceRun: a corrida ligada à prova;
 *  por data só numa prova já concluída, e só uma competição sem ligação. */
export function findRaceRunServer(runs: TriggerRun[] | null | undefined, race: TriggerRace): TriggerRun | null {
  if (!race?.id) return null;
  const list = runs || [];
  const linked = list.find((r) => r?.race_id === race.id);
  if (linked) return linked;
  if (race.status !== "concluida") return null;
  return list.find((r) => !r?.race_id && r?.kind === "competicao" && r?.date === race.date) || null;
}

export function pickServerProactive(
  input: { raceEvents: TriggerRace[] | null | undefined; runs: TriggerRun[] | null | undefined; lastRecordDate: string | null },
  todayISO: string,
): ServerProactiveCandidate | null {
  const races = (input.raceEvents || []).filter((r) => r && typeof r.date === "string");
  const scheduled = races.filter((r) => r.status !== "concluida");
  const base = { raceId: null, raceName: null, hasRun: false, silenceDays: null, anchorDate: null, anchorAt: null };

  const morning = scheduled.find((r) => r.date.slice(0, 10) === todayISO);
  if (morning) return { ...base, trigger: "race_morning", key: `race_morning:${morning.id}`, raceId: morning.id, raceName: morning.name ?? null };

  const eve = scheduled.find((r) => daysBetween(todayISO, r.date.slice(0, 10)) === 1);
  if (eve) return { ...base, trigger: "race_eve", key: `race_eve:${eve.id}`, raceId: eve.id, raceName: eve.name ?? null };

  const past = races
    .map((race) => ({ race, gap: daysBetween(race.date.slice(0, 10), todayISO) }))
    .filter(({ gap }) => gap >= 0 && gap <= RACE_AFTER_DAYS_WITH_RUN)
    .sort((a, b) => a.gap - b.gap);
  for (const { race, gap } of past) {
    const run = findRaceRunServer(input.runs, race);
    if (run) {
      return { ...base, trigger: "race_after", key: `race_after:${race.id}:${run.id || "corrida"}`, raceId: race.id, raceName: race.name ?? null, hasRun: true, anchorDate: race.date.slice(0, 10), anchorAt: run.created_at ?? null };
    }
    if (gap >= 1 && gap <= RACE_AFTER_DAYS_WITHOUT_RUN) {
      return { ...base, trigger: "race_after", key: `race_after:${race.id}:sem-registo`, raceId: race.id, raceName: race.name ?? null, anchorDate: race.date.slice(0, 10) };
    }
  }

  const last = input.lastRecordDate ? input.lastRecordDate.slice(0, 10) : null;
  if (last) {
    const gap = daysBetween(last, todayISO);
    if (gap >= SILENCE_DAYS) return { ...base, trigger: "silence", key: `silence:${last}`, silenceDays: gap, anchorDate: last };
  }
  return null;
}

/* O texto da notificação, na voz dela (carolTone): sem emoji, sem ponto de
   exclamação, sem frase de manual. É curto porque o que ela tem a dizer a
   sério é escrito no chat, com o contexto todo, quando o atleta abre. */
export function proactivePushMessage(c: ServerProactiveCandidate): { title: string; body: string } {
  const name = (c.raceName || "").trim().slice(0, 60);
  const title = "Carol";
  switch (c.trigger) {
    case "race_morning":
      return { title, body: `Hoje é dia de prova${name ? `: ${name}` : ""}. Tenho duas coisas para te dizer antes da partida.` };
    case "race_eve":
      return { title, body: `Amanhã é dia de prova${name ? `: ${name}` : ""}. Tenho o plano para hoje à noite e para amanhã de manhã.` };
    case "race_after":
      return {
        title,
        body: c.hasRun
          ? `Vi o registo da prova${name ? ` ${name}` : ""}. Quero fazer o balanço contigo.`
          : `Como correu a prova${name ? ` ${name}` : ""}? Conta-me, e regista a corrida.`,
      };
    case "silence":
      return { title, body: `Não vejo nada teu há ${c.silenceDays ?? SILENCE_DAYS} dias. Estás bem?` };
  }
}

export const DEFAULT_PUSH_START_HOUR = 9;
export const DEFAULT_PUSH_END_HOUR = 21;
export const RACE_MORNING_EARLIEST_HOUR = 6;
export const ALL_PROACTIVE_TRIGGERS: ProactiveTriggerName[] = ["race_morning", "race_eve", "race_after", "silence"];

/** As preferências do atleta (P.6): a janela em horas de Lisboa, o máximo
 *  por dia e os momentos que aceita. Tudo opcional, com os valores por omissão
 *  da migration carol_push_preferences. */
export interface PushPreferences {
  startHour?: number | null;
  endHour?: number | null;
  maxPerDay?: number | null;
  types?: string[] | null;
}

function inWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return true;                       // 24 horas
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;                   // atravessa a meia-noite
}

/** Janela de envio, em horas de Lisboa, a do atleta (9h–21h por omissão). A
 *  manhã da prova é a exceção: a prova não espera, e pode sair a partir das
 *  6h mesmo que a janela dele comece mais tarde — nunca depois do fim dela. */
export function isWithinProactiveWindow(trigger: ProactiveTriggerName, lisbonHour: number, prefs: PushPreferences = {}): boolean {
  let start = Number.isInteger(prefs.startHour) ? prefs.startHour! : DEFAULT_PUSH_START_HOUR;
  let end = Number.isInteger(prefs.endHour) ? prefs.endHour! : DEFAULT_PUSH_END_HOUR;
  /* Início igual ao fim é, quase sempre, um engano no Perfil — e na Carol
     não pode querer dizer "24 horas": um "Estás bem?" às 3h da manhã. Cai na
     janela por omissão (revisão pré-master da P.6). */
  if (start === end) { start = DEFAULT_PUSH_START_HOUR; end = DEFAULT_PUSH_END_HOUR; }
  if (inWindow(lisbonHour, start, end)) return true;
  if (trigger === "race_morning" && start < end && start > RACE_MORNING_EARLIEST_HOUR) {
    return lisbonHour >= RACE_MORNING_EARLIEST_HOUR && lisbonHour < end;
  }
  return false;
}
