import React, { useEffect, useMemo, useState } from 'react';
import { Footprints, ChevronRight } from 'lucide-react';
import { useAppStore, selectCoachPendingTopics } from '../../store';
import { useToast } from '../shared/ToastProvider';
import { detectCoachInsights } from '../../utils/biEngine';
import { pendingRaceBalanceCandidate, dismissProactiveAlert } from '../../utils/coachProactive';
import { detectPlanDivergence, detectRaceConflict, raceLabel, wasDivergenceHandled } from '../../utils/planDivergence';
import { buildOrbitRings, hasAnyRecord, mealsForDay } from '../../utils/homeModels';
import { todayISO } from '../../lib/utils';
import { computeAcceptedWindow, buildPlanDays } from './WeeklyPlanCard';
import SectionLabel from '../shared/SectionLabel';
import { Dialog } from '../shared/Sheet';
import CarolCard from './CarolCard';
import DayPlanCard from './DayPlanCard';
import MealSheet from './MealSheet';
import RaceCard from './RaceCard';
import StatusCard from './StatusCard';
import FirstDayCard from './FirstDayCard';
import CheckinCard from './CheckinCard';
import CoachInsightButton from '../BI/CoachInsightButton';
import CoachInsightModal from '../BI/CoachInsightModal';
import MedalMoment from '../shared/MedalMoment';
import useMedalMoment from '../../utils/useMedalMoment';

