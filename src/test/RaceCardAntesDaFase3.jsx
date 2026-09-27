/* "Para onde vou" (Home/RaceCard.jsx) ANTES da Fase 3 do Troféu, tal e
   qual (git ef3c4af, sem os comentários e com os caminhos dos imports
   acertados a esta pasta). Com os MESMOS componentes e utilitários
   partilhados (GlassCard, RaceTrail, CarouselDots, raceMilestone, o plano da
   prova…): o que muda neles para toda a gente muda nos dois lados.

   NÃO É CÓDIGO DA APP e NÃO se atualiza para acompanhar o Troféu: é a régua
   da invariância (specs/trofeu.md §10, "sem inscrição, o cartão é o de
   hoje") de Home/RaceCard.test.jsx, como RaceListCardAntesDaFase3 em
   RaceListCard.test.jsx. Mudar o cartão por outra razão obriga a mudar esta
   cópia no mesmo commit — é de propósito. */
import React, { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Flag, Medal, Plus, Trophy } from 'lucide-react';
import { todayISO } from '../lib/utils';
import { findRaceRun, formatDuration, formatPace } from '../utils/run';
import { classifyRaceOutcome } from '../utils/raceOutcome';
import { achievementsForRace } from '../utils/achievements';
import { calculateRaceTrainingPlan } from '../utils/racePlanEngine';
import { buildTrailModel } from '../utils/homeModels';
import GlassCard from '../components/shared/GlassCard';
import RaceTrail from '../components/shared/RaceTrail';
import CarouselDots from '../components/shared/CarouselDots';
import { AchievementChip } from '../components/shared/AchievementCard';
import { useRevealAnimation } from '../utils/useRevealAnimation';
import { useCountUpText } from '../utils/useCountUp';
import { useAppStore } from '../store';
import CoachAvatar from '../components/Coach/CoachAvatar';
import { raceMilestoneLine, milestoneMomentKey, wasMilestoneSeen, markMilestoneSeen } from '../components/Home/raceMilestone';
import useMomentOnce from '../utils/useMomentOnce';
import { triggerCarouselTick } from '../utils/haptics';

function DaysCount({ days, animate }) {
  return <>{useCountUpText(days, { animate })}</>;
}

const DIAS_A_ESPERAR_PELO_REGISTO = 7;

const SWIPE_MIN_PX = 40;

function diasEntre(a, b) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

