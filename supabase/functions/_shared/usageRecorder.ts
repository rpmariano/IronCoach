/* Regista em public.ai_usage o consumo do Gemini de cada pedido — do lado do
   servidor, que é quem paga a chamada (migração 20260927203409_ai_usage).

   Porquê (auditoria de custos de 2026-09-27): até aqui era a app que gravava
   o custo (invokeEdgeFunctionWithTimeout → app_logs) quando recebia a
   resposta. Um timeout do lado dela, a app fechada a meio ou uma resposta
   perdida na rede apagavam o custo, e qualquer cliente podia escrever (ou
   omitir) linhas de custo. Para cobrar por utilizador não serve.

   withUsageRecording(fn, handler) embrulha o Deno.serve de cada função: lê o
   `usage` que a resposta JSON já traz (o mesmo que a app registava — ver
   _shared/geminiUsage.ts) e grava-o com a service role. Uma linha por
   pedido, com `calls` a dizer quantas chamadas ao Gemini somou. Nunca mexe
   na resposta e nunca a faz falhar: um erro aqui é só um console.warn.

   O utilizador vem do `sub` do JWT do pedido. Não se verifica a assinatura
   aqui porque não é preciso: uma resposta só traz `usage` depois de a função
   ter validado a sessão (sb.auth.getUser); um JWT forjado dá 401 sem usage.
   Funções sem utilizador (cron) chamam recordUsage diretamente. */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { type GeminiUsage, runWithUsageSink, usageTokens } from "./geminiUsage.ts";

export type UsageRow = {
  user_id: string | null;
  function: string;
  model: string | null;
  input_tokens: number;
  cached_tokens: number;
  output_tokens: number;
  thoughts_tokens: number;
  calls: number;
  source: "server";
  /** A hora do pedido, a mesma nas linhas de um pedido (a quota conta pedidos). */
  created_at?: string;
};

const int = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));

/** A linha a gravar, ou null quando não houve consumo nenhum. */
// deno-lint-ignore no-explicit-any
export function usageRow(fn: string, userId: string | null, usage: any): UsageRow | null {
  if (!usage || typeof usage !== "object") return null;
  const row: UsageRow = {
    user_id: userId,
    function: fn,
    model: typeof usage.model === "string" && usage.model ? usage.model.slice(0, 120) : null,
    input_tokens: int(usage.input_tokens),
    cached_tokens: int(usage.cached_tokens),
    output_tokens: int(usage.output_tokens),
    thoughts_tokens: int(usage.thoughts_tokens),
    // Respostas antigas não traziam `calls`: uma resposta com usage = 1 chamada.
    calls: usage.calls === undefined ? 1 : int(usage.calls),
    source: "server",
  };
  row.cached_tokens = Math.min(row.cached_tokens, row.input_tokens);
  if (!row.calls || (!row.input_tokens && !row.output_tokens && !row.thoughts_tokens)) return null;
  return row;
}

/** As linhas a gravar: uma por modelo quando o pedido somou chamadas de dois
 *  ou mais (o Flash de recurso, 29-10-2026 — preços diferentes, revisão de
 *  fa525453); senão a linha única de usageRow. Só se parte quando by_model
 *  cobre todas as chamadas — uma chamada sem modelVersion ficava de fora. */
// deno-lint-ignore no-explicit-any
export function usageRows(fn: string, userId: string | null, usage: any): UsageRow[] {
  const single = usageRow(fn, userId, usage);
  if (!single) return [];
  const byModel = usage?.by_model && typeof usage.by_model === "object" ? Object.entries(usage.by_model) : [];
  // deno-lint-ignore no-explicit-any
  const calls = byModel.reduce((t, [, v]: [string, any]) => t + int(v?.calls), 0);
  if (byModel.length < 2 || calls !== single.calls) return [single];
  return byModel
    // deno-lint-ignore no-explicit-any
    .map(([model, v]: [string, any]) => usageRow(fn, userId, { ...v, model }))
    .filter((r): r is UsageRow => r !== null);
}

