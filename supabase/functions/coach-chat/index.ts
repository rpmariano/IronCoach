// IronHealth · coach-chat Edge Function
// Recebe uma mensagem do utilizador, constrói o contexto completo
// (role de sistema + perfil do utilizador + dados nutricionais de hoje +
// histórico de conversa) e chama o Gemini. Guarda pergunta e resposta
// na tabela coach_messages para persistência entre sessões.

import { createClient } from "jsr:@supabase/supabase-js@2";

// Alias que segue sempre o modelo flash estável mais recente — evita 404s
// quando a Google descontinua uma versão fixa (confirmado em produção: fixar
// em "gemini-2.5-flash" resultou em 404 "no longer available to new users"
// dias depois). O preço de usar o alias é que os parâmetros aceites por
// generationConfig podem mudar de geração para geração (ver thinkingConfig
// abaixo) — por isso esta função evita depender de campos específicos de uma
// geração de modelo.
const GEMINI_MODEL = "gemini-flash-latest";
const MAX_HISTORY   = 30;   // mensagens mais recentes enviadas ao Gemini
const MAX_MSG_LEN   = 2000; // caracteres máximos por mensagem
const MAX_TOOL_ROUNDS = 4;  // idas-e-voltas de function calling antes de forçar resposta final
// Tempo máximo por chamada ao Gemini antes de desistir e tentar mais uma vez.
// A API do Gemini (sobretudo no tier gratuito) tem latência muito variável —
// isto evita que uma chamada presa arraste a função até ao limite rígido da
// plataforma (~150s), o que produz um erro genérico e ilegível no cliente.
const GEMINI_TIMEOUT_MS = 40000;
const GEMINI_RETRIES = 1; // repetições automáticas após timeout, antes de desistir de vez

const NUTRITION_TOOL = {
  name: "get_nutrition_history",
  description:
    "Obtém o resumo nutricional diário (calorias, proteína, hidratos, gordura, nº refeições) " +
    "do utilizador para um intervalo de datas específico. Usa esta função sempre que a pergunta " +
    "envolva um período fora dos últimos 7 dias já fornecidos no contexto (ex: um mês passado, " +
    "uma data concreta, \"desde o início do ano\").",
  parameters: {
    type: "OBJECT",
    properties: {
      start_date: { type: "STRING", description: "Data de início, formato YYYY-MM-DD" },
      end_date: { type: "STRING", description: "Data de fim (inclusive), formato YYYY-MM-DD" },
    },
    required: ["start_date", "end_date"],
  },
};

const GYM_TOOL = {
  name: "get_gym_history",
  description:
    "Obtém os treinos concluídos do utilizador para um intervalo de datas específico. " +
    "Cada sessão é de um de dois tipos: treino de força (com exercícios, séries, volume " +
    "total em kg e grupos musculares trabalhados) ou aula de grupo/cardio marcada com " +
    "\"(aula)\" — ex.: HIIT, RPM, pilates — que NÃO tem séries nem volume, sendo descrita " +
    "por duração, calorias e frequência cardíaca. Uma aula sem volume é um treino a sério, " +
    "não um treino falhado. Ambos os tipos podem trazer duração, calorias, frequência " +
    "cardíaca e esforço percebido (1-10). Usa esta função sempre que a pergunta envolva " +
    "treinos fora dos últimos 30 dias já fornecidos no contexto.",
  parameters: {
    type: "OBJECT",
    properties: {
      start_date: { type: "STRING", description: "Data de início, formato YYYY-MM-DD" },
      end_date: { type: "STRING", description: "Data de fim (inclusive), formato YYYY-MM-DD" },
    },
    required: ["start_date", "end_date"],
  },
};

const RUNNING_TOOL = {
  name: "get_running_history",
  description:
    "Obtém as corridas do utilizador (data, tipo — simples/treino/competição —, distância, " +
    "duração, pace) para um intervalo de datas específico. Usa esta função sempre que a " +
    "pergunta envolva corridas fora dos últimos 30 dias já fornecidos no contexto.",
  parameters: {
    type: "OBJECT",
    properties: {
      start_date: { type: "STRING", description: "Data de início, formato YYYY-MM-DD" },
      end_date: { type: "STRING", description: "Data de fim (inclusive), formato YYYY-MM-DD" },
    },
    required: ["start_date", "end_date"],
  },
};

// Espelha TRAINING_TYPE_KEYS em supabase/functions/analyze-run/index.ts e o
// check constraint de runs.training_type. Um valor fora desta lista faria o
// insert do item do plano rebentar, por isso vai como enum no schema da
// ferramenta — o modelo não consegue inventar um tipo novo.
const RUN_TRAINING_TYPES = [
  "continuo", "longo", "recuperacao", "tempo", "fartlek",
  "intervalos", "subidas", "trail", "tecnico",
];

// Ferramenta de ESCRITA — as três acima só leem. Grava um plano de treino em
// coach_plans/coach_plan_items com status 'proposto'; o atleta aceita ou
// recusa depois, no cliente. Sem isto, o coach recomendaria treinos em prosa
// bonita e a app não ficava a saber de nada — ver specs/plano-de-treino.md §5.1.
const PROPOSE_PLAN_TOOL = {
  name: "propose_training_plan",
  description:
    "Propõe ao atleta um plano de treinos para um período. Usa esta função SEMPRE que o " +
    "utilizador pedir um plano, sugestões de treinos para os próximos dias, ou o que deve " +
    "fazer numa semana — em vez de listares os treinos apenas no texto da resposta. A proposta " +
    "fica pendente de aceitação pelo atleta, que a vê no ecrã Início. Depois de a criares, " +
    "menciona na tua resposta que a proposta está lá para ele aceitar. NÃO uses esta função " +
    "para responder a perguntas sobre treinos já feitos, nem quando o utilizador só quer uma " +
    "opinião sem plano concreto. DURAÇÃO DO PLANO: a janela ideal é 7-14 dias (um microciclo). " +
    "Se o utilizador não especificar duração, pergunta-lhe antes de propor se quer um plano de " +
    "7 ou 14 dias e explica brevemente que adaptações musculares e cardiovasculares precisam de " +
    "pelo menos 7 dias de estímulo consistente para ocorrer — mudar mais rápido introduz ruído " +
    "que impede a supercompensação. Se pedir menos de 7 dias, aceita o pedido mas aconselha " +
    "a extender para 7 e explica o mesmo racional — a decisão final é sempre do atleta.",
  parameters: {
    type: "OBJECT",
    properties: {
      period_start: { type: "STRING", description: "Primeiro dia do plano, formato YYYY-MM-DD" },
      period_end: { type: "STRING", description: "Último dia do plano (inclusive), formato YYYY-MM-DD" },
      summary: {
        type: "STRING",
        description: "Resumo curto do plano numa frase, ex.: \"4 treinos, foco em base aeróbica\"",
      },
      items: {
        type: "ARRAY",
        description:
          "Um item por DIA com conteúdo — não é obrigatório cobrir todos os dias do período. " +
          "Um dia sem treino mas com sugestão alimentar relevante (véspera de longão, dia de " +
          "recuperação) entra como kind=descanso com meal_suggestion preenchida. Dias sem " +
          "treino e sem nada a dizer não devem entrar de todo.",
        items: {
          type: "OBJECT",
          properties: {
            planned_date: { type: "STRING", description: "Dia do treino, formato YYYY-MM-DD" },
            kind: {
              type: "STRING",
              enum: ["corrida", "ginasio", "descanso"],
              description:
                "Tipo de dia. 'descanso' é um dia SEM treino — usa-o só quando tiveres " +
                "sugestão alimentar ou nota que justifique o dia aparecer no plano.",
            },
            training_type: {
              type: "STRING",
              enum: RUN_TRAINING_TYPES,
              description: "Só para kind=corrida. Tipo de treino de corrida.",
            },
            categories: {
              type: "ARRAY",
              items: { type: "STRING" },
              description:
                "Só para kind=ginasio. Grupos musculares ou modalidade, ex.: [\"Pernas\", \"Glúteos\"] " +
                "ou [\"HIIT\"].",
            },
            target_distance_km: { type: "NUMBER", description: "Só para kind=corrida. Distância alvo em km." },
            target_duration_min: { type: "NUMBER", description: "Duração alvo em minutos." },
            notes: {
              type: "STRING",
              description: "Instrução curta ao atleta, ex.: \"Z2, fácil, sem olhar ao ritmo\"",
            },
            meal_suggestion: {
              type: "STRING",
              description:
                "Sugestão alimentar para este dia, ligada à carga do treino — o que comer " +
                "antes, durante e depois, com alimentos concretos e porções aproximadas. " +
                "É uma SUGESTÃO EDUCATIVA, nunca uma prescrição: escreve em tom de " +
                "\"considera\"/\"costuma resultar\", não de imposição. Respeita sempre as " +
                "restrições alimentares do atleta indicadas no contexto — nunca sugiras um " +
                "alimento que elas excluam. Se detetares sinais de alarme (perda de peso " +
                "rápida, ingestão muito baixa), não sugiras ementas: levanta a preocupação.",
            },
          },
          required: ["planned_date", "kind"],
        },
      },
    },
    required: ["period_start", "period_end", "items"],
  },
};

// Escreve objetivos do atleta diretamente no perfil — macronutrientes, água e
// objetivos corporais. A autorização (profiles.coach_can_set_nutrition_goals)
// é verificada no EXECUTOR (runUpdateGoals), não aqui — a ferramenta fica
// sempre visível ao modelo, mas recusa escrever sem o interruptor ligado.
//
// FLUXO OBRIGATÓRIO: o modelo NÃO deve chamar esta ferramenta por iniciativa
// própria. Deve primeiro PROPOR o valor em texto, perguntar "Queres que
// atualize?", e só chamar a ferramenta quando o atleta confirmar. Ver prompt.
const UPDATE_GOALS_TOOL = {
  name: "update_goals",
  description:
    "Escreve objetivos do atleta (macronutrientes, água, corpo) diretamente no perfil. " +
    "NUNCA chames esta ferramenta sem o atleta ter confirmado explicitamente na conversa. " +
    "O fluxo correto é: (1) propõe o valor em texto, (2) pergunta 'Queres que atualize?', " +
    "(3) só chamas a ferramenta depois de o atleta dizer que sim. Requer que o atleta tenha " +
    "ativado 'O Coach pode ajustar as metas' no Perfil — se devolver erro de autorização, " +
    "diz onde ativar e não repitas a chamada.",
  parameters: {
    type: "OBJECT",
    properties: {
      calorie_goal:      { type: "NUMBER", description: "Meta diária de calorias (kcal). Omite se não mudar." },
      protein_goal:      { type: "NUMBER", description: "Meta diária de proteína (g). Omite se não mudar." },
      carbs_goal:        { type: "NUMBER", description: "Meta diária de hidratos de carbono (g). Omite se não mudar." },
      fat_goal:          { type: "NUMBER", description: "Meta diária de gordura (g). Omite se não mudar." },
      water_goal_ml:     { type: "NUMBER", description: "Meta diária de água (ml). Omite se não mudar." },
      goal_weight_kg:         { type: "NUMBER", description: "Peso-alvo (kg). Omite se não mudar." },
      goal_body_fat_pct:      { type: "NUMBER", description: "Percentagem de gordura corporal alvo (%). Omite se não mudar." },
      goal_muscle_mass_kg:    { type: "NUMBER", description: "Massa muscular alvo (kg). Omite se não mudar." },
      goal_lean_body_mass_kg: { type: "NUMBER", description: "Massa magra alvo (kg). Omite se não mudar." },
      rationale: {
        type: "STRING",
        description: "Frase curta a justificar os valores propostos (ex.: '1,8 g/kg · 72 kg · treino força 4×/sem').",
      },
    },
  },
};

