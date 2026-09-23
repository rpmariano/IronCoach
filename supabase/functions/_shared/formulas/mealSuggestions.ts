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

/** O texto do dia a partir da lista, uma linha "Rótulo: texto" por refeição.
 *  É o que a Carol e o resumo do dia leem (só leem meal_suggestion): sem o
 *  refazer, ela via o jantar antigo depois de o atleta o ter trocado
 *  (revisão pré-deploy de 2026-09-23). */
export function mealTextFromItems(items: MealRow[]): string {
  return items.map((r) => `${MEAL_TYPE_LABEL[r.tipo] || r.tipo}: ${r.texto}`).join("\n");
}

// "Almoço: …", "Lanche da tarde: …" — o que um texto corrido antigo usa para
// separar refeições (o mesmo corte que parseMealSuggestion faz na app).
const LABEL_ALIASES: Array<[RegExp, string]> = [
  [/^pequeno-almo[cç]o$/i, "pequeno-almoco"],
  [/^lanche (da manh[ãa]|pr[ée]-treino)$/i, "lanche-manha"],
  [/^almo[cç]o$/i, "almoco"],
  [/^lanche( da tarde| p[óo]s-treino)?$/i, "lanche"],
  [/^jantar$/i, "jantar"],
  [/^ceia$/i, "ceia"],
];
const LABEL_SPLIT = /(Pequeno-almo[cç]o|Lanche da manh[ãa]|Lanche da tarde|Lanche pr[ée]-treino|Lanche p[óo]s-treino|Lanche|Almo[cç]o|Jantar|Ceia):\s*/gi;

function tipoOfLabel(label: string): string | null {
  const hit = LABEL_ALIASES.find(([re]) => re.test(label.trim()));
  return hit ? hit[1] : null;
}

/** Junta UMA refeição à sugestão que o dia já tem, substituindo só essa.
 *  - Com lista (meal_macros.items): troca-se a entrada desse tipo e o texto
 *    refaz-se a partir da lista. Os totais do dia deixam de bater certo e
 *    ficam a null — o cartão mostra o objetivo do perfil.
 *  - Só com texto antigo: troca-se o troço dessa refeição ("Jantar: …") se
 *    lá estiver, senão acrescenta-se — nunca ficam dois "Jantar:".
 *  - Sem nada: nasce uma lista com essa refeição. */
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
      meal_suggestion: mealTextFromItems(merged),
      meal_macros: { items: merged, kcal: null, protein_g: null, carbs_g: null, fat_g: null },
    };
  }
  const text = typeof existing?.meal_suggestion === "string" ? existing.meal_suggestion.trim() : "";
  if (text) {
    // Parte o texto nos rótulos: [antes, rótulo1, corpo1, rótulo2, corpo2, …].
    const parts = text.split(LABEL_SPLIT);
    const head = parts[0].trim();
    const segs: Array<{ label: string; body: string }> = [];
    for (let i = 1; i < parts.length; i += 2) segs.push({ label: parts[i], body: (parts[i + 1] || "").trim() });
    const idx = segs.findIndex((sg) => tipoOfLabel(sg.label) === tipo);
    if (idx >= 0) {
      // A primeira ocorrência troca-se; outras com o mesmo tipo (um texto
      // antigo com "Lanche da tarde" e "Lanche") saem.
      const kept = segs
        .map((sg, i) => (i === idx ? { label, body: texto } : sg))
        .filter((sg, i) => i === idx || tipoOfLabel(sg.label) !== tipo);
      const rebuilt = [head, ...kept.map((sg) => `${sg.label}: ${sg.body}`)].filter(Boolean).join("\n");
      return { meal_suggestion: rebuilt, meal_macros: existing?.meal_macros ?? null };
    }
    return { meal_suggestion: `${text}\n${label}: ${texto}`, meal_macros: existing?.meal_macros ?? null };
  }
  return {
    meal_suggestion: `${label}: ${texto}`,
    meal_macros: { items: [{ tipo, texto }], kcal: null, protein_g: null, carbs_g: null, fat_g: null },
  };
}
