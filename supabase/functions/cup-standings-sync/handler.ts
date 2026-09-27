// cup-standings-sync — autenticação e roteamento (specs/trofeu.md §7; fase
// 4, C.1). 2026-09-27.
//
// Dois chamadores, ambos por POST (verify_jwt = false no config.toml, a
// autenticação faz-se aqui dentro, como no race-calendar e no
// compute-percentile-snapshots):
//   · o pg_cron, com x-cron-secret = CRON_SECRET → 202 { aceite } logo e a
//     volta corre em EdgeRuntime.waitUntil (o net.http_post do cron tem um
//     timeout curto; a volta não depende de o pedido ficar aberto). O cron
//     só se cria DEPOIS da M2, à mão (fase4-desenho.md H.6);
//   · o admin, com o JWT dele (is_admin verificado com a service role):
//     { modo: 'correr', edition_id, round_ids? } — "Ler agora";
//     { modo: 'ensaio', jornadas, geral?, points_table?, team_min_athletes?,
//       season_label? } — lê e valida sem gravar (C.6). Só o admin, e corre
//       sem a M2 (não grava nada que um atleta leia; 1 linha agregada em
//       app_logs). O cron nunca chega aqui: o x-cron-secret vai sempre para
//       a volta normal (runSync), que sem a M2 não faz nenhum pedido.
// Respostas sempre JSON; erros com { error: 'frase' }; nunca conteúdo das
// páginas. Na consola, só o nome de um erro inesperado (nunca a mensagem).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { cupResultsUrlError } from "../_shared/formulas/cupResults.ts";
import { TROFEU_ADAPTER, TROFEU_LIMITS, TROFEU_USER_AGENT, trofeuHttp, type TrofeuHttp, trofeuUrlKind } from "./adapters/trofeuCascais.ts";
import { type Db, type EnsaioInput, runEnsaio, runSync, type SyncDeps } from "./sync.ts";

export interface HandlerDeps {
  cronSecret: string | null | undefined;
  /** O cliente com a service role (criado a pedido). */
  service: () => Db;
  /** O utilizador do cabeçalho Authorization (null = sem sessão válida). */
  userFromAuth: (authorization: string) => Promise<{ id: string } | null>;
  http: (kind: "cron" | "admin") => TrofeuHttp;
  now: () => Date;
  /** EdgeRuntime.waitUntil em produção; sem ele (testes) a volta é esperada. */
  waitUntil?: ((p: Promise<unknown>) => void) | null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function errName(e: unknown): string {
  return e instanceof Error ? e.name : typeof e;
}

const ID_RE = /^[0-9A-Za-z-]{1,64}$/;
const SEASON_RE = /^\s*\d{4}\s*(\/\s*(\d{2}|\d{4}))?\s*$/;

/** O corpo do ensaio, validado ANTES de qualquer pedido ao site. */
export function parseEnsaioBody(body: Record<string, unknown>): { ok: true; input: EnsaioInput } | { ok: false; error: string } {
  const bad = (error: string) => ({ ok: false as const, error });
  const j = body.jornadas;
  if (!Array.isArray(j) || j.length < 1 || j.length > 12) return bad("Cola entre 1 e 12 links de provas.");
  const jornadas: string[] = [];
  for (const u of j) {
    if (typeof u !== "string" || trofeuUrlKind(u) !== "jornada") {
      return bad(cupResultsUrlError(TROFEU_ADAPTER, "jornada", typeof u === "string" && u.trim() ? u : "x") ?? "Link de prova inválido.");
    }
    jornadas.push(u.trim());
  }
  let geral: string | null = null;
  if (body.geral != null && body.geral !== "") {
    if (typeof body.geral !== "string" || trofeuUrlKind(body.geral) !== "geral") {
      return bad(cupResultsUrlError(TROFEU_ADAPTER, "geral", "x") ?? "Link da classificação geral inválido.");
    }
    geral = body.geral.trim();
  }
  let points_table: number[] | null = null;
  if (body.points_table != null) {
    const t = body.points_table;
    if (!Array.isArray(t) || t.length < 1 || t.length > 200 || !t.every((x) => Number.isInteger(x) && x >= 0 && x <= 1000)) {
      return bad("A tabela de pontos tem de ser uma lista de inteiros (≥ 0).");
    }
    points_table = t as number[];
  }
  let team_min_athletes: number | null = null;
  if (body.team_min_athletes != null) {
    const n = body.team_min_athletes;
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 100) return bad("O mínimo de atletas da coletiva tem de ser um inteiro de 1 a 100.");
    team_min_athletes = n as number;
  }
  let season_label: string | null = null;
  if (body.season_label != null && body.season_label !== "") {
    if (typeof body.season_label !== "string" || !SEASON_RE.test(body.season_label)) return bad("A época escreve-se como 2025/26.");
    season_label = body.season_label.trim();
  }
  return { ok: true, input: { jornadas, geral, points_table, team_min_athletes, season_label } };
}