// Guarda sugestões alimentares nos coach_plan_items do plano aceite em curso
// (ou cria um plano alimentar proposto se não houver plano ativo).
// Ferramenta dedicada para não conflituar com a regra de proteção de microciclo
// da propose_training_plan — sugestões alimentares não são um plano de treino.
const SAVE_MEALS_TOOL = {
  name: "save_meal_suggestions",
  description:
    "Grava sugestões alimentares para dias concretos, visíveis no ecrã Início (Plano da semana). " +
    "Usa esta ferramenta SEMPRE que o atleta pedir sugestões de refeições para um ou mais dias " +
    "específicos (ex.: 'o que devo comer esta semana?', 'sugestão de refeição para amanhã', " +
    "'plano alimentar para 7 dias'). NÃO uses para comentários genéricos de nutrição no texto — " +
    "só quando o atleta quer recomendações estruturadas por dia para ver no plano. " +
    "Podes usar esta ferramenta mesmo quando há um plano de treino ativo — ela não interfere.",
  parameters: {
    type: "OBJECT",
    properties: {
      suggestions: {
        type: "ARRAY",
        description: "Lista de sugestões, uma por dia.",
        items: {
          type: "OBJECT",
          properties: {
            date: { type: "STRING", description: "Data no formato YYYY-MM-DD." },
            meal: {
              type: "STRING",
              description:
                "Sugestão alimentar para o dia inteiro — menciona refeições principais " +
                "(pequeno-almoço, almoço, jantar e snacks se relevantes), quantidades " +
                "aproximadas e racional nutricional em 2-4 frases.",
            },
          },
          required: ["date", "meal"],
        },
        minItems: 1,
        maxItems: 14,
      },
    },
    required: ["suggestions"],
  },
};

// Ferramentas que o Gemini pode invocar quando a pergunta do utilizador sai
// das janelas já incluídas no contexto (ex: "compara Maio com hoje"), ou
// quando pede um plano de treinos ou sugestões alimentares.
function buildTools() {
  return [{ functionDeclarations: [NUTRITION_TOOL, GYM_TOOL, RUNNING_TOOL, PROPOSE_PLAN_TOOL, UPDATE_GOALS_TOOL, SAVE_MEALS_TOOL] }];
}

// Contagem de tokens de uma (ou mais, somadas) chamadas ao Gemini —
// usada para estimar o custo real da API — ver admin_logs/painel de custos.
type GeminiUsage = { input_tokens: number; output_tokens: number };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Resposta estruturada: separa o texto da resposta das sugestões de
// seguimento, para o cliente poder mostrar as sugestões como botões
// em vez de o modelo as misturar dentro do texto. `on_topic` deixa o
// próprio modelo sinalizar perguntas fora do âmbito da app (ver
// buildSystemInstruction) — o servidor devolve erro nesse caso em vez
// de guardar/mostrar uma resposta.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    on_topic: { type: "BOOLEAN" },
    reply: { type: "STRING" },
    suggestions: {
      type: "ARRAY",
      items: { type: "STRING" },
      maxItems: 3,
    },
  },
  required: ["on_topic", "reply", "suggestions"],
};

// Estados HTTP de sobrecarga momentânea do lado da Google (500/502/503/504) —
// vale a pena repetir estes, porque costumam resolver-se à segunda. O 429
// (limite de pedidos excedido) fica DE FORA de propósito: repetir logo a
// seguir só volta a bater no mesmo limite por minuto — e até o acelera — por
// isso passa já ao chamador com a mensagem própria de 429 (ver handler).
// Erros "permanentes" (400, 401, 403...) também passam sempre à primeira.
const GEMINI_RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

// fetch com limite de tempo por tentativa + repetições automáticas quando a
// chamada fica presa (AbortError), falha ao nível da rede, ou o Gemini
// devolve um estado transitório (ver GEMINI_RETRYABLE_STATUSES) — por
// exemplo, confirmámos em produção uma resposta 503 (sobrecarga momentânea)
// que a app mostrava como erro imediato, mesmo sem qualquer problema de rede
// ou timeout envolvido. Ao fim das tentativas, devolve a resposta tal como
// veio (o chamador decide a mensagem) ou lança um erro claro se nem chegou
// a haver resposta.
async function fetchGeminiWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = GEMINI_TIMEOUT_MS,
  retries = GEMINI_RETRIES,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok && GEMINI_RETRYABLE_STATUSES.has(res.status) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      if (attempt < retries) continue;
      throw new Error(
        "O Gemini demorou demasiado tempo a responder (mesmo depois de tentar de novo). Tenta outra vez daqui a pouco.",
      );
    }
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type DayTotals = { kcal: number; prot: number; carbs: number; fat: number; meals: number };

