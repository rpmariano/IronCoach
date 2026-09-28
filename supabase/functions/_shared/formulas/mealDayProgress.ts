// O dia até agora, na análise de uma refeição — fórmula pura
// (specs/carol-omnisciencia-omnipresenca.md, ação 5.5, push 3).
//
// O analyze-meal comentava cada refeição sozinha: sabia a meta diária do
// perfil e as últimas refeições do mesmo tipo, mas não o que ele já tinha
// comido hoje nem o que ela própria tinha sugerido para o dia. Por isso não
// conseguia dizer "sugeri 125 g de proteína para hoje; com esta vais em 60 g"
// — a frase que ajuda a decidir a próxima refeição. Isto soma o dia (as outras
// refeições de hoje mais esta) e compara com a sugestão do plano para hoje
// (coach_plan_items.meal_macros) ou, sem ela, com a meta do perfil.
//
// 2026-09-28: a soma sozinha não chega. Um lanche registado DEPOIS do jantar
// levou a "o jantar terá de assumir o resto" — ela via 76 g no dia mas não
// sabia que o jantar já estava lá dentro, e assumia a ordem habitual do dia.
// Agora recebe que refeições já estão registadas (pelo tipo) e quais ainda
// podem vir, e nunca manda compensar numa que já foi comida.
//
// Com a hora (meals.meal_time, opcional) a posição de cada refeição no dia
// deixa de depender só do tipo: um "lanche" às 20:15 fica no jantar ou depois
// dele. A posição é a mais tardia entre a do tipo e a da hora — os intervalos
// são os de getDefaultMealType (MealRegistration.jsx). Antes das 05:00 a hora é
// ambígua (ceia de madrugada? pequeno-almoço cedo?) e não conta.

export interface MacroTotals { calories: number; protein: number }
/** Uma refeição do dia, com o tipo e a hora quando se sabem (meals.meal_type, meals.meal_time). */
export interface DayMeal extends MacroTotals { meal_type?: string | null; meal_time?: string | null }

/** A ordem do dia — a mesma de MEAL_TYPES no analyze-meal. */
export const MEAL_ORDER = ["pequeno-almoco", "lanche-manha", "almoco", "lanche", "jantar", "ceia"] as const;
export const MEAL_ORDER_LABELS: Record<string, string> = {
  "pequeno-almoco": "Pequeno-almoço",
  "lanche-manha": "Lanche da manhã",
  "almoco": "Almoço",
  "lanche": "Lanche",
  "jantar": "Jantar",
  "ceia": "Ceia",
};
/** 'HH:MM' normalizada, ou null — espelha normalizeStartTime (src/utils/startTime.js):
 *  o PostgREST devolve 'HH:MM:SS', a app envia 'HH:MM'. */
