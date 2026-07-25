// IronHealth · analyze-gym Edge Function
// Modo normal: recebe 1+ prints de uma app de ginásio (Hevy, Strong, etc.),
// analisa com Gemini e grava workout_sessions + workout_session_sets na BD.
// Modo reanálise (session_id presente): repesca os prints já guardados dessa
// sessão no Storage, volta a chamar o Gemini com as observações atualizadas,
// e substitui os sets existentes pelos novos.
// Ao contrário da Nutrição, não há modo de entrada manual por texto aqui —
// séries/repetições/carga são números simples que o utilizador introduz
// diretamente no cliente, sem precisar de estimativa da IA.
// A chave Gemini vive apenas aqui (secret GEMINI_API_KEY), nunca no cliente.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_PHOTOS = 6;
const MAX_NOTES_LENGTH = 500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Alias que segue sempre o modelo flash estável mais recente — evita 404s
// quando a Google descontinua modelos para contas novas (mesmo alias usado
// em analyze-meal/analyze-body).
const GEMINI_MODEL = "gemini-flash-latest";
// Tempo máximo por chamada ao Gemini antes de desistir e tentar mais uma vez.
const GEMINI_TIMEOUT_MS = 40000;
const GEMINI_RETRIES = 1;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    session_name: { type: "STRING" },
    // Grupos musculares (força) ou modalidades (aula). Array: uma sessão pode
    // ser "Ombros" + "Tríceps". O cliente sugere uma lista; aceita-se texto
    // livre porque a coluna não tem CHECK.
    categories: { type: "ARRAY", items: { type: "STRING" } },
    // Métricas do relógio/app. Existem em qualquer tipo de sessão, mas numa
    // aula são tudo o que há para extrair.
    duration_seconds: { type: "NUMBER", nullable: true },
    calories_kcal: { type: "NUMBER", nullable: true },
    avg_hr: { type: "NUMBER", nullable: true },
    max_hr: { type: "NUMBER", nullable: true },
    exertion: { type: "NUMBER", nullable: true },
    // Tudo o que o print mostra e a app ainda não guarda. Não vai para a BD:
    // é registado nos logs para depois decidirmos o que vale a pena promover a
    // coluna própria (ver logEvent 'gym_analysis' no cliente).
    extra_fields: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          value: { type: "STRING" },
        },
        required: ["label", "value"],
      },
    },
    exercises: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          sets: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                reps: { type: "NUMBER", nullable: true },
                weight: { type: "NUMBER", nullable: true },
              },
              required: ["reps", "weight"],
            },
          },
        },
        required: ["name", "sets"],
      },
    },
  },
  required: ["session_name", "exercises"],
};

// Instruções comuns aos dois tipos: as métricas do relógio podem aparecer em
// qualquer sessão, e nunca se inventam valores.
const METRICS_PROMPT =
  "Extrai também, se estiverem visíveis, a duração total em SEGUNDOS " +
  "(duration_seconds), as calorias gastas (calories_kcal), a frequência " +
  "cardíaca média (avg_hr) e a máxima (max_hr), ambas em batimentos por minuto. " +
  "ATENÇÃO à duração: cada app escreve-a à sua maneira e tens de converter " +
  "sempre para segundos. Exemplos: \"37:57\" são 37 minutos e 57 segundos = " +
  "2277; \"43m\" são 43 minutos = 2580; \"45 min\" = 2700; \"1:05:30\" é uma " +
  "hora, 5 minutos e 30 segundos = 3930; \"1h 20m\" = 4800. Um treino de " +
  "ginásio dura tipicamente entre 15 e 120 minutos, por isso um resultado " +
  "abaixo de 600 segundos para uma sessão inteira é quase de certeza um erro " +
  "de conversão. " +
  "Extrai ainda o esforço percebido (exertion) numa escala de 1 a 10, se o ecrã " +
  "o mostrar (ex.: \"6/10\" num campo chamado Exertion, Esforço ou RPE). " +
  "Devolve null em qualquer campo que não esteja visível — nunca inventes nem " +
  "estimes valores.\n\n" +
  "Por fim, preenche extra_fields com TODOS os outros dados numéricos ou " +
  "textuais que o ecrã mostre sobre esta sessão e que não caibam em nenhum dos " +
  "campos acima (exemplos: volume total, número de recordes pessoais, hora de " +
  "início, distância, passos, ritmo, zonas de frequência cardíaca, elevação). " +
  "Usa o rótulo tal como aparece no ecrã em label, e o valor tal como aparece " +
  "em value. Se não houver nada nessas condições, devolve extra_fields vazio. " +
  "Não repitas nestes campos informação que já puseste nos campos acima.";

