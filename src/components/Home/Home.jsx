import React, { useMemo, useState } from 'react';
import { useAppStore } from '../../store';
import { Flag, Bell, Check, X as XIcon, Dumbbell as DumbbellIcon, Footprints } from 'lucide-react';

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
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0];
  const color = 'var(--color-warn)';

  if (!next) return (
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

  const daysUntil = Math.round((new Date(next.date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
  const countLabel = daysUntil === 0 ? 'Hoje!' : daysUntil === 1 ? '1 dia' : `${daysUntil} dias`;
  const countColor = daysUntil === 0 ? 'var(--color-error)' : daysUntil <= 7 ? 'var(--color-alert)' : 'var(--text-main)';

  return (
    <button onClick={() => onNav('corrida')} className="w-full text-left rounded-2xl p-3.5 active:scale-[0.98] transition" style={statCardBg(color)}>
      <div className="flex items-center justify-between mb-1.5">
        <h2 className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--green)' }}>Próxima Prova</h2>
        {next.race_type && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color: `color-mix(in srgb, ${color} 45%, var(--text-main))` }}>
            {next.race_type}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: 'var(--text-main)' }}>{next.name}</p>
          <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--green)' }}>
            {next.date}{next.location ? ` · ${next.location}` : ''}
          </p>
        </div>
        <p className="text-xl font-extrabold leading-none shrink-0" style={{ color: countColor }}>{countLabel}</p>
      </div>
    </button>
  );
}

