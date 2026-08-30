// IronHealth · coach-daily-summary Edge Function
//
// Resumo diário do Coach para o card rotativo do Início. Ver
// specs/plano-de-treino.md §11 e specs/coach-investigacao.md, Bloco 7
// (forma de entrega 3): recapitulação recente, avisos do dia, sugestão de
// refeição, preparação para o dia seguinte.
//
// GERAÇÃO: 1x por dia, cacheada em coach_daily_summary. Um pedido normal
// (force=false) devolve a linha de hoje se já existir, sem chamar o Gemini —
// mantém o custo proporcional a utilizadores ativos por dia, não a aberturas
// da app. force=true (botão "Atualizar" no card) ignora a cache e regenera.
//
// A chave Gemini vive apenas aqui (secret GEMINI_API_KEY), nunca no cliente.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { normalizeGender, categorizeDistance as sharedCategorizeDistance, MIN_PREP_WEEKS as SHARED_MIN_PREP_WEEKS } from "../_shared/formulas/vocabulary.ts";
import { computeAcwr as sharedComputeAcwr } from "../_shared/formulas/acwr.ts";
import { computeWeightTrend } from "../_shared/formulas/weightTrend.ts";
import { getTaperDays as sharedGetTaperDays } from "../_shared/formulas/taper.ts";
import { assessWeightLossRate as sharedAssessWeightLossRate } from "../_shared/formulas/weightLossRate.ts";
import { computeBMR as sharedComputeBMR, computeTDEE as sharedComputeTDEE } from "../_shared/formulas/tdee.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_TIMEOUT_MS = 40000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Espelha DIETARY_RESTRICTION_INFO em coach-chat/index.ts e analyze-meal/index.ts
// (que por sua vez espelham DIETARY_RESTRICTIONS em src/utils/diet.js).
// Quarta cópia — ver a nota em analyze-meal/index.ts sobre porque cada Edge
// Function precisa da sua própria.
const DIETARY_RESTRICTION_LABELS: Record<string, string> = {
  vegetariano: "Vegetariano",
  vegano: "Vegano",
  sem_lactose: "Sem lactose",
  sem_gluten: "Sem glúten",
};

// Doutrina de nutrição condensada — ver src/coach-knowledge/07-sugestoes-alimentares.md
// (fonte: specs/coach-investigacao.md, Bloco 7). Terceira cópia — mesma razão
// da duplicação de DIETARY_RESTRICTION_LABELS, ver a nota em analyze-meal/index.ts.
const MEAL_DOCTRINE =
  `Doutrina de nutrição a seguir SEMPRE que preencheres meal_suggestion (Bloco 7 da ` +
  `investigação — ACSM/AND 2016, ISSN Nutrient Timing, Burke 2021, INSA/PortFIR):\n` +
  `- Dia leve/descanso: pequeno-almoço 20-25% kcal, almoço 30-35%, lanche 10-15%, jantar ` +
  `25-30%. Proteína 0,3-0,4 g/kg por refeição.\n` +
  `- Dia de treino exigente: hidratos concentram-se peri-treino. Pré (1-3h antes): 1,0-2,0 ` +
  `g/kg hidratos fáceis. Pós (0-2h): 1,0-1,2 g/kg hidratos + 20-40 g proteína.\n` +
  `- Equivalência proteína/100g (INSA/PortFIR): frango/peru peito 30-31, salmão/atum 24-26, ` +
  `ovo 12,5 (≈6g/ovo), skyr/grego 0% 10-12, tofu firme 12-15, lentilhas/grão 8-9.\n` +
  `- Pré-prova 24-48h: arroz branco, massa branca, batata sem pele, banana madura, mel; ` +
  `evita integrais, leguminosas, fritos, picante.`;

// Ciclo de conceitos educativos — 1 por dia, rotação de 21 dias (3 semanas).
// A seleção é determinística: dayOfYear(today) % DAILY_CONCEPTS.length.
// Carol explica o conceito selecionado; o key+title vêm daqui, o body vem do Gemini.
const DAILY_CONCEPTS = [
  { key: "rpe",                 title: "RPE — Esforço Percebido" },
  { key: "acwr",                title: "ACWR — Rácio Carga Aguda:Crónica" },
  { key: "zonas_fc",            title: "Zonas de Frequência Cardíaca" },
  { key: "taper",               title: "Taper — Polimento Pré-Prova" },
  { key: "supercompensacao",    title: "Supercompensação" },
  { key: "regra_10pct",         title: "A Regra dos 10% no Treino" },
  { key: "nutricao_peritreino", title: "Nutrição Peri-Treino" },
  { key: "proteina",            title: "Proteína e Recuperação Muscular" },
  { key: "vo2max",              title: "VO₂max" },
  { key: "economia_corrida",    title: "Economia de Corrida" },
  { key: "cadencia",            title: "Cadência de Corrida" },
  { key: "limiar_latico",       title: "Limiar Lático" },
  { key: "reds",                title: "RED-S — Deficiência Energética no Desporto" },
  { key: "long_run",            title: "Long Run — A Corrida Longa Semanal" },
  { key: "fartlek",             title: "Fartlek" },
  { key: "intervalos",          title: "Treino de Intervalos" },
  { key: "sono",                title: "Sono e Recuperação Desportiva" },
  { key: "periodizacao",        title: "Periodização do Treino" },
  { key: "tdee",                title: "TDEE — Gasto Energético Total Diário" },
  { key: "composicao_corporal", title: "Composição Corporal vs. Peso na Balança" },
  { key: "recuperacao_ativa",   title: "Recuperação Ativa vs. Passiva" },
];

