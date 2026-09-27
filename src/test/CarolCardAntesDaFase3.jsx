/* O cartão da Carol (Home/CarolCard.jsx) — useCoachDailyMessages e o
   desenho — ANTES da Fase 3 do Troféu, tal e qual (git ef3c4af, sem os
   comentários e com os caminhos dos imports acertados a esta pasta). Com as
   MESMAS frases (carolCardLines.js) e os mesmos utilitários: uma frase da
   Carol que mude para toda a gente muda nos dois lados.

   NÃO É CÓDIGO DA APP e NÃO se atualiza para acompanhar o Troféu: é a régua
   da invariância (specs/trofeu.md §10, "sem inscrição, a lista é a de
   hoje") de Home/CarolCard.test.jsx. Mudar o cartão por outra razão obriga
   a mudar esta cópia no mesmo commit — é de propósito. */
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { computeRaceEve } from '@formulas/raceEve.ts';
import { buildRacePacingPlan } from '@formulas/racePacing.ts';
import { useAppStore } from '../store';
import { addDaysISO } from '../lib/utils';
import { getRacePrediction } from '../utils/biEngine';
import { formatPace, parseDurationToSeconds } from '../utils/run';
import { isRacePlanItem } from '../utils/homeModels';
import { lisbonParts } from '../utils/carolWelcome';
import { eventoDaVida } from '../utils/carolVida';
import { todaysCheckin } from '../utils/checkin';
import { computeAcceptedWindow } from '../components/Home/WeeklyPlanCard';
import {
  limparAvisoDoServidor, tipoDoDia, linhaDoTreinoDeHoje, linhaDoDia, linhaDeAmanha,
  linhaDaAgua, linhaDaProvaDeHoje, linhaDaVespera,
} from '../components/Home/carolCardLines';
import GlassCard from '../components/shared/GlassCard';
import CoachAvatar from '../components/Coach/CoachAvatar';
import { inferMoodFromText } from '@formulas/carolMood.ts';
import { pickRaceOfDay } from '@formulas/mainRace.ts';

const clean = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null);

function useAgora() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const acertar = () => setAgora(new Date());
    const aoVoltar = () => { if (document.visibilityState !== 'hidden') acertar(); };
    const id = setInterval(acertar, 60 * 1000);
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', acertar);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', acertar);
    };
  }, []);
  return agora;
}

function findScheduledRace(raceEvents, dateISO) {
  return pickRaceOfDay(
    (raceEvents || []).filter((r) => r && r.status !== 'concluida' && typeof r.date === 'string'),
    dateISO,
  );
}

