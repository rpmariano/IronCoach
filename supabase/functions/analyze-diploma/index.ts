// IronCoach · analyze-diploma Edge Function (pedido 2026-09-13)
// Recebe a imagem de um diploma de prova (base64) e devolve, lidos pelo
// Gemini, o que o diploma traz e a app guarda: tempo de chip e tempo bruto,
// classificação geral, no escalão e por género, escalão, participantes,
// dorsal, parciais oficiais. Não grava nada — o registo da prova mostra a
// leitura ao atleta e é ele que a aplica (RunRegistration).
// Calibrado com um diploma real da Corrida do Tejo 2026 (lastlap): "Tempo
// chip 00:51:27" e "Concluíste a prova em 00:51:51" no mesmo diploma —
// o de chip é o que conta, o outro é o bruto.
// A chave Gemini vive só aqui (secret GEMINI_API_KEY), nunca no cliente.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_TIMEOUT_MS = 40000;
const GEMINI_RETRIES = 1;
const GEMINI_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_IMAGE_B64_LENGTH = 6_000_000; // ~4,5 MB de imagem — mais do que o cliente alguma vez envia

export type DiplomaReading = {
  athlete_name: string | null;
  race_name: string | null;
  race_date: string | null;
  chip_time_seconds: number | null;
  gun_time_seconds: number | null;
  position: number | null;
  age_group: string | null;
  age_group_position: number | null;
  gender_position: number | null;
  participants: number | null;
  bib_number: string | null;
  splits: { km: number; seconds: number }[];
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    athlete_name: { type: "STRING", nullable: true },
    race_name: { type: "STRING", nullable: true },
    race_date: { type: "STRING", nullable: true },
    chip_time: { type: "STRING", nullable: true },
    gun_time: { type: "STRING", nullable: true },
    position: { type: "NUMBER", nullable: true },
    age_group: { type: "STRING", nullable: true },
    age_group_position: { type: "NUMBER", nullable: true },
    gender_position: { type: "NUMBER", nullable: true },
    participants: { type: "NUMBER", nullable: true },
    bib_number: { type: "STRING", nullable: true },
    splits: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { km: { type: "NUMBER" }, time: { type: "STRING" } },
        required: ["km", "time"],
      },
    },
  },
  required: [
    "athlete_name", "race_name", "race_date", "chip_time", "gun_time", "position", "age_group",
    "age_group_position", "gender_position", "participants", "bib_number", "splits",
  ],
};

export function buildDiplomaPrompt(): string {
  return (
    "A imagem é um DIPLOMA (ou certificado de resultado) de uma prova de corrida a pé, normalmente em português. " +
    "Extrai só o que está escrito — nunca inventes nem calcules o que não aparece. Devolve null no que não existir.\n\n" +
    "Campos:\n" +
    "- athlete_name: o nome do atleta impresso.\n" +
    "- race_name: o nome da prova, se aparecer (ex.: 'Corrida do Tejo'). race_date: a data da prova em YYYY-MM-DD, se aparecer.\n" +
    "- chip_time: o tempo LÍQUIDO / de CHIP / 'net' (desde que o atleta passa o tapete), tal como está escrito (ex.: '00:51:27').\n" +
    "- gun_time: o tempo BRUTO / OFICIAL / 'gun' (desde o tiro de partida). Se o diploma tem dois tempos e um está rotulado como chip/líquido, " +
    "esse é chip_time e o outro é gun_time. Uma frase como 'Concluíste a prova em 00:51:51' sem rótulo é o tempo bruto (gun_time). " +
    "Se só houver UM tempo sem rótulo de chip, põe-no em gun_time e deixa chip_time null.\n" +
    "- position: a classificação GERAL (número). age_group_position: a classificação no ESCALÃO. gender_position: a classificação por GÉNERO/SEXO (masculino/feminino), " +
    "só se estiver escrita como tal — não confundas com o escalão.\n" +
    "- age_group: o nome do escalão, só se estiver escrito (ex.: 'M40', 'Seniores', 'F35-39'). participants: o total de inscritos/participantes/classificados, se aparecer.\n" +
    "- bib_number: o dorsal (número de peito), se aparecer.\n" +
    "- splits: os tempos de passagem intermédios que o diploma mostrar (ex.: 'Tempo km5 00:25:15' → {km: 5, time: '00:25:15'}; 'meia' → km 21.1). Sem parciais, lista vazia.\n" +
    "Tempos sempre como texto hh:mm:ss ou mm:ss; números de classificação sem o '.º'."
  );
}

