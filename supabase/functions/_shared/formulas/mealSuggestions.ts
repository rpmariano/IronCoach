// Regras das sugestões de refeições da Carol (decididas a 2026-09-23).
//
//   Dia dentro de um plano aceite:
//     · UMA refeição (ex.: só o jantar) grava-se logo, sem confirmação, e
//       substitui só essa refeição no dia — as outras ficam.
//     · Um dia inteiro de refeições só se grava depois de o atleta dizer que
//       sim na conversa.
//   Dia sem plano:
//     · Uma refeição ou um dia fica só na conversa — a app não cria planos
//       por causa de refeições.
//     · Mais de um dia cria um plano proposto só de refeições (o atleta
//       aceita ou recusa); a Carol pode antes sugerir juntar-lhe treinos.
//
// Os itens de um plano só podem ser corrida, ginásio ou descanso. Um dia com
// refeições e sem treino guardava-se como "descanso" — e aparecia como dia de
// descanso planeado, que ninguém decidiu. A marca abaixo, em `categories`
// (que só o ginásio usa), distingue-o sem migração: mostra-se "Sem treino
// planeado" e conta como um dia sem treino em tudo o resto. Vive em
// formulas/ para a app a ler pelo @formulas.

export const MEAL_ONLY_CATEGORY = "so-refeicoes";

export const MEAL_ONLY_DAY_LABEL = "Sem treino planeado";

// deno-lint-ignore no-explicit-any
export function isMealOnlyItem(item: any): boolean {
  return !!item && item.kind === "descanso" && Array.isArray(item.categories) && item.categories.includes(MEAL_ONLY_CATEGORY);
}

export const MEAL_TYPE_ORDER = ["pequeno-almoco", "lanche-manha", "almoco", "lanche", "jantar", "ceia"];

export const MEAL_TYPE_LABEL: Record<string, string> = {
  "pequeno-almoco": "Pequeno-almoço",
  "lanche-manha": "Lanche da manhã",
  "almoco": "Almoço",
  "lanche": "Lanche",
  "jantar": "Jantar",
  "ceia": "Ceia",
};

type MealRow = { tipo: string; texto: string };
// deno-lint-ignore no-explicit-any
type MealMacros = { items: MealRow[]; kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; [k: string]: any };

/** Junta UMA refeição à sugestão que o dia já tem, substituindo só essa.
 *  Os totais do dia deixam de bater certo com a lista — ficam a null, e o
 *  cartão mostra o objetivo do perfil em vez de uma estimativa errada.
 *  Uma sugestão antiga só em texto corrido não tem onde se substituir: a
 *  refeição acrescenta-se ao texto, com o nome. */
export function mergeSingleMeal(
  existing: { meal_suggestion?: string | null; meal_macros?: MealMacros | null } | null,
  tipo: string,
  texto: string,
): { meal_suggestion: string | null; meal_macros: MealMacros | null } {
  const label = MEAL_TYPE_LABEL[tipo] || tipo;
  const items = existing?.meal_macros?.items;
  if (Array.isArray(items) && items.length > 0) {
    const merged = [...items.filter((r) => r?.tipo !== tipo), { tipo, texto }]
      .sort((a, b) => MEAL_TYPE_ORDER.indexOf(a.tipo) - MEAL_TYPE_ORDER.indexOf(b.tipo));
    return {
      meal_suggestion: existing?.meal_suggestion ?? null,
      meal_macros: { items: merged, kcal: null, protein_g: null, carbs_g: null, fat_g: null },
    };
  }
  const text = typeof existing?.meal_suggestion === "string" ? existing.meal_suggestion.trim() : "";
  if (text) {
    return { meal_suggestion: `${text}\n${label}: ${texto}`, meal_macros: existing?.meal_macros ?? null };
  }
  return {
    meal_suggestion: `${label}: ${texto}`,
    meal_macros: { items: [{ tipo, texto }], kcal: null, protein_g: null, carbs_g: null, fat_g: null },
  };
}