// ─── Nutrição Hero ─────────────────────────────────────────────────────────
function NutritionHeroCard({ meals = [], profile = {}, onNav }) {
  const today = todayISO();
  const calGoal = Number(profile?.calorie_goal) || 0;
  const proteinGoal = Number(profile?.protein_goal) || 0;
  const totals = useMemo(() => {
    return meals.filter(m => m.date === today).reduce((acc, m) => ({
      calories: acc.calories + (m.calories || 0),
      protein: acc.protein + (m.protein || 0),
    }), { calories: 0, protein: 0 });
  }, [meals, today]);

  const remaining = calGoal - totals.calories;
  const pct = calGoal > 0 ? (totals.calories / calGoal) * 100 : 0;
  const mealsToday = meals.filter(m => m.date === today).length;

  let status = null;
  if (calGoal > 0 && totals.calories > calGoal) status = { color: 'var(--color-error)', label: 'Calorias acima da meta' };
  else if (proteinGoal > 0 && totals.protein >= proteinGoal) status = { color: 'var(--color-success)', label: 'Proteína no alvo' };
  else if (proteinGoal > 0) status = { color: 'var(--color-warn)', label: `Faltam ${(proteinGoal - totals.protein).toFixed(0)}g de proteína` };

  const desc = calGoal > 0
    ? `${mealsToday} refeição(ões) registada(s) hoje. Estás a ${Math.round(Math.min(100, pct))}% da meta diária.`
    : `${mealsToday} refeição(ões) registada(s) hoje. Define a tua meta no Perfil.`;

  return (
    <button onClick={() => onNav('nutricao')} className="w-full text-left rounded-3xl p-5 active:scale-[0.99] transition" style={statCardBg('var(--accent)')}>
      <h2 className="text-[11px] font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--green)' }}>Hoje · Nutrição</h2>
      <div className="flex items-center gap-5">
        <div className="relative shrink-0" style={{ width: 104, height: 104 }}>
          <RingSvg pct={pct} size={104} stroke={9} color="var(--accent)" />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold leading-none" style={{ color: 'var(--text-main)' }}>{totals.calories.toFixed(0)}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide mt-1" style={{ color: 'var(--green)' }}>
              {calGoal > 0 ? `de ${calGoal.toFixed(0)} kcal` : 'kcal'}
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold leading-tight" style={{ color: 'var(--text-main)' }}>
            {calGoal > 0 ? (remaining >= 0 ? `Restam ${remaining.toFixed(0)} kcal` : `${Math.abs(remaining).toFixed(0)} kcal acima`) : 'Sem meta definida'}
          </p>
          <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--green)' }}>{desc}</p>
          {status && (
            <p className="flex items-center gap-1.5 mt-2.5 text-xs font-semibold" style={{ color: status.color }}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: status.color, opacity: 0.8 }} />
              {status.label}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Água Home card ───────────────────────────────────────────────────────────
function WaterHomeCard({ waterLogs = [], profile = {}, onNav, onLogWater }) {
  const today = todayISO();
  const goal = Number(profile?.water_goal_ml) || 2000;
  const total = useMemo(() => waterLogs.filter(w => w.date === today).reduce((s, w) => s + (w.amount_ml || 0), 0), [waterLogs, today]);
  const pct = goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : 0;

  return (
    <div onClick={() => onNav('nutricao')} role="button" tabIndex={0}
      className="water-home-card w-full text-left rounded-2xl p-3.5 relative overflow-hidden active:scale-[0.98] transition cursor-pointer"
      style={statCardBg('var(--blue)')}>
      <div className="water-glass-fill" style={{ height: `${pct}%` }}>
        <svg className="water-wave-svg" viewBox="0 0 200 20" preserveAspectRatio="none"><path d={WATER_WAVE_PATH_1} /></svg>
        <svg className="water-wave-svg w2" viewBox="0 0 200 20" preserveAspectRatio="none"><path d={WATER_WAVE_PATH_2} /></svg>
      </div>
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--green)' }}>Água hoje</h2>
          <p className="text-3xl font-black leading-none" style={{ color: 'var(--text-main)' }}>
            {total}<span className="text-sm font-bold" style={{ color: 'var(--green)' }}> /{goal} ml</span>
          </p>
          <p className="text-xs mt-1.5" style={{ color: 'var(--green)' }}>
            {goal > 0 && total >= goal ? 'Meta atingida! 🎉' : `${pct}% da meta diária`}
          </p>
        </div>
        <button onClick={e => e.stopPropagation()} className="tap-44 shrink-0 rounded-full flex items-center justify-center active:scale-90 transition"
          style={{ background: 'white', border: '1px solid color-mix(in srgb, var(--blue) 30%, transparent)' }}>
          <Bell size={16} style={{ color: 'var(--blue-dark)' }} />
        </button>
      </div>
      <div className="relative z-10 flex gap-2 mt-4">
        {WATER_QUICK_AMOUNTS.map(ml => (
          <button key={ml} onClick={e => { e.stopPropagation(); onLogWater(ml); }} type="button"
            className="tap-h-44 flex items-center justify-center text-[11px] font-semibold rounded-full px-4 active:scale-95 transition"
            style={{ color: '#334155', background: 'white', border: '1px solid color-mix(in srgb, var(--blue) 30%, transparent)' }}>
            +{ml}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Plano da semana ───────────────────────────────────────────────────────
// Ver specs/plano-de-treino.md. Ocupa o espaço da antiga grelha
// personalizável — essa deixou de fazer sentido com o plano acordado com o
// Coach a ocupar o mesmo lugar central do Início.
const WEEKDAY_LABELS_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function PlanItemRow({ item, onComplete, onCancel, readOnly = false }) {
  const isPast = item.planned_date < todayISO();
  const d = new Date(item.planned_date + 'T00:00:00');
  const dayLabel = WEEKDAY_LABELS_LONG[d.getDay()].slice(0, 3);
  const isRun = item.kind === 'corrida';

  const title = isRun
    ? [item.training_type ? item.training_type[0].toUpperCase() + item.training_type.slice(1) : 'Corrida',
        item.target_distance_km ? `${item.target_distance_km} km` : null]
        .filter(Boolean).join(' · ')
    : [item.categories?.length ? item.categories.join('/') : 'Ginásio',
        item.target_duration_min ? `${item.target_duration_min} min` : null]
        .filter(Boolean).join(' · ');

  return (
    <div className="flex items-center gap-2.5 py-2 border-b last:border-b-0" style={{ borderColor: 'var(--brd-800)' }}>
      <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: isRun ? 'color-mix(in srgb, var(--mod-corrida-to) 15%, transparent)' : 'color-mix(in srgb, var(--mod-ginasio-to) 15%, transparent)' }}>
        {isRun
          ? <Footprints size={15} style={{ color: 'var(--mod-corrida-to)' }} />
          : <DumbbellIcon size={15} style={{ color: 'var(--mod-ginasio-to)' }} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: isPast ? 'var(--color-error)' : 'var(--green)' }}>
          {dayLabel}{isPast ? ' · em atraso' : ''}
        </p>
        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-main)' }}>{title}</p>
        {item.notes && <p className="text-[10px] truncate" style={{ color: 'var(--green)' }}>{item.notes}</p>}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => onComplete(item)} aria-label="Marcar como concluído"
            className="tap-44 rounded-full flex items-center justify-center active:scale-90 transition"
            style={{ background: 'var(--color-success)', color: '#fff' }}>
            <Check size={16} />
          </button>
          <button onClick={() => onCancel(item)} aria-label="Cancelar este treino"
            className="tap-44 rounded-full flex items-center justify-center active:scale-90 transition"
            style={{ background: 'rgba(15,23,42,0.08)', color: 'var(--green)' }}>
            <XIcon size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// Proposta ainda por aceitar — o coach criou-a no chat, o atleta decide aqui.
// Enquanto 'proposto', os treinos não contam para nada (nem aparecem como
// treinos a fazer, nem ajustam objetivos de nutrição).
function PlanProposalCard({ plan, items, onRespond }) {
  const its = items
    .filter(i => i.plan_id === plan.id)
    .sort((a, b) => a.planned_date.localeCompare(b.planned_date));

  return (
    <div className="rounded-2xl p-3.5" style={statCardBg('var(--mod-coach-to)')}>
      <h2 className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--green)' }}>
        O Coach propôs um plano
      </h2>
      {plan.summary && <p className="text-xs mb-2" style={{ color: 'var(--text-main)' }}>{plan.summary}</p>}
      <div className="mb-3">
        {its.map(item => (
          <PlanItemRow key={item.id} item={item} readOnly />
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => onRespond(plan.id, true)}
          className="tap-h-44 flex-1 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition"
          style={{ background: 'var(--color-success)', color: '#fff' }}>
          <Check size={15} /> Aceitar
        </button>
        <button onClick={() => onRespond(plan.id, false)}
          className="tap-h-44 flex-1 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition"
          style={{ background: 'rgba(15,23,42,0.08)', color: 'var(--green)' }}>
          <XIcon size={15} /> Recusar
        </button>
      </div>
    </div>
  );
}

function WeeklyPlanCard({ plans = [], planItems = [], onComplete, onCancel, onRespond, onNav }) {
  // Uma proposta por aceitar tem precedência — mostra-se essa em vez da lista
  // de treinos, para a decisão não ficar escondida.
  const proposal = plans.find(p => p.status === 'proposto');
  if (proposal) {
    return <PlanProposalCard plan={proposal} items={planItems} onRespond={onRespond} />;
  }

  // Só itens de planos aceites — um plano recusado deixa os itens em
  // 'pendente' na BD, mas nunca devem aparecer como treinos a fazer.
  const acceptedPlanIds = new Set(plans.filter(p => p.status === 'aceite').map(p => p.id));
  const pending = planItems
    .filter(i => i.status === 'pendente' && acceptedPlanIds.has(i.plan_id))
    .sort((a, b) => a.planned_date.localeCompare(b.planned_date));

  if (pending.length === 0) {
    return (
      <button onClick={() => onNav('coach')} className="w-full text-left rounded-2xl p-3.5 active:scale-[0.98] transition" style={statCardBg('var(--mod-coach-to)')}>
        <h2 className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--green)' }}>Plano da semana</h2>
        <p className="text-xs" style={{ color: 'var(--green)' }}>
          Sem treinos acordados. Pede ao Coach um plano para a próxima semana.
        </p>
      </button>
    );
  }

  return (
    <div className="rounded-2xl p-3.5" style={statCardBg('var(--mod-coach-to)')}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--green)' }}>Plano da semana</h2>
        <button onClick={() => onNav('coach')} className="text-[10px] font-semibold" style={{ color: 'var(--mod-coach-to)' }}>Ver no Coach</button>
      </div>
      <div>
        {pending.map(item => (
          <PlanItemRow key={item.id} item={item} onComplete={onComplete} onCancel={onCancel} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Home component ──────────────────────────────────────────────────────
// Só os 3 cartões fixos (Próxima Prova, Nutrição, Água) + o Plano da semana.
// A antiga grelha personalizável foi removida — ver specs/plano-de-treino.md.
export default function Home() {
  const {
    profile, meals, waterLogs, raceEvents, coachPlans, coachPlanItems,
    setActiveTab, setPlanItemPrefill, completePlanItem, cancelPlanItem, respondToPlan,
  } = useAppStore();
  const [localWaterLogs, setLocalWaterLogs] = useState([]);

  const effectiveWaterLogs = [...(waterLogs || []), ...localWaterLogs];

  const handleNav = (tab) => setActiveTab(tab);

  const handleLogWater = (ml) => {
    const tempLog = { id: `__tmp_${Date.now()}`, date: todayISO(), amount_ml: ml };
    setLocalWaterLogs(prev => [tempLog, ...prev]);
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
    }
  };

  return (
    <div className="space-y-4 fade-in">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--green)' }}>Início</h2>

      {/* Próxima Prova */}
      <NextRaceCard raceEvents={raceEvents} onNav={handleNav} />

      {/* Nutrição Hero — sempre visível */}
      <NutritionHeroCard meals={meals} profile={profile} onNav={handleNav} />

      {/* Água — sempre visível */}
      <WaterHomeCard waterLogs={effectiveWaterLogs} profile={profile} onNav={handleNav} onLogWater={handleLogWater} />

      {/* Plano da semana — ver specs/plano-de-treino.md */}
      <WeeklyPlanCard
        plans={coachPlans}
        planItems={coachPlanItems}
        onComplete={handleCompleteItem}
        onCancel={handleCancelItem}
        onRespond={respondToPlan}
        onNav={handleNav}
      />
    </div>
  );
}