// deno-lint-ignore no-explicit-any
export function aggregateMealsByDate(meals: any[]): Record<string, DayTotals> {
  const byDate: Record<string, DayTotals> = {};
  for (const meal of meals) {
    if (!byDate[meal.date]) byDate[meal.date] = { kcal: 0, prot: 0, carbs: 0, fat: 0, meals: 0 };
    const d = byDate[meal.date];
    d.meals += 1;
    for (const it of (meal.meal_items || [])) {
      const f = (it.quantity_grams || 0) / 100;
      d.kcal  += (it.calories_per_100g || 0) * f;
      d.prot  += (it.protein_per_100g  || 0) * f;
      d.carbs += (it.carbs_per_100g    || 0) * f;
      d.fat   += (it.fat_per_100g      || 0) * f;
    }
  }
  return byDate;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;      // limite defensivo para não pedir intervalos absurdos
const WEEKLY_BUCKET_THRESHOLD = 35; // acima disto, agrega por semana em vez de por dia

// Executa a function call pedida pelo Gemini: vai buscar os dados nutricionais
// do intervalo pedido e devolve um resumo textual compacto.
// deno-lint-ignore no-explicit-any
export async function runGetNutritionHistory(sb: any, userId: string, args: { start_date?: string; end_date?: string }): Promise<string> {
  const { start_date, end_date } = args;
  if (!start_date || !end_date || !ISO_DATE_RE.test(start_date) || !ISO_DATE_RE.test(end_date)) {
    return "Erro: start_date e end_date têm de ser strings no formato YYYY-MM-DD.";
  }
  const start = new Date(start_date + "T00:00:00Z");
  const end = new Date(end_date + "T00:00:00Z");
  if (start > end) return "Erro: start_date é posterior a end_date.";
  const rangeDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (rangeDays > MAX_RANGE_DAYS) return `Erro: intervalo demasiado longo (máximo ${MAX_RANGE_DAYS} dias).`;

  const { data: meals, error } = await sb
    .from("meals")
    .select("date, meal_items(quantity_grams, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g)")
    .eq("user_id", userId)
    .gte("date", start_date)
    .lte("date", end_date);

  if (error) return `Erro ao consultar dados: ${error.message}`;

  const byDate = aggregateMealsByDate(meals || []);
  const daysWithData = Object.keys(byDate).length;
  if (daysWithData === 0) {
    return `Sem refeições registadas entre ${start_date} e ${end_date}.`;
  }

  if (rangeDays <= WEEKLY_BUCKET_THRESHOLD) {
    const lines: string[] = [];
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const day = byDate[iso];
      lines.push(
        day
          ? `- ${iso}: ${day.kcal.toFixed(0)} kcal, ${day.prot.toFixed(0)}g proteína, ${day.carbs.toFixed(0)}g hidratos, ${day.fat.toFixed(0)}g gordura (${day.meals} refeições)`
          : `- ${iso}: sem refeições registadas`,
      );
    }
    return `Resumo diário de ${start_date} a ${end_date}:\n${lines.join("\n")}`;
  }

  // Intervalo longo: agrega por semana para não inchar o prompt.
  const weeks: { start: string; end: string; totals: DayTotals; days: number }[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    if (weekEnd > end) weekEnd.setTime(end.getTime());

    const totals: DayTotals = { kcal: 0, prot: 0, carbs: 0, fat: 0, meals: 0 };
    let days = 0;
    const d = new Date(weekStart);
    while (d <= weekEnd) {
      const iso = d.toISOString().slice(0, 10);
      const day = byDate[iso];
      if (day) {
        totals.kcal += day.kcal; totals.prot += day.prot;
        totals.carbs += day.carbs; totals.fat += day.fat; totals.meals += day.meals;
        days += 1;
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
    weeks.push({ start: weekStart.toISOString().slice(0, 10), end: weekEnd.toISOString().slice(0, 10), totals, days });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  const lines = weeks.map((w) => {
    const n = Math.max(w.days, 1);
    return `- ${w.start} a ${w.end} (média/dia com registo, ${w.days} dias registados): ` +
      `${(w.totals.kcal / n).toFixed(0)} kcal, ${(w.totals.prot / n).toFixed(0)}g proteína, ` +
      `${(w.totals.carbs / n).toFixed(0)}g hidratos, ${(w.totals.fat / n).toFixed(0)}g gordura`;
  });
  return `Resumo semanal (médias diárias) de ${start_date} a ${end_date}:\n${lines.join("\n")}`;
}

// ── Ginásio ────────────────────────────────────────────────────────────────
export type GymSessionSummary = {
  date: string;
  name: string;
  kind: "forca" | "aula";
  categories: string[];
  volume: number;
  sets: number;
  durationSeconds: number | null;
  calories: number | null;
  avgHr: number | null;
  maxHr: number | null;
  exertion: number | null;
};

// Resume sessões de treino para o coach. Volume = Σ reps×carga sobre séries
// com reps e carga preenchidos — numa aula fica 0, porque uma aula não tem
// séries (ver formatSessionLine, que por isso as omite).
// deno-lint-ignore no-explicit-any
export function summariseSessions(sessions: any[]): GymSessionSummary[] {
  return sessions.map((s) => {
    let volume = 0;
    let sets = 0;
    for (const st of (s.workout_session_sets || [])) {
      if (st.reps != null && st.weight != null) { volume += st.reps * st.weight; sets += 1; }
    }
    return {
      date: s.date,
      name: s.name || "Treino",
      kind: s.kind === "aula" ? "aula" : "forca",
      categories: Array.isArray(s.categories) ? s.categories : [],
      volume,
      sets,
      durationSeconds: s.duration_seconds ?? null,
      calories: s.calories_kcal ?? null,
      avgHr: s.avg_hr ?? null,
      maxHr: s.max_hr ?? null,
      exertion: s.exertion ?? null,
    };
  });
}

// Uma linha por sessão, no formato que o modelo lê. Partilhada pelo resumo
// automático e pela function call, para não divergirem.
export function formatSessionLine(r: GymSessionSummary): string {
  const parts: string[] = [];
  // Volume e séries só entram quando existem mesmo. Uma aula tem sempre zero
  // de ambos, e escrever "0 kg de volume, 0 séries" fazia o coach ler um HIIT
  // de 45 minutos como treino falhado.
  if (r.sets > 0) {
    parts.push(`${Math.round(r.volume)} kg de volume`, `${r.sets} séries`);
  }
  if (r.durationSeconds) parts.push(`${Math.round(r.durationSeconds / 60)} min`);
  if (r.calories) parts.push(`${r.calories} kcal`);
  if (r.avgHr && r.maxHr) parts.push(`FC média ${r.avgHr} / máx ${r.maxHr} bpm`);
  else if (r.avgHr) parts.push(`FC média ${r.avgHr} bpm`);
  else if (r.maxHr) parts.push(`FC máx ${r.maxHr} bpm`);
  if (r.exertion) parts.push(`esforço ${r.exertion}/10`);

  const kindLabel = r.kind === "aula" ? " (aula)" : "";
  const cats = r.categories.length ? ` [${r.categories.join(", ")}]` : "";
  const detail = parts.length ? ` — ${parts.join(", ")}` : " — sem detalhes registados";
  return `- ${r.date}: ${r.name}${kindLabel}${cats}${detail}`;
}

// deno-lint-ignore no-explicit-any
function buildGymSummary(sessions: any[], windowDays: number): string {
  const rows = summariseSessions(sessions);
  if (rows.length === 0) {
    return `Treinos de ginásio (últimos ${windowDays} dias): sem treinos concluídos.`;
  }
  return `Treinos de ginásio (últimos ${windowDays} dias, ${rows.length} concluído(s)):\n` +
    rows.map(formatSessionLine).join("\n");
}

// Executa a function call get_gym_history: treinos concluídos num intervalo.
// deno-lint-ignore no-explicit-any
export async function runGetGymHistory(sb: any, userId: string, args: { start_date?: string; end_date?: string }): Promise<string> {
  const { start_date, end_date } = args;
  if (!start_date || !end_date || !ISO_DATE_RE.test(start_date) || !ISO_DATE_RE.test(end_date)) {
    return "Erro: start_date e end_date têm de ser strings no formato YYYY-MM-DD.";
  }
  const start = new Date(start_date + "T00:00:00Z");
  const end = new Date(end_date + "T00:00:00Z");
  if (start > end) return "Erro: start_date é posterior a end_date.";
  const rangeDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (rangeDays > MAX_RANGE_DAYS) return `Erro: intervalo demasiado longo (máximo ${MAX_RANGE_DAYS} dias).`;

  const { data, error } = await sb
    .from("workout_sessions")
    .select("date, name, status, workout_session_sets(reps, weight)")
    .eq("user_id", userId)
    .eq("status", "concluido")
    .gte("date", start_date)
    .lte("date", end_date)
    .order("date", { ascending: true });

  if (error) return `Erro ao consultar dados: ${error.message}`;
  const rows = summariseSessions(data || []);
  if (rows.length === 0) return `Sem treinos concluídos entre ${start_date} e ${end_date}.`;
  return `Treinos de ${start_date} a ${end_date} (${rows.length}):\n` +
    rows.map(formatSessionLine).join("\n");
}

// ── Corrida ──────────────────────────────────────────────────────────────
const RUN_KIND_LABELS: Record<string, string> = {
  simples: "Simples", treino: "Treino", competicao: "Competição",
};
const RUN_TRAINING_TYPE_LABELS: Record<string, string> = {
  continuo: "Contínuo", longo: "Longo", tempo: "Tempo", recuperacao: "Recuperação",
  intervalos: "Intervalos", sprints: "Sprints",
};

function formatPace(distanceKm: number | null, durationSeconds: number | null): string | null {
  if (!distanceKm || !durationSeconds || distanceKm <= 0) return null;
  const secPerKm = durationSeconds / distanceKm;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}
function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

// deno-lint-ignore no-explicit-any
function summariseRuns(runs: any[]): string[] {
  return runs.map((r) => {
    const kindLabel = r.kind === "treino"
      ? `Treino${r.training_type ? ` (${RUN_TRAINING_TYPE_LABELS[r.training_type] || r.training_type})` : ""}`
      : RUN_KIND_LABELS[r.kind] || "Simples";
    const distance = r.distance_km != null ? `${Number(r.distance_km).toFixed(2)} km` : null;
    const duration = r.duration_seconds != null ? formatDuration(r.duration_seconds) : null;
    const pace = formatPace(r.distance_km, r.duration_seconds);
    const parts = [distance, duration, pace].filter(Boolean);
    return `- ${r.date}: ${kindLabel}${parts.length ? ` — ${parts.join(", ")}` : ""}`;
  });
}

// deno-lint-ignore no-explicit-any
function buildRunningSummary(runs: any[], windowDays: number): string {
  if (runs.length === 0) {
    return `Corridas (últimos ${windowDays} dias): sem corridas registadas.`;
  }
  return `Corridas (últimos ${windowDays} dias, ${runs.length} registada(s)):\n${summariseRuns(runs).join("\n")}`;
}

// Executa a function call get_running_history: corridas num intervalo.
// deno-lint-ignore no-explicit-any
export async function runGetRunningHistory(sb: any, userId: string, args: { start_date?: string; end_date?: string }): Promise<string> {
  const { start_date, end_date } = args;
  if (!start_date || !end_date || !ISO_DATE_RE.test(start_date) || !ISO_DATE_RE.test(end_date)) {
    return "Erro: start_date e end_date têm de ser strings no formato YYYY-MM-DD.";
  }
  const start = new Date(start_date + "T00:00:00Z");
  const end = new Date(end_date + "T00:00:00Z");
  if (start > end) return "Erro: start_date é posterior a end_date.";
  const rangeDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (rangeDays > MAX_RANGE_DAYS) return `Erro: intervalo demasiado longo (máximo ${MAX_RANGE_DAYS} dias).`;

  const { data, error } = await sb
    .from("runs")
    .select("date, kind, training_type, distance_km, duration_seconds")
    .eq("user_id", userId)
    .gte("date", start_date)
    .lte("date", end_date)
    .order("date", { ascending: true });

  if (error) return `Erro ao consultar dados: ${error.message}`;
  if (!data || data.length === 0) return `Sem corridas registadas entre ${start_date} e ${end_date}.`;
  return `Corridas de ${start_date} a ${end_date} (${data.length}):\n${summariseRuns(data).join("\n")}`;
}

// Máximo de treinos por proposta — um plano semanal razoável não passa daqui,
// e o limite trava uma resposta descontrolada do modelo a criar dezenas de
// linhas na base de dados.
const MAX_PLAN_ITEMS = 14;

// Executa a function call propose_training_plan: grava o plano com estado
// 'proposto' e os respetivos itens. Ao contrário das outras três ferramentas,
// esta ESCREVE — daí a validação apertada de cada campo antes do insert.
// Ver specs/plano-de-treino.md §3 e §5.1.
// deno-lint-ignore no-explicit-any
export async function runProposeTrainingPlan(sb: any, userId: string, args: any): Promise<string> {
  const { period_start, period_end, summary, items } = args || {};

  if (!period_start || !period_end || !ISO_DATE_RE.test(period_start) || !ISO_DATE_RE.test(period_end)) {
    return "Erro: period_start e period_end têm de ser datas no formato YYYY-MM-DD.";
  }
  if (period_start > period_end) return "Erro: period_start é posterior a period_end.";
  if (!Array.isArray(items) || items.length === 0) {
    return "Erro: o plano tem de ter pelo menos um treino em items.";
  }
  if (items.length > MAX_PLAN_ITEMS) {
    return `Erro: demasiados treinos no plano (máximo ${MAX_PLAN_ITEMS}).`;
  }

  // Valida tudo ANTES de gravar seja o que for — um item inválido a meio
  // deixaria um plano meio criado, que o atleta veria como proposta legítima.
  const rows = [];
  for (const [i, item] of items.entries()) {
    const n = i + 1;
    if (!item?.planned_date || !ISO_DATE_RE.test(item.planned_date)) {
      return `Erro no treino ${n}: planned_date tem de ser uma data YYYY-MM-DD.`;
    }
    if (item.planned_date < period_start || item.planned_date > period_end) {
      return `Erro no treino ${n}: planned_date (${item.planned_date}) está fora do período do plano.`;
    }
    if (item.kind !== "corrida" && item.kind !== "ginasio" && item.kind !== "descanso") {
      return `Erro no treino ${n}: kind tem de ser "corrida", "ginasio" ou "descanso".`;
    }
    if (item.kind === "corrida" && item.training_type && !RUN_TRAINING_TYPES.includes(item.training_type)) {
      return `Erro no treino ${n}: training_type "${item.training_type}" não é válido. Usa um de: ${RUN_TRAINING_TYPES.join(", ")}.`;
    }
    const mealSuggestion = typeof item.meal_suggestion === "string" && item.meal_suggestion.trim()
      ? item.meal_suggestion.trim()
      : null;
    const itemNotes = typeof item.notes === "string" && item.notes.trim() ? item.notes.trim() : null;
    // Um dia de descanso sem sugestão nem nota não tem nada para mostrar — só
    // ocuparia uma linha vazia no plano. Rejeitar aqui ensina o modelo a não
    // encher o plano com dias vazios só para "cobrir a semana".
    if (item.kind === "descanso" && !mealSuggestion && !itemNotes) {
      return `Erro no treino ${n}: um dia de descanso precisa de meal_suggestion ou notes — ` +
        `caso contrário não o incluas no plano.`;
    }
    const distance = Number(item.target_distance_km);
    const duration = Number(item.target_duration_min);
    const isTraining = item.kind === "corrida" || item.kind === "ginasio";
    rows.push({
      user_id: userId,
      planned_date: item.planned_date,
      kind: item.kind,
      // O schema já limita training_type a corridas, mas o modelo pode enganar-se
      // — forçar null no ginásio evita gravar um tipo de corrida numa sessão de
      // ginásio (não rebentaria, mas ficaria incoerente).
      training_type: item.kind === "corrida" && item.training_type ? item.training_type : null,
      categories: item.kind === "ginasio" && Array.isArray(item.categories) ? item.categories : [],
      target_distance_km: item.kind === "corrida" && distance > 0 ? distance : null,
      // Num dia de descanso não há duração para cumprir — o modelo por vezes
      // preenche na mesma, e ficaria um "0 min" sem sentido no cartão.
      target_duration_min: isTraining && duration > 0 ? Math.round(duration) : null,
      notes: itemNotes,
      meal_suggestion: mealSuggestion,
    });
  }

  const { data: plan, error: planErr } = await sb
    .from("coach_plans")
    .insert({
      user_id: userId,
      status: "proposto",
      period_start,
      period_end,
      summary: typeof summary === "string" && summary.trim() ? summary.trim() : null,
    })
    .select()
    .single();

  if (planErr || !plan) return `Erro ao gravar o plano: ${planErr?.message || "sem resposta da base de dados"}`;

  const { error: itemsErr } = await sb
    .from("coach_plan_items")
    .insert(rows.map((r) => ({ ...r, plan_id: plan.id })));

  if (itemsErr) {
    // Sem os itens o plano é uma casca vazia — apaga-o para o atleta não ver
    // uma proposta sem treinos nenhuns.
    await sb.from("coach_plans").delete().eq("id", plan.id);
    return `Erro ao gravar os treinos do plano: ${itemsErr.message}`;
  }

  return `Plano criado com ${rows.length} treino(s), de ${period_start} a ${period_end}. ` +
    `Está pendente de aceitação — o atleta vê-o no ecrã Início e decide se aceita.`;
}

// Limites de bom senso por campo — travam valores impossíveis para qualquer
// atleta humano (ex.: 5 g de proteína, 10 000 kcal, 200 kg de massa muscular).
const GOAL_LIMITS: Record<string, [number, number]> = {
  calorie_goal:        [800,  6000],
  protein_goal:        [20,   400],
  carbs_goal:          [20,   800],
  fat_goal:            [10,   300],
  water_goal_ml:       [500,  6000],
  goal_weight_kg:         [30,   250],
  goal_body_fat_pct:      [3,    50],
  goal_muscle_mass_kg:    [10,   120],
  goal_lean_body_mass_kg: [20,   150],
};

// Mapeamento campo → flag _set_by_coach + label legível para a mensagem de retorno.
const GOAL_META: Record<string, { flag: string; label: string; unit: string }> = {
  calorie_goal:        { flag: "calorie_goal_set_by_coach",   label: "calorias",           unit: "kcal/dia" },
  protein_goal:        { flag: "protein_goal_set_by_coach",   label: "proteína",            unit: "g/dia" },
  carbs_goal:          { flag: "carbs_goal_set_by_coach",     label: "hidratos",            unit: "g/dia" },
  fat_goal:            { flag: "fat_goal_set_by_coach",       label: "gordura",             unit: "g/dia" },
  water_goal_ml:       { flag: "water_goal_set_by_coach",     label: "água",                unit: "ml/dia" },
  goal_weight_kg:         { flag: "goal_weight_set_by_coach",    label: "peso-alvo",             unit: "kg" },
  goal_body_fat_pct:      { flag: "goal_body_fat_set_by_coach",  label: "gordura corporal alvo", unit: "%" },
  goal_muscle_mass_kg:    { flag: "goal_muscle_set_by_coach",    label: "massa muscular alvo",   unit: "kg" },
  goal_lean_body_mass_kg: { flag: "goal_lean_mass_set_by_coach", label: "massa magra alvo",      unit: "kg" },
};

// Executa update_goals: escreve qualquer combinação dos campos acima no perfil,
// SÓ se o atleta tiver ativado coach_can_set_nutrition_goals (toggle global).
// deno-lint-ignore no-explicit-any
export async function runUpdateGoals(sb: any, userId: string, args: any): Promise<string> {
  const fieldNames = Object.keys(GOAL_META);
  // deno-lint-ignore no-explicit-any
  const updates: Record<string, any> = {};

  // Verificar quais campos foram passados e validar limites.
  for (const field of fieldNames) {
    const raw = (args || {})[field];
    if (raw === undefined || raw === null) continue;
    const n = Number(raw);
    const [min, max] = GOAL_LIMITS[field];
    if (!Number.isFinite(n) || n < min || n > max) {
      return `Erro: ${field} tem de ser um número entre ${min} e ${max} (${GOAL_META[field].unit}).`;
    }
    // Valores em gramas/kcal arredondados; decimais só em kg/%.
    const rounded = ["goal_weight_kg", "goal_body_fat_pct", "goal_muscle_mass_kg"].includes(field)
      ? Math.round(n * 10) / 10
      : Math.round(n);
    updates[field] = rounded;
    updates[GOAL_META[field].flag] = true;
  }

  if (Object.keys(updates).length === 0) {
    return "Erro: nenhum campo fornecido. Indica pelo menos um objetivo a atualizar.";
  }

  // Verificar autorização global do atleta.
  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("coach_can_set_nutrition_goals")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) return `Erro a verificar autorização: ${profileErr.message}`;
  if (!profile?.coach_can_set_nutrition_goals) {
    return "Erro: o atleta ainda não autorizou o Coach a escrever metas. " +
      "Explica que pode ativar 'O Coach pode ajustar as metas' no Perfil > separador Metas, " +
      "e não tentes de novo nesta resposta.";
  }

  const { error: updateErr } = await sb.from("profiles").update(updates).eq("id", userId);
  if (updateErr) return `Erro ao gravar metas: ${updateErr.message}`;

  const parts = fieldNames
    .filter(f => updates[f] !== undefined && !f.endsWith("_set_by_coach"))
    .map(f => `${GOAL_META[f].label}: ${updates[f]} ${GOAL_META[f].unit}`);
  return `Metas atualizadas: ${parts.join(", ")}. Já estão gravadas no perfil do atleta.`;
}

// ── Sugestões alimentares ────────────────────────────────────────────────
// Grava meal_suggestion em coach_plan_items existentes (plano ativo aceite)
// ou cria um plano proposto de descanso para datas fora do plano ativo.
// Não conflitua com a regra de proteção de microciclo — é independente de
// propose_training_plan.
// deno-lint-ignore no-explicit-any
export async function runSaveMealSuggestions(sb: any, userId: string, args: any): Promise<string> {
  const { suggestions } = args || {};
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return "Erro: 'suggestions' tem de ser uma lista com pelo menos uma sugestão ({date, meal}).";
  }

  const todayISO = new Date().toISOString().slice(0, 10);

  // Buscar plano ativo (aceite, em curso ou futuro cujo período ainda não terminou).
  const { data: activePlan, error: planErr } = await sb
    .from("coach_plans")
    .select("id, period_start, period_end")
    .eq("user_id", userId)
    .eq("status", "aceite")
    .gte("period_end", todayISO)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (planErr) return `Erro ao buscar plano ativo: ${planErr.message}`;

  const saved: string[] = [];
  const outside: { date: string; meal: string }[] = [];

  for (const s of suggestions) {
    const { date, meal } = s || {};
    if (!date || !meal) continue;
    const isInsidePlan =
      activePlan &&
      date >= activePlan.period_start &&
      date <= activePlan.period_end;

    if (isInsidePlan) {
      // Tentar atualizar item existente para esse dia.
      const { data: existing } = await sb
        .from("coach_plan_items")
        .select("id")
        .eq("plan_id", activePlan.id)
        .eq("day", date)
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error: upErr } = await sb
          .from("coach_plan_items")
          .update({ meal_suggestion: meal })
          .eq("id", existing.id);
        if (upErr) return `Erro ao atualizar sugestão para ${date}: ${upErr.message}`;
      } else {
        // Não existe item para este dia — criar um de descanso com a sugestão.
        const { error: insErr } = await sb.from("coach_plan_items").insert({
          plan_id: activePlan.id,
          day: date,
          kind: "descanso",
          meal_suggestion: meal,
        });
        if (insErr) return `Erro ao inserir sugestão para ${date}: ${insErr.message}`;
      }
      saved.push(date);
    } else {
      outside.push({ date, meal });
    }
  }

  // Para datas fora do plano ativo, criar um plano proposto dedicado.
  if (outside.length > 0) {
    const dates = outside.map((o) => o.date).sort();
    const periodStart = dates[0];
    const periodEnd = dates[dates.length - 1];

    const { data: newPlan, error: createErr } = await sb
      .from("coach_plans")
      .insert({
        user_id: userId,
        status: "proposto",
        period_start: periodStart,
        period_end: periodEnd,
        notes: "Sugestões alimentares do Coach",
      })
      .select("id")
      .single();
    if (createErr) return `Erro ao criar plano para sugestões: ${createErr.message}`;

    const items = outside.map((o) => ({
      plan_id: newPlan.id,
      day: o.date,
      kind: "descanso",
      meal_suggestion: o.meal,
    }));
    const { error: itemsErr } = await sb.from("coach_plan_items").insert(items);
    if (itemsErr) return `Erro ao inserir itens de sugestão: ${itemsErr.message}`;
    outside.forEach((o) => saved.push(o.date));
  }

  if (saved.length === 0) return "Nenhuma sugestão válida para gravar.";
  return `Sugestões alimentares gravadas para: ${saved.sort().join(", ")}. Estão visíveis no ecrã Início.`;
}

