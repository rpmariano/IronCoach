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

/* NOTA: esta função compara water_reminder_muted_date em UTC de propósito,
   porque o frontend em produção (a app vanilla em index.html) grava esse campo
   com todayISO(), que é UTC. Manter as duas escalas iguais é o que importa —
   comparar em Lisboa contra um valor gravado em UTC faria o silenciamento não
   ter efeito nenhum na hora em que as duas divergem (00:00–01:00 no horário de
   verão).

   O ramo staging/react-consolidation tem a versão que compara pela data de
   Lisboa, a par de um frontend que também a grava em Lisboa. As duas mudanças
   têm de ir juntas — ver PRD 5.3. */

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
    // UTC, para bater com o todayISO() do frontend em produção — ver a nota
    // acima sobre as escalas de data.
    const todayISO = nowDate.toISOString().slice(0, 10);

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
      if (p.water_reminder_muted_date === todayISO) return false;
      if (!isWithinReminderHours(currentHour, p.water_reminder_start_hour, p.water_reminder_end_hour)) return false;
      const intervalMs = (p.water_reminder_interval_minutes || DEFAULT_INTERVAL_MINUTES) * 60000;
      const lastMs = p.water_last_activity_at ? new Date(p.water_last_activity_at).getTime() : 0;
      return now - lastMs >= intervalMs;
    });

    // Quem já bateu a meta de hoje não precisa de mais lembretes — verifica-se
    // à parte (não dá para filtrar isto numa única query, é por utilizador).
    const due: typeof dueByTime = [];
    for (const profile of dueByTime) {
      const { data: todayLogs } = await sb
        .from("water_logs")
        .select("amount_ml")
        .eq("user_id", profile.id)
        .eq("date", todayISO);
      const todayTotal = (todayLogs || []).reduce((sum, l) => sum + (l.amount_ml || 0), 0);
      const goal = Number(profile.water_goal_ml) || 2000;
      if (todayTotal < goal) due.push(profile);
    }

    let sent = 0;
    let failed = 0;
    let usersNotified = 0;

    for (const profile of due) {
      const { data: subs, error: subsErr } = await sb
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", profile.id);
      if (subsErr || !subs || subs.length === 0) continue;

      let anySuccess = false;
      const payload = JSON.stringify({
        title: "Hora de beber água 💧",
        body: "Já passou algum tempo desde o teu último registo de água.",
      });

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
