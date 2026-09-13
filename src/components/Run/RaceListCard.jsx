import React, { useMemo, useState } from 'react';
import { Flag, Plus, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';
import { groupRaces, countdownLabel } from '../../utils/raceList';
import { raceDistanceLabel, formatDuration, formatTargetTimeLabel } from '../../utils/run';
import GlassCard from '../shared/GlassCard';
import SectionLabel from '../shared/SectionLabel';
import { Sheet } from '../shared/Sheet';
import { AchievementIcon } from '../shared/AchievementCard';

/* "As tuas provas" — todas as provas num sítio só, no módulo Corrida do
   Dashboard (pedido 2026-09-13). O Início só mostra a próxima, o cartão de
   prontidão também, a agenda tem-nas dia a dia e o Palmarés só as
   concluídas: faltava a lista. Os grupos e a ordem vêm de utils/raceList.js.

   No cartão cabem até três de cada grupo; o resto está a um toque, em "Ver
   todas", numa persiana com as listas completas. Cada linha abre o hub da
   prova, que é onde se regista, se vê o plano e se juntam as memórias. O
   âmbar é da prova e só da prova. */

const INLINE_MAX = 3;

function dayNumber(dateIso) {
  try { return format(parseISO(dateIso), 'd'); } catch { return ''; }
}

function monthShort(dateIso) {
  try { return format(parseISO(dateIso), 'MMM', { locale: pt }).replace('.', ''); } catch { return ''; }
}

function yearOf(dateIso) {
  return String(dateIso || '').slice(0, 4);
}

function DateTile({ date, muted }) {
  return (
    <span
      aria-hidden="true"
      className="flex flex-col items-center justify-center shrink-0"
      style={{
        width: 44, height: 44, borderRadius: 12,
        background: muted ? 'var(--surface-glass)' : 'var(--tint-race-bg)',
        border: `1px solid ${muted ? 'var(--border-glass)' : 'var(--tint-race-bd)'}`,
        color: muted ? 'var(--text-3)' : 'var(--race)',
      }}
    >
      <span className="text-[15px] font-black leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>{dayNumber(date)}</span>
      <span className="text-[11px] font-extrabold uppercase leading-none mt-[3px]">{monthShort(date)}</span>
    </span>
  );
}

function RaceRow({ race, meta, trailing, muted, onOpen, testId }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => onOpen(race.id)}
      className="flex items-center gap-3 w-full text-left"
      style={{ minHeight: 56, borderRadius: 16, padding: '6px 8px 6px 6px', background: 'none', border: 'none', cursor: 'pointer' }}
    >
      <DateTile date={race.date} muted={muted} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-extrabold truncate" style={{ color: muted ? 'var(--text-2)' : 'var(--text-1)' }}>
          {race.name || 'Prova sem nome'}
        </span>
        <span className="block text-[11.5px] mt-[2px] truncate" style={{ color: 'var(--text-4)' }}>{meta}</span>
      </span>
      {trailing}
      <ChevronRight size={15} aria-hidden="true" style={{ color: 'var(--text-4)', flexShrink: 0 }} />
    </button>
  );
}

function Group({ label, tone, items, max, render }) {
  if (!items.length) return null;
  const shown = max ? items.slice(0, max) : items;
  return (
    <div className="mt-3 first:mt-0">
      <SectionLabel tone={tone} style={{ margin: '0 2px 2px' }}>{label}</SectionLabel>
      <div className="flex flex-col">{shown.map(render)}</div>
    </div>
  );
}