const MEAL_TYPE_LABELS: Record<string, string> = {
  "pequeno-almoco": "Pequeno-almoço",
  "lanche-manha": "Lanche da manhã",
  "almoco": "Almoço",
  "lanche": "Lanche",
  "jantar": "Jantar",
  "ceia": "Ceia",
};

type MealTotals = { calories: number; protein: number; carbs: number; fat: number };

// deno-lint-ignore no-explicit-any
function totalsFromMeal(meal: any): MealTotals {
  return (meal.meal_items || []).reduce(
    // deno-lint-ignore no-explicit-any
    (acc: MealTotals, it: any) => {
      const f = (Number(it?.quantity_grams) || 0) / 100;
      acc.calories += f * (Number(it?.calories_per_100g) || 0);
      acc.protein += f * (Number(it?.protein_per_100g) || 0);
      acc.carbs += f * (Number(it?.carbs_per_100g) || 0);
      acc.fat += f * (Number(it?.fat_per_100g) || 0);
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
}

// Número do dia no ano (0-indexed) — usado para selecionar o conceito diário.
function dayOfYear(isoDate: string): number {
  const d     = new Date(isoDate + "T00:00:00Z");
  const start = new Date(d.getUTCFullYear() + "-01-01T00:00:00Z");
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}
export function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatPlanItemsSummary(items: any[]): string {
  if (!items || items.length === 0) return "Descanso (sem treinos planeados)";
  return items.map((i: any) => {
    if (i.kind === "corrida") {
      const typeStr = i.training_type ? i.training_type : "corrida";
      const distStr = i.target_distance_km ? `${i.target_distance_km} km` : "";
      const durStr = i.target_duration_min ? `${i.target_duration_min} min` : "";
      const details = [typeStr, distStr, durStr].filter(Boolean).join(", ");
      return `Corrida (${details})`;
    }
    if (i.kind === "ginasio") {
      const catStr = i.categories?.length ? i.categories.join("/") : "Geral";
      const durStr = i.target_duration_min ? `${i.target_duration_min} min` : "";
      const details = [catStr, durStr].filter(Boolean).join(", ");
      return `Ginásio (${details})`;
    }
    return "Descanso";
  }).join(" + ");
}

// Cópia local de src/utils/raceViability.js — agora reexporta a tabela de
// ../_shared/formulas/vocabulary.ts (T0), a mesma que o frontend e
// coach-chat usam. Deixou de ser cópia (specs/formulas-checklist.md Fase B).
const VIAB_MIN_WEEKS = SHARED_MIN_PREP_WEEKS;
const viabCatDist = sharedCategorizeDistance;

// O corte do Polimento/Taper delega em ../_shared/formulas/taper.ts (T1) —
// era um `daysUntil <= 14` fixo, igual para qualquer nível/distância/
// prioridade (mesma correção de coach-chat/index.ts — ver
// specs/formulas-checklist.md Fase C).
function getRacePhase(
  daysUntil: number,
  distanceKm: number | null,
  level: string | null,
  racePriority: string | null,
  raceType: string | null,
): string {
  if (daysUntil <= 0) return "Dia da Prova (ou já passou)";
  const cat = viabCatDist(distanceKm);
  let minWeeks = 12; // defeito
  if (cat && level && VIAB_MIN_WEEKS[level] && VIAB_MIN_WEEKS[level][cat] !== null) {
    minWeeks = VIAB_MIN_WEEKS[level][cat] as number;
  }
  const maxDays = minWeeks * 7;
  const taperDays = sharedGetTaperDays(distanceKm, racePriority ?? "a", level ?? "iniciante", raceType ?? "estrada");

  if (daysUntil > maxDays + 14) return `Não iniciado (faltam ${daysUntil - maxDays} dias para o início oficial do plano de ${minWeeks} semanas)`;
  if (daysUntil > maxDays) return `A iniciar em breve (faltam ${daysUntil - maxDays} dias para o início oficial do plano de ${minWeeks} semanas)`;
  if (daysUntil === maxDays) return `Início do plano (arranca hoje o bloco de ${minWeeks} semanas)`;
  if (daysUntil <= taperDays) return `Polimento / Taper (fase final de redução de carga, faltam ${daysUntil} dias, taper de ${taperDays} dias para este nível/distância/prioridade)`;
  return `Em curso / Carga (a meio da preparação, plano de ${minWeeks} semanas)`;
}

// Monta o contexto que vai para o Gemini a partir dos dados já buscados —
// separado da leitura à BD para poder ser testado sem mockar o Supabase.
// deno-lint-ignore no-explicit-any
export function buildDailySummaryContext(params: {
  today: string;
  // deno-lint-ignore no-explicit-any
  profile: any;
  // deno-lint-ignore no-explicit-any
  todayMeals: any[];
  // deno-lint-ignore no-explicit-any
  todayWater: any[];
  // deno-lint-ignore no-explicit-any
  recentRuns: any[];
  // deno-lint-ignore no-explicit-any
  recentGym: any[];
  // deno-lint-ignore no-explicit-any
  planItems: any[];
  // deno-lint-ignore no-explicit-any
  nextRace: any;
  // deno-lint-ignore no-explicit-any
  bodyAssessments?: any[];
  acwr?: { acute_km_per_day: number; chronic_km_per_day: number; ratio: number | null };
  tdee?: number | null;
}) {
  const { today, profile, todayMeals, todayWater, recentRuns, recentGym, planItems, nextRace, bodyAssessments, acwr, tdee } = params;
  const tomorrow = addDaysISO(today, 1);
  const dayAfterTomorrow = addDaysISO(today, 2);

  // deno-lint-ignore no-explicit-any
  const mealTotals = (todayMeals || []).reduce((acc: MealTotals, m: any) => {
    const t = totalsFromMeal(m);
    acc.calories += t.calories; acc.protein += t.protein; acc.carbs += t.carbs; acc.fat += t.fat;
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  // deno-lint-ignore no-explicit-any
  const waterTotal = (todayWater || []).reduce((s: number, w: any) => s + (w.amount_ml || 0), 0);

  const restrictions = (profile?.dietary_restrictions as string[] | null) || [];
  const dietaryContext = restrictions.length || profile?.dietary_notes
    ? {
      restrictions: restrictions.map((k) => DIETARY_RESTRICTION_LABELS[k] || k),
      notes: profile?.dietary_notes || null,
    }
    : null;

  // deno-lint-ignore no-explicit-any
  const todayPlan = (planItems || []).filter((i: any) => i.planned_date === today);
  // deno-lint-ignore no-explicit-any
  const tomorrowPlan = (planItems || []).filter((i: any) => i.planned_date === tomorrow);
  // deno-lint-ignore no-explicit-any
  const dayAfterPlan = (planItems || []).filter((i: any) => i.planned_date === dayAfterTomorrow);

  const planTodayDesc = formatPlanItemsSummary(todayPlan);
  const planTomorrowDesc = formatPlanItemsSummary(tomorrowPlan);

  return {
    today,
    tomorrow,
    objetivos_diarios: {
      calorias: profile?.calorie_goal ?? null,
      proteina_g: profile?.protein_goal ?? null,
      hidratos_g: profile?.carbs_goal ?? null,
      gordura_g: profile?.fat_goal ?? null,
      agua_ml: profile?.water_goal_ml ?? null,
    },
    hoje_ate_agora: {
      // deno-lint-ignore no-explicit-any
      refeicoes_registadas: (todayMeals || []).map((m: any) => MEAL_TYPE_LABELS[m.meal_type] || m.meal_type),
      calorias: Math.round(mealTotals.calories),
      proteina_g: Math.round(mealTotals.protein),
      hidratos_g: Math.round(mealTotals.carbs),
      gordura_g: Math.round(mealTotals.fat),
      agua_ml: waterTotal,
    },
    restricoes_alimentares: dietaryContext,
    perfil: {
      experience_level: profile?.experience_level ?? null,
      weight_kg: profile?.weight_kg ?? null,
      height_cm: profile?.height_cm ?? null,
      gender: profile?.gender ?? null,
    },
    objetivos_diarios_tdee_kcal: tdee ?? null,
    corridas_ultimos_30_dias: recentRuns || [],
    ginasio_ultimos_30_dias: recentGym || [],
    composicao_corporal_30_dias: (bodyAssessments || []).map((a: any) => ({
      date: a.date,
      weight_kg: a.weight_kg,
      body_fat_pct: a.body_fat_pct,
      lean_body_mass_kg: a.lean_body_mass_kg,
    })),
    acwr: acwr ?? null,
    plano_treino_hoje: {
      data: today,
      resumo: planTodayDesc,
      itens: todayPlan,
    },
    plano_treino_amanha: {
      data: tomorrow,
      resumo: planTomorrowDesc,
      itens: tomorrowPlan,
    },
    plano_treino_depois_de_amanha: {
      data: dayAfterTomorrow,
      resumo: formatPlanItemsSummary(dayAfterPlan),
    },
    /* Em qual das quatro situações o atleta está — espelha a doutrina "Modos
       de Acompanhamento" do coach-chat e o planningFrameSection dos analyze-*.
       Sem isto o resumo diário falava de plano e de preparação de prova a quem
       não tem nem uma coisa nem outra. */
    modo_acompanhamento: (planItems || []).length > 0
      ? (nextRace ? "PROVA_COM_PLANO" : "MANUTENCAO_COM_PLANO")
      : (nextRace ? "PROVA_SEM_PLANO" : "LIVRE"),
    proxima_prova: nextRace ? {
      ...nextRace,
      fase_do_plano: getRacePhase(
        Math.round((new Date(nextRace.date + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) / 86400000),
        nextRace.distance_km ?? null,
        nextRace.experience_level || profile?.experience_level || 'iniciante',
        nextRace.race_priority ?? null,
        nextRace.race_type ?? null,
      )
    } : null,
  };
}

function formatWorkoutItemName(i: any): string {
  if (i.kind === "corrida") {
    const typeStr = i.training_type ? i.training_type : "corrida";
    const distStr = i.target_distance_km ? `${i.target_distance_km} km` : "";
    const durStr = i.target_duration_min ? `${i.target_duration_min} min` : "";
    const details = [typeStr, distStr, durStr].filter(Boolean).join(", ");
    return `Corrida (${details})`;
  }
  if (i.kind === "ginasio") {
    const catStr = i.categories?.length ? i.categories.join("/") : "Geral";
    const durStr = i.target_duration_min ? `${i.target_duration_min} min` : "";
    const details = [catStr, durStr].filter(Boolean).join(", ");
    return `Ginásio (${details})`;
  }
  return "Descanso";
}

function buildWarningsMessage(
  todayPlanItems: any[],
  waterTotal: number,
  waterGoal: number | null,
  bodyMetrics?: { hasRedSRisk: boolean; latestBodyFat: number | null; gender: string | null; weeklyWeightChange: number | null; weightLossTooFast?: boolean; weightLossPct?: number | null },
  acwr?: { ratio: number | null },
): string | null {
  const nonRest = (todayPlanItems || []).filter((i: any) => i.kind !== "descanso");
  let msg = "";
  if (nonRest.length > 0) {
    const itemsDesc = nonRest.map(formatWorkoutItemName).join(" e ");
    msg = `Para hoje tens agendado: ${itemsDesc}.`;
  }

  if (waterGoal && waterTotal === 0) {
    // Nunca registou água hoje
    const waterRem = ` Ainda não registaste consumo de água hoje. Começa a hidratar-te desde já.`;
    msg = msg ? `${msg}${waterRem}` : waterRem.trim();
  } else if (waterGoal && waterTotal < waterGoal / 2) {
    // Registou, mas ainda abaixo de metade da meta
    const waterRem = ` Só registaste ${waterTotal} ml. Continua a hidratar-te para atingir a tua meta.`;
    msg = msg ? `${msg}${waterRem}` : waterRem.trim();
  }

  // Alerta RED-S: gordura corporal abaixo do limiar de segurança (ACSM)
  if (bodyMetrics?.hasRedSRisk && bodyMetrics.latestBodyFat !== null) {
    const threshold = isFemale(bodyMetrics.gender) ? "16%" : "8%";
    const redSMsg = ` ⚠️ Percentagem de gordura corporal (${bodyMetrics.latestBodyFat}%) abaixo do limiar de segurança (${threshold}). Risco RED-S — consulta um profissional de saúde.`;
    msg = msg ? `${msg}${redSMsg}` : redSMsg.trim();
  }

  // Alerta de perda de peso rápida — limiar por nível, delega em
  // ../_shared/formulas/weightLossRate.ts (T1). Era um valor absoluto fixo
  // (0,9 kg/semana para toda a gente); a doutrina é sempre relativa à
  // massa corporal e ao nível (ver specs/formulas-checklist.md Fase C).
  if (bodyMetrics?.weightLossTooFast && bodyMetrics.weightLossPct != null) {
    const wlMsg = ` Perda de peso rápida detetada (${Math.abs(bodyMetrics.weeklyWeightChange ?? 0)} kg/semana, ${bodyMetrics.weightLossPct}% do peso). Certifica-te que estás a comer o suficiente para suportar o treino.`;
    msg = msg ? `${msg}${wlMsg}` : wlMsg.trim();
  }

  // Alerta ACWR elevado: carga aguda muito acima da crónica → risco de lesão
  if (acwr?.ratio !== null && acwr?.ratio !== undefined && acwr.ratio > 1.5) {
    const acwrMsg = ` Carga de treino desta semana muito elevada face às últimas 4 semanas (ACWR ${acwr.ratio.toFixed(2)}). Considera um dia de recuperação ativa.`;
    msg = msg ? `${msg}${acwrMsg}` : acwrMsg.trim();
  }

  return msg || null;
}

function buildTomorrowPrepMessage(tomorrowPlanItems: any[]): string | null {
  const nonRest = (tomorrowPlanItems || []).filter((i: any) => i.kind !== "descanso");
  if (nonRest.length === 0) return null;

  const itemsDesc = nonRest.map(formatWorkoutItemName).join(" e ");
  const hasRun = nonRest.some((i: any) => i.kind === "corrida");
  const hasGym = nonRest.some((i: any) => i.kind === "ginasio");

  let tip = "Deixa o equipamento já organizado hoje à noite.";
  if (hasRun && !hasGym) {
    tip = "Deixa o teu equipamento de corrida pronto.";
  } else if (hasGym && !hasRun) {
    tip = "Deixa a tua sacola de treino pronta para o ginásio.";
  }

  return `Amanhã o plano aponta para: ${itemsDesc}. ${tip}`;
}

// ── Métricas calculadas ──────────────────────────────────────────────────────

// ACWR (Acute:Chronic Workload Ratio) — rácio de carga treino aguda/crónica.
// Aguda = média diária dos últimos 7 dias; Crónica = média diária dos últimos 28.
// ACWR > 1,5 indica risco elevado de lesão por sobrecarga (Foster 1998, Gabbett 2016).
// Usa distância de corrida como proxy de carga (simplificação conservadora).
// O ratio delega em ../_shared/formulas/acwr.ts (T1) — a mesma fórmula que
// coach-chat e biEngine.js usam desde a Fase C (specs/formulas-checklist.md).
// A agregação por data fica aqui (impura, específica desta runtime).
function computeACWR(runs: any[], today: string): { acute_km_per_day: number; chronic_km_per_day: number; ratio: number | null } {
  const day7  = addDaysISO(today, -6);   // início da janela aguda (7 dias)
  const day28 = addDaysISO(today, -27);  // início da janela crónica (28 dias)
  const acuteKm   = (runs || []).filter((r: any) => r.date >= day7)
    .reduce((s: number, r: any) => s + (Number(r.distance_km) || 0), 0);
  const chronicKm = (runs || []).filter((r: any) => r.date >= day28)
    .reduce((s: number, r: any) => s + (Number(r.distance_km) || 0), 0);
  const acutePerDay   = acuteKm / 7;
  const chronicPerDay = chronicKm / 28;
  // computeAcwr espera a média SEMANAL crónica (chronicPerDay × 7), não a
  // diária — só o formato de entrada muda, o rácio resultante é o mesmo.
  const { ratio } = sharedComputeAcwr(acuteKm, chronicPerDay * 7);
  return {
    acute_km_per_day:   Math.round(acutePerDay   * 10) / 10,
    chronic_km_per_day: Math.round(chronicPerDay * 10) / 10,
    ratio:              ratio !== null ? Math.round(ratio * 100) / 100 : null,
  };
}

// profiles.gender só grava 'M'/'F' (ver Perfil.jsx) — antes esta função
// comparava com "masculino"/"feminino", que nunca batiam certo, e o TMB
// caía sempre no ramo feminino (ver specs/formulas-checklist.md P0-1).
// normalizeGender() (../_shared/formulas/vocabulary.ts, T0) já aceita os
// valores por extenso por defensividade — Fase B substitui a comparação
// manual daqui pelo vocabulário partilhado (specs/formulas-checklist.md
// Fase B).
export function isFemale(gender: string | null | undefined): boolean {
  return normalizeGender(gender) === "F";
}

// Métricas de composição corporal — RED-S e tendência de peso.
// Limiares RED-S: < 8 % homem, < 16 % mulher (ACSM Position Stand 2007).
// Perda rápida: ritmo sustentado > limiar por nível (Bloco 4.1 #5/4.2 #3 —
// ver ../_shared/formulas/weightLossRate.ts). Era um valor absoluto fixo
// (0,9 kg/semana, igual para toda a gente) — a doutrina é sempre relativa
// à massa corporal e ao nível do atleta, nunca um kg/semana fixo (Fase C,
// specs/formulas-checklist.md).
// weeklyWeightChange delega em ../_shared/formulas/weightTrend.ts (T1,
// EWMA α≈0,25) — antes usava uma regressão só entre o ponto mais recente e
// o mais antigo, ignorando todos os intermédios (Fase C escolheu a EWMA,
// já usada em src/utils/biEngine.js, como fórmula única — ver
// specs/formulas-centralizacao.md §5.3, specs/formulas-checklist.md Fase C).
export function computeBodyMetrics(bodyAssessments: any[], gender: string | null, experienceLevel?: string | null): {
  latestBodyFat: number | null;
  latestWeight: number | null;
  hasRedSRisk: boolean;
  weeklyWeightChange: number | null;
  weightLossTooFast: boolean;
  weightLossPct: number | null;
} {
  if (!bodyAssessments || bodyAssessments.length === 0) {
    return { latestBodyFat: null, latestWeight: null, hasRedSRisk: false, weeklyWeightChange: null, weightLossTooFast: false, weightLossPct: null };
  }
  const latest = bodyAssessments[0]; // mais recente (ORDER BY date DESC)
  const latestBodyFat = latest.body_fat_pct != null ? Math.round(Number(latest.body_fat_pct) * 10) / 10 : null;
  const latestWeight  = latest.weight_kg      != null ? Math.round(Number(latest.weight_kg)      * 10) / 10 : null;
  const redSThreshold = isFemale(gender) ? 16 : 8;
  const hasRedSRisk   = latestBodyFat !== null && latestBodyFat < redSThreshold;

  // computeWeightTrend espera ordem ascendente (mais antigo primeiro) —
  // bodyAssessments vem DESC da query.
  const rawPoints = [...bodyAssessments]
    .filter((a) => a.weight_kg != null && Number(a.weight_kg) > 0 && a.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map((a) => ({ date: String(a.date), weight: Number(a.weight_kg) }));
  const trend = rawPoints.length >= 2 ? computeWeightTrend(rawPoints) : null;
  const weeklyWeightChange = trend ? Math.round(trend.weeklyRate * 10) / 10 : null;

  const lossRate = (trend && latestWeight)
    ? sharedAssessWeightLossRate(trend.weeklyRate, latestWeight, experienceLevel ?? null)
    : null;

  return {
    latestBodyFat, latestWeight, hasRedSRisk, weeklyWeightChange,
    weightLossTooFast: lossRate?.isTooFast ?? false,
    weightLossPct: lossRate ? Math.round(lossRate.lossPct * 10) / 10 : null,
  };
}

// TDEE (GETD) estimado via Mifflin-St Jeor — delega em
// ../_shared/formulas/tdee.ts (T1), fator único ×1,3 + custo do treino
// (Bloco 4.1 #4). Era ×1,55 sem custo de treino nenhum — divergia ~400+
// kcal do coach-chat para o mesmo perfil no mesmo dia (P0-4,
// specs/formulas-checklist.md, resolvido na Fase C).
// weeklyVolumeKm: km corridos nos últimos 7 dias, para somar o custo do
// treino em vez de o ignorar.
export function computeTDEE(profile: any, weeklyVolumeKm: number | null = null): number | null {
  const { weight_kg, height_cm, gender, birth_date } = profile || {};
  if (!weight_kg || !height_cm || !gender || !birth_date) return null;
  const ageMs = new Date().getTime() - new Date(birth_date + "T00:00:00Z").getTime();
  const age   = Math.floor(ageMs / (365.25 * 86400 * 1000));
  const bmr   = sharedComputeBMR(Number(weight_kg), Number(height_cm), age, isFemale(gender));
  return sharedComputeTDEE(bmr, weeklyVolumeKm, Number(weight_kg));
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    recap:            { type: "STRING", nullable: true },
    meal_suggestion:  { type: "STRING", nullable: true },
    // Avaliação de prontidão para a próxima prova (semáforo green/yellow/red).
    // null se não houver prova agendada.
    race_readiness: {
      type: "OBJECT",
      nullable: true,
      properties: {
        race_date: { type: "STRING" },
        level:     { type: "STRING" },  // "green" | "yellow" | "red"
        reason:    { type: "STRING" },
      },
      required: ["race_date", "level", "reason"],
    },
    // Corpo do conceito educativo do dia (key+title são determinísticos, vêm do servidor).
    daily_concept_body: { type: "STRING", nullable: true },
  },
  required: ["recap", "meal_suggestion", "race_readiness", "daily_concept_body"],
};

// deno-lint-ignore no-explicit-any
async function generateSummary(ctx: Record<string, unknown>, geminiKey: string, todayConceptTitle: string): Promise<any> {
  const prompt =
    `És a Carol, Coach de um atleta amador numa app de corrida/fitness/nutrição. Geras quatro ` +
    `conteúdos independentes para o cartão diário do Início. Português (PT), tom direto e próximo, ` +
    `nunca genérico. Devolve null nos campos onde não tens nada útil a dizer.\n\n` +
    `Contexto do atleta:\n${JSON.stringify(ctx, null, 2)}\n\n` +
    `CAMPOS A PREENCHER:\n\n` +
    `1. recap — mensagem do Coach ao atleta (máx. 3 frases). ` +
    `Combina: (a) balanço honesto dos treinos recentes — consistência, volume, tendências; ` +
    `(b) se "proxima_prova" existir, inclui uma observação concreta sobre a preparação para a prova ` +
    `(o que está bem, o que precisa de atenção — usa os dados de ACWR, pace, RPE/exertion, volume); ` +
    `(c) uma sugestão prática para os próximos dias. ` +
    `Lê "fase_do_plano" e calibra o tom. Só preenches se houver histórico — caso contrário null.\n` +
    `ENQUADRAMENTO OBRIGATÓRIO — lê "modo_acompanhamento" antes de escrever:\n` +
    `  - PROVA_COM_PLANO: podes falar de plano, de dias previstos e de fase de preparação.\n` +
    `  - MANUTENCAO_COM_PLANO: há plano mas NÃO há prova. Fala do plano, mas nunca de taper, ` +
    `pico de forma ou contagem decrescente — o critério é consistência e progressão sustentável.\n` +
    `  - PROVA_SEM_PLANO: há prova mas NÃO há plano. NUNCA menciones plano, dias previstos, ` +
    `"desvio" ou "atraso" — não existe plano. A referência é a prova e o histórico.\n` +
    `  - LIVRE: não há prova nem plano. É acompanhamento pontual: o pressuposto é que o atleta ` +
    `quer MANTER hábitos. Comenta o que vês e o que é risco real; NUNCA fales de plano, prova, ` +
    `"desvio" ou "atraso", e não o pressiones para definir objetivos neste cartão (esse convite ` +
    `é da conversa no chat, não daqui).\n\n` +
    `2. meal_suggestion — insight ou estratégia nutricional de valor acrescentado para hoje ` +
    `(ex: timing de ingestão peri-treino, reforço de hidratação cruzada com o treino, ou importância de um macronutriente face à carga agendada). ` +
    `CRÍTICO: NÃO sugiras ingredientes ou pratos específicos (ex: frango grelhado, arroz), pois o atleta já tem um plano alimentar detalhado a cumprir. ` +
    `Foca-te exclusivamente no *porquê* e na estratégia fisiológica. Respeita SEMPRE restrições alimentares do contexto.\n\n` +
    `3. race_readiness — avalia a prontidão para "proxima_prova". Devolve null se não houver prova. ` +
    `Critérios de level:\n` +
    `  "green" — preparação adequada: semanas suficientes, volume ok, ACWR < 1.3, ` +
    `paces (se disponíveis) dentro do intervalo necessário para o target_time, exertion controlada.\n` +
    `  "yellow" — 1-2 alertas: ex. volume ok mas paces longe do alvo, ACWR 1.3-1.5, ` +
    `semanas no limite, exertion elevada mas isolada.\n` +
    `  "red" — múltiplos fatores em risco, ACWR > 1.5, tempo claramente insuficiente, ` +
    `ou exertion cronicamente muito alta.\n` +
    `  "race_date": copia de "proxima_prova.date" (formato yyyy-mm-dd).\n` +
    `  "reason": 1-2 frases com os fatores determinantes, usando números reais do contexto.\n\n` +
    `4. daily_concept_body — explica o conceito "${todayConceptTitle}" em 2-4 frases. ` +
    `Tom de coach que quer que o atleta perceba o porquê, não apenas o quê. ` +
    `Inclui um exemplo prático ou número concreto. Termina com uma dica de aplicação imediata.\n\n` +
    MEAL_DOCTRINE;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: "application/json",
          response_schema: RESPONSE_SCHEMA,
          // Sem thinkingConfig de propósito: o campo para desativar/limitar
          // o raciocínio interno varia de geração para geração e causa 400 em
          // modelos que não o suportam (ex: gemini-flash-latest → 1.x/2.0).
          // Deixar sem o campo funciona em todas as gerações.
        },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini devolveu resposta vazia.");
  // O consumo vai junto com o resultado para a resposta o poder devolver ao
  // cliente, que é quem o regista em app_logs (ver invokeEdgeFunctionWithTimeout
  // em src/lib/supabase.js — regista sempre que a resposta traz `usage`).
  return {
    parsed: JSON.parse(text),
    usage: {
      input_tokens: Number(json?.usageMetadata?.promptTokenCount) || 0,
      output_tokens: Number(json?.usageMetadata?.candidatesTokenCount) || 0,
      cached_tokens: Number(json?.usageMetadata?.cachedContentTokenCount) || 0,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não suportado" }, 405);

  try {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) return jsonResponse({ error: "GEMINI_API_KEY não configurada no servidor" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Sem autorização" }, 401);
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData?.user) return jsonResponse({ error: "Sessão inválida" }, 401);
    const userId = userData.user.id;

    let body: { force?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      // corpo vazio é válido — equivale a force=false
    }
    const force = body?.force === true;

    const today = todayISO();

    // ── Cache: devolve já se existir e não for pedido forçado ──────────
    if (!force) {
      const { data: cached } = await sb
        .from("coach_daily_summary")
        .select("*")
        .eq("user_id", userId)
        .eq("date", today)
        .maybeSingle();
      if (cached) return jsonResponse({ summary: cached, cached: true });
    }

    // ── Contexto: perfil, refeições/água de hoje, atividade recente, plano ──
    const [
      { data: profile },
      { data: todayMeals },
      { data: todayWater },
      { data: recentRuns },
      { data: recentGym },
      { data: acceptedPlans },
      { data: upcomingRaces },
      { data: bodyAssessments },
    ] = await Promise.all([
      sb.from("profiles")
        .select("calorie_goal, protein_goal, carbs_goal, fat_goal, water_goal_ml, dietary_restrictions, dietary_notes, experience_level, weight_kg, height_cm, gender, birth_date, resting_hr_bpm")
        .eq("id", userId).maybeSingle(),
      sb.from("meals").select("meal_type, meal_items(quantity_grams, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g)")
        .eq("user_id", userId).eq("date", today),
      sb.from("water_logs").select("amount_ml").eq("user_id", userId).eq("date", today),
      // Janela alargada a 30 dias para calcular ACWR (precisa de 28 dias de histórico crónico)
      sb.from("runs").select("date, training_type, distance_km, duration_seconds, effort_rpe, details, kind")
        .eq("user_id", userId).gte("date", addDaysISO(today, -29)).lte("date", today).order("date", { ascending: false }),
      sb.from("workout_sessions").select("date, categories, duration_seconds, avg_hr, exertion")
        .eq("user_id", userId).gte("date", addDaysISO(today, -29)).lte("date", today).order("date", { ascending: false }),
      sb.from("coach_plans")
        .select("id, period_start, period_end, created_at")
        .eq("user_id", userId)
        .eq("status", "aceite")
        .order("created_at", { ascending: false }),
      // 3 próximas provas com prioridade e distância para alertas de taper corretos
      sb.from("race_events").select("name, date, race_type, distance_km, race_priority, target_time, target_pace_seconds_per_km")
        .eq("user_id", userId).gte("date", today)
        .order("date", { ascending: true }).limit(3),
      // Composição corporal: 30 dias para RED-S e tendência de peso
      sb.from("body_assessments").select("date, weight_kg, body_fat_pct, lean_body_mass_kg, visceral_fat, body_water_pct")
        .eq("user_id", userId).gte("date", addDaysISO(today, -29)).lte("date", today).order("date", { ascending: false }),
    ]);

    const nextRace = upcomingRaces?.[0] ?? null;

    // Encontra os treinos de todos os planos aceites relevantes para os próximos dias
    const acceptedPlanIds = (acceptedPlans || []).map((p: any) => p.id);
    let planItems: any[] = [];
    if (acceptedPlanIds.length > 0) {
      const { data: fetchedItems } = await sb
        .from("coach_plan_items")
        .select("id, plan_id, planned_date, kind, training_type, categories, target_distance_km, target_duration_min, notes, meal_suggestion, status")
        .eq("user_id", userId)
        .in("plan_id", acceptedPlanIds)
        .in("planned_date", [today, addDaysISO(today, 1), addDaysISO(today, 2)])
        .neq("status", "cancelado");
      planItems = fetchedItems || [];
    }

    const tomorrow = addDaysISO(today, 1);
    const todayPlanItems    = planItems.filter((i: any) => i.planned_date === today);
    const tomorrowPlanItems = planItems.filter((i: any) => i.planned_date === tomorrow);
    const waterTotal = (todayWater || []).reduce((s: number, w: any) => s + (w.amount_ml || 0), 0);

    // Métricas calculadas para alertas determinísticos e contexto do Gemini
    const acwr        = computeACWR(recentRuns || [], today);
    const bodyMetrics = computeBodyMetrics(bodyAssessments || [], profile?.gender ?? null, profile?.experience_level ?? null);
    // acute_km_per_day × 7 = km dos últimos 7 dias, para o TDEE somar o
    // custo do treino (ver computeTDEE acima).
    const tdee        = computeTDEE(profile, acwr.acute_km_per_day * 7);

    const ctx = buildDailySummaryContext({
      today, profile, todayMeals: todayMeals || [], todayWater: todayWater || [],
      recentRuns: recentRuns || [], recentGym: recentGym || [], planItems, nextRace,
      bodyAssessments: bodyAssessments || [], acwr, tdee,
    });

    const warningsMsg = buildWarningsMessage(
      todayPlanItems,
      waterTotal,
      profile?.water_goal_ml ?? null,
      { ...bodyMetrics, gender: profile?.gender ?? null },
      acwr,
    );
    const tomorrowPrepMsg = buildTomorrowPrepMessage(tomorrowPlanItems);

    // Conceito educativo do dia — determinístico, sem risco de repetição a curto prazo
    const todayConcept = DAILY_CONCEPTS[dayOfYear(today) % DAILY_CONCEPTS.length];

    let generated: {
      recap: string | null;
      meal_suggestion: string | null;
      race_readiness: { race_date: string; level: string; reason: string } | null;
      daily_concept_body: string | null;
    } = { recap: null, meal_suggestion: null, race_readiness: null, daily_concept_body: null };

    // Fica a null quando o Gemini falha ou quando a resposta vem da cache —
    // nesses casos não houve chamada, e não há consumo para registar.
    let usage: { input_tokens: number; output_tokens: number } | null = null;

    try {
      const result = await generateSummary(ctx, geminiKey, todayConcept.title);
      generated = result.parsed;
      usage = result.usage;
    } catch (e) {
      console.error("coach-daily-summary generation failed:", e);
      // Se Gemini falhar, continuamos com as mensagens determinísticas sem crashar
    }

    const row = {
      user_id: userId,
      date: today,
      recap: generated.recap || null,
      warnings: warningsMsg,
      meal_suggestion: generated.meal_suggestion || null,
      tomorrow_prep: tomorrowPrepMsg,
      race_readiness: generated.race_readiness || null,
      daily_concept: generated.daily_concept_body
        ? { key: todayConcept.key, title: todayConcept.title, body: generated.daily_concept_body }
        : null,
      generated_at: new Date().toISOString(),
    };

    const { data: saved, error: saveError } = await sb
      .from("coach_daily_summary")
      .upsert(row, { onConflict: "user_id,date" })
      .select()
      .single();
    if (saveError) return jsonResponse({ error: `Falha a gravar resumo: ${saveError.message}` }, 500);

    return jsonResponse({ summary: saved, cached: false, usage });
  } catch (e) {
    console.error("Erro inesperado:", e);
    return jsonResponse({ error: "Erro inesperado no servidor" }, 500);
  }
});