// ── Agenda de provas ─────────────────────────────────────────────────────
const RACE_TYPE_LABELS: Record<string, string> = {
  estrada: "Estrada", trail: "Trail", ultra: "Ultra", "5k": "5 km", "10k": "10 km",
  "21k": "Meia maratona", "42k": "Maratona", outro: "Outro",
};

// Espelha EXPERIENCE_LEVELS em src/utils/experience.js — só os rótulos, o
// código do cliente é que tem as descrições usadas na UI.
const EXPERIENCE_LEVEL_LABELS: Record<string, string> = {
  iniciante: "Iniciante", basico: "Básico", medio: "Médio", avancado: "Avançado",
};

// Espelha DIETARY_RESTRICTIONS em src/utils/diet.js. Duplicado de propósito:
// o bundle de deploy da Edge Function não leva ficheiros de fora da sua
// pasta, por isso importar do cliente partiria em produção. Se mexeres num,
// mexe no outro — src/utils/diet.test.js trava as chaves do lado do cliente.
//
// Ao contrário dos outros rótulos aqui, isto não é decoração: cada entrada
// desloca alvos numéricos que os alarmes usam (o limiar de ferro de um
// vegetariano é 1,8× o de um omnívoro). Ver Bloco 7 #5 da investigação.
const DIETARY_RESTRICTION_INFO: Record<string, { label: string; rule: string }> = {
  vegetariano: {
    label: "Vegetariano",
    rule:
      "sem carne nem peixe (come ovos e lacticínios). Alternativas: tofu, tempeh, seitan, ovos, " +
      "lacticínios, leguminosas com cereais. Ferro: 1,8× o valor de um omnívoro, com vitamina C " +
      "à refeição e sem café/chá/cálcio à mesma hora. Proteína: +10-20% face ao alvo normal.",
  },
  vegano: {
    label: "Vegano",
    rule:
      "sem qualquer produto animal — nem ovos nem lacticínios. Alternativas: tofu, tempeh, seitan, " +
      "proteína de ervilha ou arroz, soja texturizada, leguminosas com cereais. B12: suplementação " +
      "obrigatória (250 µg/dia ou 2000 µg/semana), não substituível por alimentos. Ferro: 1,8× o " +
      "valor de um omnívoro. Proteína: +10-20%. Creatina 3-5 g/dia e ómega-3 de microalgas.",
  },
  sem_lactose: {
    label: "Sem lactose",
    rule:
      "evita leite e derivados frescos. Alternativas: produtos sem lactose, queijos curados, " +
      "bebidas vegetais enriquecidas, whey isolate. Vigiar cálcio e vitamina D.",
  },
  sem_gluten: {
    label: "Sem glúten",
    rule:
      "evita trigo, centeio e cevada. Alternativas: arroz, batata, batata-doce, tapioca, milho, " +
      "quinoa, trigo sarraceno, aveia certificada. Chegar aos 10-12 g/kg de hidratos é mais " +
      "difícil sem exceder fibra — prioriza arroz branco, tapioca e fécula de batata.",
  },
};

// Espelha RACE_PRIORITIES em src/utils/run.js. Determina o taper: prova
// principal leva 10-21 dias de polimento, prova de treino leva só 2-4.
const RACE_PRIORITY_LABELS: Record<string, string> = {
  a: "prova principal (taper completo)",
  b: "prova secundária (taper curto)",
  c: "prova de treino (taper curto, 2-4 dias)",
};

