// A quota do Gemini por atleta (auditoria de segurança, 2026-11-13, aprovada
// pelo Rui): o custo do Gemini não tinha teto por utilizador — um cliente em
// ciclo, ou uma conta abusada, gastava sem limite.
//
// Conta-se no ai_usage (uma linha por pedido que chamou o Gemini, gravada pelo
// usageRecorder), antes de chamar o Gemini, em janelas móveis:
//   - GEMINI_QUOTA_REQUESTS_PER_HOUR pedidos na última hora;
//   - GEMINI_QUOTA_TOKENS_PER_DAY tokens (entrada + saída + raciocínio) nas
//     últimas 24 h.
// Os valores são folgados para uso normal: nos 30 dias antes de 2026-11-13, o
// atleta que mais usou fez 14 pedidos numa hora e 1,16 M tokens num dia
// (p99 por hora: 11 pedidos). 60 por hora é mais de 4×; 4 M por dia, mais de 3×.
//
// O admin (profiles.is_admin) fica sem limite. Uma falha a ler deixa passar:
// a quota protege o custo, não pode deitar a app abaixo. O ai_usage só se lê
// com a service role (a RLS só o abre ao admin).
//
// Conta PEDIDOS, não linhas: com o Flash de recurso, um pedido grava uma
// linha por modelo — com a mesma hora (usageRecorder.ts) —, e cada par
// (função, created_at) é um pedido.
//
// É best-effort: o ai_usage só se grava DEPOIS da resposta (usageRecorder,
// runAfterResponse), por isso pedidos em paralelo passam todos a verificação
// antes de qualquer um contar. Trava um ciclo ou uma conta abusada ao longo
// de minutos, não uma rajada de pedidos simultâneos.

import { createClient } from "jsr:@supabase/supabase-js@2";

/** Pedidos ao Gemini por atleta na última hora. */
export const GEMINI_QUOTA_REQUESTS_PER_HOUR = 60;
/** Tokens (entrada + saída + raciocínio) por atleta nas últimas 24 h. */
export const GEMINI_QUOTA_TOKENS_PER_DAY = 4_000_000;
/** O teto GLOBAL — todos os atletas somados — nas últimas 24 h (2.ª auditoria
 *  de segurança, 2026-11-14, A1). Nos 30 dias antes, o dia com mais consumo
 *  somou 1,51 M tokens (mediana 0,52 M): 20 M é ~13× isso. Passado, ninguém
 *  chama o Gemini até a janela descer (429 com a frase do dia); o admin não. */
export const GEMINI_GLOBAL_TOKENS_PER_DAY = 20_000_000;
/** Quando a reserva da hora recusa, quanto se diz para esperar (a reserva não
 *  diz quando liberta o lugar). */
const RESERVATION_RETRY_SECONDS = 15 * 60;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface QuotaRow {
  created_at: string;
  /** A função que gravou a linha: com created_at, identifica o pedido. */
  function?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  thoughts_tokens?: number | null;
}

export type QuotaResult = { ok: true } | { ok: false; window: "hora" | "dia"; retryAfterSeconds: number };

const tokensOf = (r: QuotaRow) => (Number(r.input_tokens) || 0) + (Number(r.output_tokens) || 0) + (Number(r.thoughts_tokens) || 0);

/** A decisão, pura: as linhas do atleta nas últimas 24 h e o relógio. */
export function evaluateGeminiQuota(rows: QuotaRow[] | null | undefined, nowMs: number): QuotaResult {
  const list = (rows || [])
    .map((r) => ({ at: Date.parse(r.created_at), tokens: tokensOf(r), key: `${r.function ?? ""}|${r.created_at}` }))
    .filter((r) => Number.isFinite(r.at) && r.at > nowMs - DAY_MS && r.at <= nowMs)
    .sort((a, b) => a.at - b.at);
  // Os pedidos da última hora: um por (função, hora exata) — as linhas de
  // um mesmo pedido têm a mesma hora.
  const seen = new Set<string>();
  const hour = list.filter((r) => {
    if (r.at <= nowMs - HOUR_MS) return false;
    if (seen.has(r.key)) return false;
    seen.add(r.key);
    return true;
  });
  if (hour.length >= GEMINI_QUOTA_REQUESTS_PER_HOUR) {
    // Volta a haver lugar quando sai da janela o pedido que passa o limite.
    const freeAt = hour[hour.length - GEMINI_QUOTA_REQUESTS_PER_HOUR].at + HOUR_MS;
    return { ok: false, window: "hora", retryAfterSeconds: Math.max(60, Math.ceil((freeAt - nowMs) / 1000)) };
  }
  const dayTokens = list.reduce((t, r) => t + r.tokens, 0);
  if (dayTokens >= GEMINI_QUOTA_TOKENS_PER_DAY) {
    // Volta quando saírem da janela tokens que cheguem para ficar abaixo do teto.
    let excess = dayTokens - GEMINI_QUOTA_TOKENS_PER_DAY;
    let freeAt = nowMs + DAY_MS;
    for (const r of list) {
      excess -= r.tokens;
      if (excess < 0) {
        freeAt = r.at + DAY_MS;
        break;
      }
    }
    return { ok: false, window: "dia", retryAfterSeconds: Math.max(60, Math.ceil((freeAt - nowMs) / 1000)) };
  }
  return { ok: true };
}

/** A frase da Carol para o atleta (o corpo do 429). */
export function geminiQuotaText(r: Exclude<QuotaResult, { ok: true }>): string {
  if (r.window === "hora") {
    const minutes = Math.max(1, Math.ceil(r.retryAfterSeconds / 60));
    return `Fizeste muitos pedidos seguidos e preciso de uma pausa. Tenta outra vez daqui a ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`;
  }
  return "Por hoje já chegámos ao limite do que consigo analisar. Amanhã continuo contigo.";
}