function buildPrompt(kind: string, notes: string | null): string {
  let prompt: string;

  if (kind === "aula") {
    // Numa aula (HIIT, RPM, pilates...) não há séries nem cargas: o print vem
    // tipicamente do relógio e só tem métricas agregadas. Pedir exercícios aqui
    // levava o modelo a inventá-los.
    prompt =
      "As imagens seguintes são capturas de ecrã (screenshots) de uma AULA de grupo ou " +
      "treino de cardio registado num relógio ou app de fitness (ex.: Samsung Health, " +
      "Garmin, Apple Watch, Strava), todas da MESMA sessão. Este tipo de treino NÃO tem " +
      "séries nem cargas — devolve a lista de exercícios (exercises) VAZIA, a não ser que " +
      "vejas explicitamente exercícios com repetições e peso. " +
      METRICS_PROMPT +
      " Sugere um nome curto para a sessão (session_name) e, se conseguires identificar a " +
      "modalidade, preenche categories com uma ou mais destas: HIIT, RPM/Cycling, Pilates, " +
      "Yoga, Body Pump, Zumba, CrossFit, Treino Funcional, Natação. Se não for claro qual é, " +
      "devolve categories vazio. Escreve em português de Portugal.";
  } else {
    prompt =
      "As imagens seguintes são capturas de ecrã (screenshots) de uma app de registo de " +
      "treino de ginásio (ex.: Hevy, Strong, ou similar), todas da MESMA sessão de treino " +
      "(possivelmente ecrãs diferentes da mesma sessão). Combina a informação de todas as " +
      "imagens e identifica cada exercício distinto, sem o repetir se aparecer em mais do " +
      "que um ecrã. Para cada exercício, extrai a lista de séries pela ordem em que aparecem, " +
      "cada uma com repetições (reps) e carga em quilogramas (weight). Se uma série não tiver " +
      "reps ou carga visíveis/registados, devolve null nesse campo (não inventes valores). " +
      "Sugere também um nome curto para a sessão (session_name) com base no tipo de treino " +
      "(ex.: \"Peito e Tríceps\", \"Pernas\", \"Full Body\"), em português de Portugal, e " +
      "preenche categories com TODOS os grupos musculares trabalhados na sessão, não apenas " +
      "um (ex.: um treino de elevações laterais e extensões de tríceps é [\"Ombros\", " +
      "\"Tríceps\"]). Escolhe de entre: Peito, Costas, Pernas, Ombros, Bíceps, Tríceps, " +
      "Braços, Core/Abdominais, Glúteos, Full Body, Push, Pull. Se não for claro, devolve " +
      "categories vazio. " +
      METRICS_PROMPT +
      " Usa nomes de exercícios em português de Portugal quando o exercício for conhecido " +
      "por esse nome, mantendo o nome original da app quando não houver tradução óbvia.";
  }

  if (notes && notes.trim()) {
    prompt +=
      "\n\nO utilizador deixou esta observação sobre a sessão — usa-a como contexto " +
      `adicional: "${notes.trim()}"`;
  }
  prompt += "\n\nResponde apenas com JSON estruturado conforme o schema.";
  return prompt;
}

