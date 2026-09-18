// IronHealth · coach-proactive-tick Edge Function
// (specs/carol-omnisciencia-omnipresenca.md, ação P.3)
//
// A Carol passa a chamar pelo atleta sem a app aberta. Corre de hora a hora
// pelo pg_cron (job 'coach-proactive-tick'), autenticada com o mesmo
// CRON_SECRET do send-water-reminders, e usa a service role para ler os
// atletas que têm notificações ligadas.
//
// Para cada um: avalia os mesmos quatro momentos que o cliente
// (_shared/formulas/proactiveTriggers.ts — manhã da prova, véspera, balanço,
// silêncio, com as mesmas chaves), e envia uma notificação curta, na voz
// dela, se:
//   - estiver dentro da janela (6h–21h para a manhã da prova, 9h–21h o resto);
//   - a conversa ainda não tiver acontecido (coach_proactive_log);
//   - esta chave ainda não tiver sido notificada (coach_proactive_pushes);
//   - não tiver havido outra notificação dela hoje;
//   - ela não tiver falado há menos de 6 horas.
// Tocar na notificação abre o Coach, e é aí que o coach-chat escreve a
// mensagem a sério, com o contexto todo (e a regista em coach_proactive_log).

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";
import { pickServerProactive, proactivePushMessage } from "../_shared/formulas/proactiveTriggers.ts";
import { decidePush } from "./decide.ts";

const corsHeaders = { "Content-Type": "application/json" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function lisbonHour(date: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hour12: false }).format(date)) % 24;
}

function lisbonDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(date);
}

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

// deno-lint-ignore no-explicit-any
async function lastRecordDate(sb: any, userId: string): Promise<string | null> {
  const tables = ["runs", "meals", "workout_sessions", "body_assessments"];
  const results = await Promise.all(tables.map((t) =>
    sb.from(t).select("date").eq("user_id", userId).order("date", { ascending: false }).limit(1).maybeSingle()
  ));
  const dates = results.map((r: { data: { date?: string } | null }) => r.data?.date).filter((d): d is string => typeof d === "string");
  return dates.length ? dates.sort().pop()! : null;
}

async function handler(req: Request): Promise<Response> {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return jsonResponse({ error: "Não autorizado" }, 401);
  }
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) return jsonResponse({ error: "VAPID não configurado" }, 500);
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date();
  const hour = lisbonHour(now);
  const today = lisbonDate(now);

  const { data: subs, error: subsErr } = await sb.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth");
  if (subsErr) return jsonResponse({ error: subsErr.message }, 500);
  /* Só quem tem as notificações ligadas. Hoje o único interruptor é o dos
     lembretes de água: desligá-lo não apaga a subscrição do browser, e sem
     este filtro a Carol ia notificar precisamente quem as desligou
     (revisão pré-deploy da P.3). A P.6 traz um interruptor próprio. */
  const userIds = [...new Set((subs || []).map((s: { user_id: string }) => s.user_id))];
  const { data: enabled, error: profErr } = userIds.length
    ? await sb.from("profiles").select("id").in("id", userIds).eq("water_reminder_enabled", true)
    : { data: [], error: null };
  if (profErr) return jsonResponse({ error: profErr.message }, 500);
  const allowed = new Set((enabled || []).map((p: { id: string }) => p.id));
  // deno-lint-ignore no-explicit-any
  const byUser = new Map<string, any[]>();
  for (const s of subs || []) if (allowed.has(s.user_id)) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);

  const tally: Record<string, number> = {};
  let sent = 0;

  for (const [userId, userSubs] of byUser) {
    try {
      const [{ data: races }, { data: runs }, last] = await Promise.all([
        sb.from("race_events").select("id, name, date, status, distance_km, coach_balance")
          .eq("user_id", userId).gte("date", addDays(today, -7)).lte("date", addDays(today, 1)),
        sb.from("runs").select("id, date, race_id, kind, created_at")
          .eq("user_id", userId).gte("date", addDays(today, -8)),
        lastRecordDate(sb, userId),
      ]);
      const candidate = pickServerProactive({ raceEvents: races || [], runs: runs || [], lastRecordDate: last }, today);

      let decision = decidePush({ candidate, lisbonHour: hour, deliveredKeys: new Set(), pushedKeys: new Set(), pushedToday: false, lastModelMessageAt: null, nowMs: now.getTime() });
      if (candidate && decision.send) {
        // Só se consulta o resto quando há mesmo um momento para notificar.
        const [{ data: delivered }, { data: pushedKey }, { data: pushedToday }, { data: lastModel }] = await Promise.all([
          sb.from("coach_proactive_log").select("key").eq("user_id", userId).eq("key", candidate.key),
          sb.from("coach_proactive_pushes").select("key").eq("user_id", userId).eq("key", candidate.key),
          sb.from("coach_proactive_pushes").select("key").eq("user_id", userId).eq("sent_date", today).limit(1),
          sb.from("coach_messages").select("role, created_at").eq("user_id", userId)
            .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        decision = decidePush({
          candidate,
          lisbonHour: hour,
          deliveredKeys: new Set((delivered || []).map((d: { key: string }) => d.key)),
          pushedKeys: new Set((pushedKey || []).map((p: { key: string }) => p.key)),
          pushedToday: (pushedToday || []).length > 0,
          lastModelMessageAt: lastModel?.role === "model" ? lastModel.created_at : null,
          nowMs: now.getTime(),
          balanceDone: !!(races || []).find((r: { id: string; coach_balance?: string | null }) => r.id === candidate.raceId)?.coach_balance,
        });
      }
      const reason = decision.send ? "enviada" : decision.reason;
      if (!decision.send || !candidate) { tally[reason] = (tally[reason] || 0) + 1; continue; }

      // Registar ANTES de enviar: se duas execuções se cruzarem, a segunda
      // bate na chave primária e não envia outra vez.
      const { error: claimErr } = await sb.from("coach_proactive_pushes")
        .insert({ user_id: userId, key: candidate.key, trigger: candidate.trigger, sent_date: today });
      if (claimErr) { tally.ja_notificado = (tally.ja_notificado || 0) + 1; continue; }

      const payload = JSON.stringify({ ...proactivePushMessage(candidate), tag: "carol-proactive", tab: "coach" });
      let anySuccess = false;
      for (const sub of userSubs) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
          anySuccess = true;
        } catch (e) {
          // deno-lint-ignore no-explicit-any
          const status = (e as any)?.statusCode;
          if (status === 404 || status === 410) await sb.from("push_subscriptions").delete().eq("id", sub.id);
          else console.error("coach-proactive-tick: falha a enviar", sub.id, e);
        }
      }
      if (anySuccess) {
        sent++;
        tally.enviada = (tally.enviada || 0) + 1;
      } else {
        // Nenhuma subscrição aceitou: liberta a chave para a próxima hora.
        await sb.from("coach_proactive_pushes").delete().eq("user_id", userId).eq("key", candidate.key);
        tally.falhou = (tally.falhou || 0) + 1;
      }
    } catch (e) {
      console.error("coach-proactive-tick: atleta falhou", userId, e);
      tally.erro = (tally.erro || 0) + 1;
    }
  }

  return jsonResponse({ users: byUser.size, sent, hour, today, tally });
}

Deno.serve(handler);
