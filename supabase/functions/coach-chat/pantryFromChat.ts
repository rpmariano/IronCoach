// Embalagem no chat → Despensa (decisão 17 de specs/plano-registo-plano-coach.md
// §6): o atleta manda a foto de uma embalagem, a Carol lê o rótulo e guarda o
// alimento na Despensa, e diz-lho na resposta — como já faz com um rótulo
// numa refeição (analyze-meal/pantry.ts, nextFoodRow com from_label).
//
// Fora do index.ts para se poder testar: o index arranca o servidor ao ser
// importado. A Carol já VÊ a imagem (vai no pedido ao Gemini), por isso lê o
// rótulo ela mesma e passa os valores à ferramenta — uma só chamada ao modelo,
// sem segunda leitura. O que esta função faz é a parte que o modelo não pode
// decidir: validar, não escrever por cima do que o atleta ajustou e gravar.

import { foodKey } from "../_shared/formulas/foodKey.ts";
import { FOOD_SELECT, microFromModel, nextFoodRow, type PantryFood } from "../analyze-meal/pantry.ts";

const MICROS = [
  "fiber_per_100g", "sugar_per_100g", "sodium_per_100g", "iron_mg_per_100g",
  "calcium_mg_per_100g", "vitamin_c_mg_per_100g", "potassium_mg_per_100g",
] as const;

const microProp = (what: string) => ({ type: "NUMBER", description: what });

export const SAVE_PANTRY_FOOD_TOOL = {
  name: "save_pantry_food",
  description:
    "Guarda na Despensa do atleta o produto de UMA embalagem cuja tabela nutricional vês numa " +
    "das fotos que ele enviou nesta mensagem. Chama uma vez por produto (no máximo 3). " +
    "Os valores são os da tabela, POR 100 g (ou por 100 ml, para líquidos), tal como estão " +
    "escritos — nunca estimados nem de memória. Se a tabela não estiver legível, NÃO chames: " +
    "pede-lhe uma foto mais nítida do rótulo. NÃO uses para fotos de comida já preparada. " +
    "Depois de guardares, diz-lhe numa frase o que ficou na Despensa (nome, kcal e proteína " +
    "por 100 g); se o resultado disser que já lá estava ajustado por ele, diz-lhe isso em vez de " +
    "dizeres que guardaste.",
  parameters: {
    type: "OBJECT",
    properties: {
      name: { type: "STRING", description: "O nome comercial do produto, como está na embalagem (marca + produto), até 120 caracteres." },
      portion_grams: { type: "NUMBER", description: "A porção indicada na embalagem, em gramas (ex.: 30 para uma porção de 30 g). Omite se não houver." },
      portion_label: { type: "STRING", description: "O nome da porção, se for uma unidade (ex.: \"1 barra\", \"1 iogurte\"). Omite se não houver." },
      calories_per_100g: { type: "NUMBER", description: "kcal por 100 g." },
      protein_per_100g: { type: "NUMBER", description: "Proteínas por 100 g, em gramas." },
      carbs_per_100g: { type: "NUMBER", description: "Hidratos de carbono por 100 g, em gramas." },
      fat_per_100g: { type: "NUMBER", description: "Lípidos (gorduras) por 100 g, em gramas." },
      fiber_per_100g: microProp("Fibra por 100 g, em gramas — só se estiver na tabela."),
      sugar_per_100g: microProp("Açúcares por 100 g, em gramas — só se estiver na tabela."),
      sodium_per_100g: microProp("Sódio por 100 g, em miligramas (se a tabela der sal em gramas, sódio = sal × 400) — só se estiver na tabela."),
    },
    required: ["name", "calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g"],
  },
};

const finiteNonNeg = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

const round1 = (n: number) => Math.round(n * 10) / 10;

// deno-lint-ignore no-explicit-any
export async function runSavePantryFood(sb: any, userId: string, args: any, nowISO = new Date().toISOString()): Promise<string> {
  const name = typeof args?.name === "string" ? args.name.trim().slice(0, 120) : "";
  const key = foodKey(name);
  if (!key) return "Erro: falta o nome do produto. Não guardes sem ele.";

  const kcal = finiteNonNeg(args?.calories_per_100g);
  const protein = finiteNonNeg(args?.protein_per_100g);
  const carbs = finiteNonNeg(args?.carbs_per_100g);
  const fat = finiteNonNeg(args?.fat_per_100g);
  if (kcal === null || protein === null || carbs === null || fat === null) {
    return "Erro: faltam os valores por 100 g (calorias, proteínas, hidratos e gorduras). Se a tabela não os mostra, " +
      "não guardes nada e pede ao atleta uma foto mais nítida do rótulo.";
  }
  // 100 g não têm mais de 100 g de macros nem mais de ~900 kcal: fora disto leu-se mal.
  if (kcal > 900 || protein + carbs + fat > 105) {
    return "Erro: estes valores não batem certo por 100 g (releste a tabela por porção?). " +
      "Não guardes; confirma na imagem ou pede ao atleta uma foto mais nítida.";
  }

  const { data: existing, error: readErr } = await sb
    .from("athlete_foods")
    .select(FOOD_SELECT)
    .eq("user_id", userId)
    .eq("name_key", key)
    .maybeSingle();
  if (readErr) return `Erro a consultar a Despensa: ${readErr.message}. Não digas ao atleta que guardaste.`;
  const prev = (existing ?? null) as PantryFood | null;

  // Ajustado à mão: nem um rótulo lhe reescreve os valores (athlete_foods.edited_by_athlete).
  if (prev?.edited_by_athlete && prev.in_pantry) {
    return `«${prev.name}» já está na Despensa e foi ajustado por ele — não mexi nos valores. ` +
      "Diz-lho; se quiser mudá-los, abre o alimento na Despensa (Armário > Alimentação).";
  }

  const portionGrams = finiteNonNeg(args?.portion_grams);
  const item: Record<string, unknown> = {
    name,
    quantity_grams: portionGrams && portionGrams > 0 ? portionGrams : null,
    from_label: true,
    calories_per_100g: kcal,
    protein_per_100g: protein,
    carbs_per_100g: carbs,
    fat_per_100g: fat,
  };
  for (const k of MICROS) item[k] = microFromModel(args?.[k]);

  const row = nextFoodRow(prev, item, userId, nowISO);
  if (!row) return "Erro: o nome não serve como chave. Não guardes.";
  // Não veio de uma refeição: não conta como "apareceu numa refeição".
  row.times_seen = prev?.times_seen ?? 0;
  row.in_pantry = true;
  row.source = "rotulo";
  const label = typeof args?.portion_label === "string" ? args.portion_label.trim().slice(0, 40) : "";
  if (label && !prev?.portion_label) row.portion_label = label;

  const { error: upErr } = await sb.from("athlete_foods").upsert(row, { onConflict: "user_id,name_key" });
  if (upErr) return `Erro ao guardar na Despensa: ${upErr.message}. Não digas ao atleta que guardaste.`;

  const verb = prev?.in_pantry ? "atualizado" : "guardado";
  return `Produto ${verb} na Despensa: «${row.name}» — ${round1(kcal)} kcal, ${round1(protein)} g de proteína, ` +
    `${round1(carbs)} g de hidratos e ${round1(fat)} g de gordura por 100 g (do rótulo). ` +
    "Diz ao atleta numa frase curta o que ficou na Despensa.";
}
