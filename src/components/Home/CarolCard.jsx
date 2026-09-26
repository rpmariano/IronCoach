import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { computeRaceEve } from '@formulas/raceEve.ts';
import { buildRacePacingPlan } from '@formulas/racePacing.ts';
import { useAppStore } from '../../store';
import { addDaysISO } from '../../lib/utils';
import { getRacePrediction } from '../../utils/biEngine';
import { formatPace, parseDurationToSeconds } from '../../utils/run';
import { isRacePlanItem } from '../../utils/homeModels';
import { lisbonParts } from '../../utils/carolWelcome';
import { todaysCheckin } from '../../utils/checkin';
import { computeAcceptedWindow } from './WeeklyPlanCard';
import {
  limparAvisoDoServidor, tipoDoDia, linhaDoTreinoDeHoje, linhaDoDia, linhaDeAmanha,
  linhaDaAgua, linhaDaProvaDeHoje, linhaDaVespera,
} from './carolCardLines';
import GlassCard from '../shared/GlassCard';
import CoachAvatar from '../Coach/CoachAvatar';
import { inferMoodFromText } from '@formulas/carolMood.ts';

/* O cartão da Carol no topo do Início (mock "Início": ciano, "Ler mais").
   Duas partes: o cabeçalho com o nome dela, que abre o chat, e uma linha do
   resumo diário (coach-daily-summary), fechada a duas linhas, que "Ler
   mais" abre com o resto das mensagens. Os avisos "precisa de falar
   contigo" vivem no botão flutuante do Início desde 2026-09-13.
   Substitui o antigo CoachDailySummaryCard (carrossel de 4 mensagens),
   cuja composição do "aviso de hoje" (plano de hoje + água) se mantém em
   useCoachDailyMessages. Ver specs/plano-de-treino.md §11.

   Pedido 2026-09-26 — a Carol nunca pode parecer um autómato: o que o
   cartão diz por conta própria (o plano de hoje, a água, a prova, a véspera,
   o amanhã e a linha de um dia sem resumo) escreve-se em carolCardLines.js,
   pelo dia e pela hora de Lisboa, e do resumo do servidor só se usa o que é
   de hoje. */

const clean = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null);

/* O relógio do cartão (pedido 2026-09-26). As frases dependem da hora de
   Lisboa — a água só a partir das 11h, a prova antes e depois da partida, a
   véspera antes e depois da hora de deitar — e do dia. Uma PWA fica dias em
   segundo plano: sem isto, o cartão reaberto no sábado às 03:53 continuava
   a ser o de sexta. Acerta ao minuto e sempre que a app volta a ficar à
   vista. */
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

/** A prova por correr marcada para esta data, ou null. Uma prova já
 *  concluída não tem véspera nem manhã — o que ela tem é balanço, e disso
 *  trata o coachProactive. */
function findScheduledRace(raceEvents, dateISO) {
  return (raceEvents || []).find(
    (r) => r && r.status !== 'concluida' && typeof r.date === 'string' && r.date.slice(0, 10) === dateISO,
  ) || null;
}

/* O botão de uma secção do cartão — hoje só o do dia da prova, para o hub
   onde vive o plano km a km. Âmbar porque é da prova. Depois da partida
   (pedido 2026-09-26) o botão é o registo da prova (`registar`), o mesmo que
   o Início e o hub abrem: é o que a frase pede. */
function MessageAction({ action, onOpenRace }) {
  if (!action?.raceId) return null;
  // Sem callback (o cartão montado sozinho), abre o hub pelo store.
  const open = action.registar
    ? (id) => useAppStore.getState().openRaceRun(id)
    : onOpenRace || ((id) => useAppStore.getState().setEditingRaceId(id));
  // Um bloco a toda a largura: encavalitava-se no "Ler mais" quando era inline.
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
 *  água), estratégia nutricional, preparar amanhã, conceito do dia. Sem
 *  recapitulação, o aviso abre com o que o dia é (e sem aviso nenhum, é essa
 *  a mensagem, "Hoje"). `agora` é o instante do relógio do cartão. */
