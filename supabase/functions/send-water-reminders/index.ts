// IronHealth · send-water-reminders Edge Function
// Disparada periodicamente pelo pg_cron (ver migração water_reminder_cron).
// Não é invocada por um utilizador autenticado — usa um segredo próprio
// (CRON_SECRET) em vez de um JWT do Supabase Auth, e a service role key
// para poder ler/escrever em profiles e push_subscriptions de todos os
// utilizadores (as políticas RLS dessas tabelas só permitem "own rows").
//
// Para cada perfil com lembretes ativos cujo tempo desde a última
// atividade (beber água OU ser lembrado) já ultrapassou o intervalo
// configurado, envia uma notificação Web Push a todas as subscrições
// desse utilizador e atualiza water_last_activity_at — isto faz o
// intervalo reiniciar tanto quando bebes água como quando és lembrado,
// evitando lembretes em cascata caso o envio falhe silenciosamente.

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";
import { raceDayWaterPhase, waterReminderMessage, type RaceForWater } from "./message.ts";
import { carolQuietSince, usersQuietAfterCarol } from "./afterCarol.ts";

const corsHeaders = { "Content-Type": "application/json" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

const DEFAULT_INTERVAL_MINUTES = 120;
const DEFAULT_START_HOUR = 8;  // inclusive
const DEFAULT_END_HOUR = 22;   // exclusive — última hora possível é 21:xx

// Hora local em Portugal (não UTC do servidor) — Intl trata o horário de
// verão sozinho, ao contrário de um offset fixo hardcoded.
function currentLisbonHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hour12: false }).format(date),
  );
}

/** Minutos desde a meia-noite de Lisboa (0-1439): o corte da água antes da
 *  prova é ao minuto ("água até às 08:15"), não à hora. */
function currentLisbonMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/* Data do calendário em Lisboa, pelo mesmo motivo da hora: em horário de verão
   a data UTC ainda é a de ontem entre as 00:00 e a 01:00, e um "silenciar hoje"
   pedido às 23:00 caducava à 01:00 em vez de ao fim da janela de lembretes.

   Tem de acompanhar o frontend: o WaterTracker grava este campo com
   lisbonTodayISO(). Comparar numa escala diferente daquela em que é gravado faz
   o silenciamento não ter efeito nenhum na hora em que as duas divergem — ver
   PRD 5.3. */
function currentLisbonDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(date);
}

// Janela agora configurável por utilizador (water_reminder_start_hour/
// water_reminder_end_hour, 0-23) — falha para 8-22 só se, por alguma razão,
// vierem null/undefined de perfis antigos sem os valores por omissão da
// coluna aplicados.
function isWithinReminderHours(hour: number, startHour: number | null, endHour: number | null): boolean {
  const start = startHour ?? DEFAULT_START_HOUR;
  const end = endHour ?? DEFAULT_END_HOUR;
  if (start === end) return true; // janela de 24h (ex.: utilizador pôs início=fim)
  if (start < end) return hour >= start && hour < end;
  // Janela que atravessa a meia-noite (ex.: início=22, fim=6).
  return hour >= start || hour < end;
}

