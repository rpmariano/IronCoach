import React, { useMemo, useState } from 'react';
import { Flag, Plus, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';
import { groupRaces, countdownLabel } from '../../utils/raceList';
import { raceDistanceLabel, formatDuration, formatTargetTimeLabel } from '../../utils/run';
import { useCupListing } from '../../utils/useCup';
import GlassCard from '../shared/GlassCard';
import SectionLabel from '../shared/SectionLabel';
import { Sheet } from '../shared/Sheet';
import { AchievementIcon } from '../shared/AchievementCard';
import { useToast } from '../shared/ToastProvider';
import { DateTile } from './DateTile';
import { CupListBlock, CupPorRegistarRows } from './CupListBlock';
import { CupNaoFuiDialog, JornadaChip } from './CupBits';

/* "As tuas provas" — todas as provas num sítio só, no módulo Corrida do
   Dashboard (pedido 2026-09-13). O Início só mostra a próxima, o cartão de
   prontidão também, a agenda tem-nas dia a dia e o Palmarés só as
   concluídas: faltava a lista. Os grupos e a ordem vêm de utils/raceList.js.

   As próximas e as por registar aparecem sempre todas: são o objetivo, e uma
   prova marcada para daqui a meses escondida atrás de "Ver todas" parecia
   não existir (relatado 2026-09-13, duas provas de 2027). Só as concluídas,
   que são o histórico e crescem, ficam nas três mais recentes, com o resto
   em "Ver todas", numa persiana com as listas completas. Cada linha abre o hub da
   prova, que é onde se regista, se vê o plano e se juntam as memórias. O
   âmbar é da prova e só da prova.

   O TROFÉU (specs/trofeu.md §4.3, Fase 3, 2026-09-27). Com inscrição
   (useCupListing), as jornadas que não foram promovidas a principal saem
   das linhas normais e ficam num bloco fixo no fim das "Próximas"
   (CupListBlock.jsx); as que já passaram e estão por registar entram no fim
   do "Por registar", no máximo duas, com [Registar] e [Não fui]; as
   concluídas ficam onde estavam, com o chip "J3". Sem inscrição `listing` é
   null e tudo o que está abaixo corre como antes, com o mesmo HTML
   (RaceListCard.test.jsx guarda uma cópia congelada para o provar). */

const INLINE_MAX = 3;

function yearOf(dateIso) {
  return String(dateIso || '').slice(0, 4);
}

// Exportado: a mesma linha serve as listas de provas de outros ecrãs (vive
// em DateTile.jsx desde a Fase 3 do Troféu).
export { DateTile };

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

// `extra`: o que o Troféu junta ao fim do grupo (o bloco fixo, as jornadas
// por registar) — com ele o grupo aparece mesmo sem linhas normais.
function Group({ label, tone, items, max, render, extra = null }) {
  if (!items.length && !extra) return null;
  const shown = max ? items.slice(0, max) : items;
  return (
    <div className="mt-3 first:mt-0">
      <SectionLabel tone={tone} style={{ margin: '0 2px 2px' }}>{label}</SectionLabel>
      <div className="flex flex-col">{shown.map(render)}{extra}</div>
    </div>
  );
}

// O chip "J3" antes do que a linha já tinha à direita (só nas provas de
// jornadas desta edição: `jornada` vem de groupRaces com inscrição).
function withChip(jornada, trailing) {
  if (!jornada) return trailing;
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <JornadaChip chip={jornada.chip} roundNo={jornada.roundNo} roundLabel={jornada.roundLabel} />
      {trailing}
    </span>
  );
}

