// O check-in diário e os alarmes que ele dispara — fórmula pura, partilhada
// pelo cliente (via @formulas: o Início decide se chama a Carol) e pelas Edge
// Functions (o contexto que a Carol lê). specs/carol-omnisciencia-
// omnipresenca.md, Fase 2 (ações 2.1 a 2.3).
//
// Até aqui a hierarquia de alarmes da Carol (G1–G5, coach-chat) só disparava
// se o atleta MENCIONASSE o sinal no chat. O check-in diz-lho sem ele ter de
// escrever nada: sono, energia e stress de 1 a 5, dor de 0 a 10 (a mesma
// escala EVA da doutrina) com o local, e — só com consentimento explícito —
// os dias de menstruação.
//
// @doutrina coach-chat HIERARQUIA DE ALARMES (IOC REDs CAT 2023, Meeusen 2013):
//   G2 lesão óssea de stress: dor óssea focal ao carregar peso, EVA ≥ 4.
//   G3 RED-S grave: amenorreia > 3 meses, entre outros sinais.
//   G4 sobretreino não funcional: perturbação de sono/humor persistente.
//   G5 lesão músculo-tendinosa: dor EVA ≥ 4 que altera a passada.
// O check-in não diagnostica: marca o candidato, e a Carol pergunta.

export interface DailyCheckin {
  date: string;                     // YYYY-MM-DD
  sleep?: number | null;            // 1 péssimo … 5 ótimo
  energy?: number | null;           // 1 sem energia … 5 cheio
  stress?: number | null;           // 1 calmo … 5 muito stressado
  pain?: number | null;             // 0 sem dor … 10 pior dor possível (EVA)
  pain_location?: string | null;
  period_today?: boolean | null;    // null: não registado
}

export type CheckinAlarmCode = "G2" | "G3" | "G4" | "G5";

export interface CheckinAlarm {
  code: CheckinAlarmCode;
  /** Estável por episódio: o cliente só chama a Carol quando aparece uma chave nova. */
  key: string;
  reason: string;
}

export interface CheckinOptions {
  /** Só com perfil feminino E consentimento o ciclo conta. */
  female: boolean;
  /** ISO do consentimento para registar o ciclo; null = sem consentimento. */
  cycleConsentAt: string | null;
}

export const PAIN_ALARM_THRESHOLD = 4;
export const AMENORRHEA_DAYS = 90;
/* Para dizer "sem menstruação há 90 dias" é preciso que o atleta tenha
   respondido à pergunta do ciclo nesse tempo: um check-in esquecido ou uma
   resposta em branco não é um "não" (revisão pré-deploy 2026-09-18). */
export const MIN_CYCLE_ANSWERS = 20;
/** A janela que o cliente e o servidor leem. Fora dela não há histórico. */
export const CHECKIN_WINDOW_DAYS = 120;
const DAY_MS = 86400000;

/* Palavras que apontam para osso (G2) em vez de músculo ou tendão (G5). A
   lista é curta de propósito: na dúvida fica G5, e a Carol pergunta. */
const BONE_HINTS = ["tíbia", "tibia", "canela", "fémur", "femur", "metatars", "peito do pé", "osso", "calcanhar"];

