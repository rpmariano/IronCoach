import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { describeDelta } from '../../utils/raceTimes';
import { formatDelta } from '../../utils/raceOutcome';

/* "Objetivo e previsão" — o bloco do hub antes da prova.

   Eram dois cartões lado a lado, "Objetivo" e "Previsão (VDOT)", cada um
   com o seu tempo e o seu ritmo, e nada mais: nem a diferença entre eles,
   nem uma leitura. O próprio texto de ajuda pedia ao atleta que comparasse
   sozinho — "serve para comparares com o Objetivo". Pedido do utilizador:
   dar relevância aos dois números e dizer o que a diferença significa.

   Os números vêm prontos de utils/raceTimes.js (raceForecast), que é o
   mesmo sítio de onde saem o bloco pós-prova e o contexto da Carol. */

const STANCE_TOM = {
  ambicioso: 'var(--warn)',
  conservador: 'var(--ok)',
  alinhado: 'var(--text-2)',
};

/* A versão de uma linha, para o hub reorganizado (2026-11-22): «Objetivo 1:45:00 · o treino aponta
   1:52:40 (7:40 mais lento)». A frase da leitura (`showLine`) só onde o hub a quer — longe da prova;
   na última semana é a do Plano para o dia. Sem objetivo, um link curto para o marcar
   (`onSetTarget`, os Detalhes), em vez do parágrafo. */
function ForecastLine({ forecast, showLine, onSetTarget, trail = false }) {
  const [showHelp, setShowHelp] = useState(false);
  const target = forecast?.target || null;
  const predicted = forecast?.predicted || null;
  if (!target && !predicted && !onSetTarget) return null;
  /* A diferença em número curto («+6:48»: o treino aponta mais lento do que o objetivo): a leitura
     por extenso é a frase de baixo (ou a do Plano) — dita uma vez só. */
  const delta = target && predicted
    ? (forecast.deltaSeconds === 0 ? '=' : `${forecast.deltaSeconds < 0 ? '+' : '−'}${formatDelta(Math.abs(forecast.deltaSeconds))}`)
    : null;
  const deltaLong = target && predicted
    ? (forecast.deltaSeconds === 0
      ? 'exatamente o tempo do objetivo'
      : `${formatDelta(Math.abs(forecast.deltaSeconds))} ${forecast.deltaSeconds < 0 ? 'mais lento' : 'mais rápido'} do que o objetivo`)
    : null;
  const equiv = Math.round((forecast?.effectiveDistanceKm || 0) * 10) / 10;
  return (
    <div data-testid="race-forecast" data-stance={forecast?.stance || 'sem-objetivo'} className="mt-2">
      <p className="text-[13px] leading-[1.5] text-[var(--text-2)] m-0">
        {target && <>Objetivo <strong className="text-[var(--race)]">{target.timeLabel}</strong>{target.paceLabel && <span className="text-[var(--text-3)]"> ({target.paceLabel})</span>}</>}
        {target && predicted && ' · '}
        {predicted && <>o treino aponta <strong className="text-[var(--run)]">{predicted.timeLabel}</strong>{predicted.paceLabel && <span className="text-[var(--text-3)]"> ({predicted.paceLabel})</span>}</>}
        {delta && (
          <> <span data-testid="race-forecast-delta" aria-hidden="true" className="font-extrabold" title={forecast.deltaSeconds === 0 ? 'Exatamente o mesmo tempo' : `${describeDelta(-forecast.deltaSeconds)} do que o objetivo`} style={{ color: STANCE_TOM[forecast.stance] || 'var(--text-2)' }}>({delta})</span><span className="sr-only" data-testid="race-forecast-delta-sr">({deltaLong})</span></>
        )}
        {predicted && (
          <button
            type="button"
            data-testid="race-forecast-help-toggle"
            onClick={() => setShowHelp((p) => !p)}
            className="tap-area-44 inline-flex align-[-3px] ml-1 rounded-full p-0.5"
            style={{ color: showHelp ? 'var(--coach)' : 'var(--text-3)', background: 'none', border: 'none' }}
            aria-label="Como é calculada a previsão"
            aria-expanded={showHelp}
            aria-controls="race-forecast-help"
          >
            <Info size={14} aria-hidden="true" />
          </button>
        )}
      </p>
      {predicted && (
        <div id="race-forecast-help" hidden={!showHelp} data-testid="race-forecast-help" className="mt-1.5 bg-[var(--tint-coach-bg)] border border-[var(--tint-coach-bd)] text-[var(--coach-soft)] text-[11px] leading-relaxed p-3 rounded-xl">
          <p className="m-0 font-medium">
            O tempo que o treino aponta sai da fórmula de Riegel, a partir da tua corrida mais rápida recente, ajustada a esta distância e ao teu nível
            {trail && equiv > 0 ? ` (aqui, ${String(equiv).replace('.', ',')} km — a distância real mais o desnível convertido em piso plano)` : ''}.
            O ritmo é sempre sobre a distância real da prova. Quanto mais perto a corrida de referência estiver desta distância, mais fiável é a estimativa.
          </p>
        </div>
      )}
      {!target && onSetTarget && (
        <button
          type="button"
          data-testid="race-forecast-set-target"
          onClick={onSetTarget}
          className="text-[12.5px] font-bold underline"
          style={{ minHeight: 'var(--tap)', color: 'var(--race)', background: 'none', border: 'none', padding: 0 }}
        >
          Marcar o objetivo de tempo
        </button>
      )}
      {/* A leitura: com os dois, onde o hub a quer; só com o objetivo, o que falta para a previsão. */}
      {((showLine && target && predicted) || (target && !predicted)) && forecast.line && (
        <p data-testid="race-forecast-line" className="text-[12px] leading-[1.45] mt-1 m-0" style={{ color: 'var(--text-3)' }}>{forecast.line}</p>
      )}
      {showLine && forecast?.lowConfidence && (
        <p data-testid="race-forecast-confianca" className="text-[11px] leading-[1.4] mt-1 mb-0" style={{ color: 'var(--text-4)' }}>
          A corrida que sustenta esta previsão é bem mais curta do que a prova, por isso é uma extrapolação. Regista uma mais longa e o número aperta.
        </p>
      )}
    </div>
  );
}

/* O bloco «Objetivo e previsão» do hub. Era um cartão com duas colunas; desde o hub por momento
   (2026-11-22) é só a linha (ForecastLine), com a ajuda «Como é calculada a previsão» num ⓘ — que
   num trail diz também a distância equivalente usada na conta. */
export default function RaceForecastCard({ forecast, raceType, elevationGainM, showLine = true, onSetTarget = null }) {
  return <ForecastLine forecast={forecast} showLine={showLine} onSetTarget={onSetTarget} trail={raceType === 'trail' && elevationGainM > 0} />;
}
