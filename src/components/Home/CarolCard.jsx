import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, ChevronUp, Sparkles, RefreshCw } from 'lucide-react';
import { computeRaceEve, describeRaceEveShort, describeRaceDayShort } from '@formulas/raceEve.ts';
import { buildRacePacingPlan } from '@formulas/racePacing.ts';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';
import { getRacePrediction } from '../../utils/biEngine';
import { formatPace, parseDurationToSeconds } from '../../utils/run';
import { isRacePlanItem, raceNameForDate } from '../../utils/homeModels';
import { computeAcceptedWindow } from './WeeklyPlanCard';
import GlassCard from '../shared/GlassCard';
import CoachAvatar from '../Coach/CoachAvatar';

/* O cartão da Carol no topo do Início (mock "Início": ciano, "Ler mais").
   Duas partes: o cabeçalho — "A Carol precisa de falar contigo · N
   assuntos a resolver" quando há intervenção ou propostas por decidir,
   senão o nome dela — e uma linha do resumo diário (coach-daily-summary),
   fechada a duas linhas, que "Ler mais" abre com o resto das mensagens.
   Substitui o antigo CoachDailySummaryCard (carrossel de 4 mensagens),
   cuja composição do "aviso de hoje" (plano de hoje + água) se mantém em
   useCoachDailyMessages. Ver specs/plano-de-treino.md §11. */

function formatItemSummary(item, raceName = null) {
  // O dia da prova é a prova, não "uma corrida do tipo prova"
  // (specs/plano-de-prova.md, "O plano tem de saber da prova").
  if (isRacePlanItem(item)) {
    const details = [raceName, item.target_distance_km ? `${item.target_distance_km} km` : ''].filter(Boolean).join(', ');
    return details ? `Prova (${details})` : 'Prova';
  }
  if (item.kind === 'corrida') {
    const details = [item.training_type || 'corrida', item.target_distance_km ? `${item.target_distance_km} km` : '', item.target_duration_min ? `${item.target_duration_min} min` : ''].filter(Boolean).join(', ');
    return `Corrida (${details})`;
  }
  if (item.kind === 'ginasio') {
    const details = [item.categories?.length ? item.categories.join('/') : 'Geral', item.target_duration_min ? `${item.target_duration_min} min` : ''].filter(Boolean).join(', ');
    return `Ginásio (${details})`;
  }
  return 'Descanso';
}

const clean = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null);

/** A prova por correr marcada para esta data, ou null. Uma prova já
 *  concluída não tem véspera nem manhã — o que ela tem é balanço, e disso
 *  trata o coachProactive. */
function findScheduledRace(raceEvents, dateISO) {
  return (raceEvents || []).find(
    (r) => r && r.status !== 'concluida' && typeof r.date === 'string' && r.date.slice(0, 10) === dateISO,
  ) || null;
}

/* O botão de uma secção do cartão — hoje só o do dia da prova, para o hub
   onde vive o plano km a km. Âmbar porque é da prova. */
