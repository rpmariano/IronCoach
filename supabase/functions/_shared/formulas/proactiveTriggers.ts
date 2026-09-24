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
// fim de bloco > silêncio > balanço da semana — e o balanço só num dia sem
// mais nenhum (ver findWeekToReview). O servidor tem mais dois momentos que
// o cliente trata pelo Início, não pelo chat (P.5): um assunto por resolver
// (intervenção — dor no check-in, desvio num registo) passa à frente de
// tudo, e o conflito de provas vem logo a seguir à véspera.

export const SILENCE_DAYS = 3;
export const RACE_AFTER_DAYS_WITH_RUN = 7;
export const RACE_AFTER_DAYS_WITHOUT_RUN = 3;

export type ProactiveTriggerName = "intervention" | "race_morning" | "race_eve" | "race_conflict" | "race_after" | "block_end" | "silence" | "week_review";

export interface TriggerRace {
  id: string;
  name?: string | null;
  date: string;
  status?: string | null;
  distance_km?: number | string | null;
  race_priority?: string | null;
  conflict_acknowledged_at?: string | null;
}

/** Um plano, com a informação de ter treinos (e não só refeições). */
export interface TriggerPlan {
  id: string;
  status?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  race_id?: string | null;
  hasTraining?: boolean;
}

/** Quantos dias antes do fim de um bloco a Carol chama por ele. */
export const BLOCK_END_DAYS = 2;

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
  /** Conflito de provas e fim de bloco: o plano em causa. */
  planId?: string | null;
  /** Fim de bloco: o último dia do plano. */
  blockEnd?: string | null;
  /** Conflito de provas: as outras principais dentro do bloco. */
  conflictRaceNames?: string[];
  /** Balanço da semana: a semana revista (segunda e domingo). */
  weekStart?: string | null;
  weekEnd?: string | null;
}

const DAY_MS = 86400000;

/** Um resumo curto e estável de um texto — a chave da intervenção muda
 *  quando o motivo muda, e só aí (djb2, em base 36). */
