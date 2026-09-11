import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import { todayISO } from '../../lib/utils';
import { calculateRaceTrainingPlan } from '../../utils/racePlanEngine';
import { buildTrailModel } from '../../utils/homeModels';
import GlassCard from '../shared/GlassCard';
import RaceTrail from '../shared/RaceTrail';
import CarouselDots from '../shared/CarouselDots';

/* "Para onde vou" — o cartão da prova (mock "Início"): nome em âmbar, a
   fase atual, "semana 6 de 18", os dias em número grande, o trilho do
   macrociclo e, com mais de uma prova, setas e pontos. Toca-se para abrir
   o hub. O âmbar é da prova e só da prova. */
export default function RaceCard({ raceEvents = [], runs = [], profile = {}, onOpenRace, onCreateRace }) {
  const today = todayISO();
  const upcoming = useMemo(
    () => (raceEvents || []).filter((e) => e.status !== 'concluida' && e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5),
    [raceEvents, today],
  );
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(0, upcoming.length - 1));
  const race = upcoming[safeIndex];

  const model = useMemo(() => {
    if (!race) return null;
    return buildTrailModel(calculateRaceTrainingPlan({ race, profile, runs, todayISO: today }));
  }, [race, profile, runs, today]);

  if (!race) {
    return (
      <GlassCard tone="race" glow data-testid="race-card-empty">
        <div className="flex items-center gap-2">
          <Flag size={16} style={{ color: 'var(--race)' }} />
          <div className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--race)', letterSpacing: '.05em' }}>Sem prova marcada</div>
        </div>
        <p className="text-[12.5px] leading-[1.45] mt-2" style={{ color: 'var(--text-3)' }}>
          Sem uma prova marcada não consigo montar um plano com fases. Diz-me a distância e a data, e trato do resto.
        </p>
        <button type="button" onClick={onCreateRace} className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] mt-3 rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', color: 'var(--race)' }}>
          Marcar a próxima prova
        </button>
      </GlassCard>
    );
  }

  return (
    <GlassCard glow tone="race" padding="16px 16px 12px" data-testid="race-card">
      <div role="button" tabIndex={0} onClick={() => onOpenRace?.(race.id)} onKeyDown={(e) => { if (e.key === 'Enter') onOpenRace?.(race.id); }} className="cursor-pointer">
        <div className="flex items-end justify-between gap-2.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 -ml-1">
              {upcoming.length > 1 && (
                <button type="button" aria-label="Prova anterior" disabled={safeIndex === 0} onClick={(e) => { e.stopPropagation(); setIndex(safeIndex - 1); }} className="flex items-center justify-center rounded-full disabled:opacity-30 -my-3" style={{ width: 44, height: 44, color: 'var(--race)' }}>
                  <ChevronLeft size={17} />
                </button>
              )}
              <div className="text-[11px] font-extrabold uppercase truncate" style={{ color: 'var(--race)', letterSpacing: '.05em' }}>{race.name}</div>
              {upcoming.length > 1 && (
                <button type="button" aria-label="Prova seguinte" disabled={safeIndex >= upcoming.length - 1} onClick={(e) => { e.stopPropagation(); setIndex(safeIndex + 1); }} className="flex items-center justify-center rounded-full disabled:opacity-30 -my-3" style={{ width: 44, height: 44, color: 'var(--race)' }}>
                  <ChevronRight size={17} />
                </button>
              )}
            </div>
            <div className="text-[17px] font-black leading-[1.1] mt-1 truncate" style={{ color: 'var(--text-1)' }}>{model.phaseName}</div>
            {model.weekLabel && <div className="text-[11.5px] mt-[3px] whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{model.weekLabel}</div>}
          </div>
          <div className="text-right shrink-0">
            <div className="text-[26px] font-black leading-none" style={{ color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>{model.days}</div>
            <div className="text-[11px] font-extrabold uppercase mt-0.5" style={{ color: '#e2932a', letterSpacing: '.05em' }}>{model.days === 1 ? 'dia' : 'dias'}</div>
          </div>
        </div>
        <RaceTrail weeks={model.weeks} current={model.current} phases={model.phases} startLabel={model.startLabel} endLabel={model.endLabel} />
      </div>
      {upcoming.length > 1 && (
        <div className="flex justify-center mt-2.5 -mb-1 min-h-[24px] items-center">
          <CarouselDots count={upcoming.length} currentIndex={safeIndex} onSelect={setIndex} ariaLabelPrefix="Ver prova" />
        </div>
      )}
    </GlassCard>
  );
}