function rotuloDoDia(dias) {
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

function AllRacesLink({ onOpen }) {
  if (!onOpen) return null;
  return (
    <button
      type="button"
      data-testid="race-card-all"
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      className="w-full flex items-center justify-between mt-2.5 -mb-1 text-[12px] font-bold"
      style={{ minHeight: 44, color: 'var(--text-3)', borderTop: '1px solid rgba(255,255,255,.09)' }}
    >
      Todas as provas e o Palmarés <ChevronRight size={15} style={{ color: 'var(--text-4)' }} />
    </button>
  );
}

function ProvaConcluidaCard({ race, run, outcome, ordem, conquistas, dias, onOpenRace, onCreateRace, onOpenAllRaces }) {
  const tempo = outcome?.officialSeconds ? formatDuration(outcome.officialSeconds) : null;
  const ritmo = outcome?.officialSeconds && outcome?.distanceKm
    ? `${formatPace(Math.round(outcome.officialSeconds / outcome.distanceKm))}/km`
    : null;
  const objetivo = outcome?.targetSeconds ? `objetivo ${formatDuration(outcome.targetSeconds)}` : null;
  const linha = [tempo, ritmo, objetivo].filter(Boolean).join(' · ');

  return (
    <GlassCard glow tone="race" padding="16px" data-testid="race-card-completed">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <span
            aria-hidden="true"
            className="shrink-0 inline-flex items-center justify-center"
            style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', color: 'var(--race)' }}
          >
            <Trophy size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold uppercase truncate" style={{ color: 'var(--race)', letterSpacing: '.05em' }}>
              {`Prova concluída · ${rotuloDoDia(dias)}`}
            </div>
            <div className="text-[17px] font-black leading-[1.1] mt-1 truncate" style={{ color: 'var(--text-1)' }}>{race.name}</div>
            {linha && (
              <div className="text-[11.5px] mt-[3px]" style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{linha}</div>
            )}
          </div>
        </div>
        {ordem > 0 && (
          <div className="text-right shrink-0">
            <div className="text-[26px] font-black leading-none" style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{`${ordem}.ª`}</div>
            <div className="text-[11px] font-extrabold uppercase mt-0.5" style={{ color: 'var(--text-4)', letterSpacing: '.05em' }}>prova</div>
          </div>
        )}
      </div>

      {conquistas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3" data-testid="race-card-chips">
          {conquistas.map((c) => (
            <AchievementChip key={c.key} label={c.name} tone={c.tone} Icon={c.Icon} testId={`race-card-chip-${c.key}`} neutral />
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          data-testid="race-card-memories"
          onClick={() => onOpenRace?.(race.id)}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-[11px] text-[12.5px] font-extrabold"
          style={{ minHeight: 44, background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-2)' }}
        >
          <Medal size={15} /> Ver memórias
        </button>
        <button
          type="button"
          data-testid="race-card-next"
          onClick={() => onCreateRace?.()}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-[11px] text-[12.5px] font-bold"
          style={{ minHeight: 44, background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' }}
        >
          <Plus size={15} /> Próxima prova
        </button>
      </div>
      <AllRacesLink onOpen={onOpenAllRaces} />
    </GlassCard>
  );
}

function RaceMilestoneLine({ raceId, days, prioridade, flags, comPlano, comCorridas }) {
  const line = raceMilestoneLine(days, { prioridade, flags, comPlano, comCorridas });
  const userId = useAppStore((s) => s.session?.user?.id || s.profile?.id);
  const logImpression = useAppStore((s) => s.logImpression);
  const impressionShown = useAppStore((s) => s.impressionShown);
  const momentKey = milestoneMomentKey(raceId, days);
  const moment = useMomentOnce(
    !!line,
    () => wasMilestoneSeen(userId, raceId, days, impressionShown),
    () => {
      markMilestoneSeen(userId, raceId, days);
      logImpression({ kind: 'moment', key: momentKey, title: null });
    },
  );
  if (!line) return null;
  return (
    <div data-testid="race-milestone" className="flex items-start gap-2.5 mt-3 pt-3" style={{ borderTop: '1px solid rgba(251,191,36,.18)' }}>
      <CoachAvatar size={36} mood="neutral" breathing={moment} />
      <p className={`flex-1 min-w-0 text-[12.5px] font-semibold leading-[1.45]${moment ? ' race-milestone-line' : ''}`} style={{ margin: 0, color: 'var(--text-2)' }}>{line}</p>
    </div>
  );
}

export default function RaceCardAntesDaFase3({ raceEvents = [], runs = [], profile = {}, onOpenRace, onCreateRace, onRegisterRace, onOpenAllRaces }) {
  const today = todayISO();
  const estaRegistada = useMemo(() => {
    const registadas = new Set((raceEvents || []).filter((e) => findRaceRun(runs, e)).map((e) => e.id));
    return (id) => registadas.has(id);
  }, [raceEvents, runs]);
  const upcoming = useMemo(
    () => (raceEvents || [])
      .filter((e) => {
        if (!e?.date) return false;
        if (e.date >= today) return e.status !== 'concluida';
        return diasEntre(today, e.date) <= DIAS_A_ESPERAR_PELO_REGISTO && !estaRegistada(e.id);
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5),
    [raceEvents, today, estaRegistada],
  );
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(0, upcoming.length - 1));
  const race = upcoming[safeIndex];

  const touchStartRef = useRef(null);
  const swipedAtRef = useRef(0);
  const goTo = (i) => {
    const next = Math.max(0, Math.min(upcoming.length - 1, i));
    if (next === safeIndex) return;
    setIndex(next);
    triggerCarouselTick();
  };
  const onTouchStart = (e) => {
    const t = e.touches?.[0];
    touchStartRef.current = t ? { x: t.clientX, y: t.clientY } : null;
    swipedAtRef.current = 0;
  };
  const onTouchEnd = (e) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const t = e.changedTouches?.[0];
    if (!start || !t || upcoming.length < 2) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swipedAtRef.current = Date.now();
    goTo(safeIndex + (dx < 0 ? 1 : -1));
  };
  const openRace = () => {
    if (swipedAtRef.current && Date.now() - swipedAtRef.current < 400) { swipedAtRef.current = 0; return; }
    onOpenRace?.(race.id);
  };

  const concluida = useMemo(() => {
    if (upcoming.length) return null;
    return (raceEvents || [])
      .filter((e) => e?.date && e.date <= today && e.status === 'concluida'
        && diasEntre(today, e.date) <= DIAS_A_ESPERAR_PELO_REGISTO && estaRegistada(e.id))
      .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  }, [raceEvents, today, estaRegistada, upcoming.length]);

  const concluidaModel = useMemo(() => {
    if (!concluida) return null;
    const run = findRaceRun(runs, concluida);
    const outcome = classifyRaceOutcome({ race: concluida, run, runs, profile });
    const conquistas = achievementsForRace({ raceEvents, runs, profile, today }, concluida.id);
    const ordem = (raceEvents || []).filter((e) => e?.date && e.status === 'concluida'
      && e.date <= concluida.date && estaRegistada(e.id)).length;
    return { run, outcome, conquistas, ordem, dias: diasEntre(today, concluida.date) };
  }, [concluida, raceEvents, runs, profile, today, estaRegistada]);

  const daysReveal = useRevealAnimation();

  const { model, flags, comCorridas } = useMemo(() => {
    if (!race) return { model: null, flags: null, comCorridas: false };
    const plano = calculateRaceTrainingPlan({ race, profile, runs, todayISO: today });
    const inicio = plano?.effectiveStartDate || plano?.planStartDate;
    return {
      model: buildTrailModel(plano),
      flags: plano?.viability?.flags || null,
      comCorridas: !!inicio && (runs || []).some((r) => r?.date && r.date >= inicio && r.date <= today),
    };
  }, [race, profile, runs, today]);
  const coachPlans = useAppStore((s) => s.coachPlans);
  const raceDay = race ? String(race.date).slice(0, 10) : null;
  const comPlano = !!raceDay && (coachPlans || []).some((p) => p?.status === 'aceite'
    && String(p.period_start).slice(0, 10) <= today && String(p.period_end).slice(0, 10) >= raceDay);

  if (!race && concluida) {
    return (
      <ProvaConcluidaCard
        race={concluida}
        run={concluidaModel.run}
        outcome={concluidaModel.outcome}
        ordem={concluidaModel.ordem}
        conquistas={concluidaModel.conquistas}
        dias={concluidaModel.dias}
        onOpenRace={onOpenRace}
        onCreateRace={onCreateRace}
        onOpenAllRaces={onOpenAllRaces}
      />
    );
  }

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
        <AllRacesLink onOpen={onOpenAllRaces} />
      </GlassCard>
    );
  }

  const porRegistar = race.date <= today && !estaRegistada(race.id);
  const jaPassou = race.date < today;

  return (
    <GlassCard glow tone="race" padding="16px 16px 12px" data-testid="race-card">
      <div
        role="button"
        tabIndex={0}
        data-testid="race-card-body"
        onClick={openRace}
        onKeyDown={(e) => { if (e.key === 'Enter') onOpenRace?.(race.id); }}
        onTouchStart={upcoming.length > 1 ? onTouchStart : undefined}
        onTouchEnd={upcoming.length > 1 ? onTouchEnd : undefined}
        className="cursor-pointer"
        style={upcoming.length > 1 ? { touchAction: 'pan-y' } : undefined}
      >
        <div className="flex items-end justify-between gap-2.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 -ml-1">
              {upcoming.length > 1 && (
                <button type="button" aria-label="Prova anterior" disabled={safeIndex === 0} onClick={(e) => { e.stopPropagation(); goTo(safeIndex - 1); }} className="flex items-center justify-center rounded-full disabled:opacity-30 -my-3" style={{ width: 44, height: 44, color: 'var(--race)' }}>
                  <ChevronLeft size={17} />
                </button>
              )}
              <div className="text-[11px] font-extrabold uppercase truncate" style={{ color: 'var(--race)', letterSpacing: '.05em' }}>{race.name}</div>
              {upcoming.length > 1 && (
                <button type="button" aria-label="Prova seguinte" disabled={safeIndex >= upcoming.length - 1} onClick={(e) => { e.stopPropagation(); goTo(safeIndex + 1); }} className="flex items-center justify-center rounded-full disabled:opacity-30 -my-3" style={{ width: 44, height: 44, color: 'var(--race)' }}>
                  <ChevronRight size={17} />
                </button>
              )}
            </div>
            <div className="text-[17px] font-black leading-[1.1] mt-1 truncate" style={{ color: 'var(--text-1)' }}>
              {porRegistar && jaPassou ? 'Prova por registar' : model.phaseName}
            </div>
            {porRegistar && jaPassou ? (
              <div className="text-[11.5px] mt-[3px] whitespace-nowrap" style={{ color: 'var(--text-3)' }}>
                {`a prova foi ${rotuloDoDia(diasEntre(today, race.date))}`}
              </div>
            ) : model.weekLabel ? (
              <div className="text-[11.5px] mt-[3px] whitespace-nowrap" style={{ color: 'var(--text-3)' }}>{model.weekLabel}</div>
            ) : null}
          </div>
          {porRegistar && jaPassou ? (
            <div className="shrink-0 flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', color: 'var(--race)' }}>
              <Trophy size={20} />
            </div>
          ) : (
            <div className="text-right shrink-0" data-testid="race-card-days" ref={daysReveal.ref} style={daysReveal.style}>
              <div className="text-[26px] font-black leading-none" style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}><DaysCount key={daysReveal.playKey} days={model.days} animate={daysReveal.animate} /></div>
              <div className="text-[11px] font-extrabold uppercase mt-0.5" style={{ color: 'var(--text-4)', letterSpacing: '.05em' }}>{model.days === 1 ? 'dia' : 'dias'}</div>
            </div>
          )}
        </div>
        <RaceTrail raceId={race.id} weeks={model.weeks} current={model.current} phases={model.phases} startLabel={model.startLabel} endLabel={model.endLabel} />
        {!porRegistar && <RaceMilestoneLine key={`${race.id}-${model.days}`} raceId={race.id} days={model.days} prioridade={race.race_priority} flags={flags} comPlano={comPlano} comCorridas={comCorridas} />}
      </div>

      {porRegistar && (
        <button
          type="button"
          data-testid="race-card-register"
          onClick={(e) => { e.stopPropagation(); onRegisterRace?.(race.id); }}
          className="w-full inline-flex items-center justify-center gap-2 mt-3 rounded-[11px] text-[12.5px] font-extrabold"
          style={{ minHeight: 44, background: 'var(--grad-race)', color: 'var(--race-ink)', border: 'none' }}
        >
          <Trophy size={15} /> Registar a prova
        </button>
      )}
      {upcoming.length > 1 && (
        <div className="flex justify-center mt-2.5 -mb-1 min-h-[24px] items-center">
          <CarouselDots count={upcoming.length} currentIndex={safeIndex} onSelect={goTo} ariaLabelPrefix="Ver prova" />
        </div>
      )}
      <AllRacesLink onOpen={onOpenAllRaces} />
    </GlassCard>
  );
}
