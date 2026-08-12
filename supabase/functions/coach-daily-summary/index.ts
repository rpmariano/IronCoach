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
  return new Date().toISOString().slice(0, 10);
}
export function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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
}) {
  const { today, profile, todayMeals, todayWater, recentRuns, recentGym, planItems, nextRace } = params;
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

  return {
    today,
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
    nivel_experiencia: profile?.experience_level ?? null,
    corridas_ultimos_7_dias: recentRuns || [],
    ginasio_ultimos_7_dias: recentGym || [],
    // Cada item do plano é devolvido com o seu próprio planned_date, e a lista
    // fica organizada em três baldes rotulados (hoje / amanhã / depois de
    // amanhã) para dar ao modelo um dia extra de visibilidade sem risco de
    // conflação — cada balde só contém itens cujo planned_date bate certo com
    // esse dia específico. O prompt reforça que "amanhã" (tomorrow_prep) usa
    // EXCLUSIVAMENTE o balde plano_treino_amanha_*, nunca o de depois de
    // amanhã, mesmo que ambos venham preenchidos.
    // deno-lint-ignore no-explicit-any
    [`plano_treino_hoje_${today}`]: (planItems || []).filter((i: any) => i.planned_date === today),
    // deno-lint-ignore no-explicit-any
    [`plano_treino_amanha_${tomorrow}`]: (planItems || []).filter((i: any) => i.planned_date === tomorrow),
    // deno-lint-ignore no-explicit-any
    [`plano_treino_depois_de_amanha_${dayAfterTomorrow}`]: (planItems || []).filter((i: any) => i.planned_date === dayAfterTomorrow),
    proxima_prova: nextRace || null,
  };
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    recap: { type: "STRING", nullable: true },
    warnings: { type: "STRING", nullable: true },
    meal_suggestion: { type: "STRING", nullable: true },
    tomorrow_prep: { type: "STRING", nullable: true },
  },
  required: ["recap", "warnings", "meal_suggestion", "tomorrow_prep"],
};

