// IronHealth · enrich-race-event Edge Function
// Botão "Obter informação da prova" (RaceCard/RunAgenda): lê o site oficial
// da prova (race_events.website) e usa o Gemini para extrair horários,
// informação específica ao escalão/nível do atleta, recomendações de
// equipamento e deslocação, e — quando o site descrever o trajeto com
// detalhe suficiente — uma reconstrução aproximada do percurso a partir de
// indicações em texto (não há GPX nem coordenadas reais nesta app, por isso
// route_segments é sempre esquemático, nunca um mapa geograficamente exato;
// ver src/components/Run/RaceRouteDiagram.jsx).
//
// Pedido explícito e não-automático: só corre quando o atleta carrega no
// botão (custo de API + latência de rede a um site de terceiros). O
// resultado fica em race_events.web_info até o atleta pedir para atualizar.
//
// A chave Gemini vive apenas aqui (secret GEMINI_API_KEY), nunca no cliente.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_TIMEOUT_MS = 45000;
const GEMINI_RETRIES = 1;
const PAGE_FETCH_TIMEOUT_MS = 15000;
const MAX_RAW_HTML_CHARS = 3_000_000;
const MAX_PAGE_TEXT_CHARS = 30_000;
const MIN_PAGE_TEXT_CHARS = 150;

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
  // Blocos cujo conteúdo nunca interessa (código, estilos, ícones SVG).
  text = text.replace(/<(script|style|noscript|svg|head)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  // Fecho de elementos de bloco vira quebra de linha, para as palavras de
  // troços de texto vizinhos não ficarem coladas depois de remover as tags.
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

async function fetchPageText(rawUrl: string): Promise<{ text: string | null; error: string | null }> {
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
  const timer = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT_MS);
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
        },
        required: ["label", "when"],
      },
    },
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
    "found_relevant_info", "schedule", "category_info", "gear_recommendations",
    "logistics", "route_summary", "route_segments", "caveats",
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
    `Vais ler o conteúdo (extraído em texto simples) da página oficial de uma prova de corrida, e ajudar um ` +
    `atleta amador a preparar-se para ela.\n\n` +
    `Prova: "${race.name}"${race.location ? ` em ${race.location}` : ""}, ` +
    `${race.distance_km ? `${race.distance_km} km` : "distância não especificada"}, ` +
    `tipo ${RACE_TYPE_LABELS[race.race_type || ""] || race.race_type || "não especificado"}` +
    (race.elevation_gain_m ? `, D+ ${race.elevation_gain_m}m` : "") + `.\n` +
    (race.experience_level
      ? `O atleta autodeclarou-se nível "${EXPERIENCE_LEVEL_LABELS[race.experience_level] || race.experience_level}" para ESTA prova — quando a página tiver informação por escalão/categoria/nível/onda de partida, dá prioridade à que se aplica a este nível.\n`
      : "") +
    `\nREGRAS OBRIGATÓRIAS:\n` +
    `- Não inventes nem estimes nada que não esteja no texto abaixo. Se um campo não tiver informação suficiente ou confiável no texto, devolve null nesse campo — nunca preenchas com suposições genéricas sobre corridas em geral.\n` +
    `- schedule: só horários/datas CONCRETOS mencionados no texto (partida, levantamento de dorsais/kit, briefing, encerramento de inscrições, entrega de prémios, etc.), cada um como { label: rótulo curto, when: o texto do horário/data tal como aparece ou muito próximo disso }.\n` +
    `- category_info: informação específica para o escalão/nível do atleta indicado acima (regras de admissão, tempo-limite/cut-off, ondas de partida por escalão, material obrigatório específico de uma categoria). Se a página só tiver informação genérica (não separada por escalão), resume essa informação genérica em vez de devolver null.\n` +
    `- gear_recommendations: equipamento recomendado ou obrigatório para a prova (ex.: chip, kit obrigatório de trail, calçado, hidratação).\n` +
    `- logistics: deslocação e logística — estacionamento, transportes públicos, acessos, alojamento próximo, ponto de encontro.\n` +
    `- route_summary: 2-4 frases descrevendo o perfil GERAL do percurso (ex.: terreno, se é maioritariamente plano ou tem subidas, zonas emblemáticas), só se o texto tiver essa informação.\n` +
    `- route_segments: reconstrução APROXIMADA do trajeto a partir de indicações em texto (nomes de ruas/troços, marcos de km, direções, indicações de subida/descida) — só preenche se o texto descrever o trajeto com esse detalhe. NÃO inventes um trajeto plausível a partir só do nome da prova ou da cidade; se a página não descrever a rota com detalhe suficiente, devolve null neste campo. Cada segmento é qualitativo (não são coordenadas GPS reais), na ordem em que a prova percorre.\n` +
    `- caveats: nota curta (1-2 frases) se algo parecer desatualizado (ex.: menciona um ano anterior), incompleto, ou se a página remeter para PDFs/imagens que não conseguiste ler em texto. Null se não houver nada a assinalar.\n` +
    `- found_relevant_info: false se a página não tiver NENHUMA informação útil para os campos acima (ex.: é uma página de erro, login, ou completamente genérica).\n\n` +
    `Responde em português (PT).\n\n` +
    `--- CONTEÚDO DA PÁGINA (texto extraído, pode ter ruído de navegação/rodapé) ---\n${pageText}\n--- FIM DO CONTEÚDO ---`
  );
}

