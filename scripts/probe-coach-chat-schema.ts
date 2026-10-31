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
// Desde 30-10-2026 corre também no Flash de recurso (GEMINI_BUSY_FALLBACK_MODEL)
// e com a configuração completa do chat (CHAT_MAX_OUTPUT_TOKENS, thinking
// "low"): foi aí que o 3.6-flash deu 400 INVALID_ARGUMENT em produção.
//
// Resultado esperado: todas as linhas com HTTP 200. Um 400 na primeira ou na
// segunda quer dizer que o esquema novo não pode ir para produção como está
// (a rede do coach-chat repetiria cada pedido sem o campo — funciona, mas
// cada mensagem pagava uma ida e volta falhada).

import { CHAT_MAX_OUTPUT_TOKENS, GEMINI_MODEL, RESPONSE_SCHEMA, RESPONSE_SCHEMA_BASE, SERIES_TOOLS, buildSystemInstruction, buildTools } from "../supabase/functions/coach-chat/index.ts";
import { GEMINI_BUSY_FALLBACK_MODEL } from "../supabase/functions/_shared/geminiModel.ts";

const key = Deno.env.get("GEMINI_API_KEY");
if (!key) {
  console.error("Falta a variável GEMINI_API_KEY.");
  Deno.exit(2);
}

// A chave vai no header (x-goog-api-key), nunca na URL — ver _shared/geminiModel.ts.
const urlFor = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

async function probe(
  label: string,
  schema: unknown,
  withTools: boolean,
  model = GEMINI_MODEL,
  extra: Record<string, unknown> = { maxOutputTokens: 4096 },
  contents: unknown[] | null = null,
  tools: unknown = null,
  system: string | null = null,
): Promise<boolean> {
  const url = urlFor(model);
  label = `[${model}] ${label}`;
  const body = {
    system_instruction: {
      parts: [{
        text: system ?? ("És a Carol, treinadora de corrida. Responde em português de Portugal. Se recomendares descanso para um dia concreto, " +
          "preenche o campo recommendations com a data e o tipo."),
      }],
    },
    contents: contents ?? [{ role: "user", parts: [{ text: "Hoje (2026-09-25). Dormi mal e estou com as pernas pesadas. Amanhã descanso?" }] }],
    ...(withTools ? { tools: tools ?? buildTools(null) } : {}),
    generationConfig: {
      temperature: 0.7,
      ...extra,
      response_mime_type: "application/json",
      response_schema: schema,
    },
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key! }, body: JSON.stringify(body) });
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

const chatConfig = { maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS };
const noBio = {
  height_cm: null, weight_kg: null, gender: null, birth_date: null, experience_level: null, resting_hr_bpm: null,
  dietary_restrictions: null, dietary_notes: null,
};
const doctrine = buildSystemInstruction(null, noBio, null, null, "", "", null, null, null, null, null, null);
// Enchimento com o aspeto dos dados do contexto (linhas de registos), até ~150 KB.
const filler = Array.from({ length: 900 }, (_, i) => `- 2026-10-${String(1 + (i % 28)).padStart(2, "0")}: corrida de ${5 + (i % 12)} km a 5'${10 + (i % 40)}"/km, FC média ${140 + (i % 25)} bpm, RPE ${4 + (i % 5)}/10.`).join("\n");
const big = (doctrine + "\n\nDADOS DE CONTEXTO (enchimento para medir o teto):\n" + filler).slice(0, 150000);
const planConfig = { maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS, thinkingConfig: { thinkingLevel: "low" } };
/* As ferramentas do Troféu isoladas (31-10-2026: «com as ferramentas do Troféu»
   deu 400 no 3.6 e passa no 3.8). Cada caso manda só UMA declaração; nas da
   culpada, um caso por campo: sem ele, ou com o tipo mudado. */