function MessageAction({ action, onOpenRace }) {
  if (!action?.raceId) return null;
  const open = action.registar
    ? (id) => useAppStore.getState().openRaceRun(id)
    : onOpenRace || ((id) => useAppStore.getState().setEditingRaceId(id));
  return (
    <div className="mt-2">
      <button
        type="button"
        data-testid="carol-card-action"
        onClick={() => open(action.raceId)}
        className="w-full inline-flex items-center justify-center gap-2 rounded-[11px] text-[12.5px] font-extrabold"
        style={{ minHeight: 44, padding: '0 14px', background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', color: 'var(--race)' }}
      >
        {action.label}
      </button>
    </div>
  );
}

function buildEve(race, profile) {
  if (!race) return null;
  return computeRaceEve({
    startTime: race.start_time,
    weightKg: profile?.weight_kg,
    plannedFinishSeconds: Number(race.target_time_seconds) > 0 ? Number(race.target_time_seconds) : null,
    distanceKm: race.distance_km ?? null,
  });
}

export function useCoachDailyMessagesAntesDaFase3(agora = new Date()) {
  const { coachPlans, coachPlanItems, dailySummary, waterLogs, profile, raceEvents, runs, gymSessions, dailyCheckins, coachNotes } = useAppStore();
  const minuto = Math.floor(agora.getTime() / 60000);
  const instante = useMemo(() => new Date(minuto * 60000), [minuto]);
  const today = lisbonParts(instante).date;
  const tomorrow = addDaysISO(today, 1);
  const summary = dailySummary?.date === today ? dailySummary : null;
  const vidaHoje = useMemo(() => eventoDaVida(coachNotes, today), [coachNotes, today]);
  const vidaAmanha = useMemo(() => eventoDaVida(coachNotes, tomorrow), [coachNotes, tomorrow]);

  const raceToday = useMemo(() => findScheduledRace(raceEvents, today), [raceEvents, today]);
  const raceTomorrow = useMemo(() => findScheduledRace(raceEvents, tomorrow), [raceEvents, tomorrow]);

  const eveToday = useMemo(() => buildEve(raceToday, profile), [raceToday, profile]);
  const eveTomorrow = useMemo(() => buildEve(raceTomorrow, profile), [raceTomorrow, profile]);

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
    if (!window) return { today: [], tomorrow: [], comPlano: false };
    const accepted = (coachPlans || []).filter((p) => p.status === 'aceite');
    const relevant = accepted.filter((p) => p.period_end >= today || (coachPlanItems || []).some((i) => i.plan_id === p.id && i.status === 'pendente'));
    const activePlan = [...relevant].sort((a, b) => a.period_start.localeCompare(b.period_start)).pop();
    if (!activePlan) return { today: [], tomorrow: [], comPlano: false };
    const items = (coachPlanItems || []).filter((i) => i.plan_id === activePlan.id && i.status !== 'cancelado');
    return { today: items.filter((i) => i.planned_date === today), tomorrow: items.filter((i) => i.planned_date === tomorrow), comPlano: true };
  }, [coachPlans, coachPlanItems, today, tomorrow]);

  const doneKindsToday = useMemo(() => {
    const kinds = new Set();
    if ((runs || []).some((r) => typeof r?.date === 'string' && r.date.slice(0, 10) === today)) kinds.add('corrida');
    if ((gymSessions || []).some((s) => typeof s?.date === 'string' && s.date.slice(0, 10) === today)) kinds.add('ginasio');
    return kinds;
  }, [runs, gymSessions, today]);

  return useMemo(() => {
    const list = [];
    const recap = clean(summary?.recap);
    if (recap) list.push({ key: 'recap', label: 'Recapitulação', color: 'var(--coach)', text: recap });

    const itensHoje = activePlanItems.today;
    const treinoHoje = itensHoje.filter((i) => i.kind === 'corrida' || i.kind === 'ginasio');
    const provaFeita = (raceEvents || []).some((r) => r?.status === 'concluida' && typeof r.date === 'string' && r.date.slice(0, 10) === today);
    const isDone = (i) => i.status === 'concluido' || doneKindsToday.has(i.kind) || (provaFeita && isRacePlanItem(i));
    const pendentes = treinoHoje.filter((i) => !isDone(i));
    const feitos = treinoHoje.filter(isDone);
    const corridasHoje = (runs || []).filter((r) => typeof r?.date === 'string' && r.date.slice(0, 10) === today);
    const kmHoje = corridasHoje.reduce((s, r) => s + (Number(r.distance_km) || 0), 0);
    const checkin = todaysCheckin(dailyCheckins, today);

    let cabeca = null;
    let action = null;
    let soODia = false;
    if (raceToday) {
      const prova = linhaDaProvaDeHoje({ race: raceToday, eve: eveToday, firstKmPaceLabel, agora: instante, kmHoje });
      cabeca = prova.text;
      action = prova.action;
    } else if (pendentes.length) {
      cabeca = linhaDoTreinoDeHoje({ pendentes, feitos, agora: instante, checkin, vida: vidaHoje });
    } else if (!recap && !raceTomorrow) {
      const propostas = (coachPlans || []).filter((p) => p.status === 'proposto').length;
      const jaHouvePlano = (coachPlans || []).some((p) => p?.status === 'aceite');
      const tipo = tipoDoDia({ itens: itensHoje, pendentes, provaFeita, comPlano: activePlanItems.comPlano });
      cabeca = linhaDoDia({ tipo, feitos, kmHoje, propostas, jaHouvePlano, agora: instante });
      soODia = true;
    }
    const doServidor = limparAvisoDoServidor(summary?.warnings);
    const waterTotal = (waterLogs || []).filter((w) => w.date === today).reduce((s, w) => s + (Number(w.amount_ml) || 0), 0);
    const agua = raceToday ? null : linhaDaAgua({ totalMl: waterTotal, profile, agora: instante });
    const warning = [cabeca, doServidor, agua].filter(Boolean).join(' ');

    const prep = raceTomorrow
      ? linhaDaVespera({ race: raceTomorrow, eve: eveTomorrow, agora: instante })
      : linhaDeAmanha({ itens: activePlanItems.tomorrow, agora: instante, vida: vidaAmanha });
    const prepMsg = prep ? { key: 'tomorrow_prep', label: 'Preparar amanhã', color: 'var(--coach)', text: prep } : null;
    const provaPrimeiro = !!(raceTomorrow && prepMsg && !recap && !cabeca);
    if (provaPrimeiro) list.push(prepMsg);

    if (warning) {
      if (soODia && !doServidor && !agua) list.push({ key: 'hoje', label: 'Hoje', color: 'var(--coach)', text: warning });
      else list.push({ key: 'warnings', label: 'Aviso de hoje', color: 'var(--warn)', text: warning, action });
    }

    const meal = clean(summary?.meal_suggestion);
    if (meal) list.push({ key: 'meal_suggestion', label: 'Estratégia nutricional', color: 'var(--coach)', text: meal });

    if (prepMsg && !provaPrimeiro) list.push(prepMsg);

    const concept = clean(summary?.daily_concept?.body);
    if (concept) list.push({ key: 'daily_concept', label: summary.daily_concept.title || 'Conceito do dia', color: 'var(--coach)', text: concept });
    return list;
  }, [summary, activePlanItems, doneKindsToday, waterLogs, profile, today, raceEvents, raceToday, raceTomorrow, eveToday, eveTomorrow, firstKmPaceLabel, runs, dailyCheckins, coachPlans, instante, vidaHoje, vidaAmanha]);
}

