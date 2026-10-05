import React, { useEffect, useMemo, useState } from 'react';
import { Footprints, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store';
import { buildNutritionGauges, hasAnyRecord, mealsForDay } from '../../utils/homeModels';
import { todayISO, addDaysISO } from '../../lib/utils';
import { goalFromNotes, knownFacts, isFirstDay, firstRunLine } from '../../utils/firstDay';
import { computeAcceptedWindow, buildPlanDays } from './WeeklyPlanCard';
import SectionLabel from '../shared/SectionLabel';
import CarolCard from './CarolCard';
import DayPlanCard from './DayPlanCard';
import MealSheet from './MealSheet';
import RaceCard from './RaceCard';
import StatusCard from './StatusCard';
import FirstDayCard from './FirstDayCard';
import GettingStartedCard from './GettingStartedCard';
import CheckinCard from './CheckinCard';
import { CarolNoticesDock } from '../BI/CoachInsightsDock';
import useCarolNotices from '../BI/useCarolNotices';
import BadgeMoment from '../shared/BadgeMoment';
import useBadgeMoment from '../../utils/useBadgeMoment';
import { eventoDaVida } from '../../utils/carolVida';
import { lisbonParts } from '../../utils/carolWelcome';

/* O Início (redesenho 2026-09, ponto 5 — mock "Início"): o cartão da
   Carol, "O que faço hoje" (plano do dia), "Como estou" (a órbita, só
   leitura) e "Para onde vou" (a prova com o trilho). Gap de 8px entre
   cartões. No primeiro dia (sem registo, sem prova e sem plano) a Carol abre a
   conversa e o resto do ecrã convida a registar. Registar água vive no FAB.

   A ordem mudou a 2026-09-15: "Como estou" subiu para terceiro e a prova
   passou para último. O ecrã lê-se de perto para longe — quem me fala,
   o que faço hoje, como estou hoje, para onde vou —, e a prova fecha-o
   porque é o horizonte, não a tarefa. */

function firstNameOf(name) {
  if (!name || typeof name !== 'string') return null;
  const t = name.trim();
  return t ? t.split(/\s+/)[0] : null;
}

export default function Home() {
  const {
    profile, meals, waterLogs, raceEvents, coachPlans, coachPlanItems, runs, gymSessions, bodyAssessments,
    setActiveTab, setPlanItemPrefill, setEditingRaceId, setOpenCreationMode,
    dailySummary, logImpression, setCoachIntent,
  } = useAppStore();

  const [mealDay, setMealDay] = useState(null);
  /* O momento do badge (fase 4 da reforma da gamificação) — a regra de
     quando aparece e em que escala vive no hook. É a única cerimónia de ecrã
     inteiro do Início desde que os medalhões saíram (fase C): só espera
     pelas boas-vindas (ação P.11, a cancela `welcomeGate`). Sem a migração
     `user_badges` aplicada não há `pending` nenhum e isto não mostra nada. */
  const badgeMoment = useBadgeMoment();
  const badgeVisivel = badgeMoment.grande || badgeMoment.medio;

  const today = todayISO();

  /* O que o Início mostrou (ação 2.4): a Carol lê-o para não repetir como
     novidade o que o atleta já viu. O cartão dela conta quando existe para
     hoje; os avisos e os insights contam quando a janela deles abre
     (BI/useCarolNotices.js, logOpened) — antes disso são só um número no
     botão. */
  const cardDate = dailySummary?.date === today ? dailySummary.date : null;
  useEffect(() => {
    if (cardDate) logImpression({ kind: 'daily_card', key: cardDate });
  }, [cardDate, logImpression]);

  const hasRecords = hasAnyRecord({ runs, meals, gymSessions, bodyAssessments });
  const hasUpcomingRace = (raceEvents || []).some((e) => e.status !== 'concluida' && e.date >= today);
  // Com dados ainda a chegar depois do prazo do arranque, vazio não é
  // "primeiro dia" (dataPending, ver loadInitialData no store).
  const dataPending = useAppStore((s) => s.dataPending);
  // Com plano aceite ou proposto também já não é o primeiro dia (pedido
  // 2026-09-26): o cartão do primeiro dia negava o plano que a Carol tinha
  // acabado de escrever, e escondia o "O que faço hoje" (utils/firstDay.js).
  const acceptedWindow = useMemo(() => computeAcceptedWindow(coachPlans, coachPlanItems, today), [coachPlans, coachPlanItems, today]);
  const firstDay = isFirstDay({ dataPending, hasRecords, hasUpcomingRace, planWindow: acceptedWindow, plans: coachPlans });

  /* No primeiro dia a Carol lembra-se do arranque (utils/firstDay.js): o
     objetivo e o que o atleta contou vêm da Memória do Coach, que o
     arranque acabou de escrever. Numa sessão nova a memória não vem com os
     dados iniciais — lê-se aqui, uma vez, só no primeiro dia. */
  const coachNotes = useAppStore((s) => s.coachNotes);
  const reloadCoachNotes = useAppStore((s) => s.reloadCoachNotes);
  const notesEmpty = !(coachNotes || []).length;
  // Vazio antes de acabar a leitura é "ainda não chegou", não "sem
  // objetivo": o cartão só pede a prova depois de a ler (utils/firstDay.js,
  // revisão de 2026-09-26).
  const [notesRead, setNotesRead] = useState(false);
  useEffect(() => {
    if (!firstDay || !notesEmpty) return undefined;
    let vivo = true;
    Promise.resolve(reloadCoachNotes?.()).catch(() => null).then(() => { if (vivo) setNotesRead(true); });
    return () => { vivo = false; };
  }, [firstDay, notesEmpty, reloadCoachNotes]);
  const notesLoaded = !notesEmpty || notesRead;
  const firstDayGoal = firstDay ? goalFromNotes(coachNotes) : null;
  // Quem foi operado ontem não ouve "Já correste?" (pedido 2026-09-26):
  // o que ela sabe da vida dele passa à frente (utils/carolVida.js).
  const vidaHoje = firstDay ? eventoDaVida(coachNotes, lisbonParts().date) : null;
  const firstDayFacts = useMemo(() => (firstDay ? knownFacts({ profile, coachNotes }) : []), [firstDay, profile, coachNotes]);

  const gauges = useMemo(() => buildNutritionGauges({ meals, waterLogs, profile }), [meals, waterLogs, profile]);

  /* Os itens do plano aceite para HOJE — a mesma janela e o mesmo
     construtor que "O que faço hoje" usa (computeAcceptedWindow +
     buildPlanDays), só que para um dia. Servem a linha das refeições
     sugeridas, que saiu do cartão do plano para o "Como estou": é lá que
     estão os anéis da nutrição. A persiana é a de sempre (`mealDay`). */
  const todayPlanItems = useMemo(() => {
    const window = computeAcceptedWindow(coachPlans, coachPlanItems, today);
    if (!window) return [];
    const acceptedIds = new Set((coachPlans || []).filter((p) => p.status === 'aceite').map((p) => p.id));
    return buildPlanDays((coachPlanItems || []).filter((i) => acceptedIds.has(i.plan_id)), today, 1)[0]?.items || [];
  }, [coachPlans, coachPlanItems, today]);
  const todayMeals = useMemo(() => mealsForDay(todayPlanItems), [todayPlanItems]);

  /* Os avisos da Carol e os insights — os mesmos em todos os ecrãs
     (pedido 2026-09-27, ver BI/useCarolNotices.js). O Início usa a lista
     também para o toque genérico no cartão da Carol (openCoach). */
  const notices = useCarolNotices();

  // "Registar sessão" não marca logo — deixa isso ao ecrã de registo, que
  // grava o completePlanItem só depois de a corrida/sessão real estar
  // gravada (specs/plano-de-treino.md §5.2).
  // setActiveTab devolve false quando um navGuard recusa (formulário com
  // alterações por gravar). Nesse caso não se abre nada — o mesmo contrato
  // que openRaceRun (store) e o "+" do Layout já cumprem; abrir o registo
  // por cima de uma navegação que não aconteceu deixava um formulário sujo
  // sem aviso por baixo de outro (achado do grafo, 2026-09-17).
  const handleCompleteItem = (item) => {
    setPlanItemPrefill(item);
    const isRun = item.kind === 'corrida';
    if (!setActiveTab(isRun ? 'corrida' : 'ginasio')) { setPlanItemPrefill(null); return; }
    setOpenCreationMode(isRun ? 'run' : 'workout');
  };

  const createRace = () => setOpenCreationMode('race');
  // Registar a prova é abrir o registo de corrida em modo prova — o store
  // trata do prefill e do separador (specs/prova-concluida.md §3).
  const registerRace = (raceId) => useAppStore.getState().openRaceRun(raceId);
  const registerMeal = () => { if (setActiveTab('nutricao')) setOpenCreationMode('meal'); };
  // Bug #51: o objetivo de ontem e se foi atingido — a Nutrição abre na vista Dia, em ontem.
  const openNutritionHistory = () => {
    useAppStore.getState().setNutritionDayFocus(addDaysISO(today, -1));
    setActiveTab('nutricao');
  };
  const registerRun = () => { if (setActiveTab('corrida')) setOpenCreationMode('run'); };

  // O cartão "O que falta para começar" reaproveita os handlers do Início (2026-10-04).
  const handleGettingStarted = (key) => {
    if (key === 'perfil') setActiveTab('perfil');
    else if (key === 'prova') createRace();
    else if (key === 'corridas') registerRun();
    else if (key === 'refeicoes') registerMeal();
  };

  if (firstDay) {
    return (
      <div className="flex flex-col gap-3 fade-in pb-2">
        <FirstDayCard
          firstName={firstNameOf(profile?.display_name)}
          goal={firstDayGoal}
          facts={firstDayFacts}
          vida={vidaHoje}
          notesLoaded={notesLoaded}
          // Com a origem (2026-10-05): no primeiro dia é ela que abre a
          // conversa, com o que ele lhe contou no arranque — o mesmo pedido
          // do fim do onboarding (Coach.jsx, onboarding_start).
          onTalk={() => {
            setCoachIntent({ kind: 'onboarding_start' });
            if (setActiveTab('coach') === false) setCoachIntent(null);
          }}
          onCreateRace={createRace}
          onRegisterRun={registerRun}
          onRegisterMeal={registerMeal}
        />
        <GettingStartedCard onAction={handleGettingStarted} />
        <SectionLabel style={{ marginTop: 4 }}>Entretanto, começa a registar</SectionLabel>
        <StatusCard empty onRegisterMeal={registerMeal} />
        {/* Quando o pedido dela já é a corrida, a linha repetia o botão. */}
        {firstDayGoal !== 'ritmo' && firstDayGoal !== 'regresso' && !vidaHoje && (
        <button type="button" onClick={registerRun} className="flex items-center gap-2.5 w-full text-left rounded-[18px]" style={{ padding: '14px 16px', minHeight: 44, background: 'rgba(255,255,255,.04)', border: '1px solid var(--border-glass)' }}>
          <Footprints size={16} style={{ color: 'var(--run)' }} className="shrink-0" />
          {/* Sem "eu ajusto o plano" (no primeiro dia não há plano) e sem
              "hoje" de madrugada — utils/firstDay.js, firstRunLine (2026-09-26). */}
          <span className="flex-1 text-[12.5px]" style={{ color: 'var(--text-3)' }}>{firstRunLine()}</span>
          <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
        </button>
        )}
        {/* O mesmo botão da Carol dos outros ecrãs: no primeiro dia quase
            nunca tem nada, mas se ela tiver um assunto, diz-se aqui também. */}
        <CarolNoticesDock notices={notices} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 fade-in pb-2">
      <CarolCard onOpenRace={setEditingRaceId} onOpenCoach={notices.openCoach} />
      <GettingStartedCard onAction={handleGettingStarted} />

      <SectionLabel>O que faço hoje</SectionLabel>
      <DayPlanCard plans={coachPlans} planItems={coachPlanItems} raceEvents={raceEvents} onComplete={handleCompleteItem} onNav={setActiveTab} onOpenRace={setEditingRaceId} onOpenPlano={() => setOpenCreationMode('plano')} />

      <SectionLabel>Como estou</SectionLabel>
      <CheckinCard />
      <StatusCard gauges={gauges} mealsModel={todayMeals} onOpenMeals={() => setMealDay({ dateISO: today, items: todayPlanItems })} onOpenHistory={openNutritionHistory} />

      <SectionLabel>Para onde vou</SectionLabel>
      <RaceCard raceEvents={raceEvents} runs={runs} profile={profile} onOpenRace={setEditingRaceId} onCreateRace={createRace} onRegisterRace={registerRace} onOpenAllRaces={() => setActiveTab('provas')} />

      {mealDay && <MealSheet day={mealDay} onClose={() => setMealDay(null)} />}

      <CarolNoticesDock notices={notices} />
      {badgeVisivel && (badgeMoment.grande ? (
        <BadgeMoment
          /* A fila: cada grande é um momento novo, por isso remonta (a
             coreografia só toca ao montar). */
          key={badgeMoment.grande.award.id}
          escala="grande"
          badge={badgeMoment.grande.badge}
          titulo={badgeMoment.grande.award.title || badgeMoment.grande.badge?.name}
          linha={badgeMoment.grande.award.line}
          restantes={badgeMoment.filaRestante}
          onClose={badgeMoment.fecharGrande}
        />
      ) : (
        <BadgeMoment
          escala="medio"
          badge={badgeMoment.medio.badge}
          titulo={badgeMoment.medio.titulo}
          linha={badgeMoment.medio.linha}
          onClose={badgeMoment.fecharMedio}
        />
      ))}
    </div>
  );
}