/* O Início (redesenho 2026-09, ponto 5 — mock "Início"): o cartão da
   Carol, "O que faço hoje" (plano do dia), "Como estou" (a órbita, só
   leitura) e "Para onde vou" (a prova com o trilho). Gap de 8px entre
   cartões. No primeiro dia (sem registo e sem prova) a Carol abre a
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
  const { showToast } = useToast();
  const {
    profile, meals, waterLogs, raceEvents, coachPlans, coachPlanItems, runs, gymSessions, bodyAssessments, insightStates, shoes,
    setActiveTab, setPlanItemPrefill, setEditingRaceId, setProfile, setCoachIntent, setOpenCreationMode,
    dailySummary, logImpression, logImpressionDismissed,
  } = useAppStore();
  const pendingTopics = useAppStore(selectCoachPendingTopics);

  const [showInsights, setShowInsights] = useState(false);
  const [showDismiss, setShowDismiss] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [mealDay, setMealDay] = useState(null);
  // Dispensar o aviso do balanço grava a marca em localStorage, que não é
  // estado do React — este contador faz o useMemo voltar a ler.
  const [balanceDismissals, setBalanceDismissals] = useState(0);
  // O momento da medalha (specs/palmares-medalhoes.md) — a regra de quando
  // aparece vive no hook.
  const medalMoment = useMedalMoment();

  const today = todayISO();

  /* O que o Início mostrou (ação 2.4): a Carol lê-o para não repetir como
     novidade o que o atleta já viu. O cartão dela conta quando existe para
     hoje; os avisos e os insights contam quando a janela deles abre (ver
     abaixo) — antes disso são só um número no botão. */
  const cardDate = dailySummary?.date === today ? dailySummary.date : null;
  useEffect(() => {
    if (cardDate) logImpression({ kind: 'daily_card', key: cardDate });
  }, [cardDate, logImpression]);

  const hasRecords = hasAnyRecord({ runs, meals, gymSessions, bodyAssessments });
  const hasUpcomingRace = (raceEvents || []).some((e) => e.status !== 'concluida' && e.date >= today);
  const firstDay = !hasRecords && !hasUpcomingRace;

  const rings = useMemo(() => buildOrbitRings({ meals, waterLogs, profile }), [meals, waterLogs, profile]);

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

  const homeInsights = useMemo(() => {
    const all = detectCoachInsights({ runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes }, profile);
    return all.filter((i) => insightStates[i.id] !== 'understood' && i.module === 'coach');
  }, [runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes, profile, insightStates]);

  const interventionPending = profile?.coach_intervention_status === 'needed' || profile?.coach_intervention_status === 'in_progress';

  /* Duas provas principais no mesmo bloco (specs/plano-vinculado-a-prova.md
     §2.4): o taper de cada uma são 10-21 dias de polimento, e treinar para
     uma é sabotar a outra. Não há plano correto enquanto as duas forem
     principais — por isso isto sai pelo canal da intervenção e não pelo das
     divergências: pesa como um assunto por resolver, não tem botão de
     dispensar, e só se cala quando o atleta decidir (a decisão grava-se na
     prova, conflict_acknowledged_at, e vale em qualquer dispositivo). */
  const raceConflict = useMemo(
    () => detectRaceConflict({ coachPlans, raceEvents, today }),
    [coachPlans, raceEvents, today],
  );

  /* O balanço da prova (specs/gamificacao-provas.md §3): no dia a seguir, a
     Carol chama por ele a partir do botão flutuante enquanto o chat não for
     aberto. Só quando não há assuntos por resolver — uma intervenção pesa
     mais do que um balanço. Guarda-se o candidato completo (não só a prova)
     porque "Falar com a Carol" precisa dele para pedir o balanço a sério —
     ver o coachIntent 'race_balance' mais abaixo. */
  const raceBalance = useMemo(() => {
    if (pendingTopics > 0 || raceConflict) return null;
    const candidate = pendingRaceBalanceCandidate({ runs, meals, gymSessions, bodyAssessments, raceEvents, profile });
    if (!candidate) return null;
    const race = (raceEvents || []).find((r) => r?.id === candidate.raceId) || null;
    return race ? { race, candidate } : null;
  }, [pendingTopics, raceConflict, runs, meals, gymSessions, bodyAssessments, raceEvents, profile, balanceDismissals]);

  /* O plano precisa de um ajuste (specs/plano-de-prova.md, "O plano tem de
     saber da prova"): a app deteta sozinha quando a realidade se afastou do
     plano — prova sem item de prova, treino no dia da prova, trabalho forte
     na véspera, sessões falhadas — e a Carol chama por isso. A assinatura
     impede que ela chame pela mesma coisa outra vez enquanto o plano não
     mudar. Prioridade: uma intervenção pesa mais, e o ajuste pesa mais do
     que o balanço da prova (que é uma boa notícia, não uma urgência). */
  const divergence = useMemo(() => {
    if (pendingTopics > 0 || raceConflict) return null;
    const found = detectPlanDivergence({ coachPlans, coachPlanItems, raceEvents, runs, gymSessions, today });
    if (!found.reasons.length || wasDivergenceHandled(profile?.id, found.signature)) return null;
    return found;
  }, [pendingTopics, raceConflict, coachPlans, coachPlanItems, raceEvents, runs, gymSessions, today, profile?.id]);

  const openCoach = () => {
    if (interventionPending) {
      setCoachIntent({ kind: 'proactive_intervention', reason: profile?.coach_intervention_reason || null });
    } else if (raceConflict) {
      setCoachIntent({
        kind: 'race_conflict',
        races: raceConflict.races.map((r) => ({ id: r.id, name: r.name, date: r.date })),
        target: raceConflict.target ? { id: raceConflict.target.id, name: raceConflict.target.name, date: raceConflict.target.date } : null,
      });
    } else if (divergence) {
      setCoachIntent({ kind: 'adapt_plan', divergence: divergence.reasons.map((r) => r.text), signature: divergence.signature });
    }
    setActiveTab('coach');
  };

  /* Os avisos da Carol vivem no botão flutuante (pedido 2026-09-13): no
     cabeçalho do cartão dela confundiam-se com o resumo do dia. Um de cada
     vez, pela mesma prioridade de sempre — assuntos por resolver, depois o
     ajuste do plano, depois o balanço da prova —, cada um com o seu "Falar
     com a Carol" na janela dos insights. */
  const carolAlerts = [];
  if (pendingTopics > 0) {
    carolAlerts.push({
      id: 'assuntos',
      severity: 'warning',
      title: 'A Carol precisa de falar contigo',
      message: pendingTopics === 1 ? 'Tens 1 assunto a resolver com ela.' : `Tens ${pendingTopics} assuntos a resolver com ela.`,
      onTalk: openCoach,
      onDismiss: interventionPending ? () => setShowDismiss(true) : null,
    });
  } else if (raceConflict) {
    const nomes = raceConflict.races.map((r) => raceLabel(r)).join(', ');
    carolAlerts.push({
      id: 'conflito-provas',
      severity: 'warning',
      title: 'A Carol precisa de falar contigo',
      // Sem onDismiss, de propósito: enquanto houver duas principais no mesmo
      // bloco não há plano certo, e a decisão é do atleta — mas tem de ser
      // tomada. A Carol grava-a e não volta a perguntar.
      message: raceConflict.target
        ? `${nomes} está marcada como principal a meio do plano para ${raceLabel(raceConflict.target)}.`
        : `${nomes} está marcada como principal a meio do plano atual.`,
      onTalk: openCoach,
    });
  } else if (divergence) {
    carolAlerts.push({
      id: 'plano',
      severity: 'warning',
      title: 'O plano precisa de um ajuste',
      message: divergence.reasons.map((r) => r.text).join(' '),
      onTalk: openCoach,
    });
  } else if (raceBalance) {
    carolAlerts.push({
      id: 'balanco',
      severity: 'info',
      title: 'O balanço da prova',
      message: `Correste a ${raceBalance.race.name || 'prova'}. Quero fazer o balanço contigo.`,
      // Bug 2026-09-14: só mudar de separador e esperar que o Coach apanhe o
      // momento sozinho falhava em silêncio sempre que a Carol tivesse
      // falado há menos de 6h por qualquer outro motivo (regra normal contra
      // empilhar mensagens proativas) — o atleta carregava no botão e "não
      // acontecia nada". Um pedido explícito dele tem de furar essa regra,
      // por isso vai com o candidato e o Coach pede-o com `proactive_force`.
      onTalk: () => {
        setCoachIntent({ kind: 'race_balance', candidate: raceBalance.candidate });
        setActiveTab('coach');
      },
      // Uma saída se a conversa já aconteceu e o aviso não soube (outro
      // dispositivo, resposta que não chegou ao ecrã): uma marca PRÓPRIA de
      // "dispensado" — não a mesma do balanço dito, que faria o hub e o chat
      // pensarem que a conversa já tinha acontecido e deixarem de a propor.
      onDismiss: () => {
        dismissProactiveAlert(profile?.id, raceBalance.candidate);
        setBalanceDismissals((n) => n + 1);
        logImpressionDismissed({ kind: 'alert', key: 'balanco', title: 'O balanço da prova' });
      },
    });
  }

  /* Abrir a janela do botão flutuante é ver os avisos e os insights. */
  const openInsights = () => {
    for (const a of carolAlerts) logImpression({ kind: 'alert', key: a.id, title: a.title });
    for (const i of homeInsights) logImpression({ kind: 'insights', key: i.id, title: i.title });
    setShowInsights(true);
  };

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
  const registerRun = () => { if (setActiveTab('corrida')) setOpenCreationMode('run'); };

  // Saída manual do aviso da Carol (bug-016): se a conversa já resolveu o
  // assunto mas o aviso ficou preso, o atleta não fica refém disso.
  const dismissIntervention = async () => {
    if (!profile?.id) return;
    setDismissing(true);
    try {
      const { supabase } = await import('../../lib/supabase');
      const { error } = await supabase.from('profiles').update({ coach_intervention_status: 'resolved', coach_intervention_reason: null }).eq('id', profile.id);
      if (error) throw error;
      setProfile({ ...profile, coach_intervention_status: 'resolved', coach_intervention_reason: null });
      logImpressionDismissed({ kind: 'alert', key: 'assuntos', title: 'A Carol precisa de falar contigo' });
      setShowDismiss(false);
      showToast('Aviso dispensado.', 'success');
    } catch (err) {
      console.error('Erro ao dispensar intervenção:', err);
      showToast('Não foi possível dispensar o aviso. Tenta outra vez.', 'error');
    } finally {
      setDismissing(false);
    }
  };

  if (firstDay) {
    return (
      <div className="flex flex-col gap-3 fade-in pb-2">
        <FirstDayCard firstName={firstNameOf(profile?.display_name)} onTalk={() => setActiveTab('coach')} onCreateRace={createRace} />
        <SectionLabel style={{ marginTop: 4 }}>Entretanto, começa a registar</SectionLabel>
        <StatusCard empty onRegisterMeal={registerMeal} />
        <button type="button" onClick={registerRun} className="flex items-center gap-2.5 w-full text-left rounded-[18px]" style={{ padding: '14px 16px', minHeight: 44, background: 'rgba(255,255,255,.04)', border: '1px solid var(--border-glass)' }}>
          <Footprints size={16} style={{ color: 'var(--run)' }} className="shrink-0" />
          <span className="flex-1 text-[12.5px]" style={{ color: 'var(--text-3)' }}>Já correste hoje? Regista e eu ajusto o plano.</span>
          <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 fade-in pb-2">
      <CarolCard onOpenRace={setEditingRaceId} onOpenCoach={openCoach} />

      <SectionLabel>O que faço hoje</SectionLabel>
      <DayPlanCard plans={coachPlans} planItems={coachPlanItems} raceEvents={raceEvents} onComplete={handleCompleteItem} onNav={setActiveTab} onOpenRace={setEditingRaceId} onOpenPlano={() => setOpenCreationMode('plano')} />

      <SectionLabel>Como estou</SectionLabel>
      <CheckinCard />
      <StatusCard rings={rings} mealsModel={todayMeals} onOpenMeals={() => setMealDay({ dateISO: today, items: todayPlanItems })} />

      <SectionLabel>Para onde vou</SectionLabel>
      <RaceCard raceEvents={raceEvents} runs={runs} profile={profile} onOpenRace={setEditingRaceId} onCreateRace={createRace} onRegisterRace={registerRace} onOpenAllRaces={() => setActiveTab('provas')} />

      {mealDay && <MealSheet day={mealDay} onClose={() => setMealDay(null)} />}

      {showDismiss && (
        <Dialog
          title="Dispensar o aviso da Carol?"
          onClose={() => !dismissing && setShowDismiss(false)}
          actions={(
            <>
              <button type="button" disabled={dismissing} onClick={dismissIntervention} className="flex-1 min-h-[44px] rounded-[11px] text-[13px] font-extrabold disabled:opacity-45" style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', color: 'var(--coach)' }}>
                {dismissing ? 'A dispensar…' : 'Dispensar'}
              </button>
              <button type="button" disabled={dismissing} onClick={() => setShowDismiss(false)} className="flex-1 min-h-[44px] rounded-[11px] text-[13px] font-bold" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' }}>
                Cancelar
              </button>
            </>
          )}
        >
          <p className="text-[12.5px] leading-[1.55]" style={{ color: 'var(--text-3)' }}>
            O aviso deixa de aparecer na Home. Podes voltar a falar com a Carol no Chat sempre que quiseres.
          </p>
        </Dialog>
      )}

      <CoachInsightButton insights={homeInsights} alerts={carolAlerts} onClick={openInsights} />
      {showInsights && <CoachInsightModal insights={homeInsights} alerts={carolAlerts} onClose={() => setShowInsights(false)} />}
      {medalMoment.award && (
        <MedalMoment
          award={medalMoment.award}
          medalhao={medalMoment.medalhao}
          extraCount={medalMoment.extraCount}
          onClose={medalMoment.close}
          onOpenPalmares={() => setActiveTab('provas')}
        />
      )}
    </div>
  );
}
