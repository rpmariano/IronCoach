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

export interface MacroTotals { calories: number; protein: number }
export interface DaySuggestion { kcal?: number | null; protein_g?: number | null }
export interface DayGoals { calorie_goal?: number | null; protein_goal?: number | null }

export interface DayProgress {
  meals: number;
  kcal: number;
  protein: number;
  /** De onde vem o alvo do dia: a sugestão dela para hoje, a meta do perfil, ou nenhum. */
  target: { source: "sugestao" | "meta"; kcal: number | null; protein: number | null } | null;
}

function pos(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** O dia até agora (as outras refeições de hoje mais esta) e o alvo do dia. */
export function mealDayProgress(input: {
  thisMeal: MacroTotals;
  otherMeals: MacroTotals[] | null | undefined;
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
  return { meals: others.length + 1, kcal, protein, target };
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
  return `${line}\n` +
    `Se ajudar a decidir a próxima refeição, diz numa frase onde ele vai no dia face a esse alvo, com estes números — por exemplo ` +
    `"sugeri 125 g de proteína para hoje; com esta vais em 60 g". É o dia até agora, não um balanço: não cobres o que falta, diz o que ` +
    `a próxima refeição pode fazer. Na primeira refeição do dia, só se ajudar.\n`;
}
