// IronHealth · analyze-run Edge Function
// Modo normal: recebe 1+ prints de uma app de corrida (Strava, Garmin, etc.),
// extrai distância/duração/tipo de treino/splits/dados de competição com o
// Gemini e grava a corrida em `runs`. O utilizador só escolhe Treino vs.
// Competição (kind) e a data no cliente — tudo o resto (tipo de treino,
// aquecimento/recuperação, splits, disciplina, tempo oficial, posição) é
// inferido pela IA a partir da imagem. O nível de esforço (effort_rpe) nunca
// é inferido — é sempre reportado pelo próprio utilizador.
// Modo reanálise (run_id presente): repesca os prints já guardados dessa
// corrida no Storage e volta a analisar do zero (mesma extração da IA),
// substituindo os campos lidos da imagem; kind/notes/effort_rpe mantêm-se
// como estavam (não vêm de imagem nenhuma).
// A chave Gemini vive apenas aqui (secret GEMINI_API_KEY), nunca no cliente.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_PHOTOS = 6;
const MAX_NOTES_LENGTH = 500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_TIMEOUT_MS = 40000;
const GEMINI_RETRIES = 1;

// Espelha RUN_TRAINING_TYPES / RACE_TYPES no cliente (index.html) — mantidos
// sincronizados manualmente, já que o schema do Gemini precisa de um enum
// fixo de valores possíveis.
const TRAINING_TYPE_KEYS = [
  "continuo", "longo", "recuperacao", "tempo", "fartlek",
  "intervalos", "subidas", "trail", "tecnico",
];
const TRAINING_TYPE_LABELS: Record<string, string> = {
  continuo: "Contínuo", longo: "Longo", recuperacao: "Recuperação", tempo: "Ritmo (Tempo)",
  fartlek: "Fartlek", intervalos: "Intervalos", subidas: "Subidas", trail: "Trail", tecnico: "Técnico (trilho)",
};
const RACE_TYPE_KEYS = ["estrada", "trail", "ultra", "5k", "10k", "21k", "42k", "outro"];
const RACE_TYPE_LABELS: Record<string, string> = {
  estrada: "Estrada", trail: "Trail", ultra: "Ultra", "5k": "5 km", "10k": "10 km",
  "21k": "Meia maratona", "42k": "Maratona", outro: "Outro",
};
const REPEAT_TRAINING_TYPES = new Set(["intervalos", "subidas"]);

// Nome sugerido quando o cliente marcou o nome como "ainda é a sugestão
// automática" (name_is_auto) — reconstrói com o tipo/disciplina já
// confirmados pela extração da IA, mantendo o período do dia enviado pelo
// cliente (hora local de quem regista, não a hora do servidor).
function buildAutoName(kind: string, trainingType: string | null, raceType: string | null, period: string): string {
  const p = period || "";
  if (kind === "competicao") {
    const label = raceType ? RACE_TYPE_LABELS[raceType] : null;
    return (label ? `Competição ${label} ${p}` : `Competição ${p}`).trim();
  }
  const label = trainingType ? TRAINING_TYPE_LABELS[trainingType] : null;
  return (label ? `Treino ${label} ${p}` : `Treino ${p}`).trim();
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    distance_km: { type: "NUMBER", nullable: true },
    duration_seconds: { type: "NUMBER", nullable: true },
    training_type: { type: "STRING", nullable: true, enum: TRAINING_TYPE_KEYS },
    warmup_minutes: { type: "NUMBER", nullable: true },
    recovery_seconds: { type: "NUMBER", nullable: true },
    splits: {
      type: "ARRAY",
      nullable: true,
      items: {
        type: "OBJECT",
        properties: {
          distance_km: { type: "NUMBER", nullable: true },
          time_seconds: { type: "NUMBER", nullable: true },
        },
        required: ["distance_km", "time_seconds"],
      },
    },
    race_type: { type: "STRING", nullable: true, enum: RACE_TYPE_KEYS },
    official_time_seconds: { type: "NUMBER", nullable: true },
    position: { type: "NUMBER", nullable: true },
    // Métricas do relógio — comuns a qualquer tipo de corrida, lidas do
    // quadro principal (desnível, cadência, calorias), do quadro de
    // frequência cardíaca (média, máxima, zonas) e do quadro de VO2 máx,
    // quando esses ecrãs estiverem entre as imagens.
    elevation_gain_m: { type: "NUMBER", nullable: true },
    cadence_spm: { type: "NUMBER", nullable: true },
    calories_kcal: { type: "NUMBER", nullable: true },
    avg_heart_rate_bpm: { type: "NUMBER", nullable: true },
    max_heart_rate_bpm: { type: "NUMBER", nullable: true },
    vo2_max: { type: "NUMBER", nullable: true },
    hr_zones: {
      type: "ARRAY",
      nullable: true,
      items: {
        type: "OBJECT",
        properties: {
          zone: { type: "NUMBER", nullable: true },
          minutes: { type: "NUMBER", nullable: true },
        },
        required: ["zone", "minutes"],
      },
    },
  },
  required: [
    "distance_km", "duration_seconds", "training_type", "warmup_minutes",
    "recovery_seconds", "splits", "race_type", "official_time_seconds", "position",
    "elevation_gain_m", "cadence_spm", "calories_kcal", "avg_heart_rate_bpm",
    "max_heart_rate_bpm", "vo2_max", "hr_zones",
  ],
};

