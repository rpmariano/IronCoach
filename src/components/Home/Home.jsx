import React, { useMemo, useState, useRef } from 'react';
import Card from '../shared/Card';
import { useAppStore } from '../../store';
import { Flag, ChevronLeft, ChevronRight, Bot } from 'lucide-react';
import PremiumNextRaceCard from '../GraphicsLibrary/NextRaceCard';
import HydrationOptionA from '../GraphicsLibrary/HydrationOptionA';
import NutritionOptionA from '../GraphicsLibrary/NutritionOptionA';
import WeeklyPlanCard from './WeeklyPlanCard';
import CoachDailySummaryCard from './CoachDailySummaryCard';
import { useToast } from '../shared/ToastProvider';
import { useCarouselHaptics } from '../../utils/haptics';
import { assessRaceViability, recentWeeklyVolume, categorizeDistance, MIN_PREP_WEEKS } from '../../utils/raceViability';
import { calculateRaceTrainingPlan, formatDatePTShort } from '../../utils/racePlanEngine';
import { raceDistanceLabel } from '../../utils/run';
import { detectCoachInsights, calculateReadinessIndex } from '../../utils/biEngine';
import CoachInsightButton from '../BI/CoachInsightButton';
import CoachInsightModal from '../BI/CoachInsightModal';

// ─── helpers ──────────────────────────────────────────────────────────────────
function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function statCardBg(color) {
  return {
    background: `radial-gradient(130% 150% at 100% 0%, color-mix(in srgb, ${color} 10%, transparent) 0%, transparent 60%), linear-gradient(165deg, #ffffff, var(--surf-800))`,
    borderStyle: 'solid',
    borderWidth: '1px 1px 1px 3px',
    borderColor: `var(--brd-700) var(--brd-700) var(--brd-700) color-mix(in srgb, ${color} 70%, var(--brd-700))`,
    boxShadow: '0 1px 2px rgba(15,23,42,0.06), 0 4px 14px -5px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.6)',
  };
}

const WATER_WAVE_PATH_1 = "M0 10 C 25 20 25 0 50 10 S 75 0 100 10 S 125 20 150 10 S 175 0 200 10 V20 H0 Z";
const WATER_WAVE_PATH_2 = "M0 10 C 25 0 25 20 50 10 S 75 20 100 10 S 125 0 150 10 S 175 20 200 10 V20 H0 Z";
const WATER_QUICK_AMOUNTS = [200, 250, 300];

// ─── SVG ring ────────────────────────────────────────────────────────────────
function RingSvg({ pct, size = 96, stroke = 8, color = 'var(--accent)' }) {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.max(0, Math.min(100, pct || 0)) / 100;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(15,23,42,0.10)" strokeWidth={stroke} />
      {dash > 0.5 && (
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray .4s ease' }} />
      )}
    </svg>
  );
}

// Valores válidos para o semáforo de prontidão da Carol — fora do componente
// para evitar recriar o array a cada render/iteração do .map().
const VALID_READINESS_LEVELS = ['green', 'yellow', 'red'];