// Doutrina de nutrição condensada — ver src/coach-knowledge/07-sugestoes-alimentares.md
// (fonte: specs/coach-investigacao.md, Bloco 7). Antes desta constante, o
// campo meal_suggestion do propose_training_plan e qualquer sugestão de
// refeição no chat vinham do conhecimento geral do Gemini, não da literatura
// registada — nada impedia inconsistência entre pedidos. Duplicado por
// necessidade: cada Edge Function só empacota a sua própria pasta (mesma
// razão da triplicação de DIETARY_RESTRICTION_INFO).
const MEAL_DOCTRINE =
  `DOUTRINA DE NUTRIÇÃO (Bloco 7 da investigação — ACSM/AND 2016, ISSN ` +
  `Nutrient Timing/Kerksick 2017, Burke 2021, INSA/PortFIR). Usa isto sempre ` +
  `que sugerires ou comentares uma refeição, não o teu conhecimento geral:\n` +
  `- Dia leve/descanso (<60 min Z1-Z2): pequeno-almoço 20-25% kcal, almoço ` +
  `30-35%, lanche 10-15%, jantar 25-30%, ceia opcional 5-10%. Proteína ` +
  `0,3-0,4 g/kg por refeição, 3-5 doses espaçadas 3-4h.\n` +
  `- Dia de treino exigente (>60 min Z3-Z5): hidratos concentram-se na ` +
  `janela peri-treino (40-50% do total diário). Pré (1-3h antes): 1,0-2,0 ` +
  `g/kg hidratos fáceis + 0,2-0,3 g/kg proteína. Durante (>75 min): 30-90 ` +
  `g/h hidratos. Pós (0-2h): 1,0-1,2 g/kg hidratos + 20-40 g proteína.\n` +
  `- Equivalência proteína por 100 g (INSA/PortFIR, não a tabela americana): ` +
  `frango/peru peito 30-31, vaca magra 28-30, salmão/atum fresco 24-26, ovo ` +
  `inteiro 12,5 (≈6 g/ovo), skyr/iogurte grego 0% 10-12, tofu firme 12-15, ` +
  `lentilhas/grão/feijão cozidos 8-9, whey 24 g/scoop de 30 g. SOMA sempre ` +
  `os alimentos até bateres a meta em g/kg — nunca cites uma ementa de ` +
  `exemplo sem verificar que a soma fecha as contas.\n` +
  `- Pré-prova, 24-48h antes (provas >60-90 min): prioriza arroz branco, ` +
  `massa branca, pão branco, batata sem pele, banana madura, mel, frango/ ` +
  `peru/claras/peixe branco. Evita integrais, leguminosas, crucíferas, ` +
  `frutos secos, fritos, queijos curados, lactose (se sensível), picante, ` +
  `bebidas com gás.\n` +
  `- Erros a vigiar e sinalizar: treinar em jejum antes de sessões Z3-Z5 ou ` +
  `longos; défice >500-700 kcal/dia; dieta low-carb em endurance; inovar ` +
  `alimentação no dia da prova; beber só água em longos de calor >2h ` +
  `(risco de hiponatremia).\n` +
  `Tudo isto é SUGESTÃO EDUCATIVA, nunca prescrição — usa "considera"/` +
  `"costuma ajudar", não imposição. As restrições alimentares do atleta ` +
  `(se indicadas abaixo) têm sempre precedência sobre esta doutrina geral.`;

