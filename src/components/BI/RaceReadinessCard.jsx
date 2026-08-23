import React, { useMemo } from 'react';
import { Trophy, Flag, ChevronRight } from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import { calculateReadinessIndex } from '../../utils/biEngine';

const PILLAR_ICONS = {
  acwr: '🏃',
  ea: '⚡',
  calories: '🥗',
  vdot: '📈',
  tactic: '🎯',
};

export default function RaceReadinessCard({ runs, meals, bodyAssessments, gymSessions, raceEvents, profile, onClickRace }) {
  const today = new Date().toISOString().split('T')[0];
  const nextRace = useMemo(() => {
    if (!raceEvents?.length) return null;
    return [...raceEvents]
      .filter(r => r.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  }, [raceEvents, today]);

  const readiness = useMemo(() =>
    calculateReadinessIndex(runs, meals, bodyAssessments, gymSessions, profile, nextRace),
    [runs, meals, bodyAssessments, gymSessions, profile, nextRace]
  );

  const daysLeft = nextRace ? differenceInDays(parseISO(nextRace.date), new Date()) : null;

  const LEVEL_CONFIG = {
    high: { color: '#10b981', bg: 'bg-emerald-500', ring: 'stroke-emerald-500', label: 'Alta', textColor: 'text-emerald-400' },
    medium: { color: '#f59e0b', bg: 'bg-amber-500', ring: 'stroke-amber-500', label: 'Média', textColor: 'text-amber-400' },
    low: { color: '#ef4444', bg: 'bg-rose-500', ring: 'stroke-rose-500', label: 'Baixa', textColor: 'text-rose-400' },
  };
  const cfg = LEVEL_CONFIG[readiness.level] || LEVEL_CONFIG.low;

  // SVG circle ring math
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference - (readiness.score / 100) * circumference;

  const Component = nextRace && onClickRace ? 'button' : 'div';
  const componentProps = Component === 'button' ? { 
    onClick: () => onClickRace(nextRace.id),
    className: "w-full text-left bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)] active:scale-[0.98] transition-transform"
  } : {
    className: "w-full bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)]"
  };

  return (
    <Component {...componentProps}>
      {/* Header */}
      <div className="flex items-start gap-4">
        {/* Ring */}
        <div className="relative shrink-0 w-20 h-20">
          <svg viewBox="0 0 88 88" className="w-20 h-20 -rotate-90">
            <circle cx="44" cy="44" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
            <circle
              cx="44" cy="44" r={radius}
              fill="none"
              className={cfg.ring}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={progress}
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-xl font-black leading-none ${cfg.textColor}`}>{readiness.score}%</span>
            <span className="text-[9px] text-slate-400 font-semibold mt-0.5">Prontidão</span>
          </div>
        </div>

        {/* Race info or generic */}
        <div className="flex-1 min-w-0">
          {nextRace ? (
            <>
              <div className="flex items-center gap-1.5 mb-1">
                <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Próxima Prova</span>
              </div>
              <p className="text-sm font-bold text-white leading-tight truncate">{nextRace.name || nextRace.race_name || 'Prova'}</p>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                {daysLeft === 0 ? 'É hoje! 🏁' : daysLeft === 1 ? 'Amanhã!' : `Faltam ${daysLeft} dias`}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 mb-1">
                <Flag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Forma Geral</span>
              </div>
              <p className="text-sm font-bold text-white leading-tight">Nenhuma prova agendada</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Adiciona uma prova para ver a prontidão direcionada</p>
            </>
          )}
          <div className="mt-2 flex items-center justify-between">
            <div>
              <span className={`text-[11px] font-bold ${cfg.textColor}`}>
                Prontidão {cfg.label}
              </span>
              {nextRace && (
                <span className="text-[11px] text-slate-400 font-medium"> — {nextRace.distance_km || '?'}km</span>
              )}
            </div>
            {Component === 'button' && (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </div>
      </div>

      {/* Pillar breakdown */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {readiness.pillars.map(pillar => {
          const pCfg = pillar.score >= 75 ? LEVEL_CONFIG.high : pillar.score >= 45 ? LEVEL_CONFIG.medium : LEVEL_CONFIG.low;
          return (
            <div key={pillar.key} className="bg-white/5 rounded-xl p-2.5 border border-white/10">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-400 font-semibold truncate pr-1">{PILLAR_ICONS[pillar.key]} {pillar.label}</span>
                <span className={`text-[10px] font-bold ${pCfg.textColor} shrink-0`}>{pillar.score}%</span>
              </div>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${pCfg.bg}`}
                  style={{ width: `${pillar.score}%`, transition: 'width 0.8s ease' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Component>
  );
}