function buildPrompt(kindHint: string | null, notes: string | null): string {
  let prompt =
    "As imagens seguintes são capturas de ecrã (screenshots) de uma app de registo de corrida " +
    "(ex.: Strava, Garmin Connect, Nike Run Club, ou similar), todas da MESMA corrida " +
    "(possivelmente ecrãs diferentes da mesma atividade). Extrai:\n" +
    "- distance_km: distância total percorrida, em quilómetros (ex.: 10.42).\n" +
    "- duration_seconds: duração total (tempo em movimento/total da atividade), em segundos.\n" +
    `- training_type: só se esta for claramente uma sessão de TREINO (não uma competição). ` +
    `Escolhe o melhor palpite entre: ${TRAINING_TYPE_KEYS.join(", ")} ` +
    "(continuo = corrida solta sem estrutura; longo = corrida mais longa que o habitual, ritmo confortável; " +
    "recuperacao = ritmo muito fácil, pós-esforço; tempo = ritmo forte sustentado; fartlek = variações de ritmo " +
    "livres/não estruturadas; intervalos = repetições curtas rápidas com pausa entre elas, normalmente numa tabela " +
    "de voltas/laps com tempos muito diferentes entre si; subidas = repetições em subida; trail = trilho/montanha " +
    "com desnível relevante; tecnico = trilho técnico irregular). Se não conseguires distinguir com confiança, " +
    "devolve null em vez de adivinhar às cegas — não é obrigatório.\n" +
    "- warmup_minutes / recovery_seconds: só se training_type for 'intervalos' ou 'subidas' e o ecrã mostrar " +
    "claramente um aquecimento inicial ou o tempo de recuperação entre repetições.\n" +
    "- splits: se o ecrã mostrar uma tabela de voltas/laps/repetições com distância e tempo de cada uma, devolve " +
    "cada linha como { distance_km, time_seconds }. Deixa null se não houver essa tabela visível.\n" +
    `- race_type: só se esta for claramente uma COMPETIÇÃO/prova oficial (não um treino normal). ` +
    `Escolhe entre: ${RACE_TYPE_KEYS.join(", ")}.\n` +
    "- official_time_seconds / position: só em competição, se o ecrã mostrar o tempo oficial de prova e/ou a " +
    "posição de chegada (classificação).\n" +
    "- elevation_gain_m / cadence_spm / calories_kcal: se o ecrã principal (o mesmo onde aparece distância/tempo/pace) " +
    "mostrar desnível acumulado (m), cadência média (passadas por minuto) ou calorias, extrai esses valores.\n" +
    "- avg_heart_rate_bpm / max_heart_rate_bpm: se houver um ecrã de frequência cardíaca, extrai a FC média e a FC " +
    "máxima da atividade.\n" +
    "- hr_zones: se esse ecrã de frequência cardíaca mostrar uma repartição por zonas (Z1 a Z5, ou similar) com o " +
    "tempo passado em cada uma, devolve cada linha como { zone, minutes } (zone = número da zona, 1 a 5).\n" +
    "- vo2_max: se houver um ecrã com o valor de VO2 máx (ou 'VO2max'/'VO2 Max') estimado para esta atividade, extrai-o.\n" +
    "Não inventes valores — se algum destes dados não estiver visível em nenhuma imagem, ou não te sentires " +
    "confiante, devolve null nesse campo em vez de arriscar.";
  if (kindHint === "treino") {
    prompt += "\n\nO utilizador já indicou que isto é um TREINO (não uma competição) — só preenche os campos de treino, deixa race_type/official_time_seconds/position a null.";
  } else if (kindHint === "competicao") {
    prompt += "\n\nO utilizador já indicou que isto é uma COMPETIÇÃO — só preenche os campos de competição, deixa training_type/warmup_minutes/recovery_seconds a null.";
  }
  if (notes && notes.trim()) {
    prompt +=
      "\n\nO utilizador deixou esta observação sobre a corrida — usa-a como contexto " +
      `adicional: "${notes.trim()}"`;
  }
  prompt += "\n\nResponde apenas com JSON estruturado conforme o schema.";
  return prompt;
}

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

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