const MOOD_KEYS = new Set(['recap', 'warnings', 'hoje', 'tomorrow_prep']);

export default function CarolCardAntesDaFase3({ onOpenCoach, onOpenRace }) {
  const { dailySummary, dailySummaryLoading, loadDailySummary } = useAppStore();
  const agora = useAgora();
  const hoje = lisbonParts(agora).date;
  const messages = useCoachDailyMessagesAntesDaFase3(agora);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadDailySummary();
  }, [hoje]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = messages[0] || null;
  const canExpand = messages.length > 1 || (first && first.text.length > 120);
  const loading = dailySummaryLoading && dailySummary?.date !== hoje;

  return (
    <GlassCard tone="coach" radius={20} padding="13px 15px" data-testid="carol-card">
      <div className="flex items-start gap-[11px]">
      <CoachAvatar size={56} draw={false} mood={loading ? 'thinking' : inferMoodFromText(messages.filter((m) => MOOD_KEYS.has(m.key)).map((m) => m.text).join(' '))} className="mt-[1px]" />
      <div className="flex-1 min-w-0">
        <button type="button" onClick={onOpenCoach} className="flex items-center justify-between gap-2 w-full text-left min-h-[44px] -my-2">
          <span className="text-[12px] font-extrabold" style={{ color: 'var(--coach-soft)' }}>Carol</span>
          <ChevronRight size={15} style={{ color: 'var(--coach)' }} className="shrink-0" />
        </button>

        {loading ? (
          <div data-testid="carol-skeleton" className="flex flex-col gap-2 py-0.5 mt-1" aria-label="A carregar o resumo">
            <span className="block h-3 rounded-full w-full" style={{ background: 'rgba(255,255,255,.08)' }} />
            <span className="block h-3 rounded-full w-2/3" style={{ background: 'rgba(255,255,255,.08)' }} />
          </div>
        ) : !first ? (
          null
        ) : !expanded ? (
          <>
            <p className="text-[13px] leading-[1.5] font-medium mt-[3px]" style={{ color: 'var(--text-1)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {first.text}
            </p>
            {first.action && <MessageAction action={first.action} onOpenRace={onOpenRace} />}
          </>
        ) : (
          <div className="flex flex-col mt-[3px]">
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
          </div>
        )}
      </div>
      </div>
    </GlassCard>
  );
}
