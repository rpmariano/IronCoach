// IronHealth · enrich-race-event Edge Function
// Botão "Obter informação da prova" (RaceCard e o formulário de criação/
// edição em RunAgenda): lê o site oficial da prova (race_events.website) e
// usa o Gemini para extrair horários (com local, quando indicado),
// documentos necessários, informação específica ao escalão/nível do atleta,
// recomendações de equipamento e deslocação, e — quando o site descrever o
// trajeto com detalhe suficiente — uma reconstrução aproximada do percurso a
// partir de indicações em texto (não há GPX nem coordenadas reais nesta app,
// por isso route_segments é sempre esquemático, nunca um mapa
// geograficamente exato; ver src/components/Run/RaceRouteDiagram.jsx).
//
// Muitos sites de provas são uma página de aterragem que remete horários,
// percurso ou regulamento para sub-páginas do mesmo site (ex.: /percurso,
// /regulamento) — só ler a página guardada em `website` perdia essa
// informação. Por isso: lê a página principal, encontra ligações do mesmo
// domínio cujo texto ou caminho sugerem conter informação relevante (até
// MAX_SUBPAGES), lê-as também, e junta tudo num único texto para o Gemini.
//
// Dois modos de invocação:
//  - { race_event_id } — prova já gravada (RaceCard): lê o contexto da BD e
//    grava o resultado em race_events.web_info.
//  - { website, name?, race_type?, distance_km?, location?,
//      experience_level?, elevation_gain_m? } — formulário de criação/edição
//    ainda não gravado (RunAgenda): mesmo processo, mas devolve o resultado
//    sem tocar na BD — o cliente guarda-o no rascunho e só persiste quando o
//    atleta gravar a prova.
//
// Pedido explícito e não-automático em ambos os casos: só corre quando o
// atleta carrega no botão (custo de API + latência de rede a sites de
// terceiros).
//
// A chave Gemini vive apenas aqui (secret GEMINI_API_KEY), nunca no cliente.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_TIMEOUT_MS = 55000;
const GEMINI_RETRIES = 1;

const MAIN_PAGE_FETCH_TIMEOUT_MS = 15000;
const SUBPAGE_FETCH_TIMEOUT_MS = 9000;
const MAX_SUBPAGES = 4;
const MAX_RAW_HTML_CHARS = 3_000_000;
const MAX_MAIN_PAGE_TEXT_CHARS = 16_000;
const MAX_SUBPAGE_TEXT_CHARS = 10_000;
const MAX_TOTAL_TEXT_CHARS = 48_000;
const MIN_TOTAL_TEXT_CHARS = 150;

// Palavras cujo caminho ou texto de uma ligação sugerem que essa sub-página
// tem informação que a página principal só resume ou nem tem.
const LINK_KEYWORDS = [
  "percurso", "route", "trajeto", "traçado", "tracado", "mapa", "track", "gpx", "parcours",
  "regulamento", "regulation", "informa", "provas", "corrida", "inscri",
  "dorsal", "dorsais", "kit", "levantamento", "equipamento", "material",
  "horario", "horário", "programa", "faq", "perguntas", "documento",
  "escalao", "escalão", "categoria",
];

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

// Extração de texto legível a partir de HTML cru — sem parser de DOM (não
// disponível no runtime Deno das Edge Functions), por regex, tal como o
// resto desta função evita dependências externas. Suficiente para o Gemini
// ler o CONTEÚDO da página; não precisa de preservar estrutura/layout.
function htmlToText(html: string): string {
  let text = html;
  text = text.replace(/<(script|style|noscript|svg|head)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|h6|section|article|header|footer|ul|ol|table)\s*>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");

  const entities: Record<string, string> = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'",
    "&nbsp;": " ", "&ndash;": "-", "&mdash;": "-",
    "&eacute;": "é", "&aacute;": "á", "&iacute;": "í", "&oacute;": "ó", "&uacute;": "ú",
    "&atilde;": "ã", "&otilde;": "õ", "&ccedil;": "ç", "&acirc;": "â", "&ecirc;": "ê", "&ocirc;": "ô",
    "&Aacute;": "Á", "&Eacute;": "É", "&Iacute;": "Í", "&Oacute;": "Ó", "&Uacute;": "Ú",
    "&Atilde;": "Ã", "&Otilde;": "Õ", "&Ccedil;": "Ç",
  };
  text = text.replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(parseInt(d, 10)));
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
  text = text.replace(/&[a-zA-Z]+;/g, (m) => entities[m] ?? " ");

  text = text.replace(/[ \t]+/g, " ");
  text = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  return text.trim();
}