export function useCoachDailyMessages(agora = new Date()) {
  const { coachPlans, coachPlanItems, dailySummary, waterLogs, profile, raceEvents, runs, gymSessions, dailyCheckins } = useAppStore();
  /* O dia e a hora de Lisboa (pedido 2026-09-26), como as boas-vindas, o
     servidor do resumo e os registos de água: o "hoje" do cartão é o do chip
     do plano, dos dois lados da meia-noite. Ao minuto, para as frases que
     dependem da hora não se recalcularem a cada render. */
  const minuto = Math.floor(agora.getTime() / 60000);
  const instante = useMemo(() => new Date(minuto * 60000), [minuto]);
  const today = lisbonParts(instante).date;
  const tomorrow = addDaysISO(today, 1);
  /* O resumo só vale no dia para que foi gerado (pedido 2026-09-26). A PWA
     reaberta no sábado às 03:53 depois de dias em segundo plano mostrava o
     de sexta — «Para hoje tens agendado: Corrida…» por cima do «Descanso»
     do plano. O cartão pede o de hoje quando o dia muda (CarolCard). */
  const summary = dailySummary?.date === today ? dailySummary : null;

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
    if (!window) return { today: [], tomorrow: [], comPlano: false };
    const accepted = (coachPlans || []).filter((p) => p.status === 'aceite');
    const relevant = accepted.filter((p) => p.period_end >= today || (coachPlanItems || []).some((i) => i.plan_id === p.id && i.status === 'pendente'));
    const activePlan = [...relevant].sort((a, b) => a.period_start.localeCompare(b.period_start)).pop();
    if (!activePlan) return { today: [], tomorrow: [], comPlano: false };
    const items = (coachPlanItems || []).filter((i) => i.plan_id === activePlan.id && i.status !== 'cancelado');
    return { today: items.filter((i) => i.planned_date === today), tomorrow: items.filter((i) => i.planned_date === tomorrow), comPlano: true };
  }, [coachPlans, coachPlanItems, today, tomorrow]);

  /* O que já está registado hoje, por tipo. O aviso é gerado uma vez por dia
     e fica em cache: sem isto, "Para hoje tens agendado: Corrida…" ficava lá
     depois de a corrida estar registada (bug #38, 2026-09-21). Conta também
     o registo que não ficou ligado ao item do plano. */
  const doneKindsToday = useMemo(() => {
    const kinds = new Set();
    if ((runs || []).some((r) => typeof r?.date === 'string' && r.date.slice(0, 10) === today)) kinds.add('corrida');
    if ((gymSessions || []).some((s) => typeof s?.date === 'string' && s.date.slice(0, 10) === today)) kinds.add('ginasio');
    return kinds;
  }, [runs, gymSessions, today]);

  return useMemo(() => {
    const list = [];
    // Os rótulos das secções são a Carol a falar, não crachás de módulo: todos
    // em ciano (--coach), só o aviso em --warn. Antes cada um levava a cor do
    // seu módulo — o --gym (#9ec3d2) de "Preparar amanhã" tem quase a
    // luminância do texto corrido e desaparecia; o âmbar do conceito do dia
    // roubava a cor que é "da prova, só da prova" (bug relatado 2026-09-12).
    const recap = clean(summary?.recap);
    if (recap) list.push({ key: 'recap', label: 'Recapitulação', color: 'var(--coach)', text: recap });

    /* O dia, com o que já está registado. Um item conta como feito se está
       concluído no plano, se já há registo desse tipo hoje (mesmo sem ligação
       ao item — bug #38), ou, sendo o da prova, se a prova de hoje já está
       concluída. */
    const itensHoje = activePlanItems.today;
    const treinoHoje = itensHoje.filter((i) => i.kind === 'corrida' || i.kind === 'ginasio');
    const provaFeita = (raceEvents || []).some((r) => r?.status === 'concluida' && typeof r.date === 'string' && r.date.slice(0, 10) === today);
    const isDone = (i) => i.status === 'concluido' || doneKindsToday.has(i.kind) || (provaFeita && isRacePlanItem(i));
    const pendentes = treinoHoje.filter((i) => !isDone(i));
    const feitos = treinoHoje.filter(isDone);
    const corridasHoje = (runs || []).filter((r) => typeof r?.date === 'string' && r.date.slice(0, 10) === today);
    const kmHoje = corridasHoje.reduce((s, r) => s + (Number(r.distance_km) || 0), 0);
    const checkin = todaysCheckin(dailyCheckins, today);

    /* Aviso de hoje (pedido 2026-09-26): a frase do plano e a da água são
       sempre do cartão, feitas agora a partir do store; do aviso do servidor
       fica só o resto (RED-S, perda de peso). O texto do servidor é de
       quando o resumo foi gerado: às 11:00 ainda dizia a água das 07:30, e o
       plano em enum cru ("Corrida (continuo, 8 km)"). A cabeça do aviso é a
       prova, no dia dela; senão o treino por fazer; e, sem recapitulação
       (o modelo falhou, ou ainda não há resumo hoje), o que o dia é — menos
       na véspera de uma prova, em que o que o dia é diz-se pela prova de
       amanhã ("Preparar amanhã"), e ela tem de ser a primeira linha. */
    let cabeca = null;
    let action = null;
    let soODia = false;
    if (raceToday) {
      const prova = linhaDaProvaDeHoje({ race: raceToday, eve: eveToday, firstKmPaceLabel, agora: instante, kmHoje });
      cabeca = prova.text;
      // O botão leva ao hub (o plano km a km, o objetivo) ou, depois da
      // partida, ao registo da prova: dizê-lo em texto não chega.
      action = prova.action;
    } else if (pendentes.length) {
      cabeca = linhaDoTreinoDeHoje({ pendentes, feitos, agora: instante, checkin });
    } else if (!recap && !raceTomorrow) {
      const propostas = (coachPlans || []).filter((p) => p.status === 'proposto').length;
      const tipo = tipoDoDia({ itens: itensHoje, pendentes, provaFeita, comPlano: activePlanItems.comPlano });
      cabeca = linhaDoDia({ tipo, feitos, kmHoje, propostas, agora: instante });
      soODia = true;
    }
    const doServidor = limparAvisoDoServidor(summary?.warnings);
    // Os registos de água são gravados com o dia de Lisboa (addWaterLog). No
    // dia da prova a água é a do horário da prova (água até às …), não a do
    // anel.
    const waterTotal = (waterLogs || []).filter((w) => w.date === today).reduce((s, w) => s + (Number(w.amount_ml) || 0), 0);
    const agua = raceToday ? null : linhaDaAgua({ totalMl: waterTotal, profile, agora: instante });
    const warning = [cabeca, doServidor, agua].filter(Boolean).join(' ');
    if (warning) {
      // Só o dia, sem nada a avisar, não é um aviso: vai com o rótulo "Hoje", em ciano.
      if (soODia && !doServidor && !agua) list.push({ key: 'hoje', label: 'Hoje', color: 'var(--coach)', text: warning });
      else list.push({ key: 'warnings', label: 'Aviso de hoje', color: 'var(--warn)', text: warning, action });
    }

    const meal = clean(summary?.meal_suggestion);
    if (meal) list.push({ key: 'meal_suggestion', label: 'Estratégia nutricional', color: 'var(--coach)', text: meal });

    /* Na véspera, "Preparar amanhã" é a prova. O item do plano de amanhã não
       entra: nesse dia ele É a prova, e repetir o item por cima das horas da
       véspera seria dizer duas vezes a mesma coisa, a segunda pior. O
       tomorrow_prep do servidor já não entra (pedido 2026-09-26): é texto
       determinístico feito com os mesmos dados, mas em enum cru e sem a hora
       ("jantar até às 19:30" às 23:15); o cartão tem o plano e a prova. */
    const prep = raceTomorrow
      ? linhaDaVespera({ race: raceTomorrow, eve: eveTomorrow, agora: instante })
      : linhaDeAmanha({ itens: activePlanItems.tomorrow, agora: instante });
    if (prep) list.push({ key: 'tomorrow_prep', label: 'Preparar amanhã', color: 'var(--coach)', text: prep });

    const concept = clean(summary?.daily_concept?.body);
    if (concept) list.push({ key: 'daily_concept', label: summary.daily_concept.title || 'Conceito do dia', color: 'var(--coach)', text: concept });
    return list;
  }, [summary, activePlanItems, doneKindsToday, waterLogs, profile, today, raceEvents, raceToday, raceTomorrow, eveToday, eveTomorrow, firstKmPaceLabel, runs, dailyCheckins, coachPlans, instante]);
}