function MessageAction({ action, onOpenRace }) {
  if (!action?.raceId) return null;
  // Sem callback (o cartão montado sozinho), abre o hub pelo store.
  const open = onOpenRace || ((id) => useAppStore.getState().setEditingRaceId(id));
  return (
    <button
      type="button"
      data-testid="carol-card-action"
      onClick={() => open(action.raceId)}
      className="inline-flex items-center justify-center gap-2 mt-2 rounded-[11px] text-[12.5px] font-extrabold"
      style={{ minHeight: 44, padding: '0 14px', background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', color: 'var(--race)' }}
    >
      {action.label}
    </button>
  );
}

/** A véspera/manhã calculadas para uma prova, pela régua partilhada. */
function buildEve(race, profile) {
  if (!race) return null;
  return computeRaceEve({
    startTime: race.start_time,
    weightKg: profile?.weight_kg,
    plannedFinishSeconds: Number(race.target_time_seconds) > 0 ? Number(race.target_time_seconds) : null,
    distanceKm: race.distance_km ?? null,
  });
}

/** As mensagens do dia, por ordem: recapitulação, aviso de hoje (plano +
 *  água), estratégia nutricional, preparar amanhã, conceito do dia. */
export function useCoachDailyMessages() {
  const { coachPlans, coachPlanItems, dailySummary, waterLogs, profile, raceEvents, runs } = useAppStore();
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  /* ── A prova de hoje e a de amanhã (specs/plano-de-prova.md, "O plano tem
     de saber da prova") ───────────────────────────────────────────────────
     A véspera e o dia da prova mandam neste cartão: na véspera, "Preparar
     amanhã" é a prova — as horas e as gramas de computeRaceEve, não o item
     do plano de amanhã; no dia, o "Aviso de hoje" abre com a prova e a hora.
     A régua é a mesma que a Carol usa no chat e no coach-daily-summary
     (@formulas/raceEve.ts), para o cartão e a conversa nunca darem horas
     diferentes. */
  const raceToday = useMemo(() => findScheduledRace(raceEvents, today), [raceEvents, today]);
  const raceTomorrow = useMemo(() => findScheduledRace(raceEvents, tomorrow), [raceEvents, tomorrow]);

  const eveToday = useMemo(() => buildEve(raceToday, profile), [raceToday, profile]);
  const eveTomorrow = useMemo(() => buildEve(raceTomorrow, profile), [raceTomorrow, profile]);

  /* O ritmo do primeiro km é o único número da manhã da prova (spec, "Onde
     aparece" 3). Sai do mesmo buildRacePacingPlan do cartão "Plano para o
     dia" no hub — sem objetivo nem previsão não há plano, e então também
     não há número: a frase fica sem ele. */
  const firstKmPaceLabel = useMemo(() => {
    if (!raceToday) return null;
    const targetSeconds = Number(raceToday.target_time_seconds) > 0
      ? Number(raceToday.target_time_seconds)
      : parseDurationToSeconds(raceToday.target_time);
    const prediction = getRacePrediction(raceToday, profile, runs || []);
    const plan = buildRacePacingPlan({
      distanceKm: raceToday.distance_km,
      raceType: raceToday.race_type,
      elevationGainM: raceToday.elevation_gain_m,
      targetSeconds: targetSeconds > 0 ? targetSeconds : null,
      predictedSeconds: Number(prediction?.predictedSeconds) > 0 ? Math.round(prediction.predictedSeconds) : null,
      experienceLevel: raceToday.experience_level,
      routeSegments: raceToday.web_info?.route_segments || null,
      routeSummary: raceToday.web_info?.route_summary || null,
    });
    return plan ? formatPace(plan.firstKmPaceSecPerKm) : null;
  }, [raceToday, profile, runs]);

  const activePlanItems = useMemo(() => {
    const window = computeAcceptedWindow(coachPlans, coachPlanItems, today);
    if (!window) return { today: [], tomorrow: [] };
    const accepted = (coachPlans || []).filter((p) => p.status === 'aceite');
    const relevant = accepted.filter((p) => p.period_end >= today || (coachPlanItems || []).some((i) => i.plan_id === p.id && i.status === 'pendente'));
    const activePlan = [...relevant].sort((a, b) => a.period_start.localeCompare(b.period_start)).pop();
    if (!activePlan) return { today: [], tomorrow: [] };
    const items = (coachPlanItems || []).filter((i) => i.plan_id === activePlan.id && i.status !== 'cancelado');
    return { today: items.filter((i) => i.planned_date === today), tomorrow: items.filter((i) => i.planned_date === tomorrow) };
  }, [coachPlans, coachPlanItems, today, tomorrow]);

  return useMemo(() => {
    const list = [];
    // Os rótulos das secções são a Carol a falar, não crachás de módulo: todos
    // em ciano (--coach), só o aviso em --warn. Antes cada um levava a cor do
    // seu módulo — o --gym (#9ec3d2) de "Preparar amanhã" tem quase a
    // luminância do texto corrido e desaparecia; o âmbar do conceito do dia
    // roubava a cor que é "da prova, só da prova" (bug relatado 2026-09-12).
    if (clean(dailySummary?.recap)) list.push({ key: 'recap', label: 'Recapitulação', color: 'var(--coach)', text: clean(dailySummary.recap) });

    // Aviso de hoje: o do servidor, senão o plano de hoje; a água junta-se.
    const nonRest = activePlanItems.today.filter((i) => i.kind !== 'descanso');
    const raceTodayName = raceToday ? raceToday.name : raceNameForDate(raceEvents, today);
    // No dia da prova a frase da prova (mais abaixo) já diz o que é o dia —
    // acrescentar-lhe "Para hoje tens agendado: Prova (…)" era dizer duas
    // vezes a mesma coisa. O aviso do servidor, esse, mantém-se: é dele.
    let warning = clean(dailySummary?.warnings)
      || (!raceToday && nonRest.length ? `Para hoje tens agendado: ${nonRest.map((i) => formatItemSummary(i, raceTodayName)).join(' e ')}.` : '');
    const waterTotal = (waterLogs || []).filter((w) => w.date === today).reduce((s, w) => s + (w.amount_ml || 0), 0);
    // A água só se cobra a quem ligou os lembretes de água (perfil); sem
    // eles o registo é opcional e a frase era ruído (pedido 2026-09-13).
    const waterGoal = profile?.water_reminder_enabled ? profile?.water_goal_ml : null;
    // O servidor vê os mesmos registos de água e muitas vezes já os comenta
    // no aviso ("Ainda não registaste consumo de água hoje. Começa a
    // hidratar-te…"); juntar-lhe a frase local dizia a mesma coisa duas
    // vezes seguidas (bug relatado 2026-09-12). A frase local fica só para
    // quando o aviso não fala de água — que é o caso sem resumo do dia.
    // Sem \b antes de "água": em JavaScript \b é só ASCII e nunca casa entre
    // um espaço e um "á" — apanhado na revisão pré-deploy; passava só porque
    // o servidor escreve sempre "hidratar-te".
    const mentionsWater = /água|\b(agua|hidrat)/i.test(warning);
    if (waterGoal && !mentionsWater && waterTotal === 0) warning = `${warning} Ainda não registaste água hoje.`.trim();
    else if (waterGoal && !mentionsWater && waterTotal < waterGoal / 2) warning = `${warning} Só registaste ${waterTotal} ml de água.`.trim();
    // No dia da prova, o aviso abre com ela — o resto (a água, o que o
    // servidor tenha a dizer) vem a seguir, não à frente.
    // (O servidor não a prefixa: se algum dia o fizer, "Hoje é …" não se repete.)
    if (raceToday && !/^Hoje é /.test(warning)) {
      warning = [describeRaceDayShort(eveToday, raceToday.name, firstKmPaceLabel), warning].filter(Boolean).join(' ');
    }
    // No dia da prova o aviso leva o botão para o hub: é lá que está o plano
    // km a km, e dizê-lo em texto não chega — tem de estar a um toque.
    if (warning) list.push({ key: 'warnings', label: 'Aviso de hoje', color: 'var(--warn)', text: warning, action: raceToday ? { label: 'Abrir o plano da prova', raceId: raceToday.id } : null });

    if (clean(dailySummary?.meal_suggestion)) list.push({ key: 'meal_suggestion', label: 'Estratégia nutricional', color: 'var(--coach)', text: clean(dailySummary.meal_suggestion) });

    /* Na véspera, "Preparar amanhã" é a prova. O item do plano de amanhã não
       entra: nesse dia ele É a prova, e repetir "Amanhã o plano aponta para:
       Prova (…)" por cima das horas da véspera seria dizer duas vezes a
       mesma coisa, a segunda pior. */
    const tomorrowNonRest = activePlanItems.tomorrow.filter((i) => i.kind !== 'descanso');
    const prep = raceTomorrow
      ? describeRaceEveShort(eveTomorrow, raceTomorrow.name, raceTomorrow.distance_km || null)
      : tomorrowNonRest.length
        ? `Amanhã o plano aponta para: ${tomorrowNonRest.map((i) => formatItemSummary(i, raceNameForDate(raceEvents, tomorrow))).join(' e ')}.`
        : clean(dailySummary?.tomorrow_prep);
    if (prep) list.push({ key: 'tomorrow_prep', label: 'Preparar amanhã', color: 'var(--coach)', text: prep });

    if (clean(dailySummary?.daily_concept?.body)) list.push({ key: 'daily_concept', label: dailySummary.daily_concept.title || 'Conceito do dia', color: 'var(--coach)', text: clean(dailySummary.daily_concept.body) });
    return list;
  }, [dailySummary, activePlanItems, waterLogs, profile, today, tomorrow, raceEvents, raceToday, raceTomorrow, eveToday, eveTomorrow, firstKmPaceLabel]);
}

/* `topic`: um assunto que ela quer tratar sem ser uma intervenção — hoje, "o
   balanço da prova" nos dias a seguir a uma prova registada (specs/
   gamificacao-provas.md §3). Mostra-se com o mesmo cabeçalho "A Carol precisa
   de falar contigo", mas sem o semblante preocupado: é uma boa notícia. */
export default function CarolCard({ pendingTopics = 0, topic = null, onOpenCoach, onDismissTopic, onOpenRace }) {
  const { dailySummary, dailySummaryLoading, loadDailySummary } = useAppStore();
  const messages = useCoachDailyMessages();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadDailySummary();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const first = messages[0] || null;
  const canExpand = messages.length > 1 || (first && first.text.length > 120);
  const loading = dailySummaryLoading && !dailySummary;

  return (
    <GlassCard tone="coach" radius={20} padding="14px 15px" className="flex flex-col gap-[11px]" data-testid="carol-card">
      <button type="button" onClick={onOpenCoach} className="flex items-center gap-2.5 w-full text-left min-h-[44px] -my-1.5">
        <CoachAvatar size={30} mood={pendingTopics > 0 ? 'concerned' : 'neutral'} breathing={pendingTopics > 0 || !!topic} />
        <div className="flex-1 min-w-0">
          {pendingTopics > 0 ? (
            <>
              <div className="text-[13px] font-extrabold" style={{ color: 'var(--coach-soft)' }}>A Carol precisa de falar contigo</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-4)' }}>{pendingTopics === 1 ? '1 assunto a resolver' : `${pendingTopics} assuntos a resolver`}</div>
            </>
          ) : topic ? (
            <>
              <div className="text-[13px] font-extrabold" style={{ color: 'var(--coach-soft)' }}>A Carol precisa de falar contigo</div>
              <div className="text-[11px] mt-0.5" data-testid="carol-card-topic" style={{ color: 'var(--text-4)' }}>{topic}</div>
            </>
          ) : (
            <>
              <div className="text-[13px] font-extrabold" style={{ color: 'var(--coach-soft)' }}>Carol</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-4)' }}>a tua treinadora</div>
            </>
          )}
        </div>
        <ChevronRight size={16} style={{ color: 'var(--coach)' }} className="shrink-0" />
      </button>

      <div className="flex items-start gap-2.5 pt-[11px]" style={{ borderTop: '1px solid rgba(34,211,238,.2)' }}>
        <Sparkles size={16} style={{ color: 'var(--coach)', marginTop: 1 }} className="shrink-0" />
        <div className="flex-1 min-w-0">
          {loading ? (
            <div data-testid="carol-skeleton" className="flex flex-col gap-2 py-0.5" aria-label="A carregar o resumo">
              <span className="block h-3 rounded-full w-full" style={{ background: 'rgba(255,255,255,.08)' }} />
              <span className="block h-3 rounded-full w-2/3" style={{ background: 'rgba(255,255,255,.08)' }} />
            </div>
          ) : !first ? (
            <p className="text-[12.5px] leading-[1.45] font-medium" style={{ color: 'var(--text-2)' }}>
              Sem nada a assinalar por agora. Regista uma refeição ou um treino e eu tenho o que comentar.
            </p>
          ) : !expanded ? (
            <>
              <p className="text-[12.5px] leading-[1.45] font-medium" style={{ color: 'var(--text-2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {first.text}
              </p>
              {first.action && <MessageAction action={first.action} onOpenRace={onOpenRace} />}
            </>
          ) : (
            <div className="flex flex-col">
              {/* Um fio entre secções: é o que as separa em blocos sem voltar
                  ao carrossel — a cor do rótulo sozinha não chegava. */}
              {messages.map((m, i) => (
                <div key={m.key} style={i ? { borderTop: '1px solid rgba(34,211,238,.12)', marginTop: 10, paddingTop: 10 } : undefined}>
                  <div className="text-[11px] font-extrabold uppercase" style={{ color: m.color, letterSpacing: 'var(--tracking-label)' }}>{m.label}</div>
                  <p className="text-[12.5px] leading-[1.5] font-medium mt-0.5" style={{ color: 'var(--text-2)' }}>{m.text}</p>
                  {m.action && <MessageAction action={m.action} onOpenRace={onOpenRace} />}
                </div>
              ))}
            </div>
          )}

          {(canExpand || expanded) && !loading && (
            <button type="button" onClick={() => setExpanded((e) => !e)} className="inline-flex items-center gap-0.5 min-h-[44px] mt-[3px] text-[11.5px] font-bold" style={{ color: 'var(--coach)' }}>
              {expanded ? 'Ler menos' : 'Ler mais'} {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}

          {expanded && (
            <div className="flex items-center justify-between gap-2 mt-1">
              <button type="button" onClick={() => loadDailySummary({ force: true })} disabled={dailySummaryLoading} aria-label="Atualizar resumo" className="inline-flex items-center gap-1.5 min-h-[44px] text-[11.5px] font-bold" style={{ color: 'var(--text-4)' }}>
                <RefreshCw size={13} className={dailySummaryLoading ? 'animate-spin' : ''} /> Atualizar
              </button>
              {pendingTopics > 0 && onDismissTopic && (
                <button type="button" onClick={onDismissTopic} className="min-h-[44px] text-[11.5px] font-bold" style={{ color: 'var(--text-4)' }}>
                  Dispensar aviso
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
