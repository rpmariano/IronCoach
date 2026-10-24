// assistant-read — leitura pela assistente executiva
// (specs/assistente-leitura-contrato.md). 2026-10-24.
//
// GET ?resource=<r>&from=YYYY-MM-DD&to=YYYY-MM-DD com
// Authorization: Bearer ih_… — o token pessoal que o atleta gera no Perfil
// (create_assistant_token). verify_jwt = false no config.toml: não há JWT, a
// autenticação é o token, verificado aqui dentro pelo hash SHA-256.
//
// As garantias que isto segura, por ordem de importância:
//  1. O atleta é o DONO DO TOKEN e mais nada. O pedido não tem user_id (nem
//     email, nem outro identificador) — e se tiver, é ignorado. Todas as
//     leituras levam .eq("user_id", dono) (ou .eq("id", dono) nos profiles),
//     incluindo as das tabelas filhas (séries, itens), que já vinham filtradas
//     pelo pai: a service role não tem RLS a proteger, por isso o filtro é a
//     única barreira e vai em todas.
//  2. Só leitura: escreve só no assistant_access_log e em last_used_at.
//  3. Qualquer falha de autenticação é o mesmo 401 — token inexistente,
//     revogado ou mal formado não se distinguem.
// Fora nesta fase (contrato): mensagens e notas do coach, memória da Carol,
// Taça/rankings, push, logs. Por isso não saem coach_notes, carol_questions,
// ai_summary nem cup_*.

import { readResource, RESOURCES, type Resource } from "./resources.ts";

export const TIMEZONE = "Europe/Lisbon";
export const RATE_LIMIT_PER_HOUR = 120;
export const MAX_RANGE_DAYS = 92;
export const DEFAULT_RANGE_DAYS = 7;

const TOKEN_RE = /^ih_[A-Za-z0-9_-]{43}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// O subconjunto do cliente supabase-js que isto usa (o falso dos testes
// implementa o mesmo).
// deno-lint-ignore no-explicit-any
export type Db = { from(table: string): any };

export interface HandlerDeps {
  /** O cliente com a service role. */
  db: () => Db;
  now: () => Date;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}

const unauthorized = () => json({ error: "unauthorized" }, 401);
const badRequest = () => json({ error: "bad_request" }, 400);

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Datas ────────────────────────────────────────────────────────────────

/** A data de hoje no fuso do atleta (YYYY-MM-DD). */
export function todayIn(now: Date, timeZone = TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function parseDate(s: string): number | null {
  if (!DATE_RE.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  return new Date(t).toISOString().slice(0, 10) === s ? t : null;
}

export function addDays(date: string, days: number): string {
  return new Date(parseDate(date)! + days * 86_400_000).toISOString().slice(0, 10);
}

/** from/to do pedido → o período (inclusivo) ou null se for inválido. */
export function resolveRange(
  fromParam: string | null,
  toParam: string | null,
  today: string,
): { from: string; to: string } | null {
  const to = toParam ?? today;
  const from = fromParam ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  const f = parseDate(from), t = parseDate(to);
  if (f == null || t == null || f > t) return null;
  if ((t - f) / 86_400_000 + 1 > MAX_RANGE_DAYS) return null;
  return { from, to };
}

// ─── Handler ──────────────────────────────────────────────────────────────

interface TokenRow { id: string; user_id: string }

async function findToken(db: Db, authorization: string | null): Promise<TokenRow | null> {
  const m = /^Bearer (.+)$/.exec(authorization ?? "");
  if (!m || !TOKEN_RE.test(m[1])) return null;
  const { data, error } = await db
    .from("assistant_tokens")
    .select("id, user_id")
    .eq("token_hash", await sha256Hex(m[1]))
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(`assistant_tokens: ${error.message}`);
  return data ?? null;
}

async function usedLastHour(db: Db, tokenId: string, now: Date): Promise<number> {
  // Os pedidos recusados por excesso não contam: senão um cliente que insiste
  // ficava bloqueado para sempre.
  const { count, error } = await db
    .from("assistant_access_log")
    .select("id", { count: "exact", head: true })
    .eq("token_id", tokenId)
    .gte("at", new Date(now.getTime() - 3_600_000).toISOString())
    .neq("status", 429);
  if (error) throw new Error(`assistant_access_log: ${error.message}`);
  return count ?? 0;
}

async function record(db: Db, token: TokenRow, resource: string | null, status: number, now: Date) {
  const [log, used] = await Promise.all([
    db.from("assistant_access_log").insert({ token_id: token.id, user_id: token.user_id, resource, status }),
    // Um pedido recusado por excesso não é um uso: o "último uso" que a app
    // mostra fica no último pedido atendido.
    status === 429 ? null : db.from("assistant_tokens").update({ last_used_at: now.toISOString() }).eq("id", token.id)
      .eq("user_id", token.user_id),
  ]);
  // Não falha o pedido por isto, mas fica no log da função.
  if (log?.error) console.error("assistant_access_log insert:", log.error.message);
  if (used?.error) console.error("assistant_tokens last_used_at:", used.error.message);
}

export async function handler(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return badRequest();

  try {
    const db = deps.db();
    const now = deps.now();
    const token = await findToken(db, req.headers.get("Authorization"));
    if (!token) return unauthorized();

    const params = new URL(req.url).searchParams;
    const rawResource = params.get("resource");
    const resource = RESOURCES.includes(rawResource as Resource) ? (rawResource as Resource) : null;
    const loggedResource = resource ?? (rawResource ? rawResource.slice(0, 40) : null);

    if ((await usedLastHour(db, token.id, now)) >= RATE_LIMIT_PER_HOUR) {
      await record(db, token, loggedResource, 429, now);
      return json({ error: "rate_limited" }, 429);
    }

    const today = todayIn(now);
    const range = resolveRange(params.get("from"), params.get("to"), today);
    if (!resource || !range) {
      await record(db, token, loggedResource, 400, now);
      return badRequest();
    }

    let data: unknown;
    try {
      data = await readResource(resource, { db, userId: token.user_id, from: range.from, to: range.to, today });
    } catch (e) {
      console.error("assistant-read:", resource, e instanceof Error ? e.message : String(e));
      await record(db, token, resource, 500, now);
      return json({ error: "internal" }, 500);
    }
    await record(db, token, resource, 200, now);
    return json({ resource, from: range.from, to: range.to, timezone: TIMEZONE, data });
  } catch (e) {
    console.error("assistant-read:", e instanceof Error ? e.message : String(e));
    return json({ error: "internal" }, 500);
  }
}