export default function RaceListCard() {
  const { raceEvents, runs, profile, setEditingRaceId, setOpenCreationMode } = useAppStore();
  const [allOpen, setAllOpen] = useState(false);
  const today = todayISO();
  // O Troféu: null para quem não está inscrito (nem tem a pista local), e
  // então groupRaces é o de sempre.
  const { view: cupView, listing } = useCupListing();
  const { showToast } = useToast();
  const [naoFui, setNaoFui] = useState(null); // a jornada do diálogo "Não fui"
  const [naoFuiBusy, setNaoFuiBusy] = useState(false);

  const { proximas, porRegistar, concluidas, total, trofeu } = useMemo(
    () => groupRaces({ raceEvents, runs, profile, today, cup: listing }),
    [raceEvents, runs, profile, today, listing],
  );

  const openRace = (raceId) => {
    setAllOpen(false);
    setEditingRaceId(raceId);
  };

  const renderProxima = ({ race, days, jornada }) => (
    <RaceRow
      key={race.id}
      race={race}
      testId={`race-list-${race.id}`}
      onOpen={openRace}
      meta={[raceDistanceLabel(race.distance_km), race.target_time ? `objetivo ${formatTargetTimeLabel(race.target_time)}` : null].filter(Boolean).join(' · ')}
      trailing={withChip(jornada, (
        <span className="text-[11.5px] font-extrabold shrink-0" style={{ color: days <= 7 ? 'var(--race)' : 'var(--text-3)' }}>
          {countdownLabel(days)}
        </span>
      ))}
    />
  );

  const renderPorRegistar = ({ race, jornada }) => (
    <RaceRow
      key={race.id}
      race={race}
      testId={`race-list-${race.id}`}
      onOpen={openRace}
      meta={[raceDistanceLabel(race.distance_km), yearOf(race.date)].filter(Boolean).join(' · ')}
      trailing={withChip(jornada, (
        <span
          className="inline-flex items-center text-[11px] font-extrabold uppercase shrink-0"
          style={{ height: 24, padding: '0 8px', borderRadius: 99, letterSpacing: '.04em', background: 'var(--tint-warn-bg)', border: '1px solid var(--tint-warn-bd)', color: 'var(--warn)' }}
        >
          Registar
        </span>
      ))}
    />
  );

  const renderConcluida = ({ race, outcome, achievements, jornada }) => (
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
      trailing={withChip(jornada, achievements.length ? (
        <span className="flex items-center gap-1 shrink-0">
          {achievements.slice(0, 3).map((a) => <AchievementIcon key={a.key} achievement={a} size={24} />)}
        </span>
      ) : null)}
    />
  );

  /* O Troféu (só com `listing`). Tudo o que abre o ecrã do Troféu fecha
     primeiro a persiana "Ver todas"; o ecrã vive em Provas (RacesScreen),
     que consome o pedido. O modo é o de quem pede: o cabeçalho do bloco
     passa `mode: null` e o ecrã decide (a lista pré-marcada quando há
     jornadas por decidir, §4.3); o "+N" e uma jornada concreta abrem no
     calendário (a omissão). */
  const openTrofeu = ({ roundId = null, mode = 'calendario' } = {}) => {
    setAllOpen(false);
    useAppStore.getState().requestCupScreen({ roundId, mode });
  };
  const registarJornada = (raceId) => {
    setAllOpen(false);
    useAppStore.getState().openRaceRun(raceId);
  };
  const confirmarNaoFui = async () => {
    if (!naoFui || naoFuiBusy) return;
    setNaoFuiBusy(true);
    let res;
    try {
      res = await useAppStore.getState().markCupRoundNotAttended(naoFui.id);
    } catch (err) {
      res = { ok: false, error: { message: err?.message || 'Não consegui gravar.' } };
    }
    setNaoFuiBusy(false);
    setNaoFui(null);
    if (res?.ok) showToast('Marcada como «Não fui».', 'success');
    else showToast(res?.error?.message || 'Não consegui gravar.', 'error');
  };
  const trofeuRegistar = trofeu?.porRegistar || [];
  const cupBlock = listing ? (
    <CupListBlock listing={listing} onOpenRace={openRace} onOpenTrofeu={openTrofeu} />
  ) : null;
  const cupRegistar = listing && trofeuRegistar.length ? (
    <CupPorRegistarRows
      entries={trofeuRegistar}
      view={cupView}
      runs={runs}
      onOpenRace={openRace}
      onRegister={registarJornada}
      onNaoFui={setNaoFui}
      onOpenTrofeu={openTrofeu}
    />
  ) : null;

  // Só as concluídas se escondem (ver o comentário do topo).
  const hidden = Math.max(0, concluidas.length - INLINE_MAX);

  // "Troféu de Cascais 2 de 11": feitas / jornadas (progresso, não a
  // counting_rule). "Por fazer" são só as normais; "por registar" junta as
  // jornadas.
  const porRegistarCount = porRegistar.length + trofeuRegistar.length;
  const resumo = total || listing
    ? [
        proximas.length ? `${proximas.length} por fazer` : null,
        porRegistarCount ? `${porRegistarCount} por registar` : null,
        cupView?.catalogReady ? `${cupView.shortName} ${cupView.progress.done} de ${cupView.progress.total}` : null,
        concluidas.length ? `${concluidas.length} ${concluidas.length === 1 ? 'concluída' : 'concluídas'}` : null,
      ].filter(Boolean).join(' · ') || 'Ainda sem provas marcadas.'
    : 'Ainda sem provas marcadas.';

  return (
    <>
      <SectionLabel>As tuas provas</SectionLabel>
      <GlassCard padding="14px 12px 12px" data-testid="race-list-card">
        <div className="flex items-center gap-2 px-1">
          <Flag size={15} style={{ color: 'var(--text-4)' }} aria-hidden="true" />
          <p className="text-[12px] font-bold flex-1" data-testid="race-list-resumo" style={{ color: 'var(--text-3)' }}>{resumo}</p>
        </div>

        {(total > 0 || listing) && (
          <div className="mt-2">
            <Group label="Próximas" items={proximas} render={renderProxima} extra={cupBlock} />
            <Group label="Por registar" tone="warn" items={porRegistar} render={renderPorRegistar} extra={cupRegistar} />
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
            style={{ minHeight: 44, background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-2)' }}
          >
            <Plus size={15} aria-hidden="true" /> Marcar prova
          </button>
        </div>
      </GlassCard>

      {allOpen && (
        <Sheet eyebrow="As tuas provas" eyebrowTone="race" title={<span className="text-[12px] font-bold" style={{ color: 'var(--text-3)' }}>{resumo}</span>} onClose={() => setAllOpen(false)} testId="race-list-sheet" maxHeight="88dvh">
          <div className="pt-2 pb-1">
            <Group label="Próximas" items={proximas} render={renderProxima} extra={cupBlock} />
            <Group label="Por registar" tone="warn" items={porRegistar} render={renderPorRegistar} extra={cupRegistar} />
            <Group label="Concluídas" items={concluidas} render={renderConcluida} />
          </div>
        </Sheet>
      )}

      {naoFui && (
        <CupNaoFuiDialog
          round={naoFui}
          roundLabel={cupView?.roundLabel}
          busy={naoFuiBusy}
          onConfirm={confirmarNaoFui}
          onClose={() => { if (!naoFuiBusy) setNaoFui(null); }}
        />
      )}
    </>
  );
}
