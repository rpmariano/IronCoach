import { computeItemNutrients, computeMealNutrients } from '@formulas/mealNutrients.ts';

/* Cores das macros. Até 2026-10-04 eram as do mock "Dashboard · Nutrição"
   (calorias e hidratos com o mesmo violeta do módulo, proteína no rosa do
   Corpo, gordura no ciano da Corrida — cores com outro significado). Passam
   aos neon das macros (--neon-*, bug #51), os mesmos dos anéis da vista Dia e
   do mock-up aprovado "Evolução · Nutrição por período". Em hexadecimal porque
   quem desenha em <canvas> não resolve variáveis CSS — são os valores de
   tokens/colors.css. */
export const MACROS = [
  { key: 'calories', goalKey: 'calorie_goal', label: 'Calorias', unit: 'kcal', color: '#ff3d9a' },
  { key: 'protein', goalKey: 'protein_goal', label: 'Proteína', unit: 'g', color: '#9f6bff' },
  { key: 'carbs', goalKey: 'carbs_goal', label: 'Hidratos', unit: 'g', color: '#b8f53d' },
  { key: 'fat', goalKey: 'fat_goal', label: 'Gordura', unit: 'g', color: '#2ee6ff' },
];

/* As cinco linhas do resumo da Evolução (fase 4, 2026-10-04), por ordem:
   nome, unidade, nome por extenso (leitor de ecrã), cor (token) e se o
   objetivo tem teto. A régua em si (90–115%, proteína e água sem teto, N7)
   vive em @formulas/nutritionPeriod.ts (classifyMacroDay); `ceiling` aqui é
   só para desenhar a zona 90–115% ou a linha "90% ou mais". */
export const NUTRIENT_META = {
  calories: { key: 'calories', label: 'Calorias', unit: 'kcal', long: 'quilocalorias', color: 'var(--neon-kcal)', ceiling: true },
  protein: { key: 'protein', label: 'Proteína', unit: 'g', long: 'gramas de proteína', color: 'var(--neon-proteina)', ceiling: false },
  carbs: { key: 'carbs', label: 'Hidratos', unit: 'g', long: 'gramas de hidratos', color: 'var(--neon-hidratos)', ceiling: true },
  fat: { key: 'fat', label: 'Gordura', unit: 'g', long: 'gramas de gordura', color: 'var(--neon-gordura)', ceiling: true },
  water: { key: 'water', label: 'Água', unit: 'ml', long: 'mililitros de água', color: 'var(--neon-agua)', ceiling: false },
};
export const NUTRIENT_ORDER = ['calories', 'protein', 'carbs', 'fat', 'water'];

/* Estado de um dia/valor contra o objetivo (Dentro/Abaixo/Acima/Sem registo),
   em cor: verde dentro, coral fora (nunca âmbar), cinzento sem registo — a
   mesma régua de cor da vista Dia. `bg`/`bd` são as tintas do mapa de calor. */
export const DAY_STATUS_STYLE = {
  ok: { color: 'var(--ok)', bg: 'var(--tint-ok-bg)', bd: 'var(--tint-ok-bd)', word: 'Dentro', long: 'dentro do objetivo' },
  below: { color: 'var(--warn)', bg: 'var(--tint-warn-bg)', bd: 'var(--tint-warn-bd)', word: 'Abaixo', long: 'abaixo do objetivo' },
  // Acima leva riscas: com o mesmo coral do Abaixo, a forma distingue-os sem depender da cor.
  above: {
    color: 'var(--warn)',
    bg: 'repeating-linear-gradient(45deg, rgba(251,124,77,.24) 0 3px, rgba(251,124,77,.08) 3px 7px)',
    bd: 'var(--tint-warn-bd)',
    word: 'Acima',
    long: 'acima do objetivo',
  },
  none: { color: 'var(--text-4)', bg: 'transparent', bd: 'rgba(255,255,255,.18)', word: 'Sem registo', long: 'sem registo' },
};

/* Micronutrientes — `unit` por dia na Evolução ("g/dia"). `note` só no sódio:
   o limite de repouso não vale para quem transpira a treinar (mock-up). */
export const MICROS = [
  { key: 'fiber', label: 'Fibra', unit: 'g' },
  { key: 'sugar', label: 'Açúcar', unit: 'g' },
  { key: 'sodium', label: 'Sódio', unit: 'mg', note: 'Em repouso, menos de 2 000 mg. Quem treina e transpira perde sódio — não é um limite para dias de treino.' },
  { key: 'iron_mg', label: 'Ferro', unit: 'mg' },
  { key: 'calcium_mg', label: 'Cálcio', unit: 'mg' },
  { key: 'vitamin_c_mg', label: 'Vit. C', unit: 'mg' },
  { key: 'potassium_mg', label: 'Potássio', unit: 'mg' },
];