async function fetchPageText(rawUrl: string, timeoutMs: number): Promise<{ text: string | null; error: string | null }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { text: null, error: "Endereço do site inválido." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { text: null, error: "Endereço do site inválido." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Alguns sites de eventos bloqueiam pedidos sem User-Agent de
        // navegador — este identifica-se claramente como bot em vez de
        // fingir ser um browser real.
        "User-Agent": "Mozilla/5.0 (compatible; IronHealthBot/1.0; +https://ironhealth.app)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.5",
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { text: null, error: `O site respondeu com um erro (HTTP ${res.status}).` };
    }
    const contentType = res.headers.get("content-type") || "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("xml")) {
      return { text: null, error: "Este endereço não devolveu uma página web (HTML)." };
    }
    const contentLength = Number(res.headers.get("content-length") || "0");
    if (contentLength > MAX_RAW_HTML_CHARS * 2) {
      return { text: null, error: "A página é demasiado grande para analisar." };
    }
    let raw = await res.text();
    if (raw.length > MAX_RAW_HTML_CHARS) raw = raw.slice(0, MAX_RAW_HTML_CHARS);
    return { text: raw, error: null };
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      return { text: null, error: "O site demorou demasiado tempo a responder." };
    }
    return { text: null, error: "Não consegui aceder a este site." };
  }
}

function resolveUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

// Ligações do MESMO domínio cujo caminho ou texto sugerem conter informação
// que a página principal não tem (percurso, regulamento, horários,
// documentos, etc.) — a página principal é muitas vezes só uma montra que
// remete os detalhes reais para sub-páginas.
function extractCandidateLinks(html: string, baseUrl: string, baseHost: string): string[] {
  const scores = new Map<string, number>();
  const anchorRe = /<a\s+[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1];
    if (/^(mailto|tel|javascript):/i.test(href)) continue;
    const anchorText = m[2].replace(/<[^>]+>/g, " ");
    const resolved = resolveUrl(href, baseUrl);
    if (!resolved || resolved === baseUrl) continue;
    let host: string;
    try {
      host = new URL(resolved).hostname;
    } catch {
      continue;
    }
    if (host !== baseHost) continue;
    const haystack = (anchorText + " " + href).toLowerCase();
    const score = LINK_KEYWORDS.reduce((acc, kw) => acc + (haystack.includes(kw) ? 1 : 0), 0);
    if (score > 0) scores.set(resolved, Math.max(scores.get(resolved) || 0, score));
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SUBPAGES)
    .map(([url]) => url);
}

// Lê a página principal e, se encontrar ligações relevantes no mesmo
// domínio, lê-as em paralelo e junta tudo num único texto para o Gemini.
async function fetchSiteText(website: string): Promise<{ text: string | null; error: string | null; pagesRead: number }> {
  const main = await fetchPageText(website, MAIN_PAGE_FETCH_TIMEOUT_MS);
  if (!main.text) return { text: null, error: main.error, pagesRead: 0 };

  let baseHost: string;
  try {
    baseHost = new URL(website).hostname;
  } catch {
    baseHost = "";
  }
  const candidateLinks = baseHost ? extractCandidateLinks(main.text, website, baseHost) : [];

  const subResults = await Promise.all(
    candidateLinks.map((url) => fetchPageText(url, SUBPAGE_FETCH_TIMEOUT_MS)),
  );

  let combined = `=== Página principal: ${website} ===\n${htmlToText(main.text).slice(0, MAX_MAIN_PAGE_TEXT_CHARS)}`;
  let pagesRead = 1;
  candidateLinks.forEach((url, i) => {
    const sub = subResults[i];
    if (!sub.text) return;
    const t = htmlToText(sub.text).slice(0, MAX_SUBPAGE_TEXT_CHARS);
    if (t.length < 50) return;
    combined += `\n\n=== Página: ${url} ===\n${t}`;
    pagesRead += 1;
  });

  return { text: combined.slice(0, MAX_TOTAL_TEXT_CHARS), error: null, pagesRead };
}