// Ritmo em min/km. Convenção da app: ponto a separar minutos de segundos —
// "5.20" são 5min20s/km. Ver formatPace() em src/utils/run.js.
function formatPaceMinKm(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}.${s.toString().padStart(2, "0")}`;
}

function formatHms(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Contexto das próximas provas agendadas — é a base da proactividade do
// Coach (ex.: sugerir tapering/hidratos quando falta pouco para uma prova).
// Inclui explicitamente "dias até à prova" para o modelo não ter de calcular
// datas por conta própria.
// deno-lint-ignore no-explicit-any
function buildRaceEventsContext(events: any[], todayISO: string): string | null {
  if (events.length === 0) return null;
  const today = new Date(todayISO + "T00:00:00Z");
  const lines = events.map((e) => {
    const eventDate = new Date(e.date + "T00:00:00Z");
    const daysUntil = Math.round((eventDate.getTime() - today.getTime()) / 86400000);
    const typeLabel = RACE_TYPE_LABELS[e.race_type] || e.race_type;
    // Ritmo e tempo-alvo são objetivos distintos e vêm em colunas próprias.
    // `target_time` (texto livre) só entra como último recurso, para provas
    // criadas antes de os campos numéricos existirem.
    const paceStr = e.target_pace_seconds_per_km
      ? formatPaceMinKm(e.target_pace_seconds_per_km)
      : (e.distance_km && e.target_time_seconds
        ? formatPaceMinKm(Math.round(e.target_time_seconds / e.distance_km))
        : null);
    const extras = [
      e.location ? `local: ${e.location}` : null,
      e.distance_km ? `distância: ${e.distance_km} km` : null,
      e.target_time_seconds ? `tempo-alvo: ${formatHms(e.target_time_seconds)}` : null,
      paceStr ? `ritmo-alvo: ${paceStr}/km` : null,
      (!e.target_time_seconds && !e.target_pace_seconds_per_km && e.target_time)
        ? `objetivo (texto): ${e.target_time}` : null,
      // Autodeclarado para ESTA prova — pode divergir do nível geral do
      // atleta (ver bio, mais abaixo). Quando presente, prevalece para o
      // taper e progressão desta prova especificamente.
      e.experience_level
        ? `nível do atleta nesta prova: ${EXPERIENCE_LEVEL_LABELS[e.experience_level] || e.experience_level}`
        : null,
      // Decide o taper: principal leva 10-21 dias de polimento, treino leva
      // só 2-4. Ver specs/coach-investigacao.md, Corrida 2.3 #1.
      e.race_priority
        ? `prioridade: ${RACE_PRIORITY_LABELS[e.race_priority] || e.race_priority}`
        : null,
    ].filter(Boolean).join(", ");
    return `- ${e.date} (daqui a ${daysUntil} dia(s)): ${e.name} — ${typeLabel}${extras ? ` (${extras})` : ""}`;
  });
  return `Próximas provas agendadas:\n${lines.join("\n")}`;
}

// Contexto dos treinos que o coach já propôs e ainda estão por resolver —
// evita propor um plano por cima de outro que o atleta ainda não aceitou nem
// recusou, e dá-lhe memória do que combinou. Ver specs/plano-de-treino.md.
// deno-lint-ignore no-explicit-any
// deno-lint-ignore no-explicit-any
function describeItem(i: any): string {
  if (i.kind === "corrida") {
    return [i.training_type || "corrida", i.target_distance_km ? `${i.target_distance_km} km` : null]
      .filter(Boolean).join(" ");
  }
  if (i.kind === "descanso") return "descanso";
  return ["ginásio", i.categories?.length ? i.categories.join("/") : null,
    i.target_duration_min ? `${i.target_duration_min} min` : null].filter(Boolean).join(" ");
}

// deno-lint-ignore no-explicit-any
export function buildPlanContext(pendingItems: any[], activeItems: any[], todayISO: string): string | null {
  const sections: string[] = [];

  // Plano PROPOSTO (aguarda aceitação do atleta)
  if (pendingItems.length > 0) {
    const lines = pendingItems.map((i) => {
      const atraso = i.kind !== "descanso" && i.planned_date < todayISO ? " — JÁ PASSOU" : "";
      const refeicao = i.meal_suggestion ? ` [sugestão alimentar: ${i.meal_suggestion}]` : "";
      return `  - ${i.planned_date}: ${describeItem(i)}${i.notes ? ` (${i.notes})` : ""}${refeicao}${atraso}`;
    });
    sections.push(`PLANO PROPOSTO (aguarda aceitação do atleta — não propões outro sem ele decidir):\n${lines.join("\n")}`);
  }

  // Plano ACEITE em curso (itens futuros ou de hoje ainda pendentes)
  if (activeItems.length > 0) {
    const lines = activeItems.map((i) => {
      const refeicao = i.meal_suggestion ? ` [sugestão alimentar: ${i.meal_suggestion}]` : "";
      return `  - ${i.planned_date}: ${describeItem(i)}${i.notes ? ` (${i.notes})` : ""}${refeicao}`;
    });
    sections.push(
      `PLANO ACEITE EM CURSO (microciclo ativo — NÃO propões plano novo a não ser que o atleta ` +
      `refira explicitamente um dos sinais de interrupção abaixo):\n${lines.join("\n")}`
    );
  }

  return sections.length > 0 ? sections.join("\n\n") : null;
}

// Espelha ageFromBirthDate() em src/utils/body.js — duplicado porque o cliente
// e as Edge Functions correm em runtimes diferentes. Se um mudar, mudar o outro.
function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (isNaN(born.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const monthDiff = today.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) age--;

  return age >= 0 && age < 130 ? age : null;
}

export function buildSystemInstruction(
  coachContext: string | null,
  biometrics: {
    height_cm: number | null;
    weight_kg: number | null;
    gender: string | null;
    birth_date: string | null;
    experience_level: string | null;
    resting_hr_bpm: number | null;
    dietary_restrictions: string[] | null;
    dietary_notes: string | null;
    coach_can_set_nutrition_goals: boolean | null;
  },
  nutritionSummary: string,
  waterSummary: string,
  gymSummary: string | null,
  runningSummary: string | null,
  raceEventsContext: string | null,
  planContext: string | null,
): string {
  const today = new Date().toLocaleDateString("pt-PT", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let sys =
    `És um coach especializado em nutrição desportiva, treino de ginásio e corrida. ` +
    `O teu objetivo é dar conselhos práticos, personalizados e baseados em ciência ao utilizador.\n\n` +
    `Responde sempre em português de Portugal. ` +
    `Sê direto e prático. Quando adequado, estrutura as respostas com listas ou secções curtas. ` +
    `Não sejas excessivamente longo — responde de forma concisa mas completa.\n\n` +
    `MUITO IMPORTANTE — âmbito: só respondes a perguntas sobre nutrição, treino de ginásio, ` +
    `corrida, composição/avaliação corporal, ou o próprio uso desta app. Para QUALQUER pergunta ` +
    `fora destes temas (ex.: desporto profissional/futebol, atualidade, entretenimento, ` +
    `perguntas pessoais sobre ti como IA, ou qualquer outro assunto geral), define o campo ` +
    `"on_topic" como false e deixa "reply" vazio — não tentes responder ao tema nem explicar ` +
    `porque não podes. Só defines "on_topic" como true quando a pergunta se enquadra no âmbito acima.\n\n` +
    `MUITO IMPORTANTE — foco na pergunta: responde apenas ao que foi perguntado. ` +
    `Se o utilizador pede o próximo treino, dá-lhe só o próximo treino — não expandas ` +
    `automaticamente para um plano da semana inteira, nem inicies sugestões de nutrição ` +
    `ou de outros temas que não foram pedidos. Não tentes ser exaustivo nem antecipar ` +
    `tudo o que a pessoa possa querer saber.\n\n` +
    `No campo "suggestions", propõe até 3 perguntas de seguimento curtas e específicas ` +
    `que o utilizador possa querer fazer a seguir, escritas na primeira pessoa como se ` +
    `fosse o próprio utilizador a perguntar (ex: "Queres um plano de nutrição para hoje?" ` +
    `torna-se "Dá-me um plano de nutrição para hoje"). Não repitas no texto da resposta ` +
    `(campo "reply") o convite para essas perguntas — isso é só para o campo "suggestions". ` +
    `Se não fizer sentido nenhuma sugestão, deixa o array vazio.\n\n` +
    `MUITO IMPORTANTE — proactividade perto de provas: se houver "Próximas provas agendadas" ` +
    `no contexto abaixo, tem sempre em conta a proximidade da mais próxima ao dar qualquer ` +
    `conselho de treino ou nutrição, mesmo que o utilizador não a mencione diretamente. ` +
    `Regras gerais (ajusta com bom senso ao tipo de prova e distância):\n` +
    `- Última semana antes da prova: sugere reduzir o volume de treino (tapering) — menos ` +
    `quilómetros/carga, treinos mais curtos e leves, priorizar descanso e sono.\n` +
    `- Últimos 2-3 dias antes da prova (sobretudo 10km+): sugere aumentar a proporção de ` +
    `hidratos de carbono na alimentação e reduzir a intensidade do treino a quase zero.\n` +
    `- Dia da prova ou no dia seguinte: pergunta como correu / parabeniza, sem impor um novo plano.\n` +
    `Não forces este tópico se o utilizador perguntar algo completamente não relacionado (ex.: ` +
    `um alimento específico) — menciona a prova próxima apenas quando for relevante ou quando ` +
    `deres um conselho de treino/nutrição geral que deva ter isso em conta.\n\n` +
    `MUITO IMPORTANTE — hidratação: tem sempre em conta o "Água hoje" no contexto abaixo ao dar ` +
    `conselhos de treino ou nutrição (ex.: se a % da meta estiver baixa a meio/fim do dia, ou perto ` +
    `de um treino/corrida, sugere beber água). Tal como as provas, não forces este tópico numa ` +
    `pergunta que não tem nada a ver com hidratação — só o menciona quando for relevante.\n\n` +
    `Data atual: ${today}.\n\n` +
    `Sobre os treinos: há dois tipos. Os treinos de força trazem exercícios, séries, volume em ` +
    `kg e os grupos musculares trabalhados entre parênteses retos. As aulas de grupo e cardio ` +
    `vêm marcadas com "(aula)" — HIIT, RPM, pilates e afins — e NÃO têm séries nem volume, ` +
    `porque não é assim que se medem: são descritas por duração, calorias e frequência ` +
    `cardíaca. Nunca leias uma aula sem volume como um treino falhado ou uma semana parada. ` +
    `Qualquer dos tipos pode trazer esforço percebido de 1 a 10, útil para perceber se a carga ` +
    `de treino está adequada.\n\n` +
    `O contexto abaixo tem os dados de nutrição dos últimos 7 dias, os treinos de ginásio e as ` +
    `corridas dos últimos 30 dias. Se a pergunta do utilizador precisar de dados fora dessas ` +
    `janelas (um mês específico, uma data no passado, "desde o início do ano", etc.), usa a ` +
    `função get_nutrition_history (nutrição), get_gym_history (ginásio) ou get_running_history ` +
    `(corrida) com o intervalo de datas necessário antes de responder.\n\n` +
    `PLANOS DE TREINO: quando o utilizador te pedir um plano, sugestões de treinos para os ` +
    `próximos dias, ou o que deve fazer na próxima semana, usa a função propose_training_plan ` +
    `em vez de listares os treinos apenas no texto. A proposta fica pendente e o atleta ` +
    `aceita-a no ecrã Início. Antes de propores, tem em conta o histórico recente (não subas ` +
    `o volume mais de 10% face à média das últimas semanas), o nível do atleta e as provas ` +
    `agendadas — uma prova principal próxima muda o plano (taper). Depois de criares a ` +
    `proposta, diz na tua resposta o que propuseste e que está no Início à espera de ` +
    `aceitação. Se já existir um plano pendente (ver contexto abaixo), não crie outro sem o ` +
    `utilizador pedir explicitamente — pergunta antes se quer substituir o que está lá.\n\n` +
    `PLANO ATIVO EM CURSO: se o contexto abaixo indicar um PLANO ACEITE EM CURSO, não propões ` +
    `um novo plano enquanto esse microciclo não terminar — a menos que o atleta refira ` +
    `explicitamente um dos seguintes sinais de interrupção:\n` +
    `  • Dor com EVA ≥ 4/10 (ex.: "a minha perna dói muito", "tenho dores fortes")\n` +
    `  • FC de repouso subiu ≥ 5 bpm face ao normal por 2 ou mais dias seguidos\n` +
    `  • HRV significativamente abaixo da linha de base\n` +
    `  • Mudança imprevista de agenda que torna o plano impraticável (viagem, doença, emergência)\n` +
    `Se detetares um desses sinais, dizes ao atleta que o sinal sugere interromper o microciclo, ` +
    `explicas brevemente porquê (ex.: "uma FC de repouso elevada durante dias é um dos primeiros ` +
    `sinais de sobretreino — continuar sem adaptar aumenta o risco"), e perguntas se quer um ` +
    `plano ajustado. Se não houver sinal claro mas o atleta pedir mesmo assim um novo plano, ` +
    `lembras-lhe que o microciclo atual tem ainda X dias e que interrompê-lo sem motivo ` +
    `fisiológico reduz as adaptações — e deixas a decisão ao atleta.\n\n` +
    `DURAÇÃO DO PLANO (doutrina Issurin 2008, Daniels 2021, Bompa 2015): a janela ideal de ` +
    `um microciclo é 7-14 dias. Adaptações estruturais (biogénese mitocondrial, densidade ` +
    `capilar, síntese de hemoglobina) exigem estímulo consistente por 14-21 dias; mudar a ` +
    `cada 2-3 dias introduz ruído de adaptação e impede a supercompensação. Por isso:\n` +
    `1. Se o utilizador pedir um plano sem especificar duração, ANTES de propores pergunta-lhe ` +
    `se prefere 7 dias (microciclo curto, ideal para testar) ou 14 dias (microciclo completo, ` +
    `máximas adaptações) — e explica este racional em 1-2 frases simples.\n` +
    `2. Se pedir menos de 7 dias, aceita o pedido mas diz-lhe que para adaptações físicas ` +
    `reais o mínimo recomendado são 7 dias, e pergunta se quer mesmo ficar pelo período ` +
    `mais curto ou prefere estender. A decisão final é sempre do atleta.\n` +
    `3. Se o utilizador já tiver definido a duração (ex: "plano para a próxima semana", ` +
    `"14 dias"), não perguntes — respeita o que pediu e propõe diretamente.\n\n` +
    `SUGESTÕES ALIMENTARES NO PLANO: quando o atleta pedir sugestões de refeições para dias ` +
    `concretos (ex.: "o que devo comer amanhã?", "sugestão de refeições para esta semana"), ` +
    `usa SEMPRE a ferramenta save_meal_suggestions com a lista de {date, meal} para cada dia ` +
    `— assim as sugestões aparecem no ecrã Início (Plano da semana) e não ficam só no chat. ` +
    `A ferramenta trata automaticamente de planos ativos (adiciona ao dia existente) e de ` +
    `datas fora do plano (cria entradas propostas). NÃO uses propose_training_plan para ` +
    `sugestões alimentares — essa ferramenta é apenas para microciclos de treino. ` +
    `Se o pedido for apenas "uma ideia para hoje" ou muito vago, responde em texto normal ` +
    `sem usar a ferramenta — só a usas quando o pedido implica dias específicos ` +
    `ou uma semana de sugestões estruturada.\n\n` +
    MEAL_DOCTRINE;

  const bio: string[] = [];
  if (biometrics.experience_level) {
    // Nível GERAL do atleta — se uma prova concreta tiver o seu próprio
    // nível autodeclarado (ver buildRaceEventsContext), esse prevalece para
    // essa prova; este é o que vale para tudo o resto.
    bio.push(`Nível geral como corredor: ${EXPERIENCE_LEVEL_LABELS[biometrics.experience_level] || biometrics.experience_level}`);
  }
  if (biometrics.gender) bio.push(`Género: ${biometrics.gender === "F" ? "feminino" : "masculino"}`);
  // Idade derivada da data de nascimento — o modelo recebe o número já feito
  // para não ter de o calcular (e enganar-se) a partir da data.
  const idade = ageFromBirthDate(biometrics.birth_date);
  if (idade !== null) bio.push(`Idade: ${idade} anos`);
  if (biometrics.height_cm) bio.push(`Altura: ${biometrics.height_cm} cm`);
  if (biometrics.weight_kg) bio.push(`Peso: ${biometrics.weight_kg} kg`);
  if (biometrics.height_cm && biometrics.weight_kg) {
    const h = biometrics.height_cm / 100;
    const bmi = biometrics.weight_kg / (h * h);
    bio.push(`IMC: ${bmi.toFixed(1)}`);
  }
  // FC de repouso + zonas já calculadas. A fórmula preferida é Karvonen (FC de
  // reserva), que precisa da FC de repouso; sem ela cai-se para %FCmáx simples,
  // menos preciso. FCmáx por Tanaka (208 − 0,7 × idade), mais defensável que a
  // clássica 220 − idade. Ver specs/coach-investigacao.md, Corrida 2.2 #4.
  if (biometrics.resting_hr_bpm) {
    bio.push(`FC em repouso: ${biometrics.resting_hr_bpm} bpm`);
  }
  if (idade !== null) {
    const fcMax = Math.round(208 - 0.7 * idade);
    if (biometrics.resting_hr_bpm) {
      const reserva = fcMax - biometrics.resting_hr_bpm;
      const z = (pct: number) => Math.round(biometrics.resting_hr_bpm! + pct * reserva);
      bio.push(
        `Zonas de FC (Karvonen, FCmáx estimada ${fcMax} bpm por Tanaka): ` +
        `Z1 ${z(0.50)}-${z(0.60)} · Z2 ${z(0.60)}-${z(0.70)} · Z3 ${z(0.70)}-${z(0.80)} · ` +
        `Z4 ${z(0.80)}-${z(0.90)} · Z5 ${z(0.90)}-${fcMax} bpm`,
      );
    } else {
      bio.push(
        `Zonas de FC (%FCmáx, FCmáx estimada ${fcMax} bpm por Tanaka — menos ` +
        `precisas por falta de FC em repouso no perfil): Z1 ${Math.round(fcMax * 0.50)}-` +
        `${Math.round(fcMax * 0.60)} · Z2 ${Math.round(fcMax * 0.60)}-${Math.round(fcMax * 0.70)} · ` +
        `Z3 ${Math.round(fcMax * 0.70)}-${Math.round(fcMax * 0.80)} · Z4 ${Math.round(fcMax * 0.80)}-` +
        `${Math.round(fcMax * 0.90)} · Z5 ${Math.round(fcMax * 0.90)}-${fcMax} bpm`,
      );
    }
  }
  if (bio.length) {
    sys += `\n\nDados biométricos do utilizador:\n${bio.join("\n")}`;
  }

  // Restrições alimentares — regra dura, não preferência. Sem isto o coach
  // não fica calado, fica errado: sugere frango a um vegetariano e perde a
  // confiança do utilizador à primeira sugestão. Ver Bloco 7 #5.
  //
  // Só entra no prompt quando existe alguma restrição: afirmar "não tem
  // restrições" gastaria tokens em todos os pedidos da larga maioria dos
  // utilizadores, sem mudar nada na resposta.
  const dieta: string[] = [];
  for (const key of biometrics.dietary_restrictions ?? []) {
    const info = DIETARY_RESTRICTION_INFO[key];
    if (info) dieta.push(`- ${info.label}: ${info.rule}`);
  }
  const notasDieta = biometrics.dietary_notes?.trim();
  if (notasDieta) {
    dieta.push(
      `- Alergias/recusas declaradas pelo atleta: "${notasDieta}". Trata isto como ` +
      `restrição absoluta mesmo que não percebas o motivo.`,
    );
  }
  if (dieta.length) {
    sys +=
      `\n\nMUITO IMPORTANTE — restrições alimentares do utilizador. Nunca sugiras, num plano, ` +
      `numa refeição ou num exemplo, alimentos que violem o que está abaixo. Isto não é uma ` +
      `preferência a contornar: sugerir um alimento proibido é pior do que não sugerir nada. ` +
      // Sem nomear nutrientes aqui: enumerá-los no preâmbulo fá-los aparecer
      // no prompt de quem não os tem: um vegetariano come ovos e lacticínios,
      // e vê-se mandado suplementar B12 por causa de uma frase genérica.
      `Os ajustes numéricos indicados abaixo substituem os alvos normais.\n` +
      dieta.join("\n");
  }

  if (coachContext && coachContext.trim()) {
    sys += `\n\nPerfil e objetivos do utilizador (definido pelo próprio):\n${coachContext.trim()}`;
  }

  // Instruções de metas — o modelo só menciona update_goals quando autorizado,
  // mas em ambos os casos deve propor primeiro em texto e pedir confirmação.
  sys += biometrics.coach_can_set_nutrition_goals
    ? `\n\nATUALIZAÇÃO DE METAS (autorizado): o atleta autorizou-te a escrever metas ` +
      `diretamente no perfil com a ferramenta update_goals. Campos disponíveis: calorias ` +
      `(calorie_goal), proteína (protein_goal), hidratos (carbs_goal), gordura (fat_goal), ` +
      `água (water_goal_ml), peso-alvo (goal_weight_kg), gordura corporal alvo ` +
      `(goal_body_fat_pct), massa muscular alvo (goal_muscle_mass_kg).\n` +
      `FLUXO OBRIGATÓRIO — sempre em 2 passos:\n` +
      `1. Propõe o(s) valor(es) em texto com justificação (ex.: "Sugiro aumentar proteína para ` +
      `180 g/dia — 1,8 g/kg · 72 kg, adequado para 4 treinos de força por semana.").\n` +
      `2. Pergunta explicitamente: "Queres que atualize agora no teu perfil?" ou equivalente.\n` +
      `3. Só chamas update_goals DEPOIS de o atleta confirmar. Nunca por iniciativa própria.\n` +
      `4. Depois de gravar, confirma o que ficou alterado numa frase curta.`
    : `\n\nATUALIZAÇÃO DE METAS (não autorizado): NÃO uses a ferramenta update_goals — o ` +
      `atleta ainda não ativou a permissão. Se ele pedir para ajustares metas, propõe os valores ` +
      `em texto (como farias normalmente), e no fim diz: "Se quiseres que eu grave isto ` +
      `diretamente no teu perfil, ativa 'O Coach pode ajustar as metas' no Perfil, separador Metas."`;

  sys += `\n\n${nutritionSummary}`;
  sys += `\n\n${waterSummary}`;
  if (gymSummary) sys += `\n\n${gymSummary}`;
  if (runningSummary) sys += `\n\n${runningSummary}`;
  if (raceEventsContext) sys += `\n\n${raceEventsContext}`;
  if (planContext) sys += `\n\n${planContext}`;

  return sys;
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não suportado" }, 405);

  try {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) return jsonResponse({ error: "GEMINI_API_KEY não configurada" }, 500);

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

    const body = await req.json();
    const message = typeof body.message === "string"
      ? body.message.slice(0, MAX_MSG_LEN).trim()
      : "";
    if (!message) return jsonResponse({ error: "Mensagem vazia" }, 400);

    // ── Perfil do utilizador (contexto + metas + biometria) ──────────────
    const { data: profile } = await sb
      .from("profiles")
      .select("coach_context, calorie_goal, protein_goal, carbs_goal, fat_goal, water_goal_ml, height_cm, weight_kg, gender, birth_date, experience_level, resting_hr_bpm, dietary_restrictions, dietary_notes, coach_can_set_nutrition_goals")
      .eq("id", userId)
      .maybeSingle();

    // ── Dados nutricionais dos últimos 7 dias ────────────────────────────
    // Uma semana dá ao coach contexto suficiente sobre consistência e
    // padrões (incluindo fins de semana) sem inchar o prompt com histórico
    // desnecessário.
    const NUTRITION_WINDOW_DAYS = 7;
    const todayISO = new Date().toISOString().slice(0, 10);
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - (NUTRITION_WINDOW_DAYS - 1));
    const startISO = startDate.toISOString().slice(0, 10);

    const { data: weekMeals } = await sb
      .from("meals")
      .select("date, meal_items(quantity_grams, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g)")
      .eq("user_id", userId)
      .gte("date", startISO)
      .lte("date", todayISO);

    const byDate: Record<string, { kcal: number; prot: number; carbs: number; fat: number; meals: number }> = {};
    for (const meal of (weekMeals || [])) {
      if (!byDate[meal.date]) byDate[meal.date] = { kcal: 0, prot: 0, carbs: 0, fat: 0, meals: 0 };
      const d = byDate[meal.date];
      d.meals += 1;
      for (const it of (meal.meal_items || [])) {
        const f = (it.quantity_grams || 0) / 100;
        d.kcal  += (it.calories_per_100g || 0) * f;
        d.prot  += (it.protein_per_100g  || 0) * f;
        d.carbs += (it.carbs_per_100g    || 0) * f;
        d.fat   += (it.fat_per_100g      || 0) * f;
      }
    }

    const g = profile || {} as Record<string, unknown>;
    const today = byDate[todayISO];
    const todaySummary = today
      ? `Hoje (${todayISO}):\n` +
        `- Calorias: ${today.kcal.toFixed(0)} kcal (meta diária: ${g.calorie_goal ?? "–"} kcal)\n` +
        `- Proteína: ${today.prot.toFixed(1)} g (meta: ${g.protein_goal ?? "–"} g)\n` +
        `- Hidratos: ${today.carbs.toFixed(1)} g (meta: ${g.carbs_goal ?? "–"} g)\n` +
        `- Gordura: ${today.fat.toFixed(1)} g (meta: ${g.fat_goal ?? "–"} g)\n` +
        `- Refeições registadas: ${today.meals}`
      : `Hoje (${todayISO}): sem refeições registadas ainda.`;

    const historyLines: string[] = [];
    for (let i = 1; i < NUTRITION_WINDOW_DAYS; i++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const day = byDate[iso];
      historyLines.push(
        day
          ? `- ${iso}: ${day.kcal.toFixed(0)} kcal, ${day.prot.toFixed(0)}g proteína, ${day.carbs.toFixed(0)}g hidratos, ${day.fat.toFixed(0)}g gordura (${day.meals} refeições)`
          : `- ${iso}: sem refeições registadas`,
      );
    }

    const nutritionSummary =
      `${todaySummary}\n\n` +
      `Histórico dos ${NUTRITION_WINDOW_DAYS - 1} dias anteriores (metas diárias: ${g.calorie_goal ?? "–"} kcal / ${g.protein_goal ?? "–"}g proteína / ${g.carbs_goal ?? "–"}g hidratos / ${g.fat_goal ?? "–"}g gordura):\n` +
      historyLines.join("\n");

    // ── Água de hoje ──────────────────────────────────────────────────────
    const { data: waterLogs } = await sb
      .from("water_logs")
      .select("amount_ml")
      .eq("user_id", userId)
      .eq("date", todayISO);
    const waterTotalMl = (waterLogs || []).reduce((sum: number, w: { amount_ml: number }) => sum + (w.amount_ml || 0), 0);
    const waterGoalMl = Number(g.water_goal_ml) || 2000;
    const waterPct = waterGoalMl > 0 ? Math.round((waterTotalMl / waterGoalMl) * 100) : 0;
    const waterSummary = `Água hoje: ${waterTotalMl} ml de ${waterGoalMl} ml (${waterPct}% da meta).`;

    // ── Treinos de ginásio dos últimos 30 dias ───────────────────────────
    // Janela maior que a nutrição porque os treinos são menos frequentes.
    const GYM_WINDOW_DAYS = 30;
    const gymStartD = new Date();
    gymStartD.setUTCDate(gymStartD.getUTCDate() - (GYM_WINDOW_DAYS - 1));
    const gymStartISO = gymStartD.toISOString().slice(0, 10);
    const { data: gymSessions } = await sb
      .from("workout_sessions")
      .select(
        "date, name, status, kind, categories, duration_seconds, calories_kcal, avg_hr, max_hr, exertion, " +
          "workout_session_sets(reps, weight)",
      )
      .eq("user_id", userId)
      .eq("status", "concluido")
      .gte("date", gymStartISO)
      .lte("date", todayISO)
      .order("date", { ascending: false });
    const gymSummary = buildGymSummary(gymSessions || [], GYM_WINDOW_DAYS);

    // ── Corridas dos últimos 30 dias ──────────────────────────────────────
    const RUNNING_WINDOW_DAYS = 30;
    const runStartD = new Date();
    runStartD.setUTCDate(runStartD.getUTCDate() - (RUNNING_WINDOW_DAYS - 1));
    const runStartISO = runStartD.toISOString().slice(0, 10);
    const { data: recentRuns } = await sb
      .from("runs")
      .select("date, kind, training_type, distance_km, duration_seconds")
      .eq("user_id", userId)
      .gte("date", runStartISO)
      .lte("date", todayISO)
      .order("date", { ascending: false });
    const runningSummary = buildRunningSummary(recentRuns || [], RUNNING_WINDOW_DAYS);

    // ── Próximas provas agendadas (base da proactividade do Coach) ───────
    // Inclui desde ontem (não só a partir de hoje) para o Coach poder
    // perguntar "como correu?" no dia seguinte a uma prova.
    const raceLookbackD = new Date();
    raceLookbackD.setUTCDate(raceLookbackD.getUTCDate() - 1);
    const raceLookbackISO = raceLookbackD.toISOString().slice(0, 10);
    const { data: upcomingRaces } = await sb
      .from("race_events")
      .select("date, name, race_type, location, target_time, target_time_seconds, target_pace_seconds_per_km, distance_km, experience_level, race_priority")
      .eq("user_id", userId)
      .gte("date", raceLookbackISO)
      .order("date", { ascending: true })
      .limit(5);
    const raceEventsContext = buildRaceEventsContext(upcomingRaces || [], todayISO);

    // ── Treinos do plano ────────────────────────────────────────────────
    // Plano PROPOSTO: existe um plano com status='proposto' e os seus itens.
    // O atleta ainda não aceitou — não devemos propor outro por cima.
    const { data: proposedPlans } = await sb
      .from("coach_plans")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "proposto")
      .limit(1);
    const proposedPlanId = proposedPlans?.[0]?.id ?? null;
    // deno-lint-ignore no-explicit-any
    let proposedItems: any[] = [];
    if (proposedPlanId) {
      const { data } = await sb
        .from("coach_plan_items")
        .select("planned_date, kind, training_type, categories, target_distance_km, target_duration_min, notes, meal_suggestion")
        .eq("plan_id", proposedPlanId)
        .eq("status", "pendente")
        .order("planned_date", { ascending: true })
        .limit(20);
      proposedItems = data || [];
    }

    // Plano ACEITE em curso: microciclo que ainda tem dias futuros.
    // O modelo precisa de saber que existe para não propor outro sem sinal claro.
    const { data: activePlans } = await sb
      .from("coach_plans")
      .select("id, period_end")
      .eq("user_id", userId)
      .eq("status", "aceite")
      .gte("period_end", todayISO)
      .order("period_start", { ascending: false })
      .limit(1);
    const activePlanId = activePlans?.[0]?.id ?? null;
    // deno-lint-ignore no-explicit-any
    let activePlanItems: any[] = [];
    if (activePlanId) {
      const { data } = await sb
        .from("coach_plan_items")
        .select("planned_date, kind, training_type, categories, target_distance_km, target_duration_min, notes, meal_suggestion")
        .eq("plan_id", activePlanId)
        .eq("status", "pendente")
        .gte("planned_date", todayISO)
        .order("planned_date", { ascending: true })
        .limit(20);
      activePlanItems = data || [];
    }

    const planContext = buildPlanContext(proposedItems, activePlanItems, todayISO);

    // ── Histórico de conversa (últimas MAX_HISTORY mensagens) ────────────
    const { data: history } = await sb
      .from("coach_messages")
      .select("role, content")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(MAX_HISTORY);

    // ── Guardar mensagem do utilizador antes de chamar o Gemini ─────────
    const { data: userMsg, error: userMsgErr } = await sb
      .from("coach_messages")
      .insert({ user_id: userId, role: "user", content: message })
      .select()
      .single();
    if (userMsgErr) {
      return jsonResponse({ error: `Falha a guardar mensagem: ${userMsgErr.message}` }, 500);
    }

    // ── Construir pedido ao Gemini ───────────────────────────────────────
    const systemInstruction = buildSystemInstruction(
      profile?.coach_context ?? null,
      {
        birth_date: (profile?.birth_date as string | null) ?? null,
        height_cm: (profile?.height_cm as number | null) ?? null,
        weight_kg: (profile?.weight_kg as number | null) ?? null,
        gender: (profile?.gender as string | null) ?? null,
        experience_level: (profile?.experience_level as string | null) ?? null,
        resting_hr_bpm: (profile?.resting_hr_bpm as number | null) ?? null,
        dietary_restrictions: (profile?.dietary_restrictions as string[] | null) ?? null,
        dietary_notes: (profile?.dietary_notes as string | null) ?? null,
        coach_can_set_nutrition_goals: (profile?.coach_can_set_nutrition_goals as boolean | null) ?? null,
      },
      nutritionSummary,
      waterSummary,
      gymSummary,
      runningSummary,
      raceEventsContext,
      planContext,
    );

    // deno-lint-ignore no-explicit-any
    const contents: any[] = [
      ...(history || []).map((m: { role: string; content: string }) => ({
        role: m.role,
        parts: [{ text: m.content }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    // ── Loop de function calling ──────────────────────────────────────────
    // tools + response_schema coexistem: quando o modelo decide chamar uma
    // função devolve uma parte functionCall (ignora o schema), quando decide
    // responder ao utilizador segue o schema {reply, suggestions} como sempre.
    async function callGemini() {
      const res = await fetchGeminiWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents,
            tools: buildTools(),
            generationConfig: {
              temperature: 0.7,
              // Sem thinkingConfig de propósito: o campo para desativar/limitar
              // "thinking" mudou de nome entre gerações do modelo por trás do
              // alias "-latest" (thinkingBudget vs. thinkingLevel — confirmado
              // em produção: thinkingBudget causou 400 INVALID_ARGUMENT assim
              // que o alias rodou para uma geração mais recente). Sem o campo,
              // o pedido funciona com qualquer geração; em compensação
              // maxOutputTokens fica bem acima do necessário para a resposta,
              // para sobrar espaço aos tokens de raciocínio interno e a
              // resposta não ser cortada a meio.
              maxOutputTokens: 4000,
              response_mime_type: "application/json",
              response_schema: RESPONSE_SCHEMA,
            },
          }),
        },
      );
      return res;
    }

    // Soma tokens de TODAS as chamadas ao Gemini neste pedido — o loop de
    // function calling pode fazer várias idas-e-voltas (cada uma consome
    // tokens) antes de chegar à resposta final que o utilizador vê.
    const totalUsage: GeminiUsage = { input_tokens: 0, output_tokens: 0 };

    // Sinaliza ao cliente que esta resposta criou um plano — o Início tem de
    // recarregar os itens para a proposta aparecer sem refrescar a página.
    let planWasProposed = false;
    let goalsWereUpdated = false;

    let geminiJson: Record<string, unknown> | undefined;
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const isLastAllowedRound = round === MAX_TOOL_ROUNDS;
      let geminiRes: Response;
      try {
        geminiRes = await callGemini();
      } catch (e) {
        return jsonResponse({ error: e instanceof Error ? e.message : "Falha ao contactar o coach." }, 504);
      }

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.error("Gemini error:", geminiRes.status, errText);
        if (geminiRes.status === 429) {
          return jsonResponse({
            error: "O coach atingiu o limite de pedidos da API neste momento. Tenta novamente dentro de alguns minutos.",
          }, 503);
        }
        return jsonResponse({
          error: `Falha na resposta do coach (${geminiRes.status}). Tenta novamente.`,
          detail: errText.slice(0, 500),
        }, 502);
      }

      // deno-lint-ignore no-explicit-any
      const parsedRes: any = await geminiRes.json();
      totalUsage.input_tokens += Number(parsedRes?.usageMetadata?.promptTokenCount) || 0;
      totalUsage.output_tokens += Number(parsedRes?.usageMetadata?.candidatesTokenCount) || 0;
      // deno-lint-ignore no-explicit-any
      const parts: any[] = parsedRes?.candidates?.[0]?.content?.parts || [];
      // deno-lint-ignore no-explicit-any
      const functionCalls = parts.filter((p) => p.functionCall);

      if (functionCalls.length === 0 || isLastAllowedRound) {
        geminiJson = parsedRes;
        break;
      }

      // O modelo pediu dados — regista o turno e executa cada function call.
      contents.push({ role: "model", parts });
      const responseParts = [];
      for (const p of functionCalls) {
        const { name, args } = p.functionCall;
        let result: string;
        if (name === "get_nutrition_history") {
          result = await runGetNutritionHistory(sb, userId, args || {});
        } else if (name === "get_gym_history") {
          result = await runGetGymHistory(sb, userId, args || {});
        } else if (name === "get_running_history") {
          result = await runGetRunningHistory(sb, userId, args || {});
        } else if (name === "propose_training_plan") {
          result = await runProposeTrainingPlan(sb, userId, args || {});
          planWasProposed = planWasProposed || result.startsWith("Plano criado");
        } else if (name === "update_goals" || name === "update_nutrition_goals") {
          // "update_nutrition_goals" mantido por retrocompatibilidade com histórico de conversa.
          result = await runUpdateGoals(sb, userId, args || {});
          goalsWereUpdated = goalsWereUpdated || result.startsWith("Metas atualizadas");
        } else if (name === "save_meal_suggestions") {
          result = await runSaveMealSuggestions(sb, userId, args || {});
        } else {
          result = `Erro: função desconhecida "${name}".`;
        }
        responseParts.push({ functionResponse: { name, response: { result } } });
      }
      // "function" era o role documentado para devolver resultados de tools,
      // mas confirmado em produção (2026-08-11): a geração atual por trás do
      // alias "-latest" já não o aceita — 400 INVALID_ARGUMENT, "Role
      // 'function' is not supported". O erro lista os roles válidos e "user"
      // está entre eles; é o que a API aceita hoje para devolver
      // functionResponse. Mesma classe de instabilidade que already motivou
      // não fixar thinkingConfig (ver comentário em callGemini).
      contents.push({ role: "user", parts: responseParts });
    }

    const rawText: string | undefined =
      // deno-lint-ignore no-explicit-any
      (geminiJson as any)?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      console.error("Gemini resposta vazia:", JSON.stringify(geminiJson));
      return jsonResponse({ error: "O coach não conseguiu gerar uma resposta. Tenta novamente." }, 502);
    }

    let replyText: string;
    let suggestions: string[] = [];
    try {
      const parsed = JSON.parse(rawText);
      // O modelo sinaliza perguntas fora do âmbito da app (ver
      // buildSystemInstruction) — devolve erro em vez de guardar/mostrar
      // uma resposta, e não insere a mensagem do modelo no histórico.
      if (parsed.on_topic === false) {
        return jsonResponse({
          error: "Só posso ajudar com temas de nutrição, treino de ginásio, corrida e composição corporal — os módulos desta app. Tenta outra pergunta relacionada com estas áreas.",
        }, 400);
      }
      replyText = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : rawText;
      suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions.filter((s: unknown) => typeof s === "string" && s.trim()).slice(0, 3)
        : [];
    } catch {
      // JSON inválido/cortado (ex.: resposta truncada a meio) — nunca mostrar
      // o texto bruto ao utilizador (parecia um JSON partido no ecrã); melhor
      // pedir para tentar de novo do que guardar/mostrar lixo no histórico.
      console.error("Gemini devolveu JSON inválido/incompleto:", rawText);
      return jsonResponse({
        error: "O coach teve um problema a gerar a resposta. Tenta novamente.",
      }, 502);
    }

    // ── Guardar resposta do modelo ───────────────────────────────────────
    const { data: modelMsg, error: modelMsgErr } = await sb
      .from("coach_messages")
      .insert({ user_id: userId, role: "model", content: replyText })
      .select()
      .single();

    if (modelMsgErr) {
      console.error("Falha a guardar resposta:", modelMsgErr);
      return jsonResponse({
        user_message: userMsg,
        model_message: { id: null, role: "model", content: replyText, created_at: new Date().toISOString() },
        suggestions,
        usage: totalUsage,
        plan_proposed: planWasProposed,
        goals_updated: goalsWereUpdated,
      });
    }

    return jsonResponse({
      user_message: userMsg,
      model_message: modelMsg,
      suggestions,
      usage: totalUsage,
      plan_proposed: planWasProposed,
      goals_updated: goalsWereUpdated,
    });

  } catch (e) {
    console.error("Erro inesperado:", e);
    return jsonResponse({ error: "Erro inesperado no servidor" }, 500);
  }
}

if (import.meta.main) {
  Deno.serve(handler);
}
