// Validação contra a API real do Gemini do pedido do coach-chat com o
// RESPONSE_SCHEMA das recomendações (specs/carol-omnisciencia-omnipresenca.md,
// ação 5.5, push 2 — "Teste estrutural e validação contra a API real antes do
// push").
//
// O incidente de 2026-09-05 foi um 400 INVALID_ARGUMENT em QUALQUER mensagem
// ao Coach: a API recusava a forma do pedido (as ferramentas vão todas em
// cada chamada). Isto manda um pedido com a mesma forma do coach-chat — o
// mesmo modelo, TODAS as ferramentas (buildTools(null)) e o esquema de
// resposta novo — e diz se a API o aceita. Não grava nada em lado nenhum.
//
// Uso (a chave é a do segredo GEMINI_API_KEY do Supabase; fica só no teu
// terminal):
//   GEMINI_API_KEY=... deno run --allow-net --allow-env scripts/probe-coach-chat-schema.ts
//
// Resultado esperado: as três linhas com HTTP 200. Um 400 na primeira ou na
// segunda quer dizer que o esquema novo não pode ir para produção como está
// (a rede do coach-chat repetiria cada pedido sem o campo — funciona, mas
// cada mensagem pagava uma ida e volta falhada).

import { GEMINI_MODEL, RESPONSE_SCHEMA, RESPONSE_SCHEMA_BASE, buildTools } from "../supabase/functions/coach-chat/index.ts";

const key = Deno.env.get("GEMINI_API_KEY");
if (!key) {
  console.error("Falta a variável GEMINI_API_KEY.");
  Deno.exit(2);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

async function probe(label: string, schema: unknown, withTools: boolean): Promise<boolean> {
  const body = {
    system_instruction: {
      parts: [{
        text: "És a Carol, treinadora de corrida. Responde em português de Portugal. Se recomendares descanso para um dia concreto, " +
          "preenche o campo recommendations com a data e o tipo.",
      }],
    },
    contents: [{ role: "user", parts: [{ text: "Hoje (2026-09-25). Dormi mal e estou com as pernas pesadas. Amanhã descanso?" }] }],
    ...(withTools ? { tools: buildTools(null) } : {}),
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
      response_mime_type: "application/json",
      response_schema: schema,
    },
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  console.log(`${res.ok ? "OK " : "ERRO"}  ${label}: HTTP ${res.status}`);
  if (!res.ok) {
    console.log(`      ${text.slice(0, 600)}`);
    return false;
  }
  try {
    const json = JSON.parse(text);
    const parts = json?.candidates?.[0]?.content?.parts || [];
    const reply = parts.find((p: { text?: string; thought?: boolean }) => typeof p?.text === "string" && !p.thought)?.text;
    const call = parts.find((p: { functionCall?: unknown }) => p?.functionCall)?.functionCall;
    if (reply) {
      const parsed = JSON.parse(reply);
      console.log(`      recommendations: ${JSON.stringify(parsed.recommendations ?? null)}`);
    } else if (call) {
      console.log(`      (o modelo chamou uma ferramenta: ${JSON.stringify(call).slice(0, 120)})`);
    }
  } catch {
    console.log("      (resposta aceite; o texto não era JSON completo — irrelevante para a validação do esquema)");
  }
  return true;
}

const results = [
  await probe("esquema novo, com todas as ferramentas (uma ronda normal)", RESPONSE_SCHEMA, true),
  await probe("esquema novo, sem ferramentas (a ronda final)", RESPONSE_SCHEMA, false),
  await probe("esquema de antes, com todas as ferramentas (controlo)", RESPONSE_SCHEMA_BASE, true),
];
Deno.exit(results.every(Boolean) ? 0 : 1);