type GeminiUsage = { input_tokens: number; output_tokens: number };
type RunSplit = { distance_km: number | null; time_seconds: number | null };
type HrZone = { zone: number | null; minutes: number | null };
type RunExtraction = {
  distance_km: number | null;
  duration_seconds: number | null;
  training_type: string | null;
  warmup_minutes: number | null;
  recovery_seconds: number | null;
  splits: RunSplit[] | null;
  race_type: string | null;
  official_time_seconds: number | null;
  position: number | null;
  elevation_gain_m: number | null;
  cadence_spm: number | null;
  calories_kcal: number | null;
  avg_heart_rate_bpm: number | null;
  max_heart_rate_bpm: number | null;
  vo2_max: number | null;
  hr_zones: HrZone[] | null;
};

async function analyzeWithGemini(
  images: string[],
  mime: string,
  kindHint: string | null,
  notes: string | null,
  geminiKey: string,
): Promise<{ extraction: RunExtraction; usage: GeminiUsage }> {
  const parts: unknown[] = [{ text: buildPrompt(kindHint, notes) }];
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
  const str = (v: unknown, allowed: string[]): string | null =>
    typeof v === "string" && allowed.includes(v) ? v : null;

  const rawSplits = Array.isArray(parsed.splits) ? parsed.splits : [];
  const splits: RunSplit[] = rawSplits
    .map((s) => ({
      distance_km: num((s as Record<string, unknown>)?.distance_km),
      time_seconds: num((s as Record<string, unknown>)?.time_seconds),
    }))
    .filter((s) => s.distance_km !== null || s.time_seconds !== null);

  const rawZones = Array.isArray(parsed.hr_zones) ? parsed.hr_zones : [];
  const hrZones: HrZone[] = rawZones
    .map((z) => ({
      zone: num((z as Record<string, unknown>)?.zone),
      minutes: num((z as Record<string, unknown>)?.minutes),
    }))
    .filter((z) => z.zone !== null && z.minutes !== null);

  const extraction: RunExtraction = {
    distance_km: num(parsed.distance_km),
    duration_seconds: num(parsed.duration_seconds),
    training_type: str(parsed.training_type, TRAINING_TYPE_KEYS),
    warmup_minutes: num(parsed.warmup_minutes),
    recovery_seconds: num(parsed.recovery_seconds),
    splits: splits.length ? splits : null,
    race_type: str(parsed.race_type, RACE_TYPE_KEYS),
    official_time_seconds: num(parsed.official_time_seconds),
    position: num(parsed.position),
    elevation_gain_m: num(parsed.elevation_gain_m),
    cadence_spm: num(parsed.cadence_spm),
    calories_kcal: num(parsed.calories_kcal),
    avg_heart_rate_bpm: num(parsed.avg_heart_rate_bpm),
    max_heart_rate_bpm: num(parsed.max_heart_rate_bpm),
    vo2_max: num(parsed.vo2_max),
    hr_zones: hrZones.length ? hrZones : null,
  };

  if (extraction.distance_km === null && extraction.duration_seconds === null) {
    throw new Error("Não foi possível ler a distância ou a duração nas imagens. Tenta outro ângulo ou mais luz.");
  }

  return { extraction, usage };
}