function dayDiff(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`)) / DAY_MS);
}

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function num(v: unknown): number | null {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
}

function byDate(checkins: DailyCheckin[] | null | undefined): DailyCheckin[] {
  return (checkins || [])
    .filter((c) => c && typeof c.date === "string")
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function isBonePain(location: string | null | undefined): boolean {
  const l = (location || "").toLowerCase();
  return BONE_HINTS.some((w) => l.includes(w));
}

/** Os check-ins dos últimos `days` dias, até hoje inclusive. */
export function recentCheckins(checkins: DailyCheckin[] | null | undefined, todayISO: string, days = 7): DailyCheckin[] {
  const from = addDays(todayISO, -(days - 1));
  return byDate(checkins).filter((c) => c.date >= from && c.date <= todayISO);
}

/** Dias desde o último dia de menstruação registado, ou desde o
 *  consentimento se nunca houve nenhum. null sem consentimento. */
export function daysSinceLastPeriod(checkins: DailyCheckin[] | null | undefined, todayISO: string, opts: CheckinOptions): { days: number; lastPeriod: string | null } | null {
  if (!opts.female || !opts.cycleConsentAt) return null;
  const periods = byDate(checkins).filter((c) => c.period_today === true && c.date <= todayISO);
  const last = periods.length ? periods[periods.length - 1].date : null;
  const since = last ?? opts.cycleConsentAt.slice(0, 10);
  return { days: dayDiff(since, todayISO), lastPeriod: last };
}

export function evaluateCheckinAlarms(checkins: DailyCheckin[] | null | undefined, todayISO: string, opts: CheckinOptions): CheckinAlarm[] {
  const alarms: CheckinAlarm[] = [];
  const all = byDate(checkins);
  const today = all.find((c) => c.date === todayISO) ?? null;

  // Dor de hoje ≥ 4: G2 se parece óssea, senão G5.
  const pain = num(today?.pain);
  if (today && pain !== null && pain >= PAIN_ALARM_THRESHOLD) {
    const yesterday = all.find((c) => c.date === addDays(todayISO, -1));
    const repeated = (num(yesterday?.pain) ?? 0) >= PAIN_ALARM_THRESHOLD;
    const loc = (today.pain_location || "").trim();
    alarms.push({
      code: isBonePain(loc) ? "G2" : "G5",
      key: `dor:${todayISO}`,
      reason: `Dor ${pain}/10${loc ? ` (${loc})` : ""} no check-in de hoje${repeated ? ", pelo segundo dia seguido" : ""}.`,
    });
  }

  // Sono mau persistente, com energia em baixo ou stress alto: G4.
  const last5 = recentCheckins(all, todayISO, 7).slice(-5);
  if (last5.length >= 3) {
    const badSleep = last5.filter((c) => (num(c.sleep) ?? 99) <= 2).length;
    const lowEnergy = last5.filter((c) => (num(c.energy) ?? 99) <= 2).length;
    const highStress = last5.filter((c) => (num(c.stress) ?? 0) >= 4).length;
    if (badSleep >= 3 && (lowEnergy >= 3 || highStress >= 3)) {
      const withWhat = [lowEnergy >= 3 ? "energia em baixo" : null, highStress >= 3 ? "stress alto" : null].filter(Boolean).join(" e ");
      // A chave é o primeiro dia mau da janela: enquanto for o mesmo episódio,
      // é a mesma chave, e o cliente não volta a chamar a Carol todos os dias.
      const firstBad = last5.find((c) => (num(c.sleep) ?? 99) <= 2)!.date;
      alarms.push({
        code: "G4",
        key: `sono:${firstBad}`,
        reason: `Sono mau em ${badSleep} dos últimos ${last5.length} check-ins, com ${withWhat}.`,
      });
    }
  }

  // Sem menstruação há mais de 90 dias, com o ciclo registado há pelo menos
  // esse tempo: G3. Antes disso não há dados para o dizer.
  if (opts.female && opts.cycleConsentAt && dayDiff(opts.cycleConsentAt, todayISO) >= AMENORRHEA_DAYS) {
    const window = recentCheckins(all, todayISO, AMENORRHEA_DAYS);
    const answers = window.filter((c) => c.period_today === true || c.period_today === false);
    const anyPeriod = answers.some((c) => c.period_today === true);
    if (answers.length >= MIN_CYCLE_ANSWERS && !anyPeriod) {
      alarms.push({
        code: "G3",
        key: `ciclo:${todayISO.slice(0, 7)}`,
        reason: `Nenhum dia de menstruação nos últimos ${AMENORRHEA_DAYS} dias (${answers.length} respostas à pergunta do ciclo).`,
      });
    }
  }

  return alarms;
}

function avgNum(list: DailyCheckin[], field: "sleep" | "energy" | "stress"): number | null {
  const vals = list.map((c) => num(c[field])).filter((v): v is number => v !== null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function fmt1(n: number): string {
  return String(Math.round(n * 10) / 10).replace(".", ",");
}

function avg(list: DailyCheckin[], field: "sleep" | "energy" | "stress"): string | null {
  const n = avgNum(list, field);
  return n === null ? null : fmt1(n);
}

const CHECKIN_FIELDS: Array<["sleep" | "energy" | "stress", string]> = [
  ["sleep", "sono"], ["energy", "energia"], ["stress", "stress"],
];
/** A partir de que diferença entre as duas janelas se diz "a subir"/"a
 *  descer" — sem adjetivo, só a direção; a Carol julga se é bom ou mau. */
const TREND_THRESHOLD = 0.7;
const MIN_TREND_CHECKINS = 3;

/* Ciclo (ação 5.4): a duração normal ronda os 21–35 dias; a margem (18–45)
   absorve o erro de quem esquece um dia de check-in sem inventar um ciclo de
   3 dias nem de 4 meses a partir de um início mal detetado. */
const MIN_CYCLE_LENGTH_DAYS = 18;
const MAX_CYCLE_LENGTH_DAYS = 45;

/** "2026-09-09" → "09-09" (dia-mês, sem ano — a Carol já sabe o ano). */
function ddmm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}-${m}`;
}