// Estados HTTP de sobrecarga momentânea do lado da Google (500/502/503/504) —
// vale a pena repetir estes, porque costumam resolver-se à segunda. O 429
// (limite de pedidos excedido) fica DE FORA de propósito: repetir logo a
// seguir só volta a bater no mesmo limite por minuto — e até o acelera — por
// isso passa já ao chamador com uma mensagem clara. Erros "permanentes"
// (400, 401, 403...) também passam sempre à primeira.
const GEMINI_RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

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

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Chunked para evitar exceder o limite de argumentos de String.fromCharCode
// com fotos grandes.
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Contagem de tokens de uma chamada ao Gemini (usageMetadata da resposta),
// usada para estimar o custo real da API — ver admin_logs/painel de custos.
type GeminiUsage = { input_tokens: number; output_tokens: number };

type GymSet = { reps: number | null; weight: number | null };
type GymExercise = { name: string; sets: GymSet[] };
// Métricas do relógio. Os limites espelham os CHECKs da tabela
// workout_sessions — um valor fora de gama vindo do modelo tem de virar null
// aqui, senão o INSERT rebentava com erro de constraint em vez de simplesmente
// ignorar a leitura duvidosa.
type GymMetrics = {
  duration_seconds: number | null;
  calories_kcal: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  exertion: number | null;
};
// Campo visto no print para o qual ainda não há coluna. Só vai para os logs.
type GymExtraField = { label: string; value: string };
type GymAnalysis = {
  sessionName: string;
  categories: string[];
  exercises: GymExercise[];
  metrics: GymMetrics;
  extraFields: GymExtraField[];
  usage: GeminiUsage;
};

function intInRange(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !isFinite(v)) return null;
  const n = Math.round(v);
  return n >= min && n <= max ? n : null;
}

// Chama o Gemini com as imagens (base64) + observações, devolve os exercícios
// já normalizados + nome/categoria sugeridos + métricas + tokens consumidos
// (ou lança um erro com uma mensagem amigável).
async function analyzeWithGemini(
  images: string[],
  mime: string,
  kind: string,
  notes: string | null,
  geminiKey: string,
): Promise<GymAnalysis> {
  const parts: unknown[] = [{ text: buildPrompt(kind, notes) }];
  for (const b64 of images) {
    parts.push({ inline_data: { mime_type: mime, data: b64 } });
  }

  const geminiRes = await fetchGeminiWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          response_mime_type: "application/json",
          response_schema: RESPONSE_SCHEMA,
        },
      }),
    },
  );

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error("Gemini error:", geminiRes.status, errText);
    if (geminiRes.status === 429) {
      throw new Error(
        "O Gemini atingiu o limite de pedidos gratuitos neste momento. Espera um pouco e tenta novamente.",
      );
    }
    throw new Error(`Análise falhou (Gemini ${geminiRes.status}). Tenta novamente.`);
  }

  const geminiJson = await geminiRes.json();
  const usage: GeminiUsage = {
    input_tokens: Number(geminiJson?.usageMetadata?.promptTokenCount) || 0,
    output_tokens: Number(geminiJson?.usageMetadata?.candidatesTokenCount) || 0,
  };
  const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error("Gemini devolveu JSON inválido:", rawText);
    throw new Error("A análise devolveu um formato inesperado. Tenta novamente.");
  }

  const num = (v: unknown): number | null =>
    typeof v === "number" && isFinite(v) && v >= 0 ? v : null;
  const exercises: GymExercise[] = (Array.isArray(parsed.exercises) ? parsed.exercises : [])
    // deno-lint-ignore no-explicit-any
    .map((ex: any) => ({
      name: String(ex?.name ?? "").slice(0, 120) || "Exercício",
      sets: (Array.isArray(ex?.sets) ? ex.sets : [])
        // deno-lint-ignore no-explicit-any
        .map((s: any) => ({ reps: num(s?.reps), weight: num(s?.weight) })),
    }))
    .filter((ex) => ex.sets.length > 0);

  const metrics: GymMetrics = {
    // 24h de tecto: chega para qualquer sessão e apanha leituras absurdas.
    duration_seconds: intInRange(parsed.duration_seconds, 1, 86400),
    calories_kcal: intInRange(parsed.calories_kcal, 0, 20000),
    avg_hr: intInRange(parsed.avg_hr, 1, 299),
    max_hr: intInRange(parsed.max_hr, 1, 299),
    exertion: intInRange(parsed.exertion, 1, 10),
  };

  const hasAnyMetric = Object.values(metrics).some((v) => v !== null);

  // Só se desiste quando não saiu NADA das imagens. Antes bastava não haver
  // exercícios para rejeitar — o que condenava qualquer aula, já que uma aula
  // não tem séries, e ainda apagava as fotos que tinham acabado de subir.
  // Agora uma sessão sobrevive se tiver exercícios OU métricas; o que faltar o
  // utilizador acrescenta à mão, sem perder o upload.
  if (exercises.length === 0 && !hasAnyMetric) {
    throw new Error(
      kind === "aula"
        ? "Não foi possível ler os dados da aula nas imagens (duração, calorias ou frequência cardíaca). " +
          "Tenta outro print, ou preenche os campos à mão."
        : "Não foi possível identificar exercícios nas imagens. Tenta outro ângulo ou mais luz.",
    );
  }

  const str = (v: unknown, max: number): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

  // Máximos generosos mas finitos: isto vem de um modelo, e um array enorme não
  // pode inchar a linha da sessão nem o log.
  const categories = (Array.isArray(parsed.categories) ? parsed.categories : [])
    .map((c) => str(c, 60))
    .filter((c): c is string => c !== null)
    .slice(0, 8);

  const extraFields: GymExtraField[] = (Array.isArray(parsed.extra_fields) ? parsed.extra_fields : [])
    // deno-lint-ignore no-explicit-any
    .map((f: any) => ({ label: str(f?.label, 60), value: str(f?.value, 120) }))
    .filter((f): f is GymExtraField => f.label !== null && f.value !== null)
    .slice(0, 20);

  return {
    sessionName: str(parsed.session_name, 80) ?? "",
    categories,
    exercises,
    metrics,
    extraFields,
    usage,
  };
}

