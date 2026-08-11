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
  volume: number;     // Σ reps × weight (kg) — só séries com ambos preenchidos
  sets: number;       // contagem de séries efetivas
  highRepSets: number; // séries com reps ≥ 15 (faixa desaconselhada para corredor)
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
    let highRepSets = 0;
    for (const st of (s.workout_session_sets || [])) {
      if (st.reps != null && st.weight != null) {
        volume += st.reps * st.weight;
        sets += 1;
        if (st.reps >= 15) highRepSets += 1; // Bloco 3 #10 — faixa desaconselhada para corredor
      }
    }
    return {
      date: s.date,
      name: s.name || "Treino",
      kind: s.kind === "aula" ? "aula" : "forca",
      categories: Array.isArray(s.categories) ? s.categories : [],
      volume,
      sets,
      highRepSets,
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

// ─── Bloco 3 — Métricas de ginásio computadas ────────────────────────────────
//
// Calcula sinais que a doutrina (03-ginasio.md) prevê como detetáveis:
//   #6  volume-carga spike (Σ reps×weight, semana atual vs média 4 sem)
//   #7  intervalo mínimo entre sessões de pernas (<48 h = aviso)
//   #10 séries longas (≥15 reps) em sessões de pernas = tipo errado p/ corredor
//
// Recebe os rows já processados por summariseSessions para não recalcular.
// Devolve uma string de linhas de aviso, ou null se não houver nada a sinalizar.

// Grupos de pernas reconhecidos. Capitalização é inconsistente nos registos —
// comparamos em lowercase.
const LEG_CATS = new Set(["pernas", "glúteos", "gluteos", "posterior", "quadríceps",
  "quadriceps", "isquiotibiais", "gémeos", "gemeos", "solear"]);

function isLegSession(row: GymSessionSummary): boolean {
  return row.categories.some((c) => LEG_CATS.has(c.toLowerCase()));
}

export function computeGymMetrics(rows: GymSessionSummary[], todayISO: string): string | null {
  const flags: string[] = [];

  // ── #6 — Spike de volume-carga semanal (apenas sessões de pernas) ─────────
  // Semana atual = últimos 7 dias; crónica = média das 4 semanas anteriores.
  const todayMs = new Date(todayISO + "T00:00:00Z").getTime();
  const week0Cut = todayMs - 7  * 86400000; // início semana atual
  const week4Cut = todayMs - 35 * 86400000; // início da janela de 4 semanas

  const legRows = rows.filter(isLegSession);

  const curWeekVol = legRows
    .filter((r) => new Date(r.date + "T00:00:00Z").getTime() >= week0Cut)
    .reduce((s, r) => s + r.volume, 0);

  const prevRows = legRows.filter((r) => {
    const ms = new Date(r.date + "T00:00:00Z").getTime();
    return ms >= week4Cut && ms < week0Cut;
  });
  const prevWeeklyAvg = prevRows.length > 0
    ? prevRows.reduce((s, r) => s + r.volume, 0) / 4
    : null;

  if (prevWeeklyAvg !== null && prevWeeklyAvg > 0 && curWeekVol > 0) {
    const pct = Math.round(((curWeekVol - prevWeeklyAvg) / prevWeeklyAvg) * 100);
    if (pct >= 20) {
      flags.push(
        `⚠ VOLUME-CARGA PERNAS: +${pct}% face à média das 4 semanas — RISCO ELEVADO de lesão miotendinosa (Bloco 3 #6; limite seguro ≤10-15%)`,
      );
    } else if (pct >= 10) {
      flags.push(
        `⚠ VOLUME-CARGA PERNAS: +${pct}% face à média das 4 semanas — risco acrescido (limite recomendado ≤10-15%)`,
      );
    }
  }

  // ── #7 — Intervalo entre sessões de pernas (<48 h) ────────────────────────
  const legDates = legRows
    .map((r) => new Date(r.date + "T00:00:00Z").getTime())
    .sort((a, b) => a - b);
  for (let i = 1; i < legDates.length; i++) {
    const diffH = (legDates[i] - legDates[i - 1]) / 3600000;
    if (diffH < 48) {
      const d1 = new Date(legDates[i - 1]).toISOString().slice(0, 10);
      const d2 = new Date(legDates[i]).toISOString().slice(0, 10);
      flags.push(
        `⚠ INTERVALO PERNAS: sessões de ${d1} e ${d2} com apenas ${Math.round(diffH)} h de separação — mínimo recomendado 48 h (Bloco 3 #7)`,
      );
      break; // um aviso chega — evitar spam de linhas
    }
  }

  // ── #10 — Séries longas (≥15 reps) em sessões de pernas ──────────────────
  const recentCut = todayMs - 14 * 86400000; // últimas 2 semanas
  const highRepSessions = legRows.filter(
    (r) => r.highRepSets > 0 && new Date(r.date + "T00:00:00Z").getTime() >= recentCut,
  );
  if (highRepSessions.length > 0) {
    const total = highRepSessions.reduce((s, r) => s + r.highRepSets, 0);
    flags.push(
      `⚠ SÉRIES LONGAS PERNAS: ${total} série(s) com ≥15 reps nas últimas 2 semanas — faixa desaconselhada para corredor (resistência muscular local já desenvolvida pela corrida); preferir 3-6 reps ≥80% 1RM (Bloco 3 #10)`,
    );
  }

  return flags.length > 0 ? flags.join("\n") : null;
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
    // Cadência — só mostra quando registada; assinala sobrepassada (<155 spm) per 2.4 #1.
    const cadStr = r.cadence_spm != null
      ? `${Math.round(r.cadence_spm)} spm${r.cadence_spm < 155 ? " ⚠cadência<155" : ""}`
      : null;
    const parts = [distance, duration, pace, cadStr].filter(Boolean);
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

// ─── Bloco 2.1 — ACWR (rácio aguda:crónica) ─────────────────────────────────
// Acute = km nas últimas 7 noites · Chronic = média de 4 semanas (28 dias).
// Faixas: seguro 0,80-1,30 · risco_acrescido 1,31-1,49 · PERIGO ≥1,50.
// Fonte: Gabbett 2016 — The training-injury prevention paradox.
// deno-lint-ignore no-explicit-any
export function computeACWR(
  runs: any[],
  todayISO: string,
): { acuteKm: number; chronicWeeklyKm: number; ratio: number; zone: string } | null {
  if (!runs || runs.length === 0) return null;
  const todayMs = new Date(todayISO + "T00:00:00Z").getTime();
  const acuteCutMs   = todayMs - 7  * 86400000; // últimos 7 dias
  const chronicCutMs = todayMs - 28 * 86400000; // últimas 4 semanas
  const acuteKm = runs
    .filter((r) => r.date && new Date(r.date + "T00:00:00Z").getTime() >= acuteCutMs)
    .reduce((s, r) => s + (Number(r.distance_km) || 0), 0);
  const chronicTotal = runs
    .filter((r) => r.date && new Date(r.date + "T00:00:00Z").getTime() >= chronicCutMs)
    .reduce((s, r) => s + (Number(r.distance_km) || 0), 0);
  const chronicWeeklyKm = chronicTotal / 4;
  // Com menos de 1 km/semana de média crónica o rácio é matematicamente inútil.
  if (chronicWeeklyKm < 1) return null;
  const ratio = acuteKm / chronicWeeklyKm;
  const zone = ratio >= 1.50 ? "PERIGO(≥1,50)"
    : ratio >= 1.31 ? "risco_acrescido(1,31-1,49)"
    : ratio < 0.80  ? "possível_destreino(<0,80)"
    : "seguro(0,80-1,30)";
  return {
    acuteKm:          Math.round(acuteKm          * 10) / 10,
    chronicWeeklyKm:  Math.round(chronicWeeklyKm  * 10) / 10,
    ratio:            Math.round(ratio             * 100) / 100,
    zone,
  };
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

// ─── Bloco 1 — Objetivo e viabilidade ───────────────────────────────────────
// Espelha src/utils/raceViability.js (duplicado por necessidade: as Edge
// Functions não têm acesso a src/). Alterações aqui devem ser espelhadas lá.
// Fontes: Daniels' Running Formula 4th Ed (2021), Pfitzinger, Higdon, Koop.

// Semanas mínimas de preparação por nível × distância (limite INFERIOR da faixa).
const VIAB_MIN_WEEKS: Record<string, Record<string, number | null>> = {
  iniciante: { "5k":  6, "10k": 10, "meia": 16, "maratona": 24, "ultra": null },
  basico:    { "5k":  6, "10k":  8, "meia": 12, "maratona": 18, "ultra":   24 },
  medio:     { "5k":  4, "10k":  6, "meia": 10, "maratona": 14, "ultra":   18 },
  avancado:  { "5k":  4, "10k":  4, "meia":  8, "maratona": 12, "ultra":   14 },
};

// Volume semanal pré-requisito por nível × distância (km/semana, limite inferior).
const VIAB_MIN_VOL: Record<string, Record<string, number>> = {
  iniciante: { "5k": 10, "10k": 15, "meia": 25, "maratona": 35, "ultra": 45 },
  basico:    { "5k": 15, "10k": 25, "meia": 35, "maratona": 45, "ultra": 55 },
  medio:     { "5k": 25, "10k": 35, "meia": 45, "maratona": 60, "ultra": 70 },
  avancado:  { "5k": 35, "10k": 45, "meia": 60, "maratona": 75, "ultra": 90 },
};

function viabCatDist(km: number | null): string | null {
  if (!km) return null;
  if (km <=  5.5) return "5k";
  if (km <= 11.0) return "10k";
  if (km <= 22.5) return "meia";
  if (km <= 50.0) return "maratona";
  return "ultra";
}

function assessViability(
  distanceKm: number | null,
  level: string | null,
  weeksToRace: number,
  weeklyVolumeKm: number | null,
): string[] {
  const flags: string[] = [];
  if (weeksToRace <= 0) return flags;
  const cat = viabCatDist(distanceKm);
  if (!cat || !level || !VIAB_MIN_WEEKS[level]) return flags;
  if (cat === "ultra" && level === "iniciante") flags.push("ultra_para_iniciante");
  const minW = VIAB_MIN_WEEKS[level][cat];
  if (minW != null && weeksToRace < minW) flags.push("tempo_insuficiente");
  const minV = VIAB_MIN_VOL[level][cat];
  if (minV != null && weeklyVolumeKm != null && weeklyVolumeKm < minV) flags.push("volume_insuficiente");
  return flags;
}

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
function buildRaceEventsContext(
  events: any[],
  todayISO: string,
  weeklyVolumeKm: number | null,
  profileLevel: string | null,
): string | null {
  if (events.length === 0) return null;
  const today = new Date(todayISO + "T00:00:00Z");
  const lines = events.map((e) => {
    const eventDate = new Date(e.date + "T00:00:00Z");
    const daysUntil = Math.round((eventDate.getTime() - today.getTime()) / 86400000);
    const weeksUntil = Math.floor(daysUntil / 7);
    const typeLabel = RACE_TYPE_LABELS[e.race_type] || e.race_type;
    // Ritmo e tempo-alvo são objetivos distintos e vêm em colunas próprias.
    // `target_time` (texto livre) só entra como último recurso, para provas
    // criadas antes de os campos numéricos existirem.
    const paceStr = e.target_pace_seconds_per_km
      ? formatPaceMinKm(e.target_pace_seconds_per_km)
      : (e.distance_km && e.target_time_seconds
        ? formatPaceMinKm(Math.round(e.target_time_seconds / e.distance_km))
        : null);
    const effectiveLevel = e.experience_level || profileLevel;
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
    // Bloco 1 — Viabilidade do objetivo (objetivo_inviavel)
    const viabFlags = daysUntil > 0
      ? assessViability(e.distance_km ?? null, effectiveLevel, weeksUntil, weeklyVolumeKm)
      : [];
    const viabLines = viabFlags.map((f) => {
      if (f === "ultra_para_iniciante") return "⚠ OBJETIVO_INVIAVEL: ultra desaconselhado para iniciante";
      if (f === "tempo_insuficiente")   return `⚠ OBJETIVO_INVIAVEL: tempo insuficiente (${weeksUntil} sem. disponíveis)`;
      if (f === "volume_insuficiente")  return `⚠ OBJETIVO_INVIAVEL: volume insuficiente (média ${weeklyVolumeKm} km/sem)`;
      return `⚠ OBJETIVO_INVIAVEL: ${f}`;
    });
    const viabSuffix = viabLines.length > 0 ? `\n  ${viabLines.join("\n  ")}` : "";
    return `- ${e.date} (daqui a ${daysUntil} dia(s)): ${e.name} — ${typeLabel}${extras ? ` (${extras})` : ""}${viabSuffix}`;
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

// ─── Bloco 4 — Targets nutricionais calculados ────────────────────────────────
// Computa valores de referência a partir dos dados do perfil, para que o modelo
// não os tenha de derivar a partir dos campos brutos (e possivelmente errar).
//
// Fontes: Mifflin-St Jeor (1990); ACSM/AND 2016; ISSN Jäger 2017; Burke 2021.

// Proteína de manutenção (g/kg/dia), faixa inferior e superior por nível.
const PROTEIN_MAINT: Record<string, [number, number]> = {
  iniciante: [1.2, 1.4],
  basico:    [1.4, 1.6],
  medio:     [1.6, 1.8],
  avancado:  [1.6, 2.0],
};

export function buildNutritionTargets(opts: {
  weightKg:        number | null;
  heightCm:        number | null;
  age:             number | null;
  gender:          string | null;
  level:           string | null;
  restingHrBpm:    number | null;
  waterGoalMl:     number | null;
  proteinGoal:     number | null;
  calorieGoal:     number | null;
  weeklyVolumeKm:  number | null;
}): string | null {
  const { weightKg, heightCm, age, gender, level, restingHrBpm,
          waterGoalMl, proteinGoal, calorieGoal, weeklyVolumeKm } = opts;
  const lines: string[] = [];

  // TMB (Mifflin-St Jeor) + GETD estimado (Bloco 4.1 #4)
  if (weightKg && heightCm && age && gender) {
    const tmb = (gender === "feminino" || gender === "F" || gender === "f")
      ? (10 * weightKg) + (6.25 * heightCm) - (5 * age) - 161
      : (10 * weightKg) + (6.25 * heightCm) - (5 * age) + 5;
    const tmbR = Math.round(tmb);
    // Custo de corrida: 1 kcal/kg/km; GETD = TMB × 1,3 (atividade leve não-treino)
    const runCost = weeklyVolumeKm ? Math.round((weeklyVolumeKm * weightKg) / 7) : 0;
    const getd    = Math.round(tmb * 1.3) + runCost;
    lines.push(`TMB estimada (Mifflin-St Jeor): ${tmbR} kcal/dia`);
    lines.push(`GETD estimado: ${getd} kcal/dia (TMB×1,3 + ${runCost} kcal custo de corrida/dia)`);
    if (calorieGoal) {
      const diff = calorieGoal - getd;
      if (diff < -500) {
        lines.push(`⚠ META DE CALORIAS (${calorieGoal} kcal) abaixo do GETD em ${Math.abs(diff)} kcal — excede o défice seguro para corredor (máximo 300-500 kcal/dia)`);
      }
    }
  }

  // Proteína de manutenção por nível + escalamento por volume (Bloco 4.1 #1)
  if (weightKg && level && PROTEIN_MAINT[level]) {
    const [pMin, pMax] = PROTEIN_MAINT[level];
    // +0,15 g/kg/dia (média de 0,1-0,2) por cada +20 km/sem acima de 30 km/sem
    const bonus = (weeklyVolumeKm && weeklyVolumeKm > 30)
      ? Math.round(((weeklyVolumeKm - 30) / 20) * 0.15 * 10) / 10
      : 0;
    const gMin = Math.round((pMin + bonus) * weightKg);
    const gMax = Math.round((pMax + bonus) * weightKg);
    const volNote = bonus > 0 ? `, +${bonus} g/kg p/ volume de ${weeklyVolumeKm} km/sem` : "";
    lines.push(`Proteína recomendada (manutenção, nível ${level}${volNote}): ${gMin}-${gMax} g/dia`);
    if (proteinGoal && proteinGoal < gMin) {
      lines.push(`  → Meta atual (${proteinGoal} g) abaixo do mínimo recomendado (${gMin} g)`);
    }
  }

  // Hidratação base (Bloco 4.1 #6)
  if (weightKg) {
    const hMin = Math.round(weightKg * 30);
    const hMax = Math.round(weightKg * 40);
    lines.push(`Hidratação base (30-40 ml/kg × ${weightKg} kg): ${hMin}-${hMax} ml/dia (excluindo reposição de treino)`);
    if (waterGoalMl && waterGoalMl < hMin) {
      lines.push(`  → Meta de água atual (${waterGoalMl} ml) abaixo do mínimo calculado (${hMin} ml)`);
    }
  }

  // RED-S: FC em repouso <40 bpm (Bloco 4.2 #1) — novo campo, antes não capturável
  if (restingHrBpm !== null && restingHrBpm < 40) {
    lines.push(
      `⚠ RED-S — FC em repouso: ${restingHrBpm} bpm < 40 bpm (fora de adaptação de elite) — avaliar em conjunto com ingestão calórica, composição corporal e sintomas (Bloco 4.2 #1)`,
    );
  }

  if (lines.length === 0) return null;
  return `Targets nutricionais calculados (doutrina Bloco 4.1):\n${lines.map((l) => `- ${l}`).join("\n")}`;
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
  nutritionTargetsLine: string | null,
  nutritionSummary: string,
  waterSummary: string,
  gymSummary: string | null,
  gymMetricsLine: string | null,
  runningSummary: string | null,
  acwrLine: string | null,
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
    // ── Doutrina Bloco 4.1 — Nutrição base diária ───────────────────────────
    `NUTRIÇÃO — BASE DIÁRIA (Bloco 4.1 — ACSM/AND 2016, ISSN, Burke 2021):\n` +
    `PROTEÍNA (g/kg/dia) por nível e objetivo:\n` +
    `  Iniciante: manutenção 1,2-1,4 · perda gordura 1,6-1,8 · ganho 1,6-2,0\n` +
    `  Básico:    manutenção 1,4-1,6 · perda 1,8-2,0 · ganho 1,6-2,0\n` +
    `  Médio:     manutenção 1,6-1,8 · perda 2,0-2,2 · ganho 1,8-2,2\n` +
    `  Avançado:  manutenção 1,6-2,0 · perda 2,0-2,4 · ganho 1,8-2,2\n` +
    `  Escalamento por volume: +0,1-0,2 g/kg/dia por cada +20 km/sem acima de 30 km/sem.\n` +
    `  Distribuição: 3-5 refeições/dia, 0,3-0,4 g/kg por refeição a cada 3-4h.\n` +
    `HIDRATOS: meta variável por dia — "fuel for the work required" (Burke 2011).\n` +
    `  Iniciante: descanso 3,0-5,0 · treino moderado (~1h) 4,0-5,0 g/kg\n` +
    `  Básico:    descanso 3,0-4,0 · treino (1h intenso) 5,0-7,0 g/kg\n` +
    `  Médio:     descanso 4,0-5,0 · treino (1-2h longo/qualidade) 6,0-8,0 g/kg\n` +
    `  Avançado:  descanso 5,0-6,0 · treino intenso (2-3h) 8,0-10,0 g/kg; até 10-12 nas 36-48h pré-maratona\n` +
    `  NOTA: profiles.carbs_goal é a linha de base (dia sem treino). O acréscimo do treino vive na análise, não na meta guardada.\n` +
    `GORDURA:\n` +
    `  Mínimo: 20-25% do GETD OU 0,8-1,0 g/kg/dia.\n` +
    `  Alarme RED-S: <20% calorias ou <0,5-0,7 g/kg cronicamente → supressão hormonal (eixo LH/FSH), amenorreia (M), queda de testosterona (H), redução de densidade óssea.\n` +
    `  Pode descer a 15-20% nas 24-48h de carb-loading pré-maratona.\n` +
    `TMB E GETD (Mifflin-St Jeor 1990 — mais rigoroso que 220-idade):\n` +
    `  H: (10×peso) + (6,25×altura cm) − (5×idade) + 5\n` +
    `  M: (10×peso) + (6,25×altura cm) − (5×idade) − 161\n` +
    `  GETD = TMB × fator atividade não-treino (1,2-1,4) + custo corrida (≈1,0 kcal/kg/km).\n` +
    `  BIA: body_assessments.bmr_kcal NÃO usar para cálculo (erro ±200-400 kcal/dia) — informativo apenas.\n` +
    `  Os targets calculados no contexto abaixo mostram a estimativa Mifflin para este atleta.\n` +
    `DÉFICE CALÓRICO MÁXIMO por nível:\n` +
    `  Iniciante/Básico: 300-500 kcal/dia (15-20%) · perda ≤0,5 kg/sem (≤0,7% do peso).\n` +
    `  Médio:            250-400 kcal/dia (10-15%) · perda ≤0,25-0,40 kg/sem.\n` +
    `  Avançado:         200-300 kcal/dia (5-10%) · perda ≤0,20-0,30 kg/sem.\n` +
    `  Alto volume/taper/blocos intensos: DÉFICE ZERO — manutenção estrita (risco de perda de massa magra, supressão imunitária, overreaching).\n` +
    `  Durante qualquer fase de défice: proteína no limite superior do nível (1,8-2,4 g/kg).\n` +
    `HIDRATAÇÃO:\n` +
    `  Base diária: 30-40 ml/kg/dia (excluindo reposição de treino).\n` +
    `  Durante treino: 400-800 ml/h, ajustado a taxa de sudação e clima.\n` +
    `  Pós-treino: repor 1,2-1,5 L por 1,0 kg de peso perdido nas 2-4h, com 500-700 mg sódio/L.\n` +
    `  Clima >30°C: sudação pode passar 1,5-2,0 L/h; planear 300-600 mg/h de sódio para evitar hiponatremia.\n` +
    `  Sódio durante treino longo (>90 min): 300-600 mg/h — NÃO se soma ao limite de repouso (<2000 mg/dia OMS).\n\n` +
    // ── Doutrina Bloco 4.2 — Segurança ──────────────────────────────────────
    `NUTRIÇÃO — SEGURANÇA (Bloco 4.2 — IOC Mountjoy 2018/2023, Loucks 2004, Peeling 2008):\n` +
    `RED-S — disponibilidade energética (EA) = (ingestão − gasto exercício) / massa magra. Ótima ≥45 kcal/kg FFM/dia · subclínica 30-45 · limiar RED-S <30 (mantido ≥5-7 dias).\n` +
    `Sinais — alarmar quando ≥2-3 apontam na mesma direção (nenhum sinal isolado confirma RED-S):\n` +
    `  1. Ingestão calórica cronicamente baixa face ao GETD (EA <30 kcal/kg FFM estimado)\n` +
    `  2. Gordura corporal no piso fisiológico: <6-8% (H) ou <14-16% (M) — verificável em body_assessments\n` +
    `  3. FC em repouso <40 bpm (verificável em profiles.resting_hr_bpm) — o contexto assinala se presente\n` +
    `  4. Perda rápida/involuntária de peso; amenorreia ≥3 meses (M); queda de líbido/testosterona (H)\n` +
    `Consequências: supressão tiroideia (T3), redução de pico de massa óssea, imunossupressão, queda de performance.\n` +
    `FERRO (Peeling 2008/2014, Sim 2019): RDA geral H 8 mg/dia, M 18 mg/dia. Corredores de resistência: +30-50% → H ~11-14 mg/dia.\n` +
    `  Mecanismos: hemólise plantar + hepcidina pós-esforço (pico 3-6h) + perdas GI + ferro no suor.\n` +
    `  Suplementação oral: só com ferritina <30 µg/L confirmada por análise — risco de hemocromatose por sobrecarga.\n` +
    `RITMO DE PERDA DE PESO (Garthe 2011): ≤0,5-0,7% da massa corporal/semana, défice 250-500 kcal/dia.\n` +
    `  >1,0%/sem ou défice >500 kcal/dia: perda de massa magra, depleção de glicogénio, queda de rendimento.\n\n` +
    // ── Doutrina Bloco 4.3 — Treino e prova ─────────────────────────────────
    `NUTRIÇÃO — TREINO E PROVA (Bloco 4.3 — ACSM, Burke 2021, Jeukendrup 2014):\n` +
    `PRÉ-TREINO (para treino Z3-Z5 ou >60 min):\n` +
    `  3-4h antes: 2,0-4,0 g/kg hidratos (refeição sólida) + 0,3-0,4 g/kg proteína. Gordura e fibra baixas.\n` +
    `  1h antes:   1,0 g/kg hidratos (snack leve). Rodagem <45 min Z1: sem ingestão prévia especial.\n` +
    `PÓS-TREINO:\n` +
    `  Hidratos: 1,0-1,2 g/kg/h nas 2-4h se sessão seguinte em <24h; ou 1,0 g/kg na 1.ª refeição.\n` +
    `  Proteína: 0,3-0,5 g/kg (20-40g) com ≥2,5-3,0g leucina, nas 0-2h após o treino.\n` +
    `HIDRATOS DURANTE A PROVA (Jeukendrup 2014, Viribay 2020):\n` +
    `  <45 min: nenhum. · 45-75 min: bochecho ou até 30 g/h.\n` +
    `  1,0-2,5h: 30-60 g/h (glicose/maltodextrina).\n` +
    `  >2,5-3,0h: 60-90 g/h, fontes múltiplas (glicose:frutose 2:1 ou 1:0,8).\n` +
    `  >4-6h: até 90-120 g/h (requer 4-6 semanas de habituação intestinal).\n` +
    `  Ingerir 100-150 ml água por cada 15-20g de hidratos.\n` +
    `CARB-LOADING (Bussau 2002, Burke 2011) — indicado quando prova >90 min:\n` +
    `  Nas 24-48h antes: 10-12 g/kg/dia de hidratos · fibra <10-15 g/dia · gordura <15-20% das calorias.\n` +
    `  NÃO indicado em 5k/10k (<75 min) — só traz peso extra (~3g água por 1g glicogénio).\n` +
    `  Quando o contexto mostrar prova dentro de 24-48h e distância >22 km, relembrar proativamente.\n` +
    `FIBRA:\n` +
    `  Alvo diário: 25 g/dia (M) a 38 g/dia (H), ou ~14g/1000 kcal.\n` +
    `  24-48h antes da prova: reduzir para <10-15 g/dia (esvaziar resíduo fecal, evitar cólicas).\n` +
    `CAFEÍNA (ISSN Guest 2021): dose ergogénica 3-6 mg/kg (210-420 mg para 70 kg), 60 min antes.\n` +
    `  Acima de 9 mg/kg: sem ganho extra, mais efeitos colaterais. Testar sempre em treino antes da prova.\n\n` +
    // ── Doutrina Bloco 3 — Ginásio ao serviço da corrida ────────────────────
    `GINÁSIO AO SERVIÇO DA CORRIDA (Bloco 3 — Blagrove 2015, Rønnestad/Mujika 2014, Schoenfeld 2020, Gabbett 2016):\n` +
    `PAPEL DA FORÇA por nível (transição pressupõe padrões fundamentais consolidados):\n` +
    `  Iniciante: 80% coordenação/aprendizagem motora/resiliência tecidual · 20% economia de corrida · 0% potência (desaconselhada)\n` +
    `  Básico:    60% prevenção/reforço articular-tendinoso · 30% economia via adaptações neurais · 10% potência inicial\n` +
    `  Médio:     45% economia e pico de força máxima · 35% prevenção e estabilidade pélvica/core · 20% potência e RFD\n` +
    `  Avançado:  40% economia e recrutamento de UMs de limiar elevado · 40% potência, RFD e rigidez do tendão de Aquiles · 20% prevenção\n` +
    `GRUPOS PRIORITÁRIOS: 1.º tricípite sural (solear+gémeos) · 2.º quadríceps · 3.º isquiotibiais+glúteo máximo · 4.º glúteo médio/mínimo (estabilização pélvica). Secundários: core/eretores, flexores da anca, tibial anterior.\n` +
    `SÉRIES/SEMANA por grupo (membros inferiores, séries de trabalho efetivas RIR 2-3):\n` +
    `  Iniciante: desenvolvimento 4-6 · manutenção 2-3 (-50%)\n` +
    `  Básico:    desenvolvimento 6-8 · manutenção 3-4 (-50%)\n` +
    `  Médio:     desenvolvimento 8-10 · manutenção 3-5 (-50-60% nas últimas 4-6 sem pré-prova)\n` +
    `  Avançado:  desenvolvimento 8-12 (≥80% 1RM) · manutenção 4-6 (-50-60%, mantendo a carga em kg)\n` +
    `FAIXAS DE REPETIÇÕES:\n` +
    `  Força máxima/adaptação neural: 1-5 reps (≥85% 1RM), descanso 2-5 min — PREFERIDA para corredor.\n` +
    `  Hipertrofia: 6-12 reps (65-80% 1RM), descanso 60-90 s — aceitável.\n` +
    `  Resistência muscular local (15+ reps): DESACONSELHADA para corredor — essa qualidade já é desenvolvida pela corrida. Se detetares séries ≥15 reps no contexto, sinalizar (⚠ SÉRIES LONGAS PERNAS).\n` +
    `PROGRESSÃO DE CARGA por nível:\n` +
    `  Iniciante: +2,5-5,0 kg a cada 1-2 sem · critério: completar topo das reps em todas as séries com RPE ≤7.\n` +
    `  Básico:    +2,5-5,0 kg a cada 2-3 sem · critério: +2 reps além do alvo na última série, em 2 treinos consecutivos.\n` +
    `  Médio:     +1,25-2,5 kg a cada 3-4 sem ou na transição de bloco · critério: manter RIR 2 sem degradar velocidade concêntrica.\n` +
    `  Avançado:  +1,0-2,5 kg a cada 4-6 sem, periodização ondulatória · critério: perda de velocidade intrassérie <10-15%.\n` +
    `VOLUME-CARGA SPIKE (#6): >10-15% de aumento do Σ(séries×reps×kg) face à média móvel das 4 semanas = risco acrescido; >20% = risco elevado de lesão miotendinosa. O contexto pode conter alertas ⚠ VOLUME-CARGA PERNAS.\n` +
    `INTERVALO ENTRE SESSÕES (#7): 48-72 h entre sessões do mesmo grupo de membros inferiores. Baixo volume (2-4 séries): 48 h; alto volume (6-10 séries): 72 h. O contexto pode conter alertas ⚠ INTERVALO PERNAS.\n` +
    `TREINO ATÉ À FALHA (#11): 0% das séries de pernas para corredor em ciclo ativo. Todas as séries de pernas: RIR 2-4 (RPE 6-8). Falha (RIR 0) só em ≤5% das séries secundárias de superiores/core.\n` +
    `  Custo da falha: recuperação neuromuscular 72-96 h (vs. 48 h), CK +30-50%, glicogénio local esgotado, economia de corrida reduzida 3-4 dias.\n` +
    `INTERFERÊNCIA CORRIDA+GINÁSIO (#4 — prescritivo, ao propor plano):\n` +
    `  Corrida de qualidade + ginásio de pernas NO MESMO DIA: só se corrida PRIMEIRO (manhã), ginásio ao final (noite), separados por ≥6-9 h.\n` +
    `  Ginásio de pernas PRIMEIRO: aguardar ≥24 h até qualquer corrida de qualidade (Z3+) ou treino longo.\n` +
    `  Ao propor um microciclo, nunca colocar corrida de qualidade e ginásio de pernas em conflito — ou separa os dias, ou agenda a corrida de manhã e o ginásio ao final com nota explícita.\n` +
    `PLIOMETRIA por nível (contactos do pé com o solo):\n` +
    `  Iniciante: desaconselhada. Baixo impacto (skipping, corda) só após ≥12 sem de força de base.\n` +
    `  Básico:    40-60 contactos/sessão, 1×/sem · pré-req: ≥6 meses de força + agachamento estável.\n` +
    `  Médio:     60-80 contactos/sessão, 1-2×/sem · pré-req: ≥1 ano de força + agachamento ≥1,2-1,5× peso corporal.\n` +
    `  Avançado:  80-120 contactos/sessão, 1-2×/sem · pré-req: ≥2 anos de força pesada + agachamento ≥1,5-1,8× peso corporal.\n` +
    `VOLUME DE MANUTENÇÃO em bloco de prova/taper:\n` +
    `  Iniciante: 1 sessão/sem, 20-30 min, 2-3 séries/grupo.\n` +
    `  Básico:    1 sessão/sem, 30 min, 2-3 séries/grupo, mantendo a carga em kg.\n` +
    `  Médio:     1-2 sessões/sem, 20-30 min, 3-4 séries/grupo (33%), velocidade máxima concêntrica, ≥80% 1RM.\n` +
    `  Avançado:  1-2 sessões/sem, 20 min, 3-4 séries/grupo (30-40%), 1-5 reps ≥85% 1RM (eliminar fadiga metabólica).\n` +
    `  Regra: corta-se SÉRIES e REPS, nunca a carga (kg ou %1RM).\n\n` +
    // ── Doutrina Bloco 2.1 — Carga e progressão ─────────────────────────────
    `CARGA E PROGRESSÃO DE CORRIDA (Bloco 2.1 — Daniels 2021, Pfitzinger 2014, Gabbett 2016):\n` +
    `Teto de aumento semanal de volume por nível (percentual OU absoluto — usar o mais restritivo):\n` +
    `  Iniciante: ≤5-10 % OU ≤+2-3 km/sem\n` +
    `  Básico:    ≤10 % OU ≤+3-5 km/sem\n` +
    `  Médio:     ≤10 % OU ≤+5-8 km/sem\n` +
    `  Avançado:  ≤10 % OU ≤+8-10 km/sem\n` +
    `  Nunca subir volume E intensidade (Z3-Z5) na mesma semana.\n` +
    `ACWR (rácio aguda:crónica, Gabbett 2016): seguro 0,80-1,30 · risco_acrescido 1,31-1,49 · PERIGO ≥1,50 (risco exponencial de lesão/sobretreino). Se o contexto mostrar ACWR em zona de risco, reflete isso no plano antes de propor aumentos.\n` +
    `DESCARGA (semana de recuperação):\n` +
    `  Iniciante: de 2-3 em 2-3 sem · corte de 20-30 % do volume\n` +
    `  Básico:    de 3 em 3 sem     · corte de 20-25 %\n` +
    `  Médio:     de 3-4 em 3-4 sem · corte de 20-25 %\n` +
    `  Avançado:  de 3-4 em 3-4 sem (ciclos 3:1 ou 4:1) · corte de 15-20 %\n` +
    `  Corte aplica-se ao VOLUME; manter intensidade dos treinos-chave (Z3-Z5).\n` +
    `TREINO LONGO (% volume semanal / teto absoluto — o que vier primeiro):\n` +
    `  Iniciante: 25-33 % · ≤10-12 km ou ≤90 min\n` +
    `  Básico:    25-30 % · ≤16-18 km ou ≤120 min\n` +
    `  Médio:     25-30 % · ≤25-28 km ou ≤150 min\n` +
    `  Avançado:  20-25 % · ≤30-32 km/150 min (Daniels) ou ≤38 km/180 min em prep. maratona (Pfitzinger)\n` +
    `REGRESSO APÓS PAUSA (sem lesão grave — escala destreino Coyle 1986/Daniels 2021):\n` +
    `  1 sem: retoma a 100 % (só Z1/Z2 na 1.ª semana).\n` +
    `  2 sem: retoma a 75 %; recupera em 1-2 sem.\n` +
    `  4 sem: 1.ª sem 50 %, 2.ª sem 75 %; recupera em 3-4 sem.\n` +
    `  8+ sem: 1.ª sem 33-50 %, +10 %/sem; recupera em 6-12 sem (regra 1:1 parado:reconstrução).\n` +
    `  Pós-lesão músculo-esquelética: condição adicional EVA ≤2/10 — a app não consegue verificar.\n\n` +
    // ── Doutrina Bloco 2.2 — Intensidade ─────────────────────────────────────
    `INTENSIDADE DE CORRIDA (Bloco 2.2 — Seiler 2010, Fitzgerald 2014, Daniels 2021):\n` +
    `Distribuição por nível (medir por TEMPO nas zonas, não n.º de sessões):\n` +
    `  Iniciante: 90-100 % Z1/Z2 · 0-10 % Z3 (modelo 80/20 NÃO se aplica — exige ≥6-12 sem contínuas e ≥20-25 km/sem já construídos)\n` +
    `  Básico:    85-90 % Z1/Z2 · 10-15 % Z3/Z4\n` +
    `  Médio:     80 % Z1/Z2 · 20 % Z3/Z5 (modelo 80/20 clássico, Fitzgerald/Seiler)\n` +
    `  Avançado:  75-80 % Z1/Z2 · 20-25 % Z3/Z5 (polarizado ou piramidal conforme fase)\n` +
    `Quando introduzir trabalho de qualidade (≥Z3):\n` +
    `  Iniciante: fartlek suave após ≥4-6 sem contínuas e ≥15-20 km/sem (≥4 sem). Intervalos/limiar: ≥6-12 sem contínuas.\n` +
    `  Básico:    subidas/fartlek desde sem 1. Limiar após ≥4 sem a 25-30 km/sem. Intervalos após ≥6-8 sem a 30-35 km/sem.\n` +
    `  Médio:     subidas/fartlek/limiar desde sem 1-2 do ciclo (≥35-40 km/sem ×4 sem). Intervalos na fase específica (sem 3-4).\n` +
    `  Avançado:  todos os tipos desde sem 1 (≥50-60 km/sem na base).\n` +
    `SINAL DE FADIGA AGUDA (RPE/pace — Foster 1998, Meeusen 2013): RPE ≥+2 pontos Borg CR10 para o mesmo pace, OU pace caiu ≥5-8 % (≥15-20 seg/km) para o mesmo RPE, ≥2-3 sessões consecutivas → cortar 50 % do volume do dia ou cancelar sessão de intensidade e substituir por Z1/descanso.\n\n` +
    // ── Doutrina Bloco 2.4 — Cadência e sinais biomecânicos ──────────────────
    `CADÊNCIA E TÉCNICA (Bloco 2.4 — Heiderscheit MSSE 2011, Daniels 2021, Bramah AJSM 2018):\n` +
    `NÃO recomendar 180 spm como alvo universal — é individual (depende de estatura, massa, velocidade). O mito dos "180 para todos" é rejeitado pela biomecânica moderna.\n` +
    `Faixa funcional em Z1-Z3: 160-180 spm. Em Z4/Z5: 180-200+ spm é normal.\n` +
    `SINAL VERMELHO: cadência crónica <155 spm associa-se a overstriding e +15-20 % de força de impacto no joelho/anca.\n` +
    `Se a cadência de um run for <155 spm (assinalado com ⚠cadência<155 no contexto): sugerir aumento de +5-10 % sobre a cadência ATUAL do próprio atleta — nunca um valor absoluto.\n` +
    `Fora disso (155-180 spm em Z1-Z3), não comentar cadência — é ruído.\n\n` +
    `PLANOS DE TREINO: quando o utilizador te pedir um plano, sugestões de treinos para os ` +
    `próximos dias, ou o que deve fazer na próxima semana, usa a função propose_training_plan ` +
    `em vez de listares os treinos apenas no texto. A proposta fica pendente e o atleta ` +
    `aceita-a no ecrã Início. Antes de propores, tem em conta o histórico recente, o nível ` +
    `do atleta e as provas agendadas — uma prova principal próxima muda o plano (taper). ` +
    `Respeita os limiares de carga acima (ACWR, % semanal, frequência por nível). ` +
    `Depois de criares a proposta, diz na tua resposta o que propuseste e que está no Início à espera de ` +
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
  if (nutritionTargetsLine) sys += `\n\n${nutritionTargetsLine}`;
  if (gymSummary) sys += `\n\n${gymSummary}`;
  if (gymMetricsLine) sys += `\n${gymMetricsLine}`;
  if (runningSummary) sys += `\n\n${runningSummary}`;
  if (acwrLine) sys += `\n${acwrLine}`;
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
    const gymRows = summariseSessions(gymSessions || []);
    const gymMetricsLine = computeGymMetrics(gymRows, todayISO);

    // ── Corridas dos últimos 30 dias ──────────────────────────────────────
    const RUNNING_WINDOW_DAYS = 30;
    const runStartD = new Date();
    runStartD.setUTCDate(runStartD.getUTCDate() - (RUNNING_WINDOW_DAYS - 1));
    const runStartISO = runStartD.toISOString().slice(0, 10);
    const { data: recentRuns } = await sb
      .from("runs")
      .select("date, kind, training_type, distance_km, duration_seconds, cadence_spm")
      .eq("user_id", userId)
      .gte("date", runStartISO)
      .lte("date", todayISO)
      .order("date", { ascending: false });
    const runningSummary = buildRunningSummary(recentRuns || [], RUNNING_WINDOW_DAYS);

    // ACWR — calculado sobre os mesmos recentRuns (30 dias cobre as 28 noites
    // necessárias para a carga crónica). Incluído no contexto como valor pré-
    // calculado para o modelo não ter de o derivar a partir das linhas brutas.
    const acwr = computeACWR(recentRuns || [], todayISO);
    const acwrLine = acwr
      ? `ACWR atual: ${acwr.ratio} (aguda ${acwr.acuteKm} km/7d · crónica ${acwr.chronicWeeklyKm} km/sem) — zona: ${acwr.zone}`
      : null;

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
    // Volume médio semanal das últimas 4 semanas — usado pelo Bloco 1 para
    // avaliar a viabilidade do objetivo (flag volume_insuficiente).
    const runs4w = (recentRuns || []) as Array<{ date: string; distance_km: number }>;
    const cutoff4wMs = new Date(todayISO + "T00:00:00Z").getTime() - 4 * 7 * 86400000;
    const vol4w = runs4w
      .filter((r) => r.date && new Date(r.date + "T00:00:00Z").getTime() >= cutoff4wMs)
      .reduce((s, r) => s + (Number(r.distance_km) || 0), 0);
    const weeklyVolumeKm = runs4w.length > 0 ? Math.round((vol4w / 4) * 10) / 10 : null;
    const raceEventsContext = buildRaceEventsContext(
      upcomingRaces || [],
      todayISO,
      weeklyVolumeKm,
      (profile?.experience_level as string | null) ?? null,
    );

    // ── Bloco 4 — Targets nutricionais calculados (Mifflin-St Jeor) ──────
    const ageFromBirth = profile?.birth_date
      ? Math.floor((Date.now() - new Date(profile.birth_date as string).getTime()) / (365.25 * 24 * 3600 * 1000))
      : null;
    const nutritionTargetsLine = buildNutritionTargets({
      weightKg:      (profile?.weight_kg as number | null) ?? null,
      heightCm:      (profile?.height_cm as number | null) ?? null,
      age:           ageFromBirth,
      gender:        (profile?.gender as string | null) ?? null,
      level:         (profile?.experience_level as string | null) ?? null,
      restingHrBpm:  (profile?.resting_hr_bpm as number | null) ?? null,
      waterGoalMl:   (profile?.water_goal_ml as number | null) ?? null,
      proteinGoal:   (profile?.protein_goal as number | null) ?? null,
      calorieGoal:   (profile?.calorie_goal as number | null) ?? null,
      weeklyVolumeKm,
    });

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
      nutritionTargetsLine,
      nutritionSummary,
      waterSummary,
      gymSummary,
      gymMetricsLine,
      runningSummary,
      acwrLine,
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