// ─── Próxima Prova ───────────────────────────────────────────────────────────
function NextRaceCard({ raceEvents = [], runs = [], meals = [], bodyAssessments = [], gymSessions = [], profile = {}, onNav, onEditRace }) {
  const { dailySummary } = useAppStore();
  const today = todayISO();
  const upcoming = raceEvents
    .filter(e => e.status !== 'concluida' && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  
  const weeklyVol = useMemo(() => recentWeeklyVolume(runs, today), [runs, today]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef(null);
  const { handleScroll, handleTouchMove, scrollTo } = useCarouselHaptics(
    scrollRef,
    upcoming.length,
    currentIndex,
    setCurrentIndex
  );

  const color = 'var(--color-warn)';

  if (upcoming.length === 0) return (
    <button onClick={() => onNav('corrida')} className="w-full text-left rounded-2xl p-3.5 active:scale-[0.98] transition" style={statCardBg(color)}>
      <h2 className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--green)' }}>Próxima Prova</h2>
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}1a` }}>
          <Flag size={16} style={{ color }} />
        </span>
        <p className="text-xs" style={{ color: 'var(--green)' }}>Sem provas agendadas — toca para adicionar uma na Agenda.</p>
      </div>
    </button>
  );

  return (
    <div className="relative">
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchMove={handleTouchMove}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
        style={{ scrollBehavior: 'smooth' }}
      >
        {upcoming.map(next => {
          const plan = calculateRaceTrainingPlan({
            race: next,
            profile,
            runs,
            todayISO: today,
          });

          // Calcula a Prontidão Global especificamente para esta prova (Pilar Tático)
          const readinessGlobal = calculateReadinessIndex(runs, meals, bodyAssessments, gymSessions, profile, next);

          const formattedDate = formatDatePTShort(plan.raceDate);
          const daysUntil = Math.max(0, plan.daysToRace);

          // Usar a cor que vem da Prontidão Global (que mapeia high=green, medium=yellow, low=red)
          const readinessColor = readinessGlobal.level === 'high' ? 'green' : readinessGlobal.level === 'medium' ? 'yellow' : 'red';
          const readinessReason = `Score global de ${readinessGlobal.score}%. ${plan.carolAnalysis?.overviewText || ''}`;

          return (
            <div
              key={next.id}
              className="relative w-full h-full shrink-0 snap-center"
              onClick={() => {
                if (onEditRace) onEditRace(next.id);
              }}
            >
              <div className="cursor-pointer active:scale-[0.99] transition-transform w-full h-full">
                <PremiumNextRaceCard
                  title={next.name}
                  date={formattedDate}
                  location={next.location || 'Não definida'}
                  tag={next.race_type || 'Prova'}
                  distance={raceDistanceLabel(next.distance_km)}
                  priority={next.race_priority}
                  daysRemaining={daysUntil}
                  progressPercentage={plan.progressPercentage}
                  readiness={readinessColor}
                  readinessReason={readinessReason}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Pontos do carrossel FORA do cartão, em fluxo normal — antes ficavam
          sobrepostos ao cartão translúcido (absolute bottom-4), o que
          obrigava a reservar padding extra só para eles. Sem conteúdo
          colorido nessa faixa reservada, lia-se como uma caixa cinzenta à
          parte. Também deixou de haver um <div> de pontos repetido por
          prova (um por slide, todos empilhados) — passa a ser um só. */}
      {upcoming.length > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none z-10">
          <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/5 shadow-sm px-2 py-1.5 rounded-full pointer-events-auto">
            {upcoming.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => scrollTo(idx)}
                aria-label={`Ver prova ${idx + 1}`}
                className={`h-1.5 shrink-0 rounded-full transition-all duration-300 ${idx === currentIndex ? 'w-4 bg-slate-300' : 'w-1.5 bg-slate-300 opacity-40'}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Água Home card ───────────────────────────────────────────────────────────
function WaterHomeCard({ waterLogs = [], profile = {}, onNav, onLogWater }) {
  const today = todayISO();
  const goal = Number(profile?.water_goal_ml) || 2000;
  const total = useMemo(() => waterLogs.filter(w => w.date === today).reduce((s, w) => s + (w.amount_ml || 0), 0), [waterLogs, today]);

  return (
    <div 
      onClick={() => onNav('nutricao')} 
      role="button" tabIndex={0}
      className="cursor-pointer transition active:scale-[0.99] w-full"
    >
      <HydrationOptionA 
        currentMl={total} 
        goalMl={goal} 
        onLogWater={onLogWater}
        profile={profile}
      />
    </div>
  );
}

// ─── Nutrição & Água Carousel ────────────────────────────────────────────────
function NutritionWaterCarousel({ meals, waterLogs, profile, onNav, onLogWater }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef(null);
  const { handleScroll, handleTouchMove, scrollTo } = useCarouselHaptics(
    scrollRef,
    2,
    currentIndex,
    setCurrentIndex
  );

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchMove={handleTouchMove}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="w-full h-full shrink-0 snap-center">
          <WaterHomeCard waterLogs={waterLogs} profile={profile} onNav={onNav} onLogWater={onLogWater} />
        </div>
        <div className="w-full h-full shrink-0 snap-center">
          <NutritionOptionA meals={meals} profile={profile} onNav={onNav} />
        </div>
      </div>

      
      <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none z-10">
        <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md border border-white/5 shadow-sm px-2 py-1.5 rounded-full pointer-events-auto">
          {[0, 1].map((idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => scrollTo(idx)}
              aria-label={`Ver cartão ${idx + 1}`}
              className={`h-1.5 shrink-0 rounded-full transition-all duration-300 ${idx === currentIndex ? 'w-4 bg-slate-300' : 'w-1.5 bg-slate-300 opacity-40'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Home component ──────────────────────────────────────────────────────
// Só os 3 cartões fixos (Próxima Prova, Nutrição, Água) + o Plano da semana.
// A antiga grelha personalizável foi removida — ver specs/plano-de-treino.md.
export default function Home() {
  const { showToast } = useToast();
  const {
    profile, meals, waterLogs, raceEvents, coachPlans, coachPlanItems, runs, gymSessions, bodyAssessments, insightStates, shoes,
    setActiveTab, setPlanItemPrefill, completePlanItem, cancelPlanItem,
    completeMealPlanItem, cancelMealPlanItem,
    addWaterLog, setEditingRaceId
  } = useAppStore();

  const [showInsights, setShowInsights] = useState(false);

  const homeInsights = useMemo(() => {
    const all = detectCoachInsights({ runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes }, profile);
    return all.filter(i => insightStates[i.id] !== 'understood' && i.module === 'coach');
  }, [runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes, profile, insightStates]);

  const handleNav = (tab) => setActiveTab(tab);

  const handleLogWater = (ml) => {
    if (profile?.id) {
      addWaterLog(ml, profile.id);
    }
  };

  // "Concluir" não marca logo — deixa isso ao ecrã de registo, que grava o
  // completePlanItem só depois de a corrida/sessão real estar gravada (ver
  // RunRegistration/GymRegistration). Aqui só passamos o item a pré-preencher
  // e navegamos para o ecrã certo — specs/plano-de-treino.md §5.2.
  const handleCompleteItem = (item) => {
    setPlanItemPrefill(item);
    if (item.kind === 'corrida') {
      setActiveTab('corrida');
      useAppStore.getState().setOpenCreationMode('run');
    } else {
      setActiveTab('ginasio');
      useAppStore.getState().setOpenCreationMode('workout');
    }
  };

  const handleCancelItem = async (item) => {
    if (item.isRace) {
      if (window.confirm('Cancelar (eliminar) esta prova da agenda?')) {
        const id = item.id.replace('race-', '');
        const previous = [...raceEvents];
        useAppStore.setState({ raceEvents: raceEvents.filter(r => r.id !== id) });
        try {
          const { supabase } = await import('../../lib/supabase');
          const { error } = await supabase.from('race_events').delete().eq('id', id);
          if (error) throw error;
          showToast('Prova cancelada');
        } catch (err) {
          console.error(err);
          useAppStore.setState({ raceEvents: previous });
          showToast('Erro ao cancelar prova');
        }
      }
      return;
    }

    if (window.confirm('Cancelar este treino do plano? Deixa de contar para os objetivos de nutrição do dia.')) {
      cancelPlanItem(item.id);
      showToast('Treino cancelado');
    }
  };

  const handleCompleteMeal = async (item) => {
    const success = await completeMealPlanItem(item.id);
    if (success) {
      showToast('Sugestão alimentar marcada como seguida');
    } else {
      showToast('Erro: Falha na base de dados (Corre a migração SQL!)');
    }
  };

  const handleCancelMeal = async (item) => {
    const success = await cancelMealPlanItem(item.id);
    if (success) {
      showToast('Sugestão alimentar marcada como não seguida');
    } else {
      showToast('Erro: Falha na base de dados (Corre a migração SQL!)');
    }
  };

  const modifiedPlanItems = useMemo(() => {
    const raceDates = new Set(raceEvents.map(r => r.date));
    
    // Filter out coach items that fall on a race date
    const itemsWithoutRaces = coachPlanItems.filter(item => !raceDates.has(item.planned_date));

    // Convert races into mock planItems
    const racePlanItems = raceEvents.map(race => ({
      id: `race-${race.id}`,
      // Just pick an active plan so it renders; if none, it's fine, it won't render unless we fake a plan too.
      // But actually computeAcceptedWindow filters planItems by plan_id of ACCEPTED plans.
      // So we MUST assign it to an accepted plan!
      plan_id: coachPlans.find(p => p.status === 'aceite' && p.period_start <= race.date && p.period_end >= race.date)?.id 
               || coachPlans.find(p => p.status === 'aceite')?.id, 
      date: race.date,
      planned_date: race.date,
      kind: 'corrida',
      isRace: true, 
      title: race.name, 
      training_type: 'competicao', 
      target_distance_km: race.distance_km,
      target_duration: race.target_time_seconds,
      elevation_gain_m: race.elevation_gain_m,
      race_type: race.race_type,
      status: race.status === 'concluida' ? 'concluido' : 'pendente',
      notes: race.notes
    }));

    // Only include races that actually got assigned to a plan (otherwise they won't render anyway)
    return [...itemsWithoutRaces, ...racePlanItems.filter(r => r.plan_id)];
  }, [coachPlanItems, raceEvents, coachPlans]);

  return (
    <div className="flex flex-col gap-6 fade-in pb-8">
      {/* Resumo do Coach — ver specs/plano-de-treino.md §11 */}
      <CoachDailySummaryCard />

      {/* Próxima Prova */}
      <NextRaceCard 
        raceEvents={raceEvents} 
        runs={runs} 
        meals={meals}
        bodyAssessments={bodyAssessments}
        gymSessions={gymSessions}
        profile={profile} 
        onNav={handleNav} 
        onEditRace={setEditingRaceId} 
      />

      {/* Nutrição & Água Carousel */}
      <NutritionWaterCarousel 
        meals={meals} 
        waterLogs={waterLogs} 
        profile={profile} 
        onNav={handleNav} 
        onLogWater={handleLogWater} 
      />

      {/* Plano — aceitar/recusar vive no chat do Coach; aqui é só consulta
          do plano aceite + registo de execução (specs/plano-de-treino.md) */}
      <WeeklyPlanCard
        plans={coachPlans}
        planItems={modifiedPlanItems}
        onComplete={handleCompleteItem}
        onCancel={handleCancelItem}
        onCompleteMeal={handleCompleteMeal}
        onCancelMeal={handleCancelMeal}
        onNav={handleNav}
      />

      {/* Botão de Intervenção Proativa do Coach */}
      {(profile?.coach_intervention_status === 'needed' || profile?.coach_intervention_status === 'in_progress') && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-sm">
          <button
            onClick={() => handleNav('coach')}
            className="w-full shadow-lg shadow-orange-500/20 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 active:scale-[0.98] transition-transform py-3 px-4 rounded-xl flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-full relative">
                <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-600 border border-white rounded-full animate-pulse"></span>
                <Bot size={20} className="text-white" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-white font-bold text-sm leading-tight">A Carol precisa de falar contigo</span>
                <span className="text-orange-100 text-xs mt-0.5">O teu plano requer atenção</span>
              </div>
            </div>
            <span className="text-white bg-black/20 p-1.5 rounded-full">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </span>
          </button>
        </div>
      )}

      <CoachInsightButton insights={homeInsights} onClick={() => setShowInsights(true)} />
      {showInsights && (
        <CoachInsightModal insights={homeInsights} onClose={() => setShowInsights(false)} />
      )}
    </div>
  );
}