async function handler(req: Request): Promise<Response> {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || providedSecret !== cronSecret) {
    return jsonResponse({ error: "Não autorizado" }, 401);
  }

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return jsonResponse({ error: "VAPID não configurado" }, 500);
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const nowDate = new Date();
    const currentHour = currentLisbonHour(nowDate);
    const currentMinutes = currentLisbonMinutes(nowDate);
    // Uma escala só, o dia de Lisboa (revisão de 2026-09-26): é nela que se
    // grava o silenciamento e também water_logs.date (addWaterLog no store,
    // o registo de água do Início). Com a data UTC, entre a meia-noite e a
    // 1h de verão o total lido era o de ontem.
    const lisbonToday = currentLisbonDate(nowDate);

    const { data: profiles, error: profilesErr } = await sb
      .from("profiles")
      .select(
        "id, water_goal_ml, water_reminder_interval_minutes, water_last_activity_at, water_reminder_muted_date, water_reminder_start_hour, water_reminder_end_hour",
      )
      .eq("water_reminder_enabled", true);
    if (profilesErr) return jsonResponse({ error: profilesErr.message }, 500);

    const now = nowDate.getTime();
    // "Resto do dia" silencia sem tocar em water_reminder_enabled — fica
    // marcado só até à data guardada; no dia seguinte esta condição já não
    // bate certo e os lembretes retomam sozinhos, sem limpeza nenhuma.
    // A janela horária é por utilizador (water_reminder_start_hour/
    // water_reminder_end_hour) — cada perfil pode ter um horário diferente.
    const dueByTime = (profiles || []).filter((p) => {
      if (p.water_reminder_muted_date === lisbonToday) return false;
      if (!isWithinReminderHours(currentHour, p.water_reminder_start_hour, p.water_reminder_end_hour)) return false;
      const intervalMs = (p.water_reminder_interval_minutes || DEFAULT_INTERVAL_MINUTES) * 60000;
      const lastMs = p.water_last_activity_at ? new Date(p.water_last_activity_at).getTime() : 0;
      return now - lastMs >= intervalMs;
    });

    // Quem já bateu a meta de hoje não precisa de mais lembretes — verifica-se
    // à parte (não dá para filtrar isto numa única query, é por utilizador).
    const due: typeof dueByTime = [];
    // O total de hoje fica guardado: é o número que a Carol diz no lembrete.
    const totalById = new Map<string, number>();
    for (const profile of dueByTime) {
      const { data: todayLogs } = await sb
        .from("water_logs")
        .select("amount_ml")
        .eq("user_id", profile.id)
        .eq("date", lisbonToday);
      const todayTotal = (todayLogs || []).reduce((sum, l) => sum + (l.amount_ml || 0), 0);
      const goal = Number(profile.water_goal_ml) || 2000;
      if (todayTotal < goal) {
        due.push(profile);
        totalById.set(profile.id, todayTotal);
      }
    }

    let sent = 0;
    let failed = 0;
    let usersNotified = 0;

    /* Nos 30 minutos a seguir a uma notificação da Carol a água espera
       (P.10, afterCarol.ts). Uma consulta só, para todos os que estão em
       dia de lembrete. Se a leitura falhar, a água sai como antes — um
       lembrete a mais é melhor do que nenhum. */
    let quietAfterCarol = new Set<string>();
    if (due.length) {
      const { data: recentCarol, error: carolErr } = await sb
        .from("coach_proactive_pushes")
        .select("user_id, sent_at")
        .in("user_id", due.map((p) => p.id))
        .gte("sent_at", carolQuietSince(now));
      if (carolErr) console.warn("send-water-reminders: não li as notificações da Carol", carolErr.message);
      else quietAfterCarol = usersQuietAfterCarol(recentCarol, now);
    }

    /* As provas de hoje com hora marcada (raceDayWaterPhase, message.ts): do
       corte da água à chegada prevista não sai lembrete; logo a seguir, sai o
       da prova acabada. Nada se grava ao calar, por isso o lembrete sai na
       primeira execução depois da chegada. Se a leitura falhar, como acima,
       a água sai como num dia qualquer. */
    const racesById = new Map<string, RaceForWater[]>();
    if (due.length) {
      const { data: todayRaces, error: racesErr } = await sb
        .from("race_events")
        .select("user_id, start_time, target_time_seconds, distance_km")
        .in("user_id", due.map((p) => p.id))
        .eq("date", lisbonToday)
        .not("start_time", "is", null);
      if (racesErr) console.warn("send-water-reminders: não li as provas de hoje", racesErr.message);
      for (const r of todayRaces || []) {
        racesById.set(r.user_id, [...(racesById.get(r.user_id) || []), r]);
      }
    }
    let duringRace = 0;

    for (const profile of due) {
      if (quietAfterCarol.has(profile.id)) continue;
      const phases = (racesById.get(profile.id) || []).map((r) => raceDayWaterPhase(r, currentMinutes));
      if (phases.includes("silencio")) {
        duringRace++;
        continue;
      }
      const { data: subs, error: subsErr } = await sb
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", profile.id);
      if (subsErr || !subs || subs.length === 0) continue;

      let anySuccess = false;
      // Na voz da Carol, com os números dele (message.ts) — já não o
      // "Hora de beber água" com emoji, que o carolTone proíbe.
      const payload = JSON.stringify(waterReminderMessage({
        totalMl: totalById.get(profile.id) ?? 0,
        goalMl: Number(profile.water_goal_ml) || 2000,
        hour: currentHour,
        startHour: profile.water_reminder_start_hour,
        endHour: profile.water_reminder_end_hour,
        afterRace: phases.includes("depois"),
      }));

      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
          anySuccess = true;
          sent++;
        } catch (e) {
          failed++;
          // deno-lint-ignore no-explicit-any
          const statusCode = (e as any)?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // Subscrição expirada/revogada pelo browser — deixa de ser válida.
            await sb.from("push_subscriptions").delete().eq("id", sub.id);
          } else {
            console.error("Falha a enviar push:", sub.id, e);
          }
        }
      }

      if (anySuccess) {
        usersNotified++;
        await sb.from("profiles")
          .update({ water_last_activity_at: new Date().toISOString() })
          .eq("id", profile.id);
      }
    }

    return jsonResponse({
      checked: profiles?.length || 0,
      due: due.length,
      afterCarol: quietAfterCarol.size,
      duringRace,
      usersNotified,
      sent,
      failed,
    });
  } catch (e) {
    console.error("Erro inesperado:", e);
    return jsonResponse({ error: "Erro inesperado no servidor" }, 500);
  }
}

if (import.meta.main) {
  Deno.serve(handler);
}