const RACE_TYPE_LABELS: Record<string, string> = { estrada: "Estrada", trail: "Trail" };
const EXPERIENCE_LEVEL_LABELS: Record<string, string> = {
  iniciante: "Iniciante", basico: "Básico", medio: "Médio", avancado: "Avançado",
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    found_relevant_info: { type: "BOOLEAN" },
    schedule: {
      type: "ARRAY",
      nullable: true,
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          when: { type: "STRING" },
          where: { type: "STRING", nullable: true },
        },
        required: ["label", "when"],
      },
    },
    required_documents: { type: "STRING", nullable: true },
    category_info: { type: "STRING", nullable: true },
    gear_recommendations: { type: "STRING", nullable: true },
    logistics: { type: "STRING", nullable: true },
    route_summary: { type: "STRING", nullable: true },
    route_segments: {
      type: "ARRAY",
      nullable: true,
      items: {
        type: "OBJECT",
        properties: {
          km_marker: { type: "NUMBER", nullable: true },
          description: { type: "STRING" },
          turn: { type: "STRING", nullable: true, enum: ["esquerda", "direita", "reto", "partida", "chegada"] },
          elevation: { type: "STRING", nullable: true, enum: ["sobe", "desce", "plano"] },
        },
        required: ["description"],
      },
    },
    caveats: { type: "STRING", nullable: true },
  },
  required: [
    "found_relevant_info", "schedule", "required_documents", "category_info",
    "gear_recommendations", "logistics", "route_summary", "route_segments", "caveats",
  ],
};

function buildPrompt(
  race: {
    name: string;
    race_type: string | null;
    distance_km: number | null;
    location: string | null;
    experience_level: string | null;
    elevation_gain_m: number | null;
  },
  pageText: string,
): string {
  return (
    `Vais ler o conteúdo (extraído em texto simples, possivelmente de mais do que uma página do mesmo site — cada ` +
    `uma marcada com "=== Página: ... ===") do site oficial de uma prova de corrida, e ajudar um atleta amador a ` +
    `preparar-se para ela.\n\n` +
    `Prova: "${race.name}"${race.location ? ` em ${race.location}` : ""}, ` +
    `${race.distance_km ? `${race.distance_km} km` : "distância não especificada"}, ` +
    `tipo ${RACE_TYPE_LABELS[race.race_type || ""] || race.race_type || "não especificado"}` +
    (race.elevation_gain_m ? `, D+ ${race.elevation_gain_m}m` : "") + `.\n` +
    (race.experience_level
      ? `O atleta autodeclarou-se nível "${EXPERIENCE_LEVEL_LABELS[race.experience_level] || race.experience_level}" para ESTA prova — quando a página tiver informação por escalão/categoria/nível/onda de partida, dá prioridade à que se aplica a este nível.\n`
      : "") +
    `\nREGRAS OBRIGATÓRIAS:\n` +
    `- Não inventes nem estimes nada que não esteja no texto abaixo. Se um campo não tiver informação suficiente ou confiável no texto, devolve null nesse campo — nunca preenchas com suposições genéricas sobre corridas em geral.\n` +
    `- schedule: horários/datas CONCRETOS mencionados no texto (levantamento de dorsais/kit, briefing, partida — por escalão/distância se houver mais do que uma —, encerramento de inscrições, entrega de prémios, etc.), cada um como { label: rótulo curto, when: o texto do horário/data tal como aparece ou muito próximo disso, where: o local/morada/recinto ONDE isso acontece, se estiver indicado (ex.: onde se levantam os dorsais pode ser um local diferente da partida) — null se não estiver indicado. PRESTA ATENÇÃO ESPECIAL ao levantamento de dorsais/kit: é frequentemente omitido — procura ativamente por isso em todas as páginas antes de desistir.\n` +
    `- required_documents: documentos que o atleta precisa de levar/apresentar para o levantamento do dorsal ou para participar (ex.: cartão de cidadão/documento de identificação, atestado médico, comprovativo de inscrição, seguro). Null se o texto não mencionar nenhum.\n` +
    `- category_info: informação específica para o escalão/nível do atleta indicado acima (regras de admissão, tempo-limite/cut-off, ondas de partida por escalão, material obrigatório específico de uma categoria). Se a página só tiver informação genérica (não separada por escalão), resume essa informação genérica em vez de devolver null.\n` +
    `- gear_recommendations: equipamento recomendado ou obrigatório para a prova (ex.: chip, kit obrigatório de trail, calçado, hidratação).\n` +
    `- logistics: deslocação e logística — estacionamento, transportes públicos, acessos, alojamento próximo, ponto de encontro (diferente de where em schedule: aqui é sobre chegar ao local, não sobre o horário de um evento específico).\n` +
    `- route_summary: 2-4 frases descrevendo o perfil GERAL do percurso (ex.: terreno, se é maioritariamente plano ou tem subidas, zonas emblemáticas), só se o texto tiver essa informação.\n` +
    `- route_segments: reconstrução APROXIMADA do trajeto a partir de indicações em texto (nomes de ruas/troços, marcos de km, direções, indicações de subida/descida) — só preenche se ALGUMA das páginas descrever o trajeto com esse detalhe (procura especialmente numa página sobre "percurso"/"route"/"trajeto", se existir entre as páginas fornecidas). NÃO inventes um trajeto plausível a partir só do nome da prova ou da cidade; se nenhuma página descrever a rota com detalhe suficiente, devolve null neste campo. Cada segmento é qualitativo (não são coordenadas GPS reais), na ordem em que a prova percorre.\n` +
    `- caveats: nota curta (1-2 frases) se algo parecer desatualizado (ex.: menciona um ano anterior), incompleto, ou se as páginas remeterem para PDFs/imagens que não conseguiste ler em texto. Null se não houver nada a assinalar.\n` +
    `- found_relevant_info: false se as páginas não tiverem NENHUMA informação útil para os campos acima (ex.: é uma página de erro, login, ou completamente genérica).\n\n` +
    `Responde em português (PT).\n\n` +
    `--- CONTEÚDO ---\n${pageText}\n--- FIM DO CONTEÚDO ---`
  );
}