/** "00:51:27" → 3087; "51:27" → 3087; "1:53:42" → 6822. null se não for um tempo. */
export function parseClockToSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(value);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = m[3] !== undefined ? Number(m[3]) : null;
  if (b > 59 || (c !== null && c > 59)) return null;
  const seconds = c === null ? a * 60 + b : a * 3600 + b * 60 + c;
  return seconds > 0 ? seconds : null;
}

/** A leitura do Gemini, validada campo a campo: números positivos ou null,
 *  textos aparados, parciais com km e tempo válidos por ordem de km. */
export function normalizeDiplomaReading(raw: unknown): DiplomaReading {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max = 80): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const int = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d]/g, "")) : NaN;
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };
  const date = str(r.race_date, 10);
  const splits = (Array.isArray(r.splits) ? r.splits : [])
    .map((s) => {
      const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      const km = typeof o.km === "number" ? o.km : Number(o.km);
      const seconds = parseClockToSeconds(o.time);
      return Number.isFinite(km) && km > 0 && seconds ? { km: Math.round(km * 100) / 100, seconds } : null;
    })
    .filter((s): s is { km: number; seconds: number } => !!s)
    .sort((a, b) => a.km - b.km);
  const bib = typeof r.bib_number === "number" ? String(r.bib_number) : str(r.bib_number, 12);
  return {
    athlete_name: str(r.athlete_name),
    race_name: str(r.race_name),
    race_date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    chip_time_seconds: parseClockToSeconds(r.chip_time),
    gun_time_seconds: parseClockToSeconds(r.gun_time),
    position: int(r.position),
    age_group: str(r.age_group, 24),
    age_group_position: int(r.age_group_position),
    gender_position: int(r.gender_position),
    participants: int(r.participants),
    bib_number: bib && /\d/.test(bib) ? bib : null,
    splits,
  };
}

export function readingHasAnything(r: DiplomaReading): boolean {
  return !!(r.chip_time_seconds || r.gun_time_seconds || r.position || r.age_group_position || r.gender_position || r.participants || r.bib_number || r.splits.length);
}

async function fetchGeminiWithTimeout(url: string, options: RequestInit, timeoutMs = GEMINI_TIMEOUT_MS, retries = GEMINI_RETRIES): Promise<Response> {
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
    } catch (_e) {
      clearTimeout(timer);
      if (attempt < retries) continue;
      throw new Error("O Gemini demorou demasiado tempo a responder. Tenta outra vez daqui a pouco.");
    }
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function readDiplomaWithGemini(imageB64: string, mime: string, geminiKey: string): Promise<{ reading: DiplomaReading; usage: Record<string, number> }> {
  const res = await fetchGeminiWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildDiplomaPrompt() }, { inline_data: { mime_type: mime, data: imageB64 } }] }],
        generationConfig: { temperature: 0, response_mime_type: "application/json", response_schema: RESPONSE_SCHEMA },
      }),
    },
  );
  if (!res.ok) {
    const errText = await res.text();
    console.error("Gemini error:", res.status, errText);
    if (res.status === 429) throw new Error("O Gemini atingiu o limite de pedidos neste momento. Espera um pouco e tenta de novo.");
    throw new Error(`Leitura falhou (Gemini ${res.status}). Tenta de novo.`);
  }
  const json = await res.json();
  const usage = {
    input_tokens: Number(json?.usageMetadata?.promptTokenCount) || 0,
    output_tokens: Number(json?.usageMetadata?.candidatesTokenCount) || 0,
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json?.candidates?.[0]?.content?.parts?.[0]?.text);
  } catch {
    throw new Error("A leitura devolveu um formato inesperado. Tenta de novo.");
  }
  const reading = normalizeDiplomaReading(parsed);
  if (!readingHasAnything(reading)) throw new Error("Não consegui ler nada neste diploma. Confirma que a imagem está nítida e direita.");
  return { reading, usage };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Método não suportado" }, 405);

  try {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) return jsonResponse({ error: "GEMINI_API_KEY não configurada no servidor" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Sem autorização" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData?.user) return jsonResponse({ error: "Sessão inválida" }, 401);

    const body = await req.json();
    const image = typeof body.image === "string" ? body.image.replace(/^data:[^,]+,/, "") : "";
    const mime = typeof body.mime_type === "string" && /^image\/(jpeg|png|webp)$/.test(body.mime_type) ? body.mime_type : "image/jpeg";
    if (!image) return jsonResponse({ error: "Sem imagem do diploma." }, 400);
    if (image.length > MAX_IMAGE_B64_LENGTH) return jsonResponse({ error: "Imagem demasiado grande." }, 413);

    const { reading, usage } = await readDiplomaWithGemini(image, mime, geminiKey);
    return jsonResponse({ reading, usage });
  } catch (e) {
    console.error("analyze-diploma:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Falha a ler o diploma." }, 502);
  }
});