export function normalizeMealTime(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(String(value).trim());
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23 || Number(m[2]) > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** O slot do dia que a hora sugere (índice em MEAL_ORDER), ou null antes das 05:00 / sem hora. */
export function slotFromTime(time: string | null | undefined): number | null {
  const t = normalizeMealTime(time);
  if (!t) return null;
  const x = Number(t.slice(0, 2)) + Number(t.slice(3)) / 60;
  if (x < 5) return null;
  if (x < 10.5) return 0;
  if (x < 12) return 1;
  if (x < 15) return 2;
  if (x < 19) return 3;
  if (x < 22.5) return 4;
  return 5;
}

export interface DaySuggestion { kcal?: number | null; protein_g?: number | null }
export interface DayGoals { calorie_goal?: number | null; protein_goal?: number | null }

export interface DayProgress {
  meals: number;
  kcal: number;
  protein: number;
  /** De onde vem o alvo do dia: a sugestão dela para hoje, a meta do perfil, ou nenhum. */
  target: { source: "sugestao" | "meta"; kcal: number | null; protein: number | null } | null;
  /** As outras refeições de hoje, pela ordem do dia (só as que têm tipo). */
  logged: Array<{ meal_type: string; meal_time: string | null; kcal: number; protein: number }>;
  /** A hora desta refeição ('HH:MM'), se a houver. */
  thisTime: string | null;
  /** Tipos que ainda podem vir hoje: os que ficam DEPOIS da última refeição
   *  já registada (esta incluída) e que ainda não existem. Vazio = dia fechado.
   *  null quando não se sabe o tipo desta refeição. */
  remaining: string[] | null;
}

function pos(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** O dia até agora (as outras refeições de hoje mais esta) e o alvo do dia. */
export function mealDayProgress(input: {
  thisMeal: DayMeal;
  otherMeals: DayMeal[] | null | undefined;
  suggestion: DaySuggestion | null | undefined;
  goals: DayGoals | null | undefined;
}): DayProgress {
  const others = input.otherMeals || [];
  const kcal = Math.round(others.reduce((s, m) => s + (Number(m.calories) || 0), Number(input.thisMeal.calories) || 0));
  const protein = Math.round(others.reduce((s, m) => s + (Number(m.protein) || 0), Number(input.thisMeal.protein) || 0));
  const sKcal = pos(input.suggestion?.kcal);
  const sProt = pos(input.suggestion?.protein_g);
  const gKcal = pos(input.goals?.calorie_goal);
  const gProt = pos(input.goals?.protein_goal);
  const target = sKcal || sProt
    ? { source: "sugestao" as const, kcal: sKcal, protein: sProt }
    : gKcal || gProt
      ? { source: "meta" as const, kcal: gKcal, protein: gProt }
      : null;
  const rank = (t: string | null | undefined) => (t ? MEAL_ORDER.indexOf(t as typeof MEAL_ORDER[number]) : -1);
  // Uma ceia com hora antes das 05:00 é a da noite ANTERIOR, registada já com
  // a data de hoje (a app põe a data do dia e sugere "ceia" de madrugada):
  // fica antes do dia e não conta como a ceia de hoje — senão fechava o dia
  // inteiro e todas as refeições seguintes ouviam "não há refeição seguinte"
  // (revisão pré-deploy de 2026-09-28).
  const preDawnCeia = (m: { meal_type?: string | null; meal_time?: string | null }) => {
    const t = normalizeMealTime(m.meal_time);
    return m.meal_type === "ceia" && !!t && t < "05:00";
  };
  // A posição no dia: a mais tardia entre o tipo e a hora.
  const position = (m: { meal_type?: string | null; meal_time?: string | null }) =>
    preDawnCeia(m) ? -1 : Math.max(rank(m.meal_type), slotFromTime(m.meal_time) ?? -1);
  const logged = others
    .filter((m) => rank(m.meal_type) >= 0)
    .map((m) => ({
      meal_type: m.meal_type as string,
      meal_time: normalizeMealTime(m.meal_time),
      kcal: Math.round(Number(m.calories) || 0),
      protein: Math.round(Number(m.protein) || 0),
    }))
    .sort((a, b) => position(a) - position(b) || (a.meal_time ?? "").localeCompare(b.meal_time ?? ""));
  const thisTime = normalizeMealTime(input.thisMeal.meal_time);
  let remaining: string[] | null = null;
  const thisRank = rank(input.thisMeal.meal_type);
  if (thisRank >= 0) {
    const last = Math.max(position(input.thisMeal), ...logged.map(position));
    const taken = new Set([input.thisMeal, ...logged].filter((m) => !preDawnCeia(m)).map((m) => m.meal_type));
    remaining = MEAL_ORDER.slice(last + 1).filter((t) => !taken.has(t));
  }
  return { meals: others.length + 1, kcal, protein, target, logged, thisTime, remaining };
}

/** A secção do prompt do analyze-meal, com a instrução de como a usar. */
export function dayProgressSection(p: DayProgress): string {
  const meals = p.meals === 1 ? "é a primeira refeição registada hoje" : `${p.meals} refeições registadas hoje, com esta`;
  let line = `O DIA ATÉ AGORA (${meals}): ${p.kcal} kcal e ${p.protein} g de proteína.`;
  if (p.target) {
    const parts: string[] = [];
    if (p.target.kcal) parts.push(`${p.target.kcal} kcal`);
    if (p.target.protein) parts.push(`${p.target.protein} g de proteína`);
    const pct: string[] = [];
    if (p.target.kcal) pct.push(`${Math.round((p.kcal / p.target.kcal) * 100)}% das kcal`);
    if (p.target.protein) pct.push(`${Math.round((p.protein / p.target.protein) * 100)}% da proteína`);
    line += p.target.source === "sugestao"
      ? ` Sugeriste para hoje ${parts.join(" e ")} — vai em ${pct.join(" e ")}.`
      : ` A meta diária dele é ${parts.join(" e ")} — vai em ${pct.join(" e ")}.`;
  }
  if (p.thisTime) line += `\nEsta refeição foi às ${p.thisTime}.`;
  if (p.logged.length) {
    line += `\nJá registadas hoje, além desta: ` +
      p.logged.map((m) =>
        `${MEAL_ORDER_LABELS[m.meal_type] ?? m.meal_type}${m.meal_time ? ` às ${m.meal_time}` : ""} (${m.kcal} kcal, ${m.protein} g de proteína)`
      ).join("; ") + ".";
  }
  let next: string;
  if (p.remaining === null) {
    next = `diz o que a próxima refeição pode fazer`;
  } else if (p.remaining.length) {
    const labels = p.remaining.map((t) => MEAL_ORDER_LABELS[t] ?? t);
    line += `\nRefeições que ainda podem vir hoje: ${labels.join(", ")}.`;
    next = `diz o que ainda pode fazer ${labels.length === 1 ? "a refeição" : "cada refeição"} que falta (${labels.join(", ")}) — ` +
      `só essas, nunca uma que já está registada acima`;
    // Só a ceia pela frente (ex.: lanche registado depois do jantar): é a
    // última oportunidade do dia, e é antes de dormir — o conselho tem de o ter
    // em conta, não pode ser "come mais" genérico (feedback de 2026-09-28).
    if (p.remaining.length === 1 && p.remaining[0] === "ceia") {
      next += `. A CEIA É A ÚNICA HIPÓTESE QUE RESTA HOJE: se o dia estiver abaixo do alvo (sobretudo na proteína), diz-lo ` +
        `explicitamente e aconselha como a ceia o pode compensar tendo em conta que é a refeição antes de ir para a cama — ` +
        `proteína de absorção lenta (skyr, iogurte grego, queijo fresco, requeijão, leite; caseína se ele usar), com uma ` +
        `quantidade concreta em gramas; porção leve e pouca gordura, para não pesar na digestão nem prejudicar o sono; ` +
        `não tentes recuperar numa ceia as calorias todas que faltam. Esta é a sugestão do bloco "Para a próxima"`;
    }
  } else {
    line += `\nNão há mais refeições previstas hoje depois desta — o dia está praticamente fechado.`;
    next = `não há refeição seguinte hoje para compensar: julga esta refeição no dia que já aconteceu e, se faltar algo, ` +
      `diz o que ajustar amanhã ou nesta mesma refeição da próxima vez`;
  }
  return `${line}\n` +
    `Se ajudar, diz numa frase onde ele vai no dia face a esse alvo, com estes números — por exemplo ` +
    `"sugeri 125 g de proteína para hoje; com esta vais em 60 g". É o dia até agora, não um balanço: não cobres o que falta; ${next}. ` +
    `NUNCA atribuas a compensação a uma refeição que já consta como registada — a ordem em que ele regista não é a ordem em que comeu, ` +
    `e esta refeição pode ter sido registada depois de outras mais tardias no dia. Na primeira refeição do dia, só se ajudar.\n`;
}