/** Os primeiros dias de cada episódio de menstruação: `period_today` true
 *  sem nenhum true nos 5 dias antes — um período de vários dias seguidos não
 *  conta como vários inícios. Ordenado por data ascendente. Sem consentimento
 *  ou perfil feminino, `checkins` já chega sem nenhum `period_today` true
 *  (fetchCheckinBlock apaga-o antes), por isso não repete aqui o corte. */
function cycleStarts(checkins: DailyCheckin[] | null | undefined): string[] {
  const trueDates = new Set(byDate(checkins).filter((c) => c.period_today === true).map((c) => c.date));
  const starts: string[] = [];
  for (const date of trueDates) {
    const hasRecentTrue = [1, 2, 3, 4, 5].some((d) => trueDates.has(addDays(date, -d)));
    if (!hasRecentTrue) starts.push(date);
  }
  return starts.sort();
}

/** A duração de cada ciclo entre inícios consecutivos, só as plausíveis. */
function cycleLengths(starts: string[]): number[] {
  const lengths: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const len = dayDiff(starts[i - 1], starts[i]);
    if (len >= MIN_CYCLE_LENGTH_DAYS && len <= MAX_CYCLE_LENGTH_DAYS) lengths.push(len);
  }
  return lengths;
}

function describeDay(c: DailyCheckin): string {
  const parts: string[] = [];
  if (num(c.sleep) !== null) parts.push(`sono ${c.sleep}`);
  if (num(c.energy) !== null) parts.push(`energia ${c.energy}`);
  if (num(c.stress) !== null) parts.push(`stress ${c.stress}`);
  const p = num(c.pain);
  if (p !== null) parts.push(p === 0 ? "sem dor" : `dor ${p}/10${c.pain_location ? ` (${String(c.pain_location).trim()})` : ""}`);
  if (c.period_today === true) parts.push("menstruada");
  return parts.join(", ");
}