type RouteSegment = {
  km_marker: number | null;
  description: string;
  turn: string | null;
  elevation: string | null;
};
type WebInfo = {
  schedule: { label: string; when: string }[] | null;
  category_info: string | null;
  gear_recommendations: string | null;
  logistics: string | null;
  route_summary: string | null;
  route_segments: RouteSegment[] | null;
  caveats: string | null;
  source_url: string;
  fetched_at: string;
};

const TURN_VALUES = new Set(["esquerda", "direita", "reto", "partida", "chegada"]);
const ELEVATION_VALUES = new Set(["sobe", "desce", "plano"]);

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
    const raceEventId = typeof body.race_event_id === "string" ? body.race_event_id : null;
    if (!raceEventId) {
      return jsonResponse({ error: "race_event_id em falta" }, 400);
    }

    const { data: race, error: fetchError } = await sb
      .from("race_events")
      .select("id, name, website, race_type, distance_km, location, experience_level, elevation_gain_m")
      .eq("id", raceEventId)
      .eq("user_id", userId)
      .maybeSingle();
    if (fetchError) return jsonResponse({ error: `Falha a procurar a prova: ${fetchError.message}` }, 500);
    if (!race) return jsonResponse({ error: "Prova não encontrada" }, 404);
    if (!race.website) return jsonResponse({ error: "Esta prova não tem site definido." }, 400);

    const page = await fetchPageText(race.website);
    if (!page.text) {
      return jsonResponse({ error: page.error || "Não consegui aceder a este site." }, 502);
    }

    const pageText = htmlToText(page.text).slice(0, MAX_PAGE_TEXT_CHARS);
    if (pageText.length < MIN_PAGE_TEXT_CHARS) {
      return jsonResponse({
        error: "Este site não tem texto suficiente para analisar — pode carregar o conteúdo só depois de JavaScript correr, algo que esta análise não consegue ver.",
      }, 422);
    }

    const prompt = buildPrompt(race, pageText);

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
    const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("Gemini devolveu JSON inválido:", rawText);
      return jsonResponse({ error: "A análise devolveu um formato inesperado. Tenta novamente." }, 502);
    }

    if (parsed.found_relevant_info === false) {
      return jsonResponse({
        web_info: null,
        message: "Não encontrei informação relevante (horários, equipamento, deslocação ou percurso) neste site.",
      });
    }

    const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
    const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);

    const rawSchedule = Array.isArray(parsed.schedule) ? parsed.schedule : [];
    const schedule = rawSchedule
      .map((s) => ({ label: str((s as Record<string, unknown>)?.label), when: str((s as Record<string, unknown>)?.when) }))
      .filter((s): s is { label: string; when: string } => !!s.label && !!s.when);

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
      category_info: str(parsed.category_info),
      gear_recommendations: str(parsed.gear_recommendations),
      logistics: str(parsed.logistics),
      route_summary: str(parsed.route_summary),
      route_segments: routeSegments.length ? routeSegments : null,
      caveats: str(parsed.caveats),
      source_url: race.website,
      fetched_at: new Date().toISOString(),
    };

    // Nada de aproveitável apesar de found_relevant_info não ter vindo false
    // explicitamente — mais seguro do que gravar um objeto todo vazio.
    const hasContent = webInfo.schedule || webInfo.category_info || webInfo.gear_recommendations ||
      webInfo.logistics || webInfo.route_summary || webInfo.route_segments;
    if (!hasContent) {
      return jsonResponse({
        web_info: null,
        message: "Não encontrei informação relevante (horários, equipamento, deslocação ou percurso) neste site.",
      });
    }

    const { data: updated, error: updateError } = await sb
      .from("race_events")
      .update({ web_info: webInfo })
      .eq("id", raceEventId)
      .eq("user_id", userId)
      .select()
      .single();
    if (updateError) return jsonResponse({ error: `Falha a gravar a informação: ${updateError.message}` }, 500);

    return jsonResponse({ race_event: updated });
  } catch (e) {
    console.error("Erro inesperado:", e);
    return jsonResponse({ error: "Erro inesperado no servidor" }, 500);
  }
});