/** O resumo do dia com a quota passada (200, o de hoje que já houver): o
 *  aviso para a app mostrar ao lado do resumo antigo. */
export function geminiQuotaNotice(r: Exclude<QuotaResult, { ok: true }>) {
  const b = geminiQuotaBody(r);
  return { quota: b.scope, quota_message: b.error, retry_after_minutes: b.retry_after_minutes };
}

/** O corpo do 429: a frase (error), a janela — `scope` "hour" | "day" (e
 *  `quota` "hora" | "dia") — e quando voltar a tentar, em segundos e minutos. */
export function geminiQuotaBody(r: Exclude<QuotaResult, { ok: true }>) {
  return {
    error: geminiQuotaText(r),
    scope: r.window === "hora" ? "hour" as const : "day" as const,
    quota: r.window,
    retry_after_seconds: r.retryAfterSeconds,
    retry_after_minutes: Math.max(1, Math.ceil(r.retryAfterSeconds / 60)),
  };
}

/**
 * Pode ser o reenvio de um registo já gravado — o único pedido que, com a
 * quota passada, segue até ao replay (alreadySaved → alreadyReply devolve a
 * gravação de antes, sem o Gemini). Sem mode (ou mode manual, que se trata
 * depois do replay), sem o id de um registo existente e com
 * client_request_id. Tudo o resto — pantry_food, answer, preview, as
 * reanálises com meal_id/run_id/session_id/assessment_id — leva 429 antes de
 * qualquer chamada ao Gemini: o id vem do cliente, e reutilizar o de um
 * registo gravado não pode saltar a quota (revisão de 4003c2f4). Depois do
 * replay, sem reenvio resolvido (nem gravação, nem a desfeita entretanto), o
 * 429 é incondicional.
 */
// deno-lint-ignore no-explicit-any
export function quotaReplayCandidate(body: any, recordIdField: string): boolean {
  const mode = body?.mode;
  if (mode != null && mode !== "manual") return false;
  const id = body?.[recordIdField];
  if (typeof id === "string" ? id.trim() !== "" : id != null) return false;
  return typeof body?.client_request_id === "string" && body.client_request_id.trim() !== "";
}

// deno-lint-ignore no-explicit-any
type Db = any;

/** A RPC (ou a tabela) ainda não existe: migration por aplicar. */
// deno-lint-ignore no-explicit-any
const missingRpc = (e: any) => ["42883", "PGRST202", "42P01", "PGRST205"].includes(String(e?.code ?? ""));

/**
 * Lê e decide, por esta ordem — e só reserva o lugar se tudo o resto passar:
 *   1. o admin passa sempre;
 *   2. o atleta: os tokens das últimas 24 h e os pedidos da última hora no
 *      ai_usage (evaluateGeminiQuota);
 *   3. o teto global de tokens nas últimas 24 h (ai_tokens_since);
 *   4. a reserva do pedido (reserve_gemini_request): atómica, conta a última
 *      hora ANTES da chamada — as rajadas em paralelo já não passam todas
 *      (2.ª auditoria de segurança, 2026-11-14, M1).
 * `fn`: a função que pede (fica na reserva). `db`: um cliente com a service
 * role (por omissão, um novo a partir do ambiente). Uma falha a ler, ou as
 * RPC por criar (migration 20261114130000 por aplicar): passa.
 */
export async function checkGeminiQuota(userId: string, deps: { db?: Db; nowMs?: number; fn?: string } = {}): Promise<QuotaResult> {
  const nowMs = deps.nowMs ?? Date.now();
  try {
    const db = deps.db ?? createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const since = new Date(nowMs - DAY_MS).toISOString();
    const [profileRes, usageRes, globalRes] = await Promise.all([
      db.from("profiles").select("is_admin").eq("id", userId).maybeSingle(),
      db.from("ai_usage").select("created_at, function, input_tokens, output_tokens, thoughts_tokens")
        .eq("user_id", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
      db.rpc("ai_tokens_since", { p_since: since }),
    ]);
    if (profileRes?.data?.is_admin === true) return { ok: true };
    if (usageRes?.error) {
      console.warn("quota do Gemini: ai_usage não lido — passa:", usageRes.error.message);
    } else {
      const own = evaluateGeminiQuota(usageRes?.data ?? [], nowMs);
      if (!own.ok) return own;
    }
    if (globalRes?.error) {
      if (!missingRpc(globalRes.error)) console.warn("quota do Gemini: teto global não lido — passa:", globalRes.error.message);
    } else if (Number(globalRes?.data) >= GEMINI_GLOBAL_TOKENS_PER_DAY) {
      console.warn("quota do Gemini: teto GLOBAL de tokens atingido", JSON.stringify({ tokens: Number(globalRes.data) }));
      return { ok: false, window: "dia", retryAfterSeconds: 3600 };
    }
    const reserve = await db.rpc("reserve_gemini_request", {
      p_user: userId, p_function: (deps.fn ?? "?").slice(0, 60), p_limit: GEMINI_QUOTA_REQUESTS_PER_HOUR,
    });
    if (reserve?.error) {
      if (!missingRpc(reserve.error)) console.warn("quota do Gemini: reserva falhou — passa:", reserve.error.message);
      return { ok: true };
    }
    if (reserve?.data === false) return { ok: false, window: "hora", retryAfterSeconds: RESERVATION_RETRY_SECONDS };
    return { ok: true };
  } catch (e) {
    console.warn("quota do Gemini: falhou — passa:", e instanceof Error ? e.message : e);
    return { ok: true };
  }
}