type ScheduleItem = { label: string; when: string; where: string | null };
type RouteSegment = {
  km_marker: number | null;
  description: string;
  turn: string | null;
  elevation: string | null;
};
type WebInfo = {
  schedule: ScheduleItem[] | null;
  required_documents: string | null;
  category_info: string | null;
  gear_recommendations: string | null;
  logistics: string | null;
  route_summary: string | null;
  route_segments: RouteSegment[] | null;
  caveats: string | null;
  source_url: string;
  fetched_at: string;
};

type RaceContext = {
  name: string;
  website: string;
  race_type: string | null;
  distance_km: number | null;
  location: string | null;
  experience_level: string | null;
  elevation_gain_m: number | null;
};

const TURN_VALUES = new Set(["esquerda", "direita", "reto", "partida", "chegada"]);
const ELEVATION_VALUES = new Set(["sobe", "desce", "plano"]);
const RACE_TYPE_VALUES = new Set(["estrada", "trail"]);
const EXPERIENCE_LEVEL_VALUES = new Set(["iniciante", "basico", "medio", "avancado"]);

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

    // Dois modos: prova já gravada (persiste o resultado) ou rascunho ainda
    // por gravar no formulário de criação/edição (só devolve, o cliente
    // guarda no rascunho e persiste junto com o resto ao gravar a prova).
    let race: RaceContext;
    let persistRaceEventId: string | null = null;

    const raceEventId = typeof body.race_event_id === "string" ? body.race_event_id : null;
    if (raceEventId) {
      const { data: dbRace, error: fetchError } = await sb
        .from("race_events")
        .select("id, name, website, race_type, distance_km, location, experience_level, elevation_gain_m")
        .eq("id", raceEventId)
        .eq("user_id", userId)
        .maybeSingle();
      if (fetchError) return jsonResponse({ error: `Falha a procurar a prova: ${fetchError.message}` }, 500);
      if (!dbRace) return jsonResponse({ error: "Prova não encontrada" }, 404);
      if (!dbRace.website) return jsonResponse({ error: "Esta prova não tem site definido." }, 400);
      race = dbRace;
      persistRaceEventId = dbRace.id;
    } else if (typeof body.website === "string" && body.website.trim()) {
      race = {
        name: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : "Prova",
        website: body.website.trim(),
        race_type: typeof body.race_type === "string" && RACE_TYPE_VALUES.has(body.race_type) ? body.race_type : null,
        distance_km: typeof body.distance_km === "number" && isFinite(body.distance_km) ? body.distance_km : null,
        location: typeof body.location === "string" && body.location.trim() ? body.location.trim().slice(0, 120) : null,
        experience_level: typeof body.experience_level === "string" && EXPERIENCE_LEVEL_VALUES.has(body.experience_level)
          ? body.experience_level : null,
        elevation_gain_m: typeof body.elevation_gain_m === "number" && isFinite(body.elevation_gain_m) ? body.elevation_gain_m : null,
      };
    } else {
      return jsonResponse({ error: "race_event_id ou website em falta" }, 400);
    }

    const site = await fetchSiteText(race.website);
    if (!site.text) {
      return jsonResponse({ error: site.error || "Não consegui aceder a este site." }, 502);
    }
    if (site.text.length < MIN_TOTAL_TEXT_CHARS) {
      return jsonResponse({
        error: "Este site não tem texto suficiente para analisar — pode carregar o conteúdo só depois de JavaScript correr, algo que esta análise não consegue ver.",
      }, 422);
    }

    const prompt = buildPrompt(race, site.text);

    let geminiRes: Response;
    try {
      geminiRes = await fetchGeminiWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              response_mime_type: "application/json",
              response_schema: RESPONSE_SCHEMA,
              maxOutputTokens: 4096,
            },
          }),
        },
      );
    } catch (e) {
      return jsonResponse({ error: e instanceof Error ? e.message : "Falha a contactar o Gemini." }, 502);
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini error:", geminiRes.status, errText);
      if (geminiRes.status === 429) {
        return jsonResponse({ error: "O Gemini atingiu o limite de pedidos gratuitos neste momento. Tenta novamente daqui a pouco." }, 502);
      }
      return jsonResponse({ error: `Análise falhou (Gemini ${geminiRes.status}). Tenta novamente.` }, 502);
    }

    const geminiJson = await geminiRes.json();
    // Consumo devolvido ao cliente, que é quem o regista em app_logs — ver
    // invokeEdgeFunctionWithTimeout (src/lib/supabase.js), que grava sempre
    // que a resposta traz `usage`. Sem isto esta função ficava invisível no
    // painel de Custos API do Admin.
    const usage = {
      input_tokens: Number(geminiJson?.usageMetadata?.promptTokenCount) || 0,
      output_tokens: Number(geminiJson?.usageMetadata?.candidatesTokenCount) || 0,
      cached_tokens: Number(geminiJson?.usageMetadata?.cachedContentTokenCount) || 0,
    };
    const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("Gemini devolveu JSON inválido:", rawText);
      return jsonResponse({ error: "A análise devolveu um formato inesperado. Tenta novamente." }, 502);
    }

    const notFoundResponse = () => jsonResponse({
      web_info: null,
      usage,
      message: "Não encontrei informação relevante (horários, equipamento, deslocação ou percurso) neste site.",
    });

    if (parsed.found_relevant_info === false) return notFoundResponse();

    const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
    const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);

    const rawSchedule = Array.isArray(parsed.schedule) ? parsed.schedule : [];
    const schedule: ScheduleItem[] = rawSchedule
      .map((s) => {
        const r = s as Record<string, unknown>;
        const label = str(r.label);
        const when = str(r.when);
        if (!label || !when) return null;
        return { label, when, where: str(r.where) };
      })
      .filter((s): s is ScheduleItem => s !== null);

    const rawSegments = Array.isArray(parsed.route_segments) ? parsed.route_segments : [];
    const routeSegments: RouteSegment[] = rawSegments
      .map((s) => {
        const r = s as Record<string, unknown>;
        const description = str(r.description);
        if (!description) return null;
        const turn = str(r.turn);
        const elevation = str(r.elevation);
        return {
          km_marker: num(r.km_marker),
          description,
          turn: turn && TURN_VALUES.has(turn) ? turn : null,
          elevation: elevation && ELEVATION_VALUES.has(elevation) ? elevation : null,
        };
      })
      .filter((s): s is RouteSegment => s !== null);

    const webInfo: WebInfo = {
      schedule: schedule.length ? schedule : null,
      required_documents: str(parsed.required_documents),
      category_info: str(parsed.category_info),
      gear_recommendations: str(parsed.gear_recommendations),
      logistics: str(parsed.logistics),
      route_summary: str(parsed.route_summary),
      route_segments: routeSegments.length ? routeSegments : null,
      caveats: str(parsed.caveats),
      source_url: race.website,
      fetched_at: new Date().toISOString(),
    };

    const hasContent = webInfo.schedule || webInfo.required_documents || webInfo.category_info ||
      webInfo.gear_recommendations || webInfo.logistics || webInfo.route_summary || webInfo.route_segments;
    if (!hasContent) return notFoundResponse();

    if (!persistRaceEventId) {
      // Modo rascunho (formulário de criação/edição ainda não gravado) —
      // devolve só o resultado, sem tocar na BD.
      return jsonResponse({ web_info: webInfo, usage });
    }

    const { data: updated, error: updateError } = await sb
      .from("race_events")
      .update({ web_info: webInfo })
      .eq("id", persistRaceEventId)
      .eq("user_id", userId)
      .select()
      .single();
    if (updateError) return jsonResponse({ error: `Falha a gravar a informação: ${updateError.message}` }, 500);

    return jsonResponse({ race_event: updated, usage });
  } catch (e) {
    console.error("Erro inesperado:", e);
    return jsonResponse({ error: "Erro inesperado no servidor" }, 500);
  }
});