/* O cabeçalho é sempre a Carol. Os avisos "precisa de falar contigo" saíram
   daqui para o botão flutuante (pedido 2026-09-13): em cima do resumo do
   dia, os dois liam-se como uma coisa só.
   Um bloco só (redesenho "Início e o âmbar", 2026-09-15): saíram o
   subtítulo "a tua treinadora", o ícone Sparkles e o fio que separava o
   cabeçalho do resumo — eram três coisas a dizer "isto é a Carol" quando
   uma bastava. */
const MOOD_KEYS = new Set(['recap', 'warnings', 'hoje', 'tomorrow_prep']);

export default function CarolCard({ onOpenCoach, onOpenRace }) {
  const { dailySummary, dailySummaryLoading, loadDailySummary } = useAppStore();
  const agora = useAgora();
  const hoje = lisbonParts(agora).date;
  const messages = useCoachDailyMessages(agora);
  const [expanded, setExpanded] = useState(false);

  // Ao montar e sempre que o dia de Lisboa muda com o cartão aberto (a PWA
  // que volta do segundo plano noutro dia): o resumo de ontem não serve.
  useEffect(() => {
    loadDailySummary();
  }, [hoje]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = messages[0] || null;
  const canExpand = messages.length > 1 || (first && first.text.length > 120);
  // A carregar o resumo de hoje, mesmo com o de outro dia ainda no store.
  const loading = dailySummaryLoading && dailySummary?.date !== hoje;

  return (
    <GlassCard tone="coach" radius={20} padding="13px 15px" data-testid="carol-card">
      {/* O GlassCard embrulha os filhos num div próprio: o flex tem de viver
          aqui dentro, senão o avatar fica por cima do texto. */}
      <div className="flex items-start gap-[11px]">
      {/* A cara do resumo de hoje: a pensar enquanto carrega, depois a que o
          texto pede — um aviso de dor deixa-a preocupada, um recorde
          orgulhosa. O conceito do dia e a estratégia nutricional ficam de
          fora: uma lição sobre sobretreino não é um aviso ao atleta. Com
          56 px para a emoção se ler; sem o desenho a traço, que a cada
          regresso ao Início seria ruído. */}
      <CoachAvatar size={56} draw={false} mood={loading ? 'thinking' : inferMoodFromText(messages.filter((m) => MOOD_KEYS.has(m.key)).map((m) => m.text).join(' '))} className="mt-[1px]" />
      <div className="flex-1 min-w-0">
        {/* Alvo ≥44px sem empurrar o resumo para baixo: a margem negativa
            devolve à linha a sua altura visual (padrão de DayPlanCard). */}
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
          // Sem resumo, o dia diz-se na mesma (linhaDoDia): "Sem nada a
          // assinalar por agora. Regista uma refeição ou um treino…" pedia um
          // treino num dia de descanso e uma refeição às 03:53 (pedido
          // 2026-09-26). Aqui só se chega sem mensagem nenhuma, o que não
          // devia acontecer.
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
          </div>
        )}
      </div>
      </div>
    </GlassCard>
  );
}