/** O bloco de prompt: hoje, a média da semana, os dias com dor e os alarmes. */
export function buildCheckinContext(checkins: DailyCheckin[] | null | undefined, todayISO: string, opts: CheckinOptions): string | null {
  const week = recentCheckins(checkins, todayISO, 7);
  const cycle = daysSinceLastPeriod(checkins, todayISO, opts);
  if (!week.length && !cycle) return null;

  const lines: string[] = [];
  const today = week.find((c) => c.date === todayISO);
  lines.push(today ? `- Hoje: ${describeDay(today) || "check-in sem valores"}.` : "- Hoje: ainda sem check-in.");
  if (week.length) {
    // Esta semana vs as 3 semanas antes (ação 5.4) — só com pelo menos 3
    // check-ins em cada janela: com menos, uma tendência é uma afirmação a
    // mais a partir de pouco. Sem isso, a média simples de sempre.
    const before = byDate(checkins).filter((c) => c.date >= addDays(todayISO, -27) && c.date <= addDays(todayISO, -7));
    if (week.length >= MIN_TREND_CHECKINS && before.length >= MIN_TREND_CHECKINS) {
      const weekParts = CHECKIN_FIELDS.map(([field, label]) => {
        const wAvg = avgNum(week, field);
        if (wAvg === null) return null;
        const bAvg = avgNum(before, field);
        const diff = bAvg === null ? 0 : wAvg - bAvg;
        const marker = diff >= TREND_THRESHOLD ? " a subir" : diff <= -TREND_THRESHOLD ? " a descer" : "";
        return `${label} ${fmt1(wAvg)}${marker}`;
      }).filter((v): v is string => v !== null);
      const beforeParts = CHECKIN_FIELDS
        .map(([field, label]) => { const v = avg(before, field); return v === null ? null : `${label} ${v}`; })
        .filter((v): v is string => v !== null);
      if (weekParts.length) {
        lines.push(`- Esta semana: ${weekParts.join(", ")} (${week.length} check-ins); as 3 semanas antes: ${beforeParts.join(", ")} (${before.length} check-ins).`);
      }
    } else {
      const means = CHECKIN_FIELDS.map(([field, label]) => { const v = avg(week, field); return v === null ? null : `${label} ${v}`; })
        .filter((v): v is string => v !== null);
      if (means.length) lines.push(`- Média dos últimos 7 dias: ${means.join(", ")} (${week.length} check-in${week.length === 1 ? "" : "s"}).`);
    }
    const painDays = week.filter((c) => (num(c.pain) ?? 0) > 0 && c.date !== todayISO);
    if (painDays.length) lines.push(`- Dias com dor esta semana: ${painDays.map((c) => `${c.date} ${describeDay(c)}`).join("; ")}.`);
  }
  if (cycle) {
    // Duração do ciclo (ação 5.4) — nunca "hoje é o dia D": os inícios detetados
    // e uma previsão em "por volta de", nunca uma data como certeza.
    const starts = cycleStarts(checkins);
    const lengths = cycleLengths(starts);
    const avgLen = lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : null;
    if (avgLen !== null && starts.length >= 3) {
      const [a, b] = starts.slice(-2);
      const next = addDays(b, avgLen);
      lines.push(`- Ciclo: inícios a ${ddmm(a)} e ${ddmm(b)} (ciclo de ~${avgLen} dias); o próximo é esperado por volta de ${ddmm(next)}.`);
    } else if (avgLen !== null && starts.length === 2) {
      const [a, b] = starts;
      const next = addDays(b, avgLen);
      lines.push(`- Ciclo: inícios a ${ddmm(a)} e ${ddmm(b)} (último ciclo: ${avgLen} dias); o próximo é esperado por volta de ${ddmm(next)}.`);
    } else {
      lines.push(cycle.lastPeriod
        ? `- Ciclo: último dia de menstruação registado a ${cycle.lastPeriod} (há ${cycle.days} dias).`
        : cycle.days < CHECKIN_WINDOW_DAYS
          ? `- Ciclo: registo ativo, ainda sem nenhum dia de menstruação marcado (${cycle.days} dias desde o consentimento).`
          : `- Ciclo: registo ativo, sem nenhum dia de menstruação marcado nos últimos ${CHECKIN_WINDOW_DAYS} dias.`);
    }
  }

  const alarms = evaluateCheckinAlarms(checkins, todayISO, opts);
  let text = `COMO O ATLETA SE SENTE (check-in diário; sono, energia e stress de 1 a 5, dor de 0 a 10):\n${lines.join("\n")}`;
  if (alarms.length) {
    text += `\nSINAIS DE ALARME DO CHECK-IN — valem como se o atleta os tivesse dito no chat. Aplica a HIERARQUIA DE ALARMES antes de ` +
      `qualquer outro assunto: pergunta primeiro, não diagnostiques, e não proponhas treino de impacto enquanto não souberes mais.\n` +
      alarms.map((a) => `- ${a.code}: ${a.reason}`).join("\n");
  }
  return text;
}
