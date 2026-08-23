// IronCoach · estimate-shoe-lifespan Edge Function
//
// Botão "Perguntar à Carol" no armário de sapatilhas (Perfil → Equipamento):
// dada a marca e o modelo concretos de um par, pede ao Gemini a vida útil
// esperada desse modelo, a categoria a que pertence e uma justificação curta.
//
// Porquê por modelo e não por categoria fixa: dois pares da mesma marca
// podem ter vidas úteis muito diferentes (um Nike Pegasus de treino diário
// dura o dobro de um Vaporfly de competição com placa de carbono). Uma
// tabela local por categoria não distingue os dois; o modelo concreto sim.
//
// IMPORTANTE — a vida útil devolvida é SEMPRE a de referência, para um
// corredor de 70 kg. O ajuste ao peso real do atleta é feito no cliente
// (src/utils/shoes.js), não aqui: o peso muda ao longo do tempo e um valor
// já ajustado ficaria desatualizado assim que o atleta registasse uma nova
// avaliação corporal. O prompt é explícito quanto a isso.
//
// Pedido explícito e não-automático: só corre quando o atleta carrega no
// botão (custo de API). Se falhar, o atleta pode sempre escrever a vida útil
// à mão no formulário — a funcionalidade nunca fica refém do Gemini.
//
// A chave Gemini vive apenas aqui (secret GEMINI_API_KEY), nunca no cliente.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_TIMEOUT_MS = 30000;

// Peso a que a estimativa se reporta — tem de ser igual a REFERENCE_WEIGHT_KG
// em src/utils/shoes.js, senão o ajuste no cliente parte de uma base errada.
const REFERENCE_WEIGHT_KG = 70;

// Travões de sanidade: nenhuma sapatilha de corrida real dura menos de 100 km
// nem mais de 1500 km. Um valor fora disto é alucinação do modelo, não uma
// estimativa — vale mais recusar do que gravar um número absurdo que depois
// silencia (ou dispara sem parar) os avisos de desgaste.
const MIN_PLAUSIBLE_KM = 100;
const MAX_PLAUSIBLE_KM = 1500;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    recognized: { type: "boolean" },
    lifespan_km: { type: "integer" },
    category: { type: "string" },
    rationale: { type: "string" },
  },
  required: ["recognized"],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchGeminiWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("O pedido à Carol demorou demasiado tempo. Tenta novamente.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function buildPrompt(brand: string, model: string): string {
  return [
    "És a Carol, treinadora de corrida. Um atleta registou um par de sapatilhas no armário dele e quer saber quantos quilómetros esse modelo costuma aguentar antes de a entressola perder as propriedades de amortecimento.",
    "",
    `Marca: ${brand}`,
    `Modelo: ${model}`,
    "",
    "Responde em JSON com:",
    '- "recognized": true se reconheces este modelo concreto (ou uma versão muito próxima dele) como uma sapatilha de corrida real. false se não fazes ideia do que é, se o texto não corresponde a nenhuma sapatilha que conheças, ou se é demasiado vago para distinguir (ex.: só "Nike").',
    `- "lifespan_km": inteiro, os quilómetros de vida útil típica DESTE modelo para um corredor de ${REFERENCE_WEIGHT_KG} kg, em asfalto, com técnica de passada normal. Assume SEMPRE este peso de referência — o ajuste ao peso real do atleta é feito noutro sítio, não é contigo. Só preencher se recognized for true.`,
    '- "category": categoria curta do modelo em português (ex.: "treino diário", "competição com placa de carbono", "trail", "estabilidade", "treino rápido"). Só preencher se recognized for true.',
    '- "rationale": UMA frase curta (máx. 200 caracteres) a explicar de onde vem o número — o tipo de espuma, a categoria, o propósito do modelo. Escreve na primeira pessoa, tom direto e prático, como se falasses com o atleta. Só preencher se recognized for true.',
    "",
    "Regras:",
    `- lifespan_km tem de estar entre ${MIN_PLAUSIBLE_KM} e ${MAX_PLAUSIBLE_KM}. Sapatilhas de treino diário andam tipicamente pelos 600-800 km; modelos de competição com placa de carbono pelos 200-350 km; trail pelos 500-700 km.`,
    "- Não inventes. Se não reconheces o modelo, devolve recognized: false e deixa os outros campos vazios. É preferível não dar estimativa nenhuma a dar uma errada — o atleta pode sempre escrever o valor à mão.",
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    const brand = typeof body.brand === "string" ? body.brand.trim().slice(0, 60) : "";
    const model = typeof body.model === "string" ? body.model.trim().slice(0, 80) : "";

    if (!brand || !model) {
      return jsonResponse({ error: "Indica a marca e o modelo antes de perguntar à Carol." }, 400);
    }

    let geminiRes: Response;
    try {
      geminiRes = await fetchGeminiWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: buildPrompt(brand, model) }] }],
            generationConfig: {
              response_mime_type: "application/json",
              response_schema: RESPONSE_SCHEMA,
              maxOutputTokens: 512,
            },
          }),
        },
      );
    } catch (e) {
      return jsonResponse({ error: e instanceof Error ? e.message : "Falha a contactar a Carol." }, 502);
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini error:", geminiRes.status, errText);
      if (geminiRes.status === 429) {
        return jsonResponse({ error: "A Carol atingiu o limite de pedidos neste momento. Tenta novamente daqui a pouco." }, 502);
      }
      return jsonResponse({ error: `A estimativa falhou (Gemini ${geminiRes.status}). Tenta novamente.` }, 502);
    }

    const geminiJson = await geminiRes.json();
    const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("Gemini devolveu JSON inválido:", rawText);
      return jsonResponse({ error: "A estimativa devolveu um formato inesperado. Tenta novamente." }, 502);
    }

    // Registo de consumo para o painel de Custos API do Admin (mesmo formato
    // das restantes funções: level 'success', tokens em meta).
    const usage = geminiJson?.usageMetadata;
    if (usage) {
      await sb.from("app_logs").insert({
        user_id: userId,
        level: "success",
        event: "estimate-shoe-lifespan",
        message: `${brand} ${model}`,
        meta: {
          input_tokens: usage.promptTokenCount ?? 0,
          output_tokens: usage.candidatesTokenCount ?? 0,
        },
      });
    }

    if (parsed.recognized !== true) {
      return jsonResponse({
        estimate: null,
        message: `Não conheço o modelo "${brand} ${model}" bem o suficiente para arriscar uma estimativa. Podes escrever a vida útil à mão — normalmente vem na caixa ou no site da marca.`,
      });
    }

    const lifespanKm = Number(parsed.lifespan_km);
    if (!Number.isFinite(lifespanKm) || lifespanKm < MIN_PLAUSIBLE_KM || lifespanKm > MAX_PLAUSIBLE_KM) {
      console.error("Gemini devolveu vida útil fora do plausível:", parsed.lifespan_km);
      return jsonResponse({
        estimate: null,
        message: "A estimativa que recebi não faz sentido para uma sapatilha de corrida. Escreve a vida útil à mão, se souberes.",
      });
    }

    return jsonResponse({
      estimate: {
        lifespan_km: Math.round(lifespanKm),
        category: typeof parsed.category === "string" ? parsed.category.slice(0, 60) : null,
        rationale: typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 240) : null,
        reference_weight_kg: REFERENCE_WEIGHT_KG,
      },
    });
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});
