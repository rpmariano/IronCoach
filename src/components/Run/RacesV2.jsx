import React, { useMemo, useState } from 'react';
import '../../styles/v2-components.css';
import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';
import { groupRaces, countdownLabel } from '../../utils/raceList';
import { formatDuration, formatTargetTimeLabel } from '../../utils/run';
import { useCupListing } from '../../utils/useCup';
import { CupListBlock, CupPorRegistarRows } from './CupListBlock';

/* A lista de provas no Design v2 (direção C · Painel, fase 2, 2026-11-25; utils/designV2.js). O
   RacesScreen escolhe-a com o v2 ligado. Sai o carrossel «Para onde vou»: a lista é o ecrã. Cada
   linha: a data grande, o nome inteiro (sem reticências), a distância e o objetivo, e à direita os
   dias (nas próximas) ou o tempo final (nas concluídas). A próxima vai a âmbar. «Por registar»
   fica à parte, com a ação. Os dados são os do RaceListCard (groupRaces), e o Troféu entra com os
   mesmos blocos. */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nf1 = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 });
const kmText = (km) => (Number(km) > 0 ? `${nf1.format(Math.round(Number(km) * 10) / 10)} km` : null);
const CONCLUIDAS_MAX = 5;

function Dt({ date }) {
  const [y, m, d] = String(date || '').slice(0, 10).split('-');
  const ano = y && y !== String(new Date().getFullYear()) ? ` ${y}` : '';
  return (
    <span className="v2-rl-dt v2-num" aria-hidden="true">
      {Number(d) || '–'}
      <small>{MESES[Number(m) - 1] || ''}{ano}</small>
    </span>
  );
}

function Row({ race, meta, right, rightLabel, next = false, action = null, onOpen, testId }) {
  return (
    <div className={`v2-rl-it${next ? ' is-next' : ''}`} data-testid={testId}>
      <button type="button" className="v2-rl-main" onClick={() => onOpen(race.id)}>
        <Dt date={race.date} />
        <span className="min-w-0">
          <b>{race.name || 'Prova sem nome'}</b>
          {meta && <span className="v2-rl-meta">{meta}</span>}
        </span>
        {right && <span className="v2-rl-tag v2-num" aria-label={rightLabel || undefined}>{right}</span>}
      </button>
      {action}
    </div>
  );
}

export default function RacesV2() {
  const { raceEvents, runs, profile, setEditingRaceId, setOpenCreationMode } = useAppStore();
  const today = todayISO();
  const { view: cupView, listing } = useCupListing();
  const [todas, setTodas] = useState(false);
  const { proximas, porRegistar, concluidas, total, trofeu } = useMemo(
    () => groupRaces({ raceEvents, runs, profile, today, cup: listing }),
    [raceEvents, runs, profile, today, listing],
  );
  const openRace = (id) => setEditingRaceId(id);
  const registar = (id) => useAppStore.getState().openRaceRun(id);
  const openTrofeu = ({ roundId = null, mode = 'calendario' } = {}) => useAppStore.getState().requestCupScreen({ roundId, mode });

  const metaOf = (race, extra) => [kmText(race.distance_km), extra].filter(Boolean).join(' · ');
  const trofeuRegistar = trofeu?.porRegistar || [];
  const concluidasVisiveis = todas ? concluidas : concluidas.slice(0, CONCLUIDAS_MAX);

  return (
    <div className="v2-screen v2-enter pb-2" data-testid="races-v2">
      <h1 className="v2-title">Provas</h1>

      {!total && !listing && <p className="v2-sub" data-testid="races-v2-empty">Ainda sem provas marcadas.</p>}

      {(proximas.length > 0 || listing) && (
        <section aria-label="Próximas" className="v2-rl-list" data-testid="races-v2-proximas">
          {proximas.map(({ race, days }, i) => (
            <Row
              key={race.id}
              race={race}
              next={i === 0}
              testId={`race-list-${race.id}`}
              onOpen={openRace}
              meta={metaOf(race, race.target_time ? `objetivo ${formatTargetTimeLabel(race.target_time)}` : 'sem objetivo')}
              right={days <= 0 ? 'hoje' : days === 1 ? 'amanhã' : `${days} d`}
              rightLabel={countdownLabel(days)}
            />
          ))}
          {listing && <CupListBlock listing={listing} onOpenRace={openRace} onOpenTrofeu={openTrofeu} />}
        </section>
      )}

      {(porRegistar.length > 0 || trofeuRegistar.length > 0) && (
        <>
          <h2 className="v2-label">Por registar</h2>
          <section aria-label="Por registar" className="v2-rl-list" data-testid="races-v2-por-registar">
            {porRegistar.map(({ race }) => (
              <Row
                key={race.id}
                race={race}
                testId={`race-list-${race.id}`}
                onOpen={openRace}
                meta={metaOf(race, null)}
                action={(
                  <button type="button" className="v2-rl-act" data-testid={`race-list-registar-${race.id}`} onClick={() => registar(race.id)} aria-label={`Registar ${race.name || 'a prova'}`}>
                    Registar
                  </button>
                )}
              />
            ))}
            {listing && trofeuRegistar.length > 0 && (
              <CupPorRegistarRows entries={trofeuRegistar} view={cupView} runs={runs} onOpenRace={openRace} onRegister={registar} onNaoFui={() => openTrofeu({})} onOpenTrofeu={openTrofeu} />
            )}
          </section>
        </>
      )}

      {concluidas.length > 0 && (
        <>
          <h2 className="v2-label">Concluídas</h2>
          <section aria-label="Concluídas" className="v2-rl-list" data-testid="races-v2-concluidas">
            {concluidasVisiveis.map(({ race, outcome }) => (
              <Row
                key={race.id}
                race={race}
                testId={`race-list-${race.id}`}
                onOpen={openRace}
                meta={metaOf(race, null)}
                right={outcome?.officialSeconds ? formatDuration(outcome.officialSeconds) : 'sem registo'}
              />
            ))}
          </section>
          {concluidas.length > CONCLUIDAS_MAX && (
            <button type="button" className="v2-btn is-quiet" aria-expanded={todas} data-testid="races-v2-todas" onClick={() => setTodas((t) => !t)}>
              {todas ? 'Ver menos' : `Ver todas as concluídas (${concluidas.length})`}
            </button>
          )}
        </>
      )}

      <button type="button" className="v2-btn is-quiet" data-testid="race-list-nova" onClick={() => setOpenCreationMode('race')}>Marcar prova</button>
    </div>
  );
}