// Monta o `details` jsonb a partir da extração: campos específicos do tipo
// (treino por repetição vs. competição) + métricas do relógio, que se
// aplicam a qualquer corrida — mesma estrutura que o cliente usa na entrada
// manual (buildRunDetailsPayload/buildRunWatchMetrics).
function detailsFromExtraction(kind: string, e: RunExtraction): Record<string, unknown> | null {
  const d: Record<string, unknown> = {};
  if (e.elevation_gain_m) d.elevation_gain_m = e.elevation_gain_m;
  if (e.cadence_spm) d.cadence_spm = e.cadence_spm;
  if (e.calories_kcal) d.calories_kcal = e.calories_kcal;
  if (e.avg_heart_rate_bpm) d.avg_heart_rate_bpm = e.avg_heart_rate_bpm;
  if (e.max_heart_rate_bpm) d.max_heart_rate_bpm = e.max_heart_rate_bpm;
  if (e.vo2_max) d.vo2_max = e.vo2_max;
  if (e.hr_zones && e.hr_zones.length) d.hr_zones = e.hr_zones;

  if (kind === "treino" && e.training_type && REPEAT_TRAINING_TYPES.has(e.training_type)) {
    if (e.warmup_minutes) d.warmup_minutes = e.warmup_minutes;
    if (e.recovery_seconds) d.recovery_seconds = e.recovery_seconds;
    if (e.splits && e.splits.length) d.splits = e.splits;
  }
  if (kind === "competicao") {
    if (e.race_type) d.race_type = e.race_type;
    if (e.official_time_seconds) d.official_time_seconds = e.official_time_seconds;
    if (e.position) d.position = e.position;
  }
  return Object.keys(d).length ? d : null;
}

