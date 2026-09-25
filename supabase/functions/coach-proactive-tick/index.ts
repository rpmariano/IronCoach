// IronHealth · coach-proactive-tick Edge Function
// (specs/carol-omnisciencia-omnipresenca.md, ação P.3)
//
// A Carol passa a chamar pelo atleta sem a app aberta. Corre de hora a hora
// pelo pg_cron (job 'coach-proactive-tick'), autenticada com o mesmo
// CRON_SECRET do send-water-reminders, e usa a service role para ler os
// atletas que têm notificações ligadas.
//
// Para cada um: avalia os mesmos momentos que o cliente
// (_shared/formulas/proactiveTriggers.ts, com as mesmas chaves), e envia uma
// notificação curta, na voz dela, se:
//   - estiver dentro da janela do atleta (a manhã da prova com hora de
//     partida: de 2 h antes dela, nunca antes das 6h, até à partida — P.10);
//   - a conversa ainda não tiver acontecido (coach_proactive_log);
//   - esta chave ainda não tiver sido notificada (coach_proactive_pushes);
//   - o Início não tiver mostrado hoje o aviso deste momento, nem o atleta o
//     tiver dispensado hoje (coach_impressions, P.10);
//   - não tiver passado o máximo de notificações dela hoje;
//   - ela não tiver falado há menos de 6 horas.
// Tocar na notificação abre o Coach, e é aí que o coach-chat escreve a
// mensagem a sério, com o contexto todo (e a regista em coach_proactive_log).
// Cada decisão sobre um atleta com algum momento fica em app_logs (P.10).

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";
import { listServerProactive, proactiveTab, weekToReviewBounds, type PushPreferences, type TriggerPlan } from "../_shared/formulas/proactiveTriggers.ts";
import { composePushMessage, type PushUsage } from "./pushText.ts";
import { choosePush, lisbonDateOf, tickLogRow, tickLogSignature } from "./decide.ts";

const corsHeaders = { "Content-Type": "application/json" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function lisbonHour(date: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hour12: false }).format(date)) % 24;
}

/** Minutos desde a meia-noite de Lisboa — a hora de partida conta ao minuto (P.10). */
function lisbonMinuteOfDay(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (get("hour") % 24) * 60 + get("minute");
}

function lisbonDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(date);
}

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

/* O último registo de todos (o silêncio) e o último treino — corrida ou
   ginásio — para o silêncio com check-ins (P.10). Uma linha por tabela. */
// deno-lint-ignore no-explicit-any
async function lastRecordDates(sb: any, userId: string): Promise<{ last: string | null; lastTraining: string | null }> {
  const tables = ["runs", "meals", "workout_sessions", "body_assessments"];
  const results = await Promise.all(tables.map((t) =>
    sb.from(t).select("date").eq("user_id", userId).order("date", { ascending: false }).limit(1).maybeSingle()
  ));
  const dates = results.map((r: { data: { date?: string } | null }) => (typeof r.data?.date === "string" ? r.data.date : null));
  const maxOf = (list: (string | null)[]) => list.filter((d): d is string => !!d).sort().pop() ?? null;
  return { last: maxOf(dates), lastTraining: maxOf([dates[0], dates[2]]) };
}

/* O balanço da semana (week_review) precisa de saber se houve algum registo
   DENTRO da semana revista — o último registo não chega (um de hoje não
   conta). Só se pergunta à segunda e à terça: uma linha por tabela. */
