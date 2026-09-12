import React, { useMemo, useState } from 'react';
import { Footprints, ChevronRight } from 'lucide-react';
import { useAppStore, selectCoachPendingTopics } from '../../store';
import { useToast } from '../shared/ToastProvider';
import { detectCoachInsights } from '../../utils/biEngine';
import { pendingRaceBalance } from '../../utils/coachProactive';
import { buildOrbitRings, hasAnyRecord } from '../../utils/homeModels';
import { todayISO } from '../../lib/utils';
import SectionLabel from '../shared/SectionLabel';
import { Dialog } from '../shared/Sheet';
import CarolCard from './CarolCard';
import DayPlanCard from './DayPlanCard';
import MealSheet from './MealSheet';
import RaceCard from './RaceCard';
import StatusCard from './StatusCard';
import FirstDayCard from './FirstDayCard';
import CoachInsightButton from '../BI/CoachInsightButton';
import CoachInsightModal from '../BI/CoachInsightModal';

/* O Início (redesenho 2026-09, ponto 5 — mock "Início"): o cartão da
   Carol, "O que faço hoje" (plano do dia), "Para onde vou" (a prova com o
   trilho) e "Como estou" (a órbita, só leitura). Gap de 8px entre cartões.
   No primeiro dia (sem registo e sem prova) a Carol abre a conversa e o
   resto do ecrã convida a registar. Registar água vive no FAB. */

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
  } = useAppStore();
  const pendingTopics = useAppStore(selectCoachPendingTopics);

  const [showInsights, setShowInsights] = useState(false);
  const [showDismiss, setShowDismiss] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [mealDay, setMealDay] = useState(null);

  const today = todayISO();
  const hasRecords = hasAnyRecord({ runs, meals, gymSessions, bodyAssessments });
  const hasUpcomingRace = (raceEvents || []).some((e) => e.status !== 'concluida' && e.date >= today);
  const firstDay = !hasRecords && !hasUpcomingRace;

  const rings = useMemo(() => buildOrbitRings({ meals, waterLogs, profile }), [meals, waterLogs, profile]);

  const homeInsights = useMemo(() => {
    const all = detectCoachInsights({ runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes }, profile);
    return all.filter((i) => insightStates[i.id] !== 'understood' && i.module === 'coach');
  }, [runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes, profile, insightStates]);

  const interventionPending = profile?.coach_intervention_status === 'needed' || profile?.coach_intervention_status === 'in_progress';

  /* O balanço da prova (specs/gamificacao-provas.md §3): no dia a seguir, a
     Carol chama por ele a partir do cartão de topo enquanto o chat não for
     aberto. Só quando não há assuntos por resolver — uma intervenção pesa
     mais do que um balanço. */
  const raceBalance = useMemo(
    () => (pendingTopics > 0 ? null : pendingRaceBalance({ runs, meals, gymSessions, bodyAssessments, raceEvents, profile })),
    [pendingTopics, runs, meals, gymSessions, bodyAssessments, raceEvents, profile],
  );

  const openCoach = () => {
    if (interventionPending) setCoachIntent({ kind: 'proactive_intervention', reason: profile?.coach_intervention_reason || null });
    setActiveTab('coach');
  };

  // "Registar sessão" não marca logo — deixa isso ao ecrã de registo, que
  // grava o completePlanItem só depois de a corrida/sessão real estar
  // gravada (specs/plano-de-treino.md §5.2).
  const handleCompleteItem = (item) => {
    setPlanItemPrefill(item);
    if (item.kind === 'corrida') {
      setActiveTab('corrida');
      setOpenCreationMode('run');
    } else {
      setActiveTab('ginasio');
      setOpenCreationMode('workout');
    }
  };

  const createRace = () => setOpenCreationMode('race');
  // Registar a prova é abrir o registo de corrida em modo prova — o store
  // trata do prefill e do separador (specs/prova-concluida.md §3).
  const registerRace = (raceId) => useAppStore.getState().openRaceRun(raceId);
  const registerMeal = () => { setActiveTab('nutricao'); setOpenCreationMode('meal'); };
  const registerRun = () => { setActiveTab('corrida'); setOpenCreationMode('run'); };

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
      <CarolCard pendingTopics={pendingTopics} topic={raceBalance ? 'o balanço da prova' : null} onOpenCoach={openCoach} onDismissTopic={interventionPending ? () => setShowDismiss(true) : undefined} />

      <SectionLabel>O que faço hoje</SectionLabel>
      <DayPlanCard plans={coachPlans} planItems={coachPlanItems} raceEvents={raceEvents} onComplete={handleCompleteItem} onNav={setActiveTab} onOpenMeals={setMealDay} onOpenRace={setEditingRaceId} />

      <SectionLabel>Para onde vou</SectionLabel>
      <RaceCard raceEvents={raceEvents} runs={runs} profile={profile} onOpenRace={setEditingRaceId} onCreateRace={createRace} onRegisterRace={registerRace} />

      <SectionLabel>Como estou</SectionLabel>
      <StatusCard rings={rings} />

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
            O aviso deixa de aparecer no Início. Podes voltar a falar com a Carol no Chat sempre que quiseres.
          </p>
        </Dialog>
      )}

      <CoachInsightButton insights={homeInsights} onClick={() => setShowInsights(true)} />
      {showInsights && <CoachInsightModal insights={homeInsights} onClose={() => setShowInsights(false)} />}
    </div>
  );
}
