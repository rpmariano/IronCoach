import React, { useMemo, useState, useRef } from 'react';
import { useAppStore } from '../../store';
import { SlidersHorizontal, Flag, Bell, X, Egg, Wheat, Droplets, Scale, Percent, Activity, Dumbbell, Droplet } from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────
function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function currentWeekDates() {
  const sunday = new Date();
  sunday.setDate(sunday.getDate() - sunday.getDay());
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
  return { dates, labels: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] };
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

// Card definitions — mirrors HOME_CARD_DEFS + CANONICAL_HOME_ORDER from legacy
const HOME_CARD_DEFS = [
  { key: 'protein_today',  label: 'Proteína hoje',    module: 'Nutrição', size: 'half', icon: Egg },
  { key: 'carbs_today',    label: 'Hidratos hoje',    module: 'Nutrição', size: 'half', icon: Wheat },
  { key: 'fat_today',      label: 'Gordura hoje',     module: 'Nutrição', size: 'half', icon: Droplets },
  { key: 'weight_kg',      label: 'Peso',             module: 'Corpo',    size: 'half', icon: Scale },
  { key: 'body_fat_pct',   label: 'Gordura corporal', module: 'Corpo',    size: 'half', icon: Percent },
  { key: 'bmi',            label: 'IMC',              module: 'Corpo',    size: 'half', icon: Activity },
  { key: 'muscle_mass_kg', label: 'Massa muscular',   module: 'Corpo',    size: 'half', icon: Dumbbell },
  { key: 'body_water_pct', label: 'Água corporal',    module: 'Corpo',    size: 'half', icon: Droplet },
  { key: 'gym_sessions',   label: 'Treinos (semana)', module: 'Ginásio',  size: 'full' },
  { key: 'gym_volume',     label: 'Volume (semana)',  module: 'Ginásio',  size: 'full' },
  { key: 'corrida_km',     label: 'Distância (semana)', module: 'Corrida', size: 'full' },
  { key: 'corrida_pace',   label: 'Melhor Pace',      module: 'Corrida',  size: 'full' },
];
const CANONICAL_HOME_ORDER = HOME_CARD_DEFS.map(d => d.key);
const DEFAULT_HOME_LAYOUT = ['weight_kg', 'body_fat_pct', 'protein_today', 'corrida_km', 'corrida_pace', 'gym_sessions', 'gym_volume'];

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

// ─── Nutrient mini card ──────────────────────────────────────────────────────
function NutrientMiniCard({ label, value, goal, color, onNav }) {
  const pct = goal > 0 ? (value / goal) * 100 : 0;
  return (
    <button onClick={onNav} className="text-left rounded-2xl p-3.5 active:scale-[0.98] transition w-full" style={statCardBg(color)}>
      <h2 className="text-[10px] font-semibold uppercase tracking-wide mb-2 truncate" style={{ color: 'var(--green)' }}>{label}</h2>
      <div className="flex items-center gap-3">
        <div className="relative shrink-0" style={{ width: 52, height: 52 }}>
          <RingSvg pct={pct} size={52} stroke={5} color={color} />
        </div>
        <div className="min-w-0">
          <p className="text-base font-extrabold leading-none" style={{ color: 'var(--text-main)' }}>
            {value.toFixed(0)}<span className="text-xs font-semibold" style={{ color: 'var(--green)' }}>g</span>
          </p>
          <p className="text-[10px] mt-1 truncate" style={{ color: 'var(--green)' }}>
            {goal > 0 ? `meta ${goal.toFixed(0)}g` : 'Sem meta'}
          </p>
        </div>
      </div>
    </button>
  );
}