// deno-lint-ignore no-explicit-any
async function weekRecordDates(sb: any, userId: string, week: { weekStart: string; weekEnd: string } | null): Promise<string[]> {
  if (!week) return [];
  const tables = ["runs", "meals", "workout_sessions", "body_assessments"];
  const results = await Promise.all(tables.map((t) =>
    sb.from(t).select("date").eq("user_id", userId).gte("date", week.weekStart).lte("date", week.weekEnd).limit(1).maybeSingle()
  ));
  return results.map((r: { data: { date?: string } | null }) => r.data?.date).filter((d): d is string => typeof d === "string");
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
  const minuteOfDay = lisbonMinuteOfDay(now);
  const today = lisbonDate(now);
  const reviewWeek = weekToReviewBounds(today);

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

  const yesterday = addDays(today, -1);

  /* As decisões sem custo que o tick já registou hoje (P.10): cada uma —
     atleta, momento e motivo — fica uma vez por dia (decide.ts, tickLogRow).
     As últimas 26 horas cobrem o dia de Lisboa inteiro, com ou sem hora de
     verão. Se a leitura falhar, regista-se de hora a hora, como antes. */
  const loggedToday = new Set<string>();
  if (byUser.size) {
    // Só os atletas desta execução: sem o filtro, acima de 1000 linhas o
    // PostgREST cortava a resposta e o registo voltava a ser de hora a hora.
    const { data: loggedRows, error: loggedErr } = await sb.from("app_logs")
      .select("user_id, meta, created_at")
      .eq("event", "coach-proactive-tick").eq("level", "info")
      .in("user_id", [...byUser.keys()])
      .gte("created_at", new Date(now.getTime() - 26 * 3600000).toISOString());
    if (loggedErr) console.warn("coach-proactive-tick: não leu o registo de hoje", loggedErr.message);
    for (const r of loggedRows || []) {
      if (typeof r?.created_at === "string" && lisbonDateOf(r.created_at) === today) {
        loggedToday.add(tickLogSignature(r.user_id, r.meta?.key ?? null, String(r.meta?.reason ?? "")));
      }
    }
  }

  for (const [userId, userSubs] of byUser) {
    try {
      const [
        { data: races, error: racesErr }, { data: runs, error: runsErr }, { last, lastTraining }, { data: plans, error: plansErr }, weekDates,
        { data: gymYesterday }, { data: lastCheckin },
      ] = await Promise.all([
        // Até 6 meses à frente: o conflito de provas olha para dentro do bloco.
        sb.from("race_events").select("id, name, date, status, distance_km, coach_balance, start_time, target_time_seconds, race_priority, conflict_acknowledged_at")
          .eq("user_id", userId).gte("date", addDays(today, -7)).lte("date", addDays(today, 183)),
        sb.from("runs").select("id, date, race_id, kind, created_at, duration_seconds, distance_km")
          .eq("user_id", userId).gte("date", addDays(today, -8)),
        lastRecordDates(sb, userId),
        // Os planos em vigor ou propostos, com os itens — o tipo, para o
        // conflito de provas e o fim de bloco (um plano só de refeições não
        // é um bloco de treino); a data, o estado e quando foi criado, para o
        // treino de ontem por registar (P.10). Desde ontem: um bloco que
        // acabou ontem ainda tem o treino de ontem.
        sb.from("coach_plans").select("id, status, period_start, period_end, race_id, coach_plan_items(kind, planned_date, status, training_type, created_at)")
          .eq("user_id", userId).in("status", ["aceite", "proposto"]).gte("period_end", yesterday),
        weekRecordDates(sb, userId, reviewWeek),
        // O treino de ontem conta como feito com qualquer sessão de ginásio
        // nesse dia (as corridas já vêm acima) — P.10.
        sb.from("workout_sessions").select("date").eq("user_id", userId).eq("date", yesterday).limit(1),
        // O último check-in: ele está por cá, mesmo sem registos (P.10).
        sb.from("daily_checkins").select("date").eq("user_id", userId).order("date", { ascending: false }).limit(1).maybeSingle(),
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
      // deno-lint-ignore no-explicit-any
      const planItems = (plans || []).flatMap((p: any) => (p.coach_plan_items || []).map((i: any) => ({ ...i, plan_id: p.id })));
      const candidates = listServerProactive({
        raceEvents: races || [],
        runs: runs || [],
        lastRecordDate: last,
        lastTrainingDate: lastTraining,
        lastCheckinDate: lastCheckin?.date ?? null,
        planItems,
        trainingDates: [
          ...(runs || []).map((r: { date?: string | null }) => r.date ?? null),
          ...(gymYesterday || []).map((g: { date?: string | null }) => g.date ?? null),
        ],
        intervention: interventionById.get(userId) ?? null,
        plans: triggerPlans,
        // Um momento desligado no Perfil não esconde os seguintes — exceto o
        // balanço da semana, que só sai num dia sem nenhum outro momento,
        // ligado ou não (P.14).
        allowed: Array.isArray(prefsById.get(userId)?.types) ? prefsById.get(userId)!.types : null,
        weekRecordDates: weekDates,
      }, today);

      const prefs = prefsById.get(userId) ?? {};
      /* A decisão fica em app_logs (P.10) — só com algum momento, e nunca a
         custo do envio: uma falha a gravar o log fica na consola. */
      const logDecision = async (
        reason: string,
        pickedCandidate: typeof candidates[number] | null,
        usage: PushUsage | null = null,
        generated = false,
      ) => {
        const row = tickLogRow({ userId, candidates, candidate: pickedCandidate ?? candidates[0] ?? null, reason, usage, generated, lisbonHour: hour, loggedToday });
        if (!row) return;
        try {
          const { error: logErr } = await sb.from("app_logs").insert(row);
          if (logErr) console.warn("coach-proactive-tick: não gravou o log", userId, logErr.message);
          else if (row.level === "info") loggedToday.add(tickLogSignature(userId, row.meta.key as string | null, reason));
        } catch (e) {
          console.warn("coach-proactive-tick: não gravou o log", userId, e);
        }
      };
      // Primeiro sem ir à base de dados: se nenhum momento passa sequer a
      // janela e os tipos, não vale a pena ler o resto.
      let { candidate, decision } = choosePush(candidates, { lisbonHour: hour, minuteOfDay, deliveredKeys: new Set(), pushedKeys: new Set(), pushedTodayCount: 0, lastModelMessageAt: null, nowMs: now.getTime(), prefs });
      if (candidate && decision.send) {
        const keys = candidates.map((c) => c.key);
        const [{ data: delivered }, { data: pushedKey }, { data: pushedToday }, { data: lastAny }, { data: lastModel }, { data: seen }] = await Promise.all([
          sb.from("coach_proactive_log").select("key").eq("user_id", userId).in("key", keys),
          sb.from("coach_proactive_pushes").select("key").eq("user_id", userId).in("key", keys),
          sb.from("coach_proactive_pushes").select("key").eq("user_id", userId).eq("sent_date", today),
          sb.from("coach_messages").select("role, created_at").eq("user_id", userId)
            .order("created_at", { ascending: false }).limit(1).maybeSingle(),
          sb.from("coach_messages").select("created_at").eq("user_id", userId).eq("role", "model")
            .order("created_at", { ascending: false }).limit(1).maybeSingle(),
          // O que o Início mostrou ou o atleta dispensou HOJE (dia de Lisboa,
          // como grava o logImpression): a chave do candidato (P.10).
          sb.from("coach_impressions").select("key").eq("user_id", userId).eq("date", today).eq("kind", "alert").in("key", keys),
        ]);
        ({ candidate, decision } = choosePush(candidates, {
          lisbonHour: hour,
          minuteOfDay,
          deliveredKeys: new Set((delivered || []).map((d: { key: string }) => d.key)),
          pushedKeys: new Set((pushedKey || []).map((p: { key: string }) => p.key)),
          seenKeys: new Set((seen || []).map((s: { key: string }) => s.key)),
          pushedTodayCount: (pushedToday || []).length,
          prefs,
          lastMessage: lastAny ?? null,
          lastModelMessageAt: lastModel?.created_at ?? null,
          nowMs: now.getTime(),
          balanceDoneFor: (c) => !!(races || []).find((r: { id: string; coach_balance?: string | null }) => r.id === c.raceId)?.coach_balance,
        }));
      }
      const reason = decision.send ? "enviada" : decision.reason;
      if (!decision.send || !candidate) {
        tally[reason] = (tally[reason] || 0) + 1;
        await logDecision(reason, null);
        continue;
      }
      const picked = candidate; // fixo, para os callbacks abaixo

      // Registar ANTES de enviar: se duas execuções se cruzarem, a segunda
      // bate na chave primária e não envia outra vez.
      const { error: claimErr } = await sb.from("coach_proactive_pushes")
        .insert({ user_id: userId, key: candidate.key, trigger: candidate.trigger, sent_date: today });
      if (claimErr) {
        tally.ja_notificado = (tally.ja_notificado || 0) + 1;
        await logDecision("ja_notificado", picked);
        continue;
      }

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
      // A chave viaja no payload (P.9): o sw.js guarda-a e o cliente, ao vê-la
      // coincidir com um candidato calculado localmente, sabe que conversa
      // prometeu — o `trigger` não vai, é o prefixo da própria chave.
      const payload = JSON.stringify({ title: message.title, body: message.body, tag: "carol-proactive", tab: proactiveTab(candidate.trigger), key: candidate.key });
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
        // O texto só existe depois de enviar (composePushMessage já correu) —
        // por isso é um update à linha do claim, não o insert de cima (P.9).
        // Falha aqui não desfaz o envio: fica sem body/generated, e o coach-chat
        // trata isso como "sem detalhe do que foi dito" (fetchPushesBlock).
        const { error: bodyErr } = await sb.from("coach_proactive_pushes")
          .update({ body: message.body.slice(0, 200), generated: message.generated })
          .eq("user_id", userId).eq("key", candidate.key);
        if (bodyErr) console.error("coach-proactive-tick: não gravou o texto enviado", userId, candidate.key, bodyErr);
        await logDecision("enviada", picked, message.usage, message.generated);
      } else {
        // Nenhuma subscrição aceitou: liberta a chave para a próxima hora.
        await sb.from("coach_proactive_pushes").delete().eq("user_id", userId).eq("key", candidate.key);
        tally.falhou = (tally.falhou || 0) + 1;
        await logDecision("falhou", picked, message.usage, message.generated);
      }
    } catch (e) {
      console.error("coach-proactive-tick: atleta falhou", userId, e);
      tally.erro = (tally.erro || 0) + 1;
    }
  }

  return jsonResponse({ users: byUser.size, sent, hour, today, tally });
}

Deno.serve(handler);