// deno-lint-ignore no-explicit-any
type Decl = any;
const only = (decl: Decl) => [{ functionDeclarations: [decl] }];
const clone = (d: Decl): Decl => JSON.parse(JSON.stringify(d));
function variants(decl: Decl): [string, Decl][] {
  const out: [string, Decl][] = [[`${decl.name} (tal como está)`, decl]];
  for (const field of Object.keys(decl.parameters?.properties ?? {})) {
    const without = clone(decl);
    delete without.parameters.properties[field];
    without.parameters.required = (without.parameters.required ?? []).filter((r: string) => r !== field);
    if (!without.parameters.required.length) delete without.parameters.required;
    out.push([`${decl.name} sem ${field}`, without]);
    const f = decl.parameters.properties[field];
    if (f?.type === "INTEGER") {
      const asNumber = clone(decl);
      asNumber.parameters.properties[field].type = "NUMBER";
      out.push([`${decl.name}: ${field} INTEGER → NUMBER`, asNumber]);
    }
    if (Array.isArray(f?.enum)) {
      const noEnum = clone(decl);
      delete noEnum.parameters.properties[field].enum;
      out.push([`${decl.name}: ${field} sem enum`, noEnum]);
    }
  }
  const noRequired = clone(decl);
  delete noRequired.parameters.required;
  out.push([`${decl.name} sem required`, noRequired]);
  const noDescription = clone(decl);
  noDescription.description = "Ferramenta de teste.";
  out.push([`${decl.name} com descrição curta`, noDescription]);
  return out;
}
async function probeSeriesTools(model: string): Promise<boolean[]> {
  const r: boolean[] = [];
  for (const decl of SERIES_TOOLS) {
    for (const [label, d] of variants(decl)) {
      r.push(await probe(`Troféu — ${label}`, RESPONSE_SCHEMA, true, model, chatConfig, null, only(d)));
    }
  }
  return r;
}

const results = [];
for (const model of [GEMINI_MODEL, GEMINI_BUSY_FALLBACK_MODEL]) {
  results.push(
    await probe("esquema novo, com todas as ferramentas (uma ronda normal)", RESPONSE_SCHEMA, true, model),
    await probe("esquema novo, sem ferramentas (a ronda final)", RESPONSE_SCHEMA, false, model),
    await probe("esquema de antes, com todas as ferramentas (controlo)", RESPONSE_SCHEMA_BASE, true, model),
    // Isolar o 400 de 30-10: o teto de saída do chat, e o thinking dos turnos de plano.
    await probe("como o chat: ferramentas + esquema + teto 32768", RESPONSE_SCHEMA, true, model, chatConfig),
    await probe("como um turno de plano: + thinking low, esquema de antes", RESPONSE_SCHEMA_BASE, true, model, planConfig),
    // R3 de 8715a0b0 (o 400 do 3.6 no pedido real do Rui): as duas diferenças
    // para os casos acima — turnos «model» seguidos no histórico (as mensagens
    // por iniciativa da Carol) e as ferramentas do Troféu (com inscrição ativa).
    await probe("histórico com turnos «model» seguidos (o do Rui)", RESPONSE_SCHEMA, true, model, chatConfig, [
      { role: "user", parts: [{ text: "Bom dia" }] },
      { role: "model", parts: [{ text: "Bom dia! Como dormiste?" }] },
      { role: "model", parts: [{ text: "Lembra-te do treino de hoje." }] },
      { role: "model", parts: [{ text: "Já registaste o pequeno-almoço?" }] },
      { role: "user", parts: [{ text: "Amanhã descanso?" }] },
    ]),
    await probe("com as ferramentas do Troféu (inscrição ativa)", RESPONSE_SCHEMA, true, model, chatConfig, null, buildTools(null, true)),
    // 31-10: o system instruction do chat chega aos 147 KB nos pedidos que o 3.6
    // recusa. A doutrina real (~98 KB) e depois ~150 KB: se só o grande dá 400,
    // é um teto de tamanho.
    // Sem as ferramentas do Troféu (31-10: elas sozinhas dão 400 no 3.6): só o tamanho.
    await probe("system com a doutrina real (~98 KB), sem Troféu", RESPONSE_SCHEMA, true, model, chatConfig, null, buildTools(null, false), doctrine),
    await probe("system de ~150 KB (doutrina + enchimento), sem Troféu", RESPONSE_SCHEMA, true, model, chatConfig, null, buildTools(null, false), big),
    // 1. As ferramentas do Troféu, uma a uma e campo a campo (só a declaração em causa).
    ...(await probeSeriesTools(model)),
  );
}
Deno.exit(results.every(Boolean) ? 0 : 1);