export function shortHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function dayOf(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

/** A mesma regra de src/utils/planDivergence.js detectRaceConflict: uma
 *  segunda prova principal, ainda por correr e não reconhecida, dentro de um
 *  bloco aceite vinculado a outra prova (intervalo fechado nos dois lados). */
export function detectRaceConflictServer(plans: TriggerPlan[] | null | undefined, races: TriggerRace[] | null | undefined, todayISO: string): { plan: TriggerPlan; races: TriggerRace[] } | null {
  const bound = (plans || []).filter((p) => p && p.status === "aceite" && p.race_id && dayOf(p.period_start) && dayOf(p.period_end) && dayOf(p.period_end)! >= todayISO);
  for (const plan of bound) {
    const start = dayOf(plan.period_start)!;
    const end = dayOf(plan.period_end)!;
    const others = (races || []).filter((r) => {
      if (!r || r.id === plan.race_id) return false;
      if (r.status === "concluida" || r.conflict_acknowledged_at) return false;
      const d = dayOf(r.date);
      return !!d && d >= todayISO && d >= start && d <= end && (r.race_priority || "a") === "a";
    }).sort((a, b) => a.date.localeCompare(b.date));
    if (others.length) return { plan, races: others };
  }
  return null;
}

/** O bloco de treino (sem prova) que acaba hoje ou nos próximos dias, sem
 *  outro plano de treino a seguir. Com prova, o fim do bloco é a prova — e
 *  essa já tem os seus momentos. */
export function findEndingBlock(plans: TriggerPlan[] | null | undefined, todayISO: string): TriggerPlan | null {
  const training = (plans || []).filter((p) => p && p.hasTraining && (p.status === "aceite" || p.status === "proposto") && dayOf(p.period_end));
  const limit = new Date(Date.parse(`${todayISO}T00:00:00Z`) + BLOCK_END_DAYS * DAY_MS).toISOString().slice(0, 10);
  const ending = training
    .filter((p) => p.status === "aceite" && !p.race_id && dayOf(p.period_end)! >= todayISO && dayOf(p.period_end)! <= limit)
    .sort((a, b) => dayOf(a.period_end)!.localeCompare(dayOf(b.period_end)!));
  for (const plan of ending) {
    const end = dayOf(plan.period_end)!;
    const next = training.some((p) => p.id !== plan.id && dayOf(p.period_end)! > end);
    if (!next) return plan;
  }
  return null;
}

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

/* ── Balanço da semana (pedido de produto 2026-09-24) ───────────────────────
   CAROL.md §3: "Semana cumprida a 100% — uma frase de reconhecimento no
   resumo de segunda-feira". À segunda-feira a Carol faz o balanço da semana
   que acabou no domingo: o que foi feito face ao plano, o que ficou bem e a
   faltar, e o foco da semana que começa. Vale também à terça, para quem não
   abriu a app na segunda; depois disso já não é "o balanço", é história.

   Duas condições (revisão pré-deploy de 2026-09-24):
   - tem de haver pelo menos um registo DENTRO da semana revista. Um registo
     de hoje não conta: quem começa a usar a app numa segunda, ou volta de
     uma ausência, não recebe o balanço de uma semana vazia;
   - só quando não há mais nenhum momento. O dia da prova, a véspera, o
     "como correu?", o fim de bloco, um assunto por resolver ou um "Estás
     bem?" ficam com o dia inteiro: o balanço não lhes aparece por trás.
   A chave é a segunda-feira da semana revista: uma por semana. */
export const WEEK_REVIEW_DAYS = 2;

/** A semana que se revê hoje (segunda a domingo), só pelas datas: null fora
 *  de segunda e terça. `todayISO` é um dia de Lisboa. */
export function weekToReviewBounds(todayISO: string): { weekStart: string; weekEnd: string } | null {
  const today = dayOf(todayISO);
  if (!today) return null;
  // Dia da semana do próprio dia (0 domingo … 6 sábado), sem fuso: a data já é de Lisboa.
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const sinceMonday = (dow + 6) % 7; // 0 à segunda, 1 à terça…
  if (sinceMonday >= WEEK_REVIEW_DAYS) return null;
  const weekStart = addDaysISO(today, -sinceMonday - 7);
  return { weekStart, weekEnd: addDaysISO(weekStart, 6) };
}

/** A semana a rever hoje, se houver algum registo dentro dela. `recordDates`
 *  são datas de registos (corridas, refeições, ginásio, avaliações) — basta
 *  que incluam as dessa semana. */
export function findWeekToReview(todayISO: string, recordDates: Array<string | null | undefined> | null | undefined): { weekStart: string; weekEnd: string } | null {
  const bounds = weekToReviewBounds(todayISO);
  if (!bounds) return null;
  const inWeek = (recordDates || []).some((d) => {
    const day = dayOf(d ?? null);
    return !!day && day >= bounds.weekStart && day <= bounds.weekEnd;
  });
  return inWeek ? bounds : null;
}

function addDaysISO(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** O input dos momentos proativos do servidor. */
export type ServerProactiveInput = {
    raceEvents: TriggerRace[] | null | undefined;
    runs: TriggerRun[] | null | undefined;
    lastRecordDate: string | null;
    /** P.5: o assunto por resolver do perfil (coach_intervention_*). */
    intervention?: { status?: string | null; reason?: string | null } | null;
    /** P.5: os planos, para o conflito de provas e o fim de bloco. */
    plans?: TriggerPlan[] | null;
    /** P.6: os momentos que o atleta aceita. Um desligado não esconde os
     *  seguintes — passa-se ao próximo da lista. Sem isto, todos contam. */
    allowed?: string[] | null;
    /** Balanço da semana: datas de registos que cubram a semana revista (o
     *  tick só as lê à segunda e à terça — weekToReviewBounds). */
    weekRecordDates?: Array<string | null | undefined> | null;
};

/** O momento mais importante agora, ou null. */
export function pickServerProactive(input: ServerProactiveInput, todayISO: string): ServerProactiveCandidate | null {
  return listServerProactive(input, todayISO)[0] ?? null;
}

/** TODOS os momentos que se aplicam agora, por ordem de prioridade (um por
 *  tipo). A notificação não pode ficar só com o primeiro: um assunto por
 *  resolver que o atleta não abre repete a mesma chave em todas as horas, e
 *  depois de notificado uma vez tapava a véspera e a manhã da prova para
 *  sempre (revisão pré-master de 2026-09-19). Quem notifica percorre a lista
 *  e fica com o primeiro que ainda pode sair — coach-proactive-tick/decide.ts
 *  (choosePush). */
export function listServerProactive(input: ServerProactiveInput, todayISO: string): ServerProactiveCandidate[] {
  const out: ServerProactiveCandidate[] = [];
  const ok = (t: ProactiveTriggerName) => !Array.isArray(input.allowed) || input.allowed.includes(t);
  const races = (input.raceEvents || []).filter((r) => r && typeof r.date === "string");
  const scheduled = races.filter((r) => r.status !== "concluida");
  const base = { raceId: null, raceName: null, hasRun: false, silenceDays: null, anchorDate: null, anchorAt: null };

  // Um assunto por resolver passa à frente de tudo: é saúde ou um desvio
  // que ela já decidiu que precisa de conversa.
  if (ok("intervention") && input.intervention?.status === "needed") {
    out.push({ ...base, trigger: "intervention", key: `intervention:${shortHash(input.intervention.reason || "")}` });
  }

  const morning = ok("race_morning") ? scheduled.find((r) => r.date.slice(0, 10) === todayISO) : undefined;
  if (morning) out.push({ ...base, trigger: "race_morning", key: `race_morning:${morning.id}`, raceId: morning.id, raceName: morning.name ?? null });

  const eve = ok("race_eve") ? scheduled.find((r) => daysBetween(todayISO, r.date.slice(0, 10)) === 1) : undefined;
  if (eve) out.push({ ...base, trigger: "race_eve", key: `race_eve:${eve.id}`, raceId: eve.id, raceName: eve.name ?? null });

  const conflict = ok("race_conflict") ? detectRaceConflictServer(input.plans, races, todayISO) : null;
  if (conflict) {
    const target = races.find((r) => r.id === conflict.plan.race_id) ?? null;
    out.push({
      ...base,
      trigger: "race_conflict",
      key: `race_conflict:${conflict.plan.id}:${conflict.races.map((r) => r.id).sort().join(",")}`,
      raceId: target?.id ?? null,
      raceName: target?.name ?? null,
      planId: conflict.plan.id,
      conflictRaceNames: conflict.races.map((r) => r.name || "outra prova"),
    });
  }

  const past = !ok("race_after") ? [] : races
    .map((race) => ({ race, gap: daysBetween(race.date.slice(0, 10), todayISO) }))
    .filter(({ gap }) => gap >= 0 && gap <= RACE_AFTER_DAYS_WITH_RUN)
    .sort((a, b) => a.gap - b.gap);
  // A prova mais recente ganha: um só "depois da prova" na lista.
  for (const { race, gap } of past) {
    const run = findRaceRunServer(input.runs, race);
    if (run) {
      out.push({ ...base, trigger: "race_after", key: `race_after:${race.id}:${run.id || "corrida"}`, raceId: race.id, raceName: race.name ?? null, hasRun: true, anchorDate: race.date.slice(0, 10), anchorAt: run.created_at ?? null });
      break;
    }
    if (gap >= 1 && gap <= RACE_AFTER_DAYS_WITHOUT_RUN) {
      out.push({ ...base, trigger: "race_after", key: `race_after:${race.id}:sem-registo`, raceId: race.id, raceName: race.name ?? null, anchorDate: race.date.slice(0, 10) });
      break;
    }
  }

  const block = ok("block_end") ? findEndingBlock(input.plans, todayISO) : null;
  if (block) {
    out.push({ ...base, trigger: "block_end", key: `block_end:${block.id}`, planId: block.id, blockEnd: dayOf(block.period_end), anchorDate: dayOf(block.period_end) });
  }

  const last = ok("silence") && input.lastRecordDate ? input.lastRecordDate.slice(0, 10) : null;
  if (last) {
    const gap = daysBetween(last, todayISO);
    if (gap >= SILENCE_DAYS) out.push({ ...base, trigger: "silence", key: `silence:${last}`, silenceDays: gap, anchorDate: last });
  }

  // O balanço da semana só entra num dia sem mais nada: o dia da prova, um
  // assunto por resolver ou um "Estás bem?" ficam com o dia inteiro.
  const week = ok("week_review") && out.length === 0 ? findWeekToReview(todayISO, input.weekRecordDates) : null;
  if (week) {
    out.push({ ...base, trigger: "week_review", key: `week_review:${week.weekStart}`, anchorDate: week.weekEnd, weekStart: week.weekStart, weekEnd: week.weekEnd });
  }
  return out;
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
    // Genérica de propósito: o motivo pode ser de saúde (uma dor), e o
    // ecrã bloqueado não é sítio para o dizer.
    case "intervention":
      return { title, body: "Preciso de falar contigo sobre uma coisa que vi. Abre a app quando puderes." };
    case "race_conflict":
      return { title, body: "Tens duas provas principais no mesmo bloco. Temos de decidir qual é o objetivo." };
    case "block_end":
      return { title, body: "O teu bloco de treino está a acabar. Vamos ver como correu e preparar o próximo." };
    case "week_review":
      return { title, body: "A semana fechou. Vem ver comigo como correu e o que fica para esta." };
  }
}

/** O separador que o toque abre. O assunto por resolver e o conflito de
 *  provas têm o seu aviso no Início, com "Falar com a Carol" — que abre a
 *  conversa certa. Os outros abrem o Coach, onde ela escreve a mensagem. */
export function proactiveTab(trigger: ProactiveTriggerName): "coach" | "home" {
  return trigger === "intervention" || trigger === "race_conflict" ? "home" : "coach";
}

export const DEFAULT_PUSH_START_HOUR = 9;
export const DEFAULT_PUSH_END_HOUR = 21;
export const RACE_MORNING_EARLIEST_HOUR = 6;
export const ALL_PROACTIVE_TRIGGERS: ProactiveTriggerName[] = ["intervention", "race_morning", "race_eve", "race_conflict", "race_after", "block_end", "silence", "week_review"];

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