// rangeBounds() removida (Fase E) — sem consumidor fora de rangeTotals(),
// que passou a delegar em @formulas/micronutrientTotals.ts.

// Delegam em @formulas/mealNutrients.ts (T1.5) — única implementação,
// partilhada com a Carol (specs/formulas-checklist.md Fase E). Ganharam
// ferro/cálcio/vitamina C/potássio no resultado (antes nunca calculados,
// mesmo com as colunas *_per_100g gravadas — bug corrigido nessa migração);
// os consumidores existentes só liam calories/protein/carbs/fat e não
// quebram com as chaves novas.
export function itemNutrients(item) {
  return computeItemNutrients(item);
}

export function mealNutrients(meal) {
  return computeMealNutrients(meal);
}

/* Um dia "de carga" — tem um item do plano de treino de corrida longa nesse
   dia (concluído ou ainda pendente). A doutrina completa (specs/
   coach-investigacao.md, Bloco 4.1) calcula a meta exata por g/kg de peso e
   por volume — depende do motor de doutrina em src/coach-knowledge/, ainda
   por construir. Este é o heurístico mínimo que já resolve o essencial: não
   marcar 'over' um dia em que o atleta comeu mais porque tinha um longão do
   plano nesse dia — o que seria penalizar visualmente o que o próprio coach
   recomendou. Considera só o próprio dia; a extensão à véspera (carga de
   hidratos pré-longo) fica para quando o motor de doutrina existir. */
export function planAffectsDay(planItems, dateStr) {
  return (planItems || []).some(item => {
    if (item.status === 'cancelado') return false;
    if (item.kind !== 'corrida') return false;
    const relevantDate = item.status === 'concluido' ? item.actual_date : item.planned_date;
    if (relevantDate !== dateStr) return false;
    const isLong = item.training_type === 'longo' || (Number(item.target_distance_km) || 0) >= 15;
    return isLong;
  });
}

/* Estado nutricional de um dia no calendário: 'none' sem refeições, 'ok' com as
   metas cumpridas, 'over' caso contrário. A proteína é a única macro em que o
   problema é ficar ABAIXO da meta — nas outras três o problema é excedê-la.
   `planItems` é opcional — sem ele, o comportamento é exatamente o de antes. */
export function dayNutrientStatus(meals, dateStr, profile, planItems) {
  const dayMeals = (meals || []).filter(m => m.date === dateStr);
  if (dayMeals.length === 0) return 'none';

  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  dayMeals.forEach(meal => {
    const n = mealNutrients(meal);
    totals.calories += n.calories;
    totals.protein += n.protein;
    totals.carbs += n.carbs;
    totals.fat += n.fat;
  });

  const p = profile || {};
  const highLoadDay = planAffectsDay(planItems, dateStr);
  // Sem meta definida, a macro nunca conta como excedida (Infinity). Num dia
  // de longão do plano, calorias e hidratos também nunca contam como
  // excedidos — ver planAffectsDay acima.
  const exceededCapped = ['calories', 'carbs', 'fat'].some(key => {
    if (highLoadDay && (key === 'calories' || key === 'carbs')) return false;
    const goalKey = MACROS.find(m => m.key === key).goalKey;
    return totals[key] > (Number(p[goalKey]) || Infinity);
  });
  const proteinMet = totals.protein >= (Number(p.protein_goal) || 0);
  return (!exceededCapped && proteinMet) ? 'ok' : 'over';
}

// Objetivo de água atingido nesse dia — soma dos registos >= meta diária.
export function dayWaterGoalMet(waterLogs, dateStr, profile) {
  const dayLogs = (waterLogs || []).filter(w => w.date === dateStr);
  if (dayLogs.length === 0) return false;
  const total = dayLogs.reduce((sum, w) => sum + (Number(w.amount_ml) || 0), 0);
  return total >= (Number(profile?.water_goal_ml) || 2000);
}

/* rangeTotals() removida (fase 4 da Evolução, 2026-10-04, erro N2): só o
   NutritionDashboard a usava, para os micronutrientes de qualquer período —
   e dava a SOMA do mês civil em Trimestre/6 Meses/Ano. A Evolução passa a
   micronutrientAverages (@formulas/nutritionPeriod.ts), média por dia do
   período certo. */

export function mealTypeLabel(type) {
  const labels = {
    'pequeno-almoco': 'Pequeno-Almoço',
    'lanche-manha': 'Lanche da Manhã',
    'almoco': 'Almoço',
    'lanche': 'Lanche da Tarde',
    'jantar': 'Jantar',
    'ceia': 'Ceia'
  };
  return labels[type] || 'Refeição';
}
