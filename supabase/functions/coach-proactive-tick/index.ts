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
import { listServerProactive, proactiveTab, type PushPreferences, type TriggerPlan } from "../_shared/formulas/proactiveTriggers.ts";
import { composePushMessage } from "./pushText.ts";
import { choosePush } from "./decide.ts";

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
  /* Só quem ligou as notificações da Carol no Perfil (P.6, opt-in). A
     subscrição do browser fica depois de as desligar — por isso o filtro é o
     interruptor, não a subscrição. Cada atleta traz as suas preferências. */
  const userIds = [...new Set((subs || []).map((s: { user_id: string }) => s.user_id))];
  const { data: enabled, error: profErr } = userIds.length
    ? await sb.from("profiles")
      .select("id, display_name, carol_push_start_hour, carol_push_end_hour, carol_push_max_per_day, carol_push_types, coach_intervention_status, coach_intervention_reason")
      .in("id", userIds).eq("carol_push_enabled", true)
    : { data: [], error: null };
  if (profErr) return jsonResponse({ error: profErr.message }, 500);
  // deno-lint-ignore no-explicit-any
  const prefsById = new Map<string, PushPreferences>((enabled || []).map((p: any) => [p.id, {
    startHour: p.carol_push_start_hour,
    endHour: p.carol_push_end_hour,
    maxPerDay: p.carol_push_max_per_day,
    types: p.carol_push_types,
  }]));
  const allowed = new Set(prefsById.keys());
  // O primeiro nome, para a Carol escrever a notificação (P.4).
  const firstNameById = new Map<string, string | null>((enabled || []).map((p: { id: string; display_name?: string | null }) =>
    [p.id, (p.display_name || "").trim().split(/\s+/)[0] || null]));
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  // O assunto por resolver de cada atleta (P.5).
  const interventionById = new Map<string, { status: string | null; reason: string | null }>(
    (enabled || []).map((p: { id: string; coach_intervention_status?: string | null; coach_intervention_reason?: string | null }) =>
      [p.id, { status: p.coach_intervention_status ?? null, reason: p.coach_intervention_reason ?? null }]),
  );
  // deno-lint-ignore no-explicit-any
  const byUser = new Map<string, any[]>();
  for (const s of subs || []) if (allowed.has(s.user_id)) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);

  const tally: Record<string, number> = {};
  let sent = 0;

  for (const [userId, userSubs] of byUser) {
    try {
      const [{ data: races, error: racesErr }, { data: runs, error: runsErr }, last, { data: plans, error: plansErr }] = await Promise.all([
        // Até 6 meses à frente: o conflito de provas olha para dentro do bloco.
        sb.from("race_events").select("id, name, date, status, distance_km, coach_balance, start_time, target_time_seconds, race_priority, conflict_acknowledged_at")
          .eq("user_id", userId).gte("date", addDays(today, -7)).lte("date", addDays(today, 183)),
        sb.from("runs").select("id, date, race_id, kind, created_at, duration_seconds, distance_km")
          .eq("user_id", userId).gte("date", addDays(today, -8)),
        lastRecordDate(sb, userId),
        // Os planos em vigor ou propostos, com os tipos dos itens — para o
        // conflito de provas e o fim de bloco (um plano só de refeições não
        // é um bloco de treino).
        sb.from("coach_plans").select("id, status, period_start, period_end, race_id, coach_plan_items(kind)")
          .eq("user_id", userId).in("status", ["aceite", "proposto"]).gte("period_end", today),
      ]);
      // Sem as provas ou as corridas, o momento escolhido podia ser o errado
      // (a véspera a cair para o silêncio): salta-se o atleta nesta hora.
      if (racesErr || runsErr || plansErr) {
        console.error("coach-proactive-tick: leitura falhou", userId, racesErr?.message ?? runsErr?.message ?? plansErr?.message);
        tally.erro = (tally.erro || 0) + 1;
        continue;
      }
      // deno-lint-ignore no-explicit-any
      const triggerPlans: TriggerPlan[] = (plans || []).map((p: any) => ({
        id: p.id,
        status: p.status,
        period_start: p.period_start,
        period_end: p.period_end,
        race_id: p.race_id,
        hasTraining: (p.coach_plan_items || []).some((i: { kind?: string }) => i?.kind === "corrida" || i?.kind === "ginasio"),
      }));
      const candidates = listServerProactive({
        raceEvents: races || [],
        runs: runs || [],
        lastRecordDate: last,
        intervention: interventionById.get(userId) ?? null,
        plans: triggerPlans,
        // Um momento desligado no Perfil não esconde os seguintes.
        allowed: Array.isArray(prefsById.get(userId)?.types) ? prefsById.get(userId)!.types : null,
      }, today);

      const prefs = prefsById.get(userId) ?? {};
      // Primeiro sem ir à base de dados: se nenhum momento passa sequer a
      // janela e os tipos, não vale a pena ler o resto.
      let { candidate, decision } = choosePush(candidates, { lisbonHour: hour, deliveredKeys: new Set(), pushedKeys: new Set(), pushedTodayCount: 0, lastModelMessageAt: null, nowMs: now.getTime(), prefs });
      if (candidate && decision.send) {
        const keys = candidates.map((c) => c.key);
        const [{ data: delivered }, { data: pushedKey }, { data: pushedToday }, { data: lastAny }, { data: lastModel }] = await Promise.all([
          sb.from("coach_proactive_log").select("key").eq("user_id", userId).in("key", keys),
          sb.from("coach_proactive_pushes").select("key").eq("user_id", userId).in("key", keys),
          sb.from("coach_proactive_pushes").select("key").eq("user_id", userId).eq("sent_date", today),
          sb.from("coach_messages").select("role, created_at").eq("user_id", userId)
            .order("created_at", { ascending: false }).limit(1).maybeSingle(),
          sb.from("coach_messages").select("created_at").eq("user_id", userId).eq("role", "model")
            .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        ({ candidate, decision } = choosePush(candidates, {
          lisbonHour: hour,
          deliveredKeys: new Set((delivered || []).map((d: { key: string }) => d.key)),
          pushedKeys: new Set((pushedKey || []).map((p: { key: string }) => p.key)),
          pushedTodayCount: (pushedToday || []).length,
          prefs,
          lastMessage: lastAny ?? null,
          lastModelMessageAt: lastModel?.created_at ?? null,
          nowMs: now.getTime(),
          balanceDoneFor: (c) => !!(races || []).find((r: { id: string; coach_balance?: string | null }) => r.id === c.raceId)?.coach_balance,
        }));
      }
      const reason = decision.send ? "enviada" : decision.reason;
      if (!decision.send || !candidate) { tally[reason] = (tally[reason] || 0) + 1; continue; }
      const picked = candidate; // fixo, para os callbacks abaixo

      // Registar ANTES de enviar: se duas execuções se cruzarem, a segunda
      // bate na chave primária e não envia outra vez.
      const { error: claimErr } = await sb.from("coach_proactive_pushes")
        .insert({ user_id: userId, key: candidate.key, trigger: candidate.trigger, sent_date: today });
      if (claimErr) { tally.ja_notificado = (tally.ja_notificado || 0) + 1; continue; }

      /* O texto, escrito por ela com os dados do momento (P.4). Qualquer
         falha — sem chave, erro, texto que não passa a validação — dá a
         frase fixa da P.3. Os números vêm só daqui, nunca do modelo. */
      // deno-lint-ignore no-explicit-any
      const race: any = (races || []).find((r: { id: string }) => r.id === picked.raceId) ?? null;
      // deno-lint-ignore no-explicit-any
      const raceRun: any = candidate.hasRun && race
        ? (runs || []).find((r: { race_id?: string | null }) => r.race_id === race.id) ?? null
        : null;
      const message = await composePushMessage(candidate, {
        firstName: firstNameById.get(userId) ?? null,
        raceName: race?.name ?? null,
        distanceKm: race?.distance_km ?? null,
        startTime: race?.start_time ?? null,
        targetSeconds: race?.target_time_seconds ?? null,
        runSeconds: raceRun?.duration_seconds ?? null,
        runDistanceKm: raceRun?.distance_km ?? null,
      }, geminiKey);
      if (message.generated) tally.texto_gerado = (tally.texto_gerado || 0) + 1;
      const payload = JSON.stringify({ title: message.title, body: message.body, tag: "carol-proactive", tab: proactiveTab(candidate.trigger) });
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
