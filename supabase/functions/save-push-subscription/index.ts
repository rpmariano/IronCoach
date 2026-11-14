// IronHealth · save-push-subscription Edge Function
// Regista (POST) ou remove (DELETE) a subscrição Web Push do browser do
// utilizador autenticado, usada por send-water-reminders para o notificar
// mesmo com a app fechada.
//
// Auditoria de segurança, 2026-11-14 (item M2):
//   - o endpoint tem de ser https e de um serviço de push conhecido
//     (_shared/pushEndpoint.ts; o mesmo CHECK está na tabela) — senão os
//     envios do servidor iam para onde o cliente quisesse (SSRF);
//   - no máximo MAX_PUSH_SUBSCRIPTIONS_PER_USER (10) por atleta: ao gravar
//     uma nova acima disso apagam-se as MAIS ANTIGAS, não se recusa a nova —
//     a nova é o browser que ele está a usar agora, as antigas são quase
//     sempre reinstalações mortas;
//   - o cliente deixou de poder fazer INSERT/UPDATE em push_subscriptions
//     (20261114120000_push_subscriptions_hardening.sql): a escrita é daqui,
//     com a service role, sempre filtrada pelo id do JWT (sb.auth.getUser()).
//     A leitura e o apagar diretos do cliente (src/lib/push.js) continuam.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  isAllowedPushEndpoint,
  isValidPushKey,
  pushSubscriptionsToPrune,
} from "../_shared/pushEndpoint.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// O endpoint já pertence a outra conta (outra sessão neste telemóvel que
// acabou sem passar pelo Perfil). Antes era a RLS a recusar o upsert, e o
// src/lib/push.js (isEndpointOfAnotherAccount) reconhece esse caso pelo texto
// "row-level security" no `error` — com a service role a RLS já não corre,
// por isso a resposta mantém o texto: o cliente cancela a subscrição do
// browser e cria uma nova. Nunca se passa a linha de outra conta para esta.
function otherAccountResponse(): Response {
  return jsonResponse(
    { error: "Esta subscrição está registada noutra conta (row-level security)" },
    403,
  );
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "DELETE") {
    return jsonResponse({ error: "Método não suportado" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Sem autorização" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData?.user) return jsonResponse({ error: "Sessão inválida" }, 401);
    const userId = userData.user.id;

    // Só para escrever, e sempre com .eq("user_id", userId): a service role
    // passa por cima da RLS, quem garante o "só as dele" é este filtro.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
    if (!endpoint) return jsonResponse({ error: "Endpoint em falta" }, 400);

    if (req.method === "DELETE") {
      // Sem validar o endpoint: apagar uma linha antiga fora da lista
      // (anterior ao CHECK) tem de continuar a ser possível.
      const { error } = await admin.from("push_subscriptions").delete()
        .eq("user_id", userId).eq("endpoint", endpoint);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }

    if (!isAllowedPushEndpoint(endpoint)) {
      return jsonResponse({ error: "Endpoint de push não permitido" }, 400);
    }

    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;
    if (!isValidPushKey(p256dh) || !isValidPushKey(auth)) {
      return jsonResponse({ error: "Subscrição inválida" }, 400);
    }

    // O antigo upsert por endpoint, sem a RLS para recusar o de outra conta:
    // primeiro vê-se de quem é a linha.
    const readOwner = () =>
      admin.from("push_subscriptions").select("user_id").eq("endpoint", endpoint).maybeSingle();
    const updateExisting = async (ownerId: string): Promise<Response> => {
      if (ownerId !== userId) return otherAccountResponse();
      const { error } = await admin.from("push_subscriptions")
        .update({ p256dh, auth })
        .eq("user_id", userId).eq("endpoint", endpoint);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    };

    const { data: current, error: currentErr } = await readOwner();
    if (currentErr) return jsonResponse({ error: currentErr.message }, 500);
    if (current) return await updateExisting(current.user_id);

    const { error: insertErr } = await admin.from("push_subscriptions")
      .insert({ user_id: userId, endpoint, p256dh, auth });
    if (insertErr) {
      // Outro pedido gravou o mesmo endpoint entretanto (unique): segue como
      // se já existisse — dele atualiza-se, de outra conta recusa-se.
      if (insertErr.code !== "23505") return jsonResponse({ error: insertErr.message }, 500);
      const { data: raced, error: racedErr } = await readOwner();
      if (racedErr || !raced) return jsonResponse({ error: racedErr?.message ?? insertErr.message }, 500);
      return await updateExisting(raced.user_id);
    }

    // Acima do limite apagam-se as mais antigas (nunca a que se acabou de
    // gravar). Depois do insert, não antes: se o insert falhar não se perdeu
    // nenhuma. Uma falha aqui não desfaz a gravação — fica para a próxima.
    const { data: rows, error: rowsErr } = await admin.from("push_subscriptions")
      .select("id, endpoint, created_at").eq("user_id", userId);
    if (rowsErr) {
      console.error("save-push-subscription: não leu as subscrições para o limite", rowsErr);
    } else {
      const prune = pushSubscriptionsToPrune(rows ?? [], endpoint);
      if (prune.length > 0) {
        const { error: pruneErr } = await admin.from("push_subscriptions").delete()
          .eq("user_id", userId).in("id", prune);
        if (pruneErr) console.error("save-push-subscription: não apagou as mais antigas", pruneErr);
      }
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error("Erro inesperado:", e);
    return jsonResponse({ error: "Erro inesperado no servidor" }, 500);
  }
}

if (import.meta.main) {
  Deno.serve(handler);
}
