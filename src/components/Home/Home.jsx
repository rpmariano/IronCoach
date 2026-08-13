import React, { useMemo, useState, useRef } from 'react';
import { useAppStore } from '../../store';
import { Flag, ChevronLeft, ChevronRight } from 'lucide-react';
import PremiumNextRaceCard from '../GraphicsLibrary/NextRaceCard';
import HydrationOptionA from '../GraphicsLibrary/HydrationOptionA';
import NutritionOptionA from '../GraphicsLibrary/NutritionOptionA';
import WeeklyPlanCard from './WeeklyPlanCard';
import CoachDailySummaryCard from './CoachDailySummaryCard';
import { useToast } from '../shared/ToastProvider';

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

// ─── Próxima Prova ───────────────────────────────────────────────────────────
function NextRaceCard({ raceEvents = [], onNav }) {
  const today = todayISO();
  const upcoming = raceEvents
    .filter(e => e.status !== 'concluida' && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef(null);

  const handleScroll = () => {
    if (scrollRef.current) {
      const index = Math.round(scrollRef.current.scrollLeft / scrollRef.current.offsetWidth);
      setCurrentIndex(index);
    }
  };

  const scrollTo = (index) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: index * scrollRef.current.offsetWidth, behavior: 'smooth' });
    }
  };

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
    <div className="flex flex-col gap-3">
      {upcoming.length > 1 && (
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-1.5">
            {upcoming.map((_, idx) => (
              <div 
                key={idx} 
                className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentIndex ? 'w-4 bg-[var(--accent)]' : 'w-1.5 bg-[var(--accent)] opacity-30'}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => scrollTo(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400 disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <button 
              onClick={() => scrollTo(Math.min(upcoming.length - 1, currentIndex + 1))}
              disabled={currentIndex === upcoming.length - 1}
              className="w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-sm text-[var(--accent)] disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1"
        style={{ scrollBehavior: 'smooth' }}
      >
        {upcoming.map(next => {
          const daysUntil = Math.max(0, Math.round((new Date(next.date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000));
          const maxDays = 84; 
          const progressPercentage = Math.max(0, Math.min(100, ((maxDays - daysUntil) / maxDays) * 100));
          const dateObj = new Date(next.date + 'T00:00:00');
          const formattedDate = dateObj.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' });

          return (
            <div 
              key={next.id} 
              className="w-full shrink-0 snap-center" 
              onClick={() => onNav('corrida')}
            >
              <div className="cursor-pointer active:scale-[0.99] transition-transform w-full px-1">
                <PremiumNextRaceCard 
                  title={next.name}
                  date={formattedDate}
                  location={next.location || 'Não definida'}
                  tag={next.race_type || 'Prova'}
                  daysRemaining={daysUntil}
                  progressPercentage={progressPercentage}
                />
              </div>
            </div>
          );
        })}
      </div>
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

// ─── Main Home component ──────────────────────────────────────────────────────
// Só os 3 cartões fixos (Próxima Prova, Nutrição, Água) + o Plano da semana.
// A antiga grelha personalizável foi removida — ver specs/plano-de-treino.md.
export default function Home() {
  const { showToast } = useToast();
  const {
    profile, meals, waterLogs, raceEvents, coachPlans, coachPlanItems,
    setActiveTab, setPlanItemPrefill, completePlanItem, cancelPlanItem,
    completeMealPlanItem, cancelMealPlanItem,
    addWaterLog
  } = useAppStore();

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

  const handleCancelItem = (item) => {
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

  return (
    <div className="flex flex-col gap-6 fade-in pb-8">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--green)' }}>Início</h2>

      {/* Resumo do Coach — ver specs/plano-de-treino.md §11 */}
      <CoachDailySummaryCard />

      {/* Próxima Prova */}
      <NextRaceCard raceEvents={raceEvents} onNav={handleNav} />

      {/* Nutrição Hero — sempre visível */}
      <NutritionOptionA meals={meals} profile={profile} onNav={handleNav} />

      {/* Água — sempre visível */}
      <WaterHomeCard waterLogs={waterLogs} profile={profile} onNav={handleNav} onLogWater={handleLogWater} />

      {/* Plano — aceitar/recusar vive no chat do Coach; aqui é só consulta
          do plano aceite + registo de execução (specs/plano-de-treino.md) */}
      <WeeklyPlanCard
        plans={coachPlans}
        planItems={coachPlanItems}
        onComplete={handleCompleteItem}
        onCancel={handleCancelItem}
        onCompleteMeal={handleCompleteMeal}
        onCancelMeal={handleCancelMeal}
        onNav={handleNav}
      />
    </div>
  );
}