/** `sub` do JWT Bearer (sem verificar — ver cabeçalho), ou null. */
export function userIdFromAuth(header: string | null): string | null {
  const token = header?.replace(/^Bearer\s+/i, "");
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    const sub = typeof json?.sub === "string" ? json.sub : null;
    // Só um uuid: a anon key (sem sub) ou a service role nunca passam por aqui.
    return sub && /^[0-9a-f-]{36}$/i.test(sub) ? sub : null;
  } catch {
    return null;
  }
}

let adminClient: SupabaseClient | null = null;
function serviceClient(): SupabaseClient | null {
  if (adminClient) return adminClient;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  adminClient = createClient(url, key, { auth: { persistSession: false } });
  return adminClient;
}

type Insert = (row: UsageRow) => Promise<{ error: unknown }>;
const defaultInsert: Insert = async (row) => {
  const sb = serviceClient();
  if (!sb) return { error: "sem SUPABASE_SERVICE_ROLE_KEY" };
  return await sb.from("ai_usage").insert(row);
};

/** Grava o consumo; nunca rejeita. */
export async function recordUsage(
  fn: string,
  userId: string | null,
  usage: GeminiUsage | Record<string, unknown> | null | undefined,
  insert: Insert = defaultInsert,
): Promise<void> {
  // As linhas de um mesmo pedido (uma por modelo, com o Flash de recurso)
  // levam a mesma hora: a quota do Gemini conta pedidos, não linhas
  // (geminiQuota.ts — revisão do lote de segurança, 2026-11-14).
  const createdAt = new Date().toISOString();
  for (const row of usageRows(fn, userId, usage)) {
    try {
      const { error } = await insert({ ...row, created_at: createdAt });
      if (error) console.warn(`[ai_usage] ${fn}: falha a gravar consumo`, error);
    } catch (e) {
      console.warn(`[ai_usage] ${fn}: falha a gravar consumo`, e);
    }
  }
}

// Em produção a gravação corre depois de a resposta sair (EdgeRuntime);
// nos testes, e se não houver runtime, espera-se por ela.
function runAfterResponse(p: Promise<void>): Promise<void> | void {
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) {
    rt.waitUntil(p);
    return;
  }
  return p;
}

/** O que gravar: o `usage` da resposta, ou o que o pedido somou de facto
 *  (usageFromGemini) quando é mais — a resposta de erro não traz usage, e uma
 *  chamada cujo resultado se deitou fora também conta (2.ª auditoria de
 *  segurança, 2026-11-14, M1). */
// deno-lint-ignore no-explicit-any
export function usageToRecord(bodyUsage: any, sinkTotal: GeminiUsage | null): GeminiUsage | Record<string, unknown> | null {
  const fromBody = bodyUsage && typeof bodyUsage === "object" ? bodyUsage : null;
  if (sinkTotal && usageTokens(sinkTotal) > usageTokens(fromBody)) return sinkTotal;
  return fromBody;
}

export function withUsageRecording(
  fn: string,
  handler: (req: Request) => Response | Promise<Response>,
  insert: Insert = defaultInsert,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const userId = () => userIdFromAuth(req.headers.get("Authorization"));
    const { sink, result } = runWithUsageSink(() => handler(req));
    let res: Response;
    try {
      res = await result;
    } catch (e) {
      // O handler rebentou depois de chamar o Gemini: grava o que se gastou
      // (num finally do pedido) e deixa o erro seguir.
      if (sink.total) await runAfterResponse(recordUsage(fn, userId(), sink.total, insert));
      throw e;
    }
    // O total fecha aqui: o que correr depois de a resposta sair (waitUntil)
    // grava-se por conta própria.
    const sinkTotal = sink.total;
    // deno-lint-ignore no-explicit-any
    let bodyUsage: any = null;
    try {
      if ((res.headers.get("content-type") || "").includes("application/json")) {
        const body = await res.clone().json();
        if (body && typeof body === "object") bodyUsage = body.usage ?? null;
      }
    } catch (e) {
      console.warn(`[ai_usage] ${fn}: resposta ilegível para o registo de consumo`, e);
    }
    const usage = usageToRecord(bodyUsage, sinkTotal);
    if (usage) await runAfterResponse(recordUsage(fn, userId(), usage, insert));
    return res;
  };
}