// ─── Body mini card ──────────────────────────────────────────────────────────
function BodyMiniCard({ label, value, prevValue, goal, unit, color, dec = 1, onNav }) {
  const hasVal = value !== null && value !== undefined;
  const hasGoal = hasVal && goal > 0;
  const pct = hasGoal ? Math.max(0, Math.min(100, 100 - Math.abs(value - goal) / goal * 100)) : 0;
  const delta = (prevValue !== null && prevValue !== undefined && hasVal) ? (value - prevValue) : null;

  return (
    <button onClick={onNav} className="text-left rounded-2xl p-3.5 active:scale-[0.98] transition w-full" style={statCardBg(color)}>
      <h2 className="text-[10px] font-semibold uppercase tracking-wide mb-2 truncate" style={{ color: 'var(--green)' }}>{label}</h2>
      <div className="flex items-center gap-3">
        <div className="relative shrink-0" style={{ width: 52, height: 52 }}>
          <RingSvg pct={hasGoal ? pct : 0} size={52} stroke={5} color={color} />
        </div>
        <div className="min-w-0">
          <p className="text-base font-extrabold leading-none" style={{ color: 'var(--text-main)' }}>
            {hasVal ? `${value}` : '—'}<span className="text-xs font-semibold" style={{ color: 'var(--green)' }}>{unit}</span>
          </p>
          <p className="text-[10px] mt-1 truncate" style={{ color: 'var(--green)' }}>{hasGoal ? `meta ${goal}${unit}` : 'Sem objetivo'}</p>
          {delta !== null && (
            <p className="text-[10px] font-semibold mt-0.5" style={{ color: delta < 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
              {delta < 0 ? '▼' : '▲'} {Math.abs(delta).toFixed(dec)}{unit}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Gym streak card ─────────────────────────────────────────────────────────
function GymSessionsCard({ gymSessions = [], onNav }) {
  const { dates: days, labels } = currentWeekDates();
  const today = todayISO();
  const trainedDates = new Set(gymSessions.map(s => s.date));
  const count = gymSessions.filter(s => days.includes(s.date)).length;

  return (
    <button onClick={onNav} className="w-full text-left rounded-2xl p-3.5 active:scale-[0.98] transition" style={statCardBg('var(--mod-ginasio-to)')}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--green)' }}>Ginásio · Esta semana</h2>
        <p className="text-xs font-bold" style={{ color: 'var(--text-main)' }}>{count} {count === 1 ? 'sessão' : 'sessões'}</p>
      </div>
      <div className="flex items-center gap-1.5">
        {days.map((d, i) => {
          const trained = trainedDates.has(d);
          const isToday = d === today;
          return (
            <div key={d} className="flex flex-col items-center gap-1 flex-1">
              <div className="w-full aspect-square rounded-lg flex items-center justify-center"
                style={{
                  background: trained ? 'linear-gradient(135deg,var(--mod-ginasio-from),var(--mod-ginasio-to))' : 'rgba(15,23,42,0.10)',
                  boxShadow: isToday && !trained ? 'inset 0 0 0 1.5px #60a5fa' : undefined,
                }}>
                {trained && <span className="text-white text-[10px] font-bold">✓</span>}
              </div>
              <span className="text-[10px]" style={{ color: isToday ? 'var(--text-main)' : 'var(--green)', fontWeight: isToday ? 700 : 400 }}>{labels[i]}</span>
            </div>
          );
        })}
      </div>
    </button>
  );
}

// ─── Gym volume card ─────────────────────────────────────────────────────────
function GymVolumeCard({ gymSessions = [], onNav }) {
  const { dates: days, labels } = currentWeekDates();
  const today = todayISO();
  const byDay = {};
  gymSessions.forEach(s => {
    const vol = (s.logs || []).reduce((sum, l) => sum + ((l.weight || 0) * (l.reps || 0) * (l.sets || 1)), 0);
    byDay[s.date] = (byDay[s.date] || 0) + vol;
  });
  const perDay = days.map(d => byDay[d] || 0);
  const total = perDay.reduce((a, b) => a + b, 0);
  const maxDay = Math.max(...perDay, 1);

  return (
    <button onClick={onNav} className="w-full text-left rounded-2xl p-3.5 active:scale-[0.98] transition" style={statCardBg('var(--mod-ginasio-to)')}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--green)' }}>Ginásio · Volume</h2>
      </div>
      <p className="text-2xl font-extrabold leading-none" style={{ color: 'var(--text-main)' }}>
        {Math.round(total)}<span className="text-xs font-semibold" style={{ color: 'var(--green)' }}> kg</span>
      </p>
      <p className="text-[10px] mt-1 mb-3" style={{ color: 'var(--green)' }}>esta semana</p>
      <div className="flex items-end gap-1.5" style={{ height: 28 }}>
        {perDay.map((kg, i) => (
          <div key={i} className="flex-1 rounded-sm" style={{ height: kg > 0 ? Math.max(4, kg / maxDay * 28) : 3, background: kg > 0 ? 'var(--mod-ginasio-to)' : 'rgba(15,23,42,0.10)' }} />
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        {days.map((d, i) => (
          <span key={d} className="flex-1 text-center text-[10px]" style={{ color: d === today ? 'var(--text-main)' : 'var(--green)', fontWeight: d === today ? 700 : 400 }}>{labels[i]}</span>
        ))}
      </div>
    </button>
  );
}

// ─── Run km card ─────────────────────────────────────────────────────────────
function RunKmCard({ runs = [], onNav }) {
  const { dates: days, labels } = currentWeekDates();
  const today = todayISO();
  const perDay = days.map(d => runs.filter(r => r.date === d).reduce((s, r) => s + (r.distance_km || 0), 0));
  const weekKm = perDay.reduce((a, b) => a + b, 0);
  const maxDay = Math.max(...perDay, 0.1);

  return (
    <button onClick={onNav} className="w-full text-left rounded-2xl p-3.5 active:scale-[0.98] transition" style={statCardBg('var(--mod-corrida-to)')}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--green)' }}>Corrida · Distância</h2>
      </div>
      <p className="text-2xl font-extrabold leading-none" style={{ color: 'var(--text-main)' }}>
        {weekKm.toFixed(1)}<span className="text-xs font-semibold" style={{ color: 'var(--green)' }}> km</span>
      </p>
      <p className="text-[10px] mt-1 mb-3" style={{ color: 'var(--green)' }}>esta semana</p>
      <div className="flex items-end gap-1.5" style={{ height: 28 }}>
        {perDay.map((km, i) => (
          <div key={i} className="flex-1 rounded-sm" style={{ height: km > 0 ? Math.max(4, km / maxDay * 28) : 3, background: km > 0 ? 'var(--mod-corrida-to)' : 'rgba(15,23,42,0.10)' }} />
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        {days.map((d, i) => (
          <span key={d} className="flex-1 text-center text-[10px]" style={{ color: d === today ? 'var(--text-main)' : 'var(--green)', fontWeight: d === today ? 700 : 400 }}>{labels[i]}</span>
        ))}
      </div>
    </button>
  );
}

// ─── Run pace card ────────────────────────────────────────────────────────────
function RunPaceCard({ runs = [], onNav }) {
  const FAST = 180, SLOW = 480;
  const paceQualityPct = (sec) => Math.max(0, Math.min(100, (SLOW - sec) / (SLOW - FAST) * 100));
  const formatPace = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  const bestPace = (minKm) => {
    const eligible = runs.filter(r => (r.distance_km || 0) >= minKm && r.duration_seconds);
    if (!eligible.length) return null;
    const paces = eligible.map(r => Math.round(r.duration_seconds / r.distance_km));
    return Math.min(...paces);
  };

  const b5 = bestPace(5);
  const b10 = bestPace(10);
  const b21 = bestPace(21);

  const Bucket = ({ label, pace }) => (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <p className="text-[10px]" style={{ color: 'var(--green)' }}>{label}</p>
        <p className="text-sm font-extrabold leading-none" style={{ color: 'var(--text-main)' }}>
          {pace ? formatPace(pace) : <span style={{ color: 'var(--green)', fontSize: 11 }}>Sem dados</span>}
        </p>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(15,23,42,0.10)' }}>
        <div className="h-full rounded-full" style={{ width: pace ? `${paceQualityPct(pace)}%` : '0%', background: 'var(--mod-corrida-from)', transition: 'width .4s ease' }} />
      </div>
    </div>
  );

  return (
    <button onClick={onNav} className="w-full text-left rounded-2xl p-3.5 active:scale-[0.98] transition" style={statCardBg('var(--mod-corrida-to)')}>
      <h2 className="text-[10px] font-semibold uppercase tracking-wide mb-2.5" style={{ color: 'var(--green)' }}>Corrida · Melhor pace</h2>
      <div className="flex items-start gap-3">
        <Bucket label="5 km+" pace={b5} />
        <Bucket label="10 km+" pace={b10} />
        <Bucket label="21 km+" pace={b21} />
      </div>
    </button>
  );
}

// ─── Personalizar panel ───────────────────────────────────────────────────────
function CustomizePanel({ activeLayout, onToggle, onClose }) {
  const activeSet = new Set(activeLayout);
  const modules = [...new Set(HOME_CARD_DEFS.map(d => d.module))];

  return (
    <div className="rounded-2xl p-4" style={statCardBg('var(--accent)')}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>Personalizar Início</h2>
        <button onClick={onClose} className="text-xs font-semibold" style={{ color: 'var(--accent-ink)' }}>Concluir</button>
      </div>
      <p className="text-[11px] mb-3 leading-relaxed" style={{ color: 'var(--green)' }}>
        Escolhe os cartões que queres ver. A posição é sempre agrupada por módulo — o cartão de calorias é sempre o primeiro e não se pode desativar.
      </p>
      {modules.map(mod => (
        <div key={mod}>
          <h3 className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--green)' }}>{mod}</h3>
          <div className="space-y-1.5 mb-3">
            {HOME_CARD_DEFS.filter(d => d.module === mod).map(d => {
              const on = activeSet.has(d.key);
              return (
                <div key={d.key} className="flex items-center gap-2 rounded-xl px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid var(--brd-800)' }}>
                  <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-main)' }}>{d.label}</span>
                  <button onClick={() => onToggle(d.key)} type="button"
                    className="w-9 h-5 rounded-full relative transition shrink-0"
                    style={{ background: on ? 'var(--accent)' : 'var(--brd-700)' }}>
                    <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: on ? 16 : 2 }} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Home component ──────────────────────────────────────────────────────
export default function Home() {
  const { profile, meals, runs, gymSessions, bodyAssessments, waterLogs, setActiveTab } = useAppStore();
  const [homeEditMode, setHomeEditMode] = useState(false);
  const [localLayout, setLocalLayout] = useState(
    () => profile?.home_layout || DEFAULT_HOME_LAYOUT
  );
  const [localWaterLogs, setLocalWaterLogs] = useState([]);

  const effectiveWaterLogs = [...(waterLogs || []), ...localWaterLogs];

  const activeLayout = useMemo(() => {
    const saved = profile?.home_layout;
    const activeSet = new Set(saved?.length ? saved : DEFAULT_HOME_LAYOUT);
    return CANONICAL_HOME_ORDER.filter(k => activeSet.has(k));
  }, [profile]);

  const [editLayout, setEditLayout] = useState(activeLayout);

  const handleNav = (tab) => setActiveTab(tab);

  const handleLogWater = (ml) => {
    const tempLog = { id: `__tmp_${Date.now()}`, date: todayISO(), amount_ml: ml };
    setLocalWaterLogs(prev => [tempLog, ...prev]);
  };

  const handleToggleCard = (key) => {
    setEditLayout(prev => {
      const set = new Set(prev);
      if (set.has(key)) set.delete(key); else set.add(key);
      return CANONICAL_HOME_ORDER.filter(k => set.has(k));
    });
  };

  const today = todayISO();

  const todayTotals = useMemo(() => (meals || []).filter(m => m.date === today).reduce((acc, m) => ({
    calories: acc.calories + (m.calories || 0),
    protein: acc.protein + (m.protein || 0),
    carbs: acc.carbs + (m.carbs || 0),
    fat: acc.fat + (m.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [meals, today]);

  const lastTwo = (key) => {
    const vals = [];
    for (const a of (bodyAssessments || [])) {
      if (a[key] !== null && a[key] !== undefined) { vals.push(a[key]); if (vals.length === 2) break; }
    }
    return [vals[0] ?? null, vals[1] ?? null];
  };

  const [weightNow, weightPrev] = lastTwo('weight_kg');
  const [fatNow, fatPrev] = lastTwo('body_fat_pct');
  const [bmiNow, bmiPrev] = lastTwo('bmi');
  const [muscleNow, musclePrev] = lastTwo('muscle_mass_kg');
  const [waterPctNow, waterPctPrev] = lastTwo('body_water_pct');

  const currentLayout = homeEditMode ? editLayout : activeLayout;

  const renderCard = (key) => {
    const def = HOME_CARD_DEFS.find(d => d.key === key);
    const isFull = def?.size === 'full';

    let card = null;
    switch (key) {
      case 'protein_today': card = <NutrientMiniCard label="Proteína hoje" value={todayTotals.protein} goal={Number(profile?.protein_goal) || 0} color="var(--data-proteina)" onNav={() => handleNav('nutricao')} />; break;
      case 'carbs_today':   card = <NutrientMiniCard label="Hidratos hoje" value={todayTotals.carbs} goal={Number(profile?.carbs_goal) || 0} color="var(--data-hidratos)" onNav={() => handleNav('nutricao')} />; break;
      case 'fat_today':     card = <NutrientMiniCard label="Gordura hoje" value={todayTotals.fat} goal={Number(profile?.fat_goal) || 0} color="var(--data-gordura)" onNav={() => handleNav('nutricao')} />; break;
      case 'weight_kg':     card = <BodyMiniCard label="Peso" value={weightNow} prevValue={weightPrev} goal={Number(profile?.goal_weight_kg) || 0} unit="kg" color="var(--data-peso)" onNav={() => handleNav('corpo')} />; break;
      case 'body_fat_pct':  card = <BodyMiniCard label="Gordura corporal" value={fatNow} prevValue={fatPrev} goal={Number(profile?.goal_body_fat_pct) || 0} unit="%" color="var(--data-gordura-corporal)" onNav={() => handleNav('corpo')} />; break;
      case 'bmi':           card = <BodyMiniCard label="IMC" value={bmiNow} prevValue={bmiPrev} goal={0} unit="" dec={1} color="var(--data-imc)" onNav={() => handleNav('corpo')} />; break;
      case 'muscle_mass_kg': card = <BodyMiniCard label="Massa muscular" value={muscleNow} prevValue={musclePrev} goal={0} unit="kg" color="var(--data-musculo-esqueletico)" onNav={() => handleNav('corpo')} />; break;
      case 'body_water_pct': card = <BodyMiniCard label="Água corporal" value={waterPctNow} prevValue={waterPctPrev} goal={0} unit="%" color="var(--data-agua-corporal)" onNav={() => handleNav('corpo')} />; break;
      case 'gym_sessions':  card = <GymSessionsCard gymSessions={gymSessions} onNav={() => handleNav('ginasio')} />; break;
      case 'gym_volume':    card = <GymVolumeCard gymSessions={gymSessions} onNav={() => handleNav('ginasio')} />; break;
      case 'corrida_km':    card = <RunKmCard runs={runs} onNav={() => handleNav('corrida')} />; break;
      case 'corrida_pace':  card = <RunPaceCard runs={runs} onNav={() => handleNav('corrida')} />; break;
      default: return null;
    }

    return (
      <div key={key} className={isFull ? 'col-span-2' : ''} style={{ display: 'block' }}>
        {card}
      </div>
    );
  };

  return (
    <div className="space-y-4 fade-in">
      {/* Título + Personalizar */}
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--green)' }}>Início</h2>
        <button onClick={() => setHomeEditMode(m => !m)}
          className="tap-h-44 flex items-center gap-1 text-[11px] font-semibold rounded-full px-3.5 active:scale-95 transition"
          style={{ color: 'var(--green)', border: '1px solid var(--brd-800)' }}>
          <SlidersHorizontal size={12} /> Personalizar
        </button>
      </div>

      {/* Próxima Prova */}
      <NextRaceCard raceEvents={[]} onNav={handleNav} />

      {/* Nutrição Hero — sempre visível */}
      <NutritionHeroCard meals={meals} profile={profile} onNav={handleNav} />

      {/* Água — sempre visível */}
      <WaterHomeCard waterLogs={effectiveWaterLogs} profile={profile} onNav={handleNav} onLogWater={handleLogWater} />

      {/* Painel de personalização OU grelha de cartões */}
      {homeEditMode ? (
        <CustomizePanel
          activeLayout={editLayout}
          onToggle={handleToggleCard}
          onClose={() => setHomeEditMode(false)}
        />
      ) : (
        currentLayout.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5">
            {currentLayout.map(key => renderCard(key))}
          </div>
        )
      )}
    </div>
  );
}