// deno-lint-ignore no-explicit-any
async function generateSummary(ctx: Record<string, unknown>, geminiKey: string): Promise<any> {
  const prompt =
    `És o Coach de um atleta amador numa app de corrida/fitness/nutrição. Vais gerar até ` +
    `QUATRO mensagens curtas (1-2 frases cada) para um cartão rotativo no ecrã Início. Cada ` +
    `uma é INDEPENDENTE — devolve null nas que não tiveres nada de útil para dizer, em vez de ` +
    `inventar conteúdo. Português (PT), tom direto e próximo, nunca genérico.\n\n` +
    `Contexto do atleta:\n${JSON.stringify(ctx, null, 2)}\n\n` +
    `CAMPOS:\n` +
    `- recap: recapitulação dos últimos dias (treinos feitos, consistência, uma tendência ` +
    `notável). Só se houver histórico recente suficiente para dizer algo real.\n` +
    `- warnings: avisos para HOJE — algo que precisa de atenção hoje (hidratação, treino já ` +
    `atrasado, proximidade de uma prova). null se não houver nada de urgente.\n` +
    `- meal_suggestion: sugestão alimentar para hoje, educativa e nunca prescritiva ("considera", ` +
    `não "tens de"). Respeita SEMPRE as restrições alimentares indicadas no contexto — nunca ` +
    `sugiras o que elas proíbem. Se houver sinais de alarme no contexto, não sugiras ementas: ` +
    `levanta a preocupação em vez disso (mesmo campo).\n` +
    `- tomorrow_prep: preparação para amanhã, só se houver algo concreto a preparar (treino ` +
    `planeado, prova próxima, carga de hidratos). null em dias sem nada de especial amanhã.\n` +
    `  REGRA ABSOLUTA: usa EXCLUSIVAMENTE o campo plano_treino_amanha_* para descrever o que ` +
    `acontece amanhã. NÃO uses corridas_ultimos_7_dias nem ginasio_ultimos_7_dias para inferir ` +
    `treinos futuros — esses campos são histórico, não plano. Se plano_treino_amanha_* estiver ` +
    `vazio ou só tiver descanso, devolve null neste campo.\n` +
    `  O campo plano_treino_depois_de_amanha_* é FORNECIDO SÓ PARA CONTEXTO — mostra o que vem ` +
    `a seguir a amanhã, para poderes mencionar en passant algo tipo "e depois de amanhã tens ` +
    `intervalos, por isso hoje é bom dia para descansar bem". NUNCA descreve os itens desse campo ` +
    `como fazendo parte de amanhã, e NUNCA combines os dois campos numa frase que sugira que ` +
    `acontecem no mesmo dia (ex.: nunca digas "amanhã tens X e Y" se X vem de plano_treino_amanha_* ` +
    `e Y vem de plano_treino_depois_de_amanha_* — são dias diferentes, sê explícito sobre qual dia ` +
    `é qual se os mencionares os dois).\n\n` +
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
          thinkingConfig: { thinkingLevel: "minimal" },
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
  return JSON.parse(text);
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
      { data: planItems },
      { data: nextRace },
    ] = await Promise.all([
      sb.from("profiles")
        .select("calorie_goal, protein_goal, carbs_goal, fat_goal, water_goal_ml, dietary_restrictions, dietary_notes, experience_level")
        .eq("id", userId).maybeSingle(),
      sb.from("meals").select("meal_type, meal_items(quantity_grams, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g)")
        .eq("user_id", userId).eq("date", today),
      sb.from("water_logs").select("amount_ml").eq("user_id", userId).eq("date", today),
      sb.from("runs").select("date, training_type, distance_km, duration_seconds")
        .eq("user_id", userId).gte("date", addDaysISO(today, -6)).lte("date", today).order("date", { ascending: false }),
      sb.from("workout_sessions").select("date, categories, duration_seconds")
        .eq("user_id", userId).gte("date", addDaysISO(today, -6)).lte("date", today).order("date", { ascending: false }),
      // D+2 incluído só para dar ao modelo visibilidade do que vem a seguir —
      // NUNCA deve ser tratado como parte de "amanhã" (ver regra no prompt).
      sb.from("coach_plan_items")
        .select("planned_date, kind, training_type, categories, target_distance_km, target_duration_min, notes, meal_suggestion, status")
        .eq("user_id", userId).in("planned_date", [today, addDaysISO(today, 1), addDaysISO(today, 2)]).neq("status", "cancelado"),
      sb.from("race_events").select("name, date, race_type").eq("user_id", userId).gte("date", today)
        .order("date", { ascending: true }).limit(1).maybeSingle(),
    ]);

    const ctx = buildDailySummaryContext({
      today, profile, todayMeals: todayMeals || [], todayWater: todayWater || [],
      recentRuns: recentRuns || [], recentGym: recentGym || [], planItems: planItems || [], nextRace,
    });

    let generated: { recap: string | null; warnings: string | null; meal_suggestion: string | null; tomorrow_prep: string | null };
    try {
      generated = await generateSummary(ctx, geminiKey);
    } catch (e) {
      console.error("coach-daily-summary generation failed:", e);
      return jsonResponse({ error: "Não foi possível gerar o resumo. Tenta novamente." }, 502);
    }

    const row = {
      user_id: userId,
      date: today,
      recap: generated.recap || null,
      warnings: generated.warnings || null,
      meal_suggestion: generated.meal_suggestion || null,
      tomorrow_prep: generated.tomorrow_prep || null,
      generated_at: new Date().toISOString(),
    };

    const { data: saved, error: saveError } = await sb
      .from("coach_daily_summary")
      .upsert(row, { onConflict: "user_id,date" })
      .select()
      .single();
    if (saveError) return jsonResponse({ error: `Falha a gravar resumo: ${saveError.message}` }, 500);

    return jsonResponse({ summary: saved, cached: false });
  } catch (e) {
    console.error("Erro inesperado:", e);
    return jsonResponse({ error: "Erro inesperado no servidor" }, 500);
  }
});