const CORRER_STATUS: Record<string, [number, string]> = {
  m2_por_aplicar: [409, "Precisa da migração M2 (por aplicar)."],
  sem_edicao: [404, "Edição não encontrada."],
  desligado: [409, "Liga «Observar» ou «Publicar» primeiro."],
  encerrada: [409, "A edição está encerrada."],
  fonte: [409, "Esta edição não lê a classificação do site (a fonte não é o adaptador)."],
  adaptador: [409, "Não conheço o adaptador desta edição."],
  a_correr: [409, "Já está uma leitura a correr. Tenta daqui a uns minutos."],
};

export function makeHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  const syncDeps = (): SyncDeps => ({ sb: deps.service(), http: deps.http, now: deps.now });

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Método não suportado" }, 405);
    try {
      // ── O cron ──
      const cron = req.headers.get("x-cron-secret");
      if (cron !== null) {
        if (!deps.cronSecret || !timingSafeEqual(cron, deps.cronSecret)) return json({ error: "Não autorizado" }, 401);
        await req.body?.cancel().catch(() => {});
        const volta = runSync(syncDeps(), { modo: "cron" }).then(
          () => {},
          (e) => console.error("cup-standings-sync: a volta falhou", errName(e)),
        );
        if (deps.waitUntil) deps.waitUntil(volta);
        else await volta;
        return json({ aceite: true }, 202);
      }

      // ── O admin ──
      const auth = req.headers.get("Authorization");
      if (!auth) return json({ error: "Sem autorização" }, 401);
      const user = await deps.userFromAuth(auth);
      if (!user) return json({ error: "Sessão inválida" }, 401);
      const sb = deps.service();
      const { data: prof, error: profErr } = await sb.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      if (profErr) return json({ error: "Não foi possível confirmar o perfil." }, 500);
      if (!prof?.is_admin) return json({ error: "Só para administradores." }, 403);

      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Pedido inválido." }, 400);

      if (body.modo === "correr") {
        const editionId = typeof body.edition_id === "string" ? body.edition_id.trim() : "";
        if (!ID_RE.test(editionId)) return json({ error: "Falta a edição (edition_id)." }, 400);
        let roundIds: string[] | null = null;
        if (body.round_ids != null) {
          const r = body.round_ids;
          if (!Array.isArray(r) || r.length > 30 || !r.every((x) => typeof x === "string" && ID_RE.test(x))) {
            return json({ error: "Jornadas inválidas (round_ids)." }, 400);
          }
          roundIds = r as string[];
        }
        const out = await runSync({ sb, http: deps.http, now: deps.now }, { modo: "correr", editionId, roundIds });
        if (out.status !== "ok") {
          const [status, error] = CORRER_STATUS[out.status] ?? [500, "Erro inesperado no servidor"];
          return json({ error, skipped: out.status }, status);
        }
        const rep = out.edicoes[0];
        if (rep?.erro === "bd") return json({ error: "Não foi possível ler ou gravar na base de dados.", pedido: "correr", ...rep }, 500);
        return json({ pedido: "correr", ...rep });
      }

      if (body.modo === "ensaio") {
        const parsed = parseEnsaioBody(body as Record<string, unknown>);
        if (!parsed.ok) return json({ error: parsed.error }, 400);
        const out = await runEnsaio({ sb, http: deps.http, now: deps.now }, parsed.input);
        if (out.status !== "ok") {
          return out.status === "robots_proibido"
            ? json({ error: "O robots.txt do site não deixa ler estas páginas." }, 409)
            : json({ error: "Não consegui ler o robots.txt do site. Tenta daqui a pouco." }, 502);
        }
        return json(out.report);
      }

      return json({ error: "Modo desconhecido: usa «correr» ou «ensaio»." }, 400);
    } catch (e) {
      console.error("cup-standings-sync: erro inesperado", errName(e));
      return json({ error: "Erro inesperado no servidor" }, 500);
    }
  };
}

/** As dependências reais (Deno.env, supabase-js, fetch, EdgeRuntime). */
export function realDeps(): HandlerDeps {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const userAgent = Deno.env.get("CUP_SYNC_USER_AGENT") || TROFEU_USER_AGENT;
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  return {
    cronSecret: Deno.env.get("CRON_SECRET"),
    service: () =>
      createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as Db,
    userFromAuth: async (authorization: string) => {
      const token = authorization.replace(/^Bearer\s+/i, "").trim();
      if (!token) return null;
      const sb = createClient(url, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await sb.auth.getUser(token);
      return error || !data?.user ? null : { id: data.user.id };
    },
    http: (kind) =>
      trofeuHttp(
        kind === "admin"
          ? { userAgent, maxPages: TROFEU_LIMITS.adminPages, budgetMs: TROFEU_LIMITS.adminBudgetMs }
          : { userAgent, maxPages: TROFEU_LIMITS.cronPages, budgetMs: TROFEU_LIMITS.cronBudgetMs },
      ),
    now: () => new Date(),
    waitUntil: runtime?.waitUntil ? (p) => runtime.waitUntil!(p) : null,
  };
}