// Achata exercícios→séries em linhas prontas para workout_session_sets
// (exercise_name + set_index sequencial por exercício).
function flattenSets(exercises: GymExercise[]): { exercise_name: string; set_index: number; reps: number | null; weight: number | null }[] {
  const rows: { exercise_name: string; set_index: number; reps: number | null; weight: number | null }[] = [];
  for (const ex of exercises) {
    ex.sets.forEach((s, i) => {
      rows.push({ exercise_name: ex.name, set_index: i, reps: s.reps, weight: s.weight });
    });
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não suportado" }, 405);
  }

  try {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      return jsonResponse({ error: "GEMINI_API_KEY não configurada no servidor" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Sem autorização" }, 401);
    }
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Sessão inválida" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json();
    const rawNotes = typeof body.notes === "string" ? body.notes.slice(0, MAX_NOTES_LENGTH) : null;

    // Valores que o utilizador escreveu no formulário. Ganham sempre à
    // sugestão da IA — ele viu o print, o modelo só o leu.
    const userText = (v: unknown, max: number): string | null =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
    const userName = userText(body.name, 80);
    const userCategories = (Array.isArray(body.categories) ? body.categories : [])
      .map((c: unknown) => userText(c, 60))
      .filter((c: string | null): c is string => c !== null)
      .slice(0, 8);
    const userMetrics: GymMetrics = {
      duration_seconds: intInRange(body.duration_seconds, 1, 86400),
      calories_kcal: intInRange(body.calories_kcal, 0, 20000),
      avg_hr: intInRange(body.avg_hr, 1, 299),
      max_hr: intInRange(body.max_hr, 1, 299),
      exertion: intInRange(body.exertion, 1, 10),
    };
    // Campo a campo: o que o utilizador não preencheu é preenchido pela IA.
    const mergeMetrics = (ai: GymMetrics): GymMetrics => ({
      duration_seconds: userMetrics.duration_seconds ?? ai.duration_seconds,
      calories_kcal: userMetrics.calories_kcal ?? ai.calories_kcal,
      avg_hr: userMetrics.avg_hr ?? ai.avg_hr,
      max_hr: userMetrics.max_hr ?? ai.max_hr,
      exertion: userMetrics.exertion ?? ai.exertion,
    });
    // Se o utilizador escolheu categorias, são essas — não se misturam com as
    // da IA, senão bastava ele desmarcar uma para ela voltar a aparecer.
    const mergeCategories = (ai: string[]): string[] =>
      userCategories.length ? userCategories : ai;

    // ── Modo reanálise: session_id presente ───────────────────────────
    if (typeof body.session_id === "string" && body.session_id) {
      const sessionId = body.session_id;
      const { data: existing, error: fetchError } = await sb
        .from("workout_sessions")
        .select("id, photo_paths, kind, categories, duration_seconds, calories_kcal, avg_hr, max_hr, exertion")
        .eq("id", sessionId)
        .eq("user_id", userId)
        .maybeSingle();
      if (fetchError) return jsonResponse({ error: `Falha a procurar sessão: ${fetchError.message}` }, 500);
      if (!existing) return jsonResponse({ error: "Sessão não encontrada" }, 404);

      const photoPaths: string[] = existing.photo_paths || [];
      if (photoPaths.length === 0) {
        return jsonResponse({ error: "Esta sessão não tem imagens guardadas para reanalisar" }, 400);
      }

      const images: string[] = [];
      for (const path of photoPaths) {
        const { data: fileBlob, error: downloadError } = await sb.storage.from("gym-photos").download(path);
        if (downloadError || !fileBlob) {
          return jsonResponse({ error: `Falha a obter imagem guardada: ${downloadError?.message ?? "desconhecida"}` }, 500);
        }
        images.push(bytesToBase64(new Uint8Array(await fileBlob.arrayBuffer())));
      }

      // O tipo é o que já está gravado na sessão — uma reanálise não muda uma
      // aula em treino de força nem o contrário.
      const existingKind = existing.kind === "aula" ? "aula" : "forca";

      let analysis: GymAnalysis;
      try {
        analysis = await analyzeWithGemini(images, "image/jpeg", existingKind, rawNotes, geminiKey);
      } catch (e) {
        return jsonResponse({ error: e instanceof Error ? e.message : "Falha na reanálise." }, 502);
      }

      const { error: deleteError } = await sb.from("workout_session_sets").delete().eq("session_id", sessionId);
      if (deleteError) return jsonResponse({ error: `Falha a limpar séries antigas: ${deleteError.message}` }, 500);

      // Uma aula não produz séries — inserir um array vazio é um pedido inútil
      // ao PostgREST, por isso salta-se.
      const setRows = flattenSets(analysis.exercises)
        .map((row) => ({ ...row, session_id: sessionId, user_id: userId }));
      let savedSets: unknown[] = [];
      if (setRows.length) {
        const { data, error: setsError } = await sb.from("workout_session_sets").insert(setRows).select();
        if (setsError) return jsonResponse({ error: `Falha a gravar séries: ${setsError.message}` }, 500);
        savedSets = data ?? [];
      }

      const mergedName = userName ?? (analysis.sessionName || null);
      const mergedCategories = mergeCategories(analysis.categories);
      // Numa reanálise o que já estava gravado é o último recurso: se a IA não
      // voltar a ler uma métrica (e o utilizador não a tiver escrito), mantém-se
      // o valor anterior em vez de ser apagado.
      const reanalysedMetrics = mergeMetrics(analysis.metrics);
      const keptMetrics: GymMetrics = {
        duration_seconds: reanalysedMetrics.duration_seconds ?? existing.duration_seconds ?? null,
        calories_kcal: reanalysedMetrics.calories_kcal ?? existing.calories_kcal ?? null,
        avg_hr: reanalysedMetrics.avg_hr ?? existing.avg_hr ?? null,
        max_hr: reanalysedMetrics.max_hr ?? existing.max_hr ?? null,
        exertion: reanalysedMetrics.exertion ?? existing.exertion ?? null,
      };
      const { data: updatedSession, error: updateError } = await sb
        .from("workout_sessions")
        .update({
          notes: rawNotes,
          ...(mergedName ? { name: mergedName } : {}),
          ...(mergedCategories.length ? { categories: mergedCategories } : {}),
          ...keptMetrics,
        })
        .eq("id", sessionId)
        .select()
        .single();
      if (updateError) return jsonResponse({ error: `Falha a atualizar sessão: ${updateError.message}` }, 500);

      return jsonResponse({
        session: updatedSession,
        sets: savedSets,
        extra_fields: analysis.extraFields,
        usage: analysis.usage,
      });
    }

    // ── Modo normal: nova sessão a partir de imagens ──────────────────
    const { mime_type, date } = body;

    let images: string[] = [];
    if (Array.isArray(body.images)) {
      images = body.images.filter((s: unknown) => typeof s === "string" && s.length > 0);
    }

    if (images.length === 0) {
      return jsonResponse({ error: "Nenhuma imagem recebida" }, 400);
    }
    if (images.length > MAX_PHOTOS) {
      return jsonResponse({ error: `Máximo de ${MAX_PHOTOS} imagens por sessão` }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
      return jsonResponse({ error: "Data inválida (esperado YYYY-MM-DD)" }, 400);
    }
    // Qualquer valor que não seja 'aula' cai em 'forca' — inclui os pedidos de
    // clientes antigos, que não enviam este campo de todo.
    const kind = body.kind === "aula" ? "aula" : "forca";
    const mime = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]
        .includes(mime_type)
      ? mime_type
      : "image/jpeg";
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";

    // 1. Upload de todas as imagens para o bucket privado, pasta do próprio utilizador
    const photoPaths: string[] = [];
    for (const b64 of images) {
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await sb.storage
        .from("gym-photos")
        .upload(path, base64ToBytes(b64), { contentType: mime });
      if (uploadError) {
        if (photoPaths.length) await sb.storage.from("gym-photos").remove(photoPaths);
        return jsonResponse({ error: `Falha no upload da imagem: ${uploadError.message}` }, 500);
      }
      photoPaths.push(path);
    }

    // 2. Análise Gemini — todas as imagens numa só chamada (partes múltiplas)
    let analysis: GymAnalysis;
    try {
      analysis = await analyzeWithGemini(images, mime, kind, rawNotes, geminiKey);
    } catch (e) {
      await sb.storage.from("gym-photos").remove(photoPaths);
      return jsonResponse({ error: e instanceof Error ? e.message : "Falha na análise." }, 502);
    }

    // 3. Gravar sessão + séries
    const mergedCategories = mergeCategories(analysis.categories);
    // Cascata do nome: o que o utilizador escreveu, a sugestão da IA, as
    // categorias, e só em último caso um rótulo genérico — para uma aula nunca
    // aparecer na lista como "Treino".
    const finalName = userName ?? (analysis.sessionName || null) ??
      (mergedCategories.length ? mergedCategories.join(" e ") : null) ??
      (kind === "aula" ? "Aula" : "Treino");
    const { data: session, error: sessionError } = await sb
      .from("workout_sessions")
      .insert({
        user_id: userId,
        date,
        name: finalName,
        kind,
        categories: mergedCategories,
        ...mergeMetrics(analysis.metrics),
        photo_paths: photoPaths,
        status: "concluido",
        notes: rawNotes,
      })
      .select()
      .single();
    if (sessionError) {
      await sb.storage.from("gym-photos").remove(photoPaths);
      return jsonResponse({ error: `Falha a gravar sessão: ${sessionError.message}` }, 500);
    }

    const setRows = flattenSets(analysis.exercises)
      .map((row) => ({ ...row, session_id: session.id, user_id: userId }));
    let savedSets: unknown[] = [];
    if (setRows.length) {
      const { data, error: setsError } = await sb.from("workout_session_sets").insert(setRows).select();
      if (setsError) {
        await sb.from("workout_sessions").delete().eq("id", session.id);
        await sb.storage.from("gym-photos").remove(photoPaths);
        return jsonResponse({ error: `Falha a gravar séries: ${setsError.message}` }, 500);
      }
      savedSets = data ?? [];
    }

    return jsonResponse({
      session,
      sets: savedSets,
      extra_fields: analysis.extraFields,
      usage: analysis.usage,
    });
  } catch (e) {
    console.error("Erro inesperado:", e);
    return jsonResponse({ error: "Erro inesperado no servidor" }, 500);
  }
});
