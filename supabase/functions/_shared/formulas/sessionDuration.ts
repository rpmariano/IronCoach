// A duração de uma sessão de ginásio registada com prints de atividades
// diferentes, e a parte de cardio dela.
//
// @contexto Bug #94 (2026-10-28): o Rui juntou ao registo de ginásio o print
// da bicicleta (15:48) e o das máquinas (38:29). O Gemini só devolvia UMA
// duração para todos os prints e ficou a das máquinas: a Carol disse «38 min
// de exercícios de pernas». Agora a leitura devolve um período por atividade
// distinta (activity_periods) e a duração da sessão é a soma deles — sem
// contar duas vezes o mesmo período, nem o mesmo treino visto em dois prints.

export type ActivityPeriod = { kind: "forca" | "cardio" | "outro"; start: number | null; duration: number };

/** O pedaço do schema de resposta do Gemini (sem limites nos arrays: o 400 de 2026-09-05). */
export const ACTIVITY_PERIODS_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      kind: { type: "STRING", enum: ["forca", "cardio", "outro"] },
      start_time: { type: "STRING", nullable: true },
      duration_seconds: { type: "NUMBER", nullable: true },
    },
    required: ["kind"],
  },
};

export const ACTIVITY_PERIODS_PROMPT =
  "Se as imagens mostrarem MAIS DO QUE UMA atividade registada no relógio ou na app (ex.: o resumo da bicicleta " +
  "e o resumo do treino de força, cada um com a sua duração), preenche activity_periods com UM elemento por " +
  "atividade distinta: kind (\"cardio\", \"forca\" ou \"outro\"), start_time (a hora de início \"HH:MM\", se " +
  "visível) e duration_seconds (a duração dessa atividade, em segundos). A mesma atividade vista em dois prints " +
  "conta uma vez. Com uma só atividade, activity_periods fica vazio. Em duration_seconds da sessão põe o tempo " +
  "TOTAL de todas as atividades.";

const MIN_PERIOD_S = 60;
const MAX_PERIOD_S = 86400;

function parseStart(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^\s*(\d{1,2})[:h](\d{2})(?::(\d{2}))?\s*$/.exec(v);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]), s = Number(m[3] ?? 0);
  return h < 24 && min < 60 && s < 60 ? h * 3600 + min * 60 + s : null;
}

/** Os períodos que o Gemini devolveu, validados; o mesmo treino visto em dois
 *  prints (mesmo tipo, duração a ±60 s e início a ±2 min ou desconhecido) fica um. */
export function parseActivityPeriods(raw: unknown): ActivityPeriod[] {
  const out: ActivityPeriod[] = [];
  for (const p of Array.isArray(raw) ? raw.slice(0, 12) : []) {
    const d = typeof p?.duration_seconds === "number" && Number.isFinite(p.duration_seconds) ? Math.round(p.duration_seconds) : null;
    if (d === null || d < MIN_PERIOD_S || d > MAX_PERIOD_S) continue;
    const kind = p?.kind === "cardio" || p?.kind === "forca" ? p.kind : "outro";
    const start = parseStart(p?.start_time);
    const dup = out.find((o) =>
      o.kind === kind && Math.abs(o.duration - d) <= 60 && (o.start === null || start === null || Math.abs(o.start - start) <= 120)
    );
    if (!dup) out.push({ kind, start, duration: d });
  }
  return out;
}

/** A duração total de dois ou mais períodos distintos: a união dos intervalos
 *  quando todos têm início (uma sobreposição não conta duas vezes), senão a
 *  soma. null com menos de dois — fica a duração que o Gemini leu. */
export function combinedDuration(periods: ActivityPeriod[]): number | null {
  if (periods.length < 2) return null;
  if (periods.every((p) => p.start !== null)) {
    const iv = periods.map((p) => [p.start as number, (p.start as number) + p.duration]).sort((a, b) => a[0] - b[0]);
    let total = 0, [cs, ce] = iv[0];
    for (const [s, e] of iv.slice(1)) {
      if (s <= ce) ce = Math.max(ce, e);
      else { total += ce - cs; [cs, ce] = [s, e]; }
    }
    return total + (ce - cs);
  }
  return periods.reduce((t, p) => t + p.duration, 0);
}

/** A duração da sessão: a soma dos períodos, se a leitura trouxe dois ou mais
 *  distintos; senão a que o Gemini leu. */
export function sessionDurationSeconds(readDuration: number | null, rawPeriods: unknown): number | null {
  const combined = combinedDuration(parseActivityPeriods(rawPeriods));
  return combined !== null && combined <= MAX_PERIOD_S ? combined : readDuration;
}

type SetLike = { exercise_name?: string | null; reps?: number | null; weight?: number | null; duration_seconds?: number | null };

/** A duração em texto, com o cardio à parte quando as séries de cardio têm
 *  tempo: «54 min no total — 16 min de cardio (Bicicleta estacionária) e 38 min
 *  de força». Sem duração, null (nunca «0 min»). */
export function durationBreakdown(totalSeconds: number | null | undefined, sets: SetLike[] | null | undefined): string | null {
  const total = Number(totalSeconds);
  if (!(total > 0)) return null;
  const cardio = new Map<string, number>();
  for (const s of sets ?? []) {
    const d = Number(s?.duration_seconds);
    if (!(d > 0) || s?.reps || s?.weight) continue;
    const name = typeof s?.exercise_name === "string" && s.exercise_name.trim() ? s.exercise_name.trim() : "cardio";
    cardio.set(name, (cardio.get(name) ?? 0) + d);
  }
  const cardioS = [...cardio.values()].reduce((a, b) => a + b, 0);
  const min = (s: number) => Math.round(s / 60);
  if (!cardioS || total - cardioS < 60) return `${min(total)} min`;
  return `${min(total)} min no total — ${min(cardioS)} min de cardio (${[...cardio.keys()].join(", ")}) e ${min(total - cardioS)} min de força`;
}
