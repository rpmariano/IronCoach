// IronHealth · race-calendar Edge Function
// O .ics de uma prova, para o botão "Adicionar ao calendário" do hub da
// prova (Apple Calendar e qualquer outro que abra .ics — o Google e o
// Outlook vão por link direto, src/utils/calendarLinks.js).
//
// Porquê uma função e não um Blob no browser: no iPhone, com a app instalada
// no ecrã principal (PWA), um .ics gerado no cliente (blob:/data:) não abre
// a folha "Adicionar ao calendário". Só abre quando o browser NAVEGA para um
// URL real servido com Content-Type text/calendar.
//
// Mas uma navegação não leva o cabeçalho Authorization, e o JWT nunca vai no
// URL (fica em logs e no histórico). Por isso dois passos:
//  1. POST { race_event_id } com a sessão do atleta → confirma pela RLS que a
//     prova é dele e devolve um URL assinado (HMAC) que expira em
//     LINK_TTL_SECONDS.
//  2. GET ?id=…&exp=…&sig=… (a navegação) → valida a assinatura e o prazo,
//     lê a prova com a service role e devolve o .ics.
// Daí verify_jwt = false em supabase/config.toml: o GET não tem JWT; a
// autenticação do POST é feita aqui dentro, como no save-push-subscription.
//
// Não guarda nada nem precisa de migration nem de secret novo — a chave do
// HMAC deriva da service role key, que já existe no ambiente das funções.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { icsFileName, raceCalendarEvent, raceIcs } from "../_shared/formulas/raceCalendar.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Tempo entre o toque no botão e a navegação — segundos. 10 min chega para
// uma rede lenta sem deixar um link reutilizável a circular.
export const LINK_TTL_SECONDS = 600;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RACE_COLUMNS =
  "id, name, date, start_time, location, race_type, distance_km, elevation_gain_m, target_time, target_time_seconds";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
}

// ─── Assinatura do link ───────────────────────────────────────────────────

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

// O prefixo separa esta assinatura de qualquer outro uso futuro da mesma
// chave — uma assinatura de outro sítio nunca serve aqui.
const signedMessage = (id: string, exp: number) => `race-calendar|${id}|${exp}`;

export async function signRaceLink(secret: string, id: string, exp: number): Promise<string> {
  return await hmacHex(secret, signedMessage(id, exp));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyRaceLink(
  secret: string,
  params: { id: string | null; exp: string | null; sig: string | null },
  nowSeconds: number,
): Promise<"ok" | "invalid" | "expired"> {
  const { id, exp, sig } = params;
  if (!id || !UUID_RE.test(id) || !exp || !/^\d{1,12}$/.test(exp) || !sig) return "invalid";
  const expected = await signRaceLink(secret, id, Number(exp));
  if (!timingSafeEqual(expected, sig)) return "invalid";
  if (Number(exp) < nowSeconds) return "expired";
  return "ok";
}

// ─── Handler ──────────────────────────────────────────────────────────────

async function createLink(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Sem autorização" }, 401);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userError } = await sb.auth.getUser();
  if (userError || !userData?.user) return jsonResponse({ error: "Sessão inválida" }, 401);

  const body = (await req.json().catch(() => null)) ?? {};
  const id = typeof body.race_event_id === "string" ? body.race_event_id : "";
  if (!UUID_RE.test(id)) return jsonResponse({ error: "race_event_id em falta" }, 400);

  // Pela RLS ("own rows"): só encontra a prova se for deste atleta.
  const { data: race, error } = await sb.from("race_events").select("id").eq("id", id).maybeSingle();
  if (error) {
    console.error("Erro a ler a prova:", error.message);
    return jsonResponse({ error: "Não foi possível ler a prova" }, 500);
  }
  if (!race) return jsonResponse({ error: "Prova não encontrada" }, 404);

  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;
  const sig = await signRaceLink(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, id, exp);
  const url = new URL(`${Deno.env.get("SUPABASE_URL")}/functions/v1/race-calendar`);
  url.searchParams.set("id", id);
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", sig);
  return jsonResponse({ url: url.toString() });
}

async function serveIcs(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const check = await verifyRaceLink(
    secret,
    { id: params.get("id"), exp: params.get("exp"), sig: params.get("sig") },
    Math.floor(Date.now() / 1000),
  );
  // Quem lê isto é o atleta, no browser — texto simples, não JSON.
  if (check === "expired") {
    return textResponse("Este link já expirou. Volta à app e toca outra vez em «Adicionar ao calendário».", 410);
  }
  if (check !== "ok") return textResponse("Link inválido.", 403);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, secret);
  const { data: race, error } = await admin
    .from("race_events")
    .select(RACE_COLUMNS)
    .eq("id", params.get("id")!)
    .maybeSingle();
  if (error) return textResponse("Não foi possível ler a prova.", 500);
  if (!race) return textResponse("Prova não encontrada.", 404);

  const ev = raceCalendarEvent(race);
  if (!ev) return textResponse("A prova não tem data.", 422);

  // UID estável por prova: voltar a importar atualiza o evento em vez de o
  // duplicar (nos calendários que respeitam o UID).
  const ics = raceIcs(ev, { uid: `race-${race.id}@ironhealth` });
  return new Response(ics, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/calendar; charset=utf-8",
      // inline, não attachment: o Safari do iPhone só mostra a folha do
      // calendário para text/calendar inline; no computador, o browser não
      // sabe mostrar o tipo e descarrega-o à mesma.
      "Content-Disposition": `inline; filename="${icsFileName(ev.title)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method === "POST") return await createLink(req);
    if (req.method === "GET") return await serveIcs(req);
    return jsonResponse({ error: "Método não suportado" }, 405);
  } catch (e) {
    console.error("Erro inesperado:", e);
    return jsonResponse({ error: "Erro inesperado no servidor" }, 500);
  }
}

if (import.meta.main) {
  Deno.serve(handler);
}