export default function RaceListCard() {
  const { raceEvents, runs, profile, setEditingRaceId, setOpenCreationMode } = useAppStore();
  const [allOpen, setAllOpen] = useState(false);
  const today = todayISO();

  const { proximas, porRegistar, concluidas, total } = useMemo(
    () => groupRaces({ raceEvents, runs, profile, today }),
    [raceEvents, runs, profile, today],
  );

  const openRace = (raceId) => {
    setAllOpen(false);
    setEditingRaceId(raceId);
  };

  const renderProxima = ({ race, days }) => (
    <RaceRow
      key={race.id}
      race={race}
      testId={`race-list-${race.id}`}
      onOpen={openRace}
      meta={[raceDistanceLabel(race.distance_km), race.target_time ? `objetivo ${formatTargetTimeLabel(race.target_time)}` : null].filter(Boolean).join(' · ')}
      trailing={(
        <span className="text-[11.5px] font-extrabold shrink-0" style={{ color: days <= 7 ? 'var(--race)' : 'var(--text-3)' }}>
          {countdownLabel(days)}
        </span>
      )}
    />
  );

  const renderPorRegistar = ({ race }) => (
    <RaceRow
      key={race.id}
      race={race}
      testId={`race-list-${race.id}`}
      onOpen={openRace}
      meta={[raceDistanceLabel(race.distance_km), yearOf(race.date)].filter(Boolean).join(' · ')}
      trailing={(
        <span
          className="inline-flex items-center text-[11px] font-extrabold uppercase shrink-0"
          style={{ height: 24, padding: '0 8px', borderRadius: 99, letterSpacing: '.04em', background: 'var(--tint-warn-bg)', border: '1px solid var(--tint-warn-bd)', color: 'var(--warn)' }}
        >
          Registar
        </span>
      )}
    />
  );

  const renderConcluida = ({ race, outcome, achievements }) => (
    <RaceRow
      key={race.id}
      race={race}
      muted
      testId={`race-list-${race.id}`}
      onOpen={openRace}
      meta={[
        raceDistanceLabel(race.distance_km),
        outcome?.officialSeconds ? formatDuration(outcome.officialSeconds) : 'sem registo',
        yearOf(race.date),
      ].filter(Boolean).join(' · ')}
      trailing={achievements.length ? (
        <span className="flex items-center gap-1 shrink-0">
          {achievements.slice(0, 3).map((a) => <AchievementIcon key={a.key} achievement={a} size={24} />)}
        </span>
      ) : null}
    />
  );

  const hidden = Math.max(0, proximas.length - INLINE_MAX)
    + Math.max(0, porRegistar.length - INLINE_MAX)
    + Math.max(0, concluidas.length - INLINE_MAX);

  const resumo = total
    ? [
        proximas.length ? `${proximas.length} por fazer` : null,
        porRegistar.length ? `${porRegistar.length} por registar` : null,
        concluidas.length ? `${concluidas.length} ${concluidas.length === 1 ? 'concluída' : 'concluídas'}` : null,
      ].filter(Boolean).join(' · ')
    : 'Ainda sem provas marcadas.';

  return (
    <>
      <SectionLabel tone="race">As tuas provas</SectionLabel>
      <GlassCard tone="race" padding="14px 12px 12px" data-testid="race-list-card">
        <div className="flex items-center gap-2 px-1">
          <Flag size={15} style={{ color: 'var(--race)' }} aria-hidden="true" />
          <p className="text-[12px] font-bold flex-1" data-testid="race-list-resumo" style={{ color: 'var(--text-3)' }}>{resumo}</p>
        </div>

        {total > 0 && (
          <div className="mt-2">
            <Group label="Próximas" tone="race" items={proximas} max={INLINE_MAX} render={renderProxima} />
            <Group label="Por registar" tone="warn" items={porRegistar} max={INLINE_MAX} render={renderPorRegistar} />
            <Group label="Concluídas" items={concluidas} max={INLINE_MAX} render={renderConcluida} />
          </div>
        )}

        <div className="flex gap-2 mt-3">
          {hidden > 0 && (
            <button
              type="button"
              data-testid="race-list-ver-todas"
              onClick={() => setAllOpen(true)}
              className="flex-1 inline-flex items-center justify-center rounded-[11px] text-[12.5px] font-extrabold"
              style={{ minHeight: 44, background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-2)' }}
            >
              Ver todas ({total})
            </button>
          )}
          <button
            type="button"
            data-testid="race-list-nova"
            onClick={() => setOpenCreationMode('race')}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-[11px] text-[12.5px] font-extrabold"
            style={{ minHeight: 44, background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', color: 'var(--race)' }}
          >
            <Plus size={15} aria-hidden="true" /> Marcar prova
          </button>
        </div>
      </GlassCard>

      {allOpen && (
        <Sheet eyebrow="As tuas provas" eyebrowTone="race" title={<span className="text-[12px] font-bold" style={{ color: 'var(--text-3)' }}>{resumo}</span>} onClose={() => setAllOpen(false)} testId="race-list-sheet" maxHeight="88dvh">
          <div className="pt-2 pb-1">
            <Group label="Próximas" tone="race" items={proximas} render={renderProxima} />
            <Group label="Por registar" tone="warn" items={porRegistar} render={renderPorRegistar} />
            <Group label="Concluídas" items={concluidas} render={renderConcluida} />
          </div>
        </Sheet>
      )}
    </>
  );
}