const VALID_KINDS = new Set(["simples", "treino", "competicao"]);

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

    // ── Modo reanálise: run_id presente ────────────────────────────────
    if (typeof body.run_id === "string" && body.run_id) {
      const runId = body.run_id;
      const { data: existing, error: fetchError } = await sb
        .from("runs")
        .select("id, photo_paths, kind")
        .eq("id", runId)
        .eq("user_id", userId)
        .maybeSingle();
      if (fetchError) return jsonResponse({ error: `Falha a procurar corrida: ${fetchError.message}` }, 500);
      if (!existing) return jsonResponse({ error: "Corrida não encontrada" }, 404);

      const photoPaths: string[] = existing.photo_paths || [];
      if (photoPaths.length === 0) {
        return jsonResponse({ error: "Esta corrida não tem imagens guardadas para reanalisar" }, 400);
      }

      const images: string[] = [];
      for (const path of photoPaths) {
        const { data: fileBlob, error: downloadError } = await sb.storage.from("run-photos").download(path);
        if (downloadError || !fileBlob) {
          return jsonResponse({ error: `Falha a obter imagem guardada: ${downloadError?.message ?? "desconhecida"}` }, 500);
        }
        images.push(bytesToBase64(new Uint8Array(await fileBlob.arrayBuffer())));
      }

      let result;
      try {
        result = await analyzeWithGemini(images, "image/jpeg", existing.kind, rawNotes, geminiKey);
      } catch (e) {
        return jsonResponse({ error: e instanceof Error ? e.message : "Falha na reanálise." }, 502);
      }

      const kind = existing.kind;
      const trainingType = kind === "treino" ? result.extraction.training_type : null;
      const { data: updated, error: updateError } = await sb
        .from("runs")
        .update({
          distance_km: result.extraction.distance_km,
          duration_seconds: result.extraction.duration_seconds,
          training_type: trainingType,
          details: detailsFromExtraction(kind, result.extraction),
          notes: rawNotes,
        })
        .eq("id", runId)
        .select()
        .single();
      if (updateError) return jsonResponse({ error: `Falha a atualizar corrida: ${updateError.message}` }, 500);

      return jsonResponse({ run: updated, usage: result.usage });
    }

    // ── Modo normal: nova corrida a partir de imagens ─────────────────
    const { mime_type, date } = body;
    const kind = VALID_KINDS.has(body.kind) ? body.kind : "treino";
    const effortRpe = Number.isInteger(body.effort_rpe) && body.effort_rpe >= 1 && body.effort_rpe <= 10
      ? body.effort_rpe
      : null;
    const clientName = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const nameIsAuto = body.name_is_auto === true;
    const periodLabel = typeof body.period_label === "string" ? body.period_label.slice(0, 20) : "";
    if (!clientName) {
      return jsonResponse({ error: "Preenche o nome da corrida." }, 400);
    }

    let images: string[] = [];
    if (Array.isArray(body.images)) {
      images = body.images.filter((s: unknown) => typeof s === "string" && s.length > 0);
    }

    if (images.length === 0) {
      return jsonResponse({ error: "Nenhuma imagem recebida" }, 400);
    }
    if (images.length > MAX_PHOTOS) {
      return jsonResponse({ error: `Máximo de ${MAX_PHOTOS} imagens por corrida` }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
      return jsonResponse({ error: "Data inválida (esperado YYYY-MM-DD)" }, 400);
    }
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
        .from("run-photos")
        .upload(path, base64ToBytes(b64), { contentType: mime });
      if (uploadError) {
        if (photoPaths.length) await sb.storage.from("run-photos").remove(photoPaths);
        return jsonResponse({ error: `Falha no upload da imagem: ${uploadError.message}` }, 500);
      }
      photoPaths.push(path);
    }

    // 2. Análise Gemini — todas as imagens numa só chamada (partes múltiplas)
    let result;
    try {
      result = await analyzeWithGemini(images, mime, kind, rawNotes, geminiKey);
    } catch (e) {
      await sb.storage.from("run-photos").remove(photoPaths);
      return jsonResponse({ error: e instanceof Error ? e.message : "Falha na análise." }, 502);
    }

    const trainingType = kind === "treino" ? result.extraction.training_type : null;
    // Se o nome ainda era a sugestão genérica do cliente (sem saber o tipo
    // real), refaz com o tipo/disciplina que a IA acabou de detetar. Se o
    // utilizador já o tinha reescrito à mão, mantém exatamente o que enviou.
    const finalName = nameIsAuto
      ? buildAutoName(kind, trainingType, kind === "competicao" ? result.extraction.race_type : null, periodLabel)
      : clientName;

    // 3. Gravar corrida
    const { data: run, error: insertError } = await sb
      .from("runs")
      .insert({
        user_id: userId,
        date,
        photo_paths: photoPaths,
        kind,
        training_type: trainingType,
        details: detailsFromExtraction(kind, result.extraction),
        notes: rawNotes,
        name: finalName,
        effort_rpe: effortRpe,
        distance_km: result.extraction.distance_km,
        duration_seconds: result.extraction.duration_seconds,
      })
      .select()
      .single();
    if (insertError) {
      await sb.storage.from("run-photos").remove(photoPaths);
      return jsonResponse({ error: `Falha a gravar corrida: ${insertError.message}` }, 500);
    }

    return jsonResponse({ run, usage: result.usage });
  } catch (e) {
    console.error("Erro inesperado:", e);
    return jsonResponse({ error: "Erro inesperado no servidor" }, 500);
  }
});
