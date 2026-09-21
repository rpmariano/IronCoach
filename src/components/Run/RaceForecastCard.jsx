import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { describeDelta } from '../../utils/raceTimes';

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

function Coluna({ label, line, cor }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--text-4)', letterSpacing: '.05em' }}>{label}</div>
      <div className="text-[17px] font-black leading-[1.15] mt-1" style={{ color: cor }}>{line.timeLabel}</div>
      {line.paceLabel && (
        <div className="text-[12px] font-bold mt-0.5" style={{ color: 'var(--text-3)' }}>{line.paceLabel}</div>
      )}
    </div>
  );
}

export default function RaceForecastCard({ forecast, raceType, elevationGainM }) {
  const [showHelp, setShowHelp] = useState(false);
  if (!forecast?.predicted) return null;

  const { target, predicted, deltaSeconds, stance, lowConfidence, effectiveDistanceKm } = forecast;
  const equiv = Math.round((effectiveDistanceKm || 0) * 10) / 10;
  const trail = raceType === 'trail' && elevationGainM > 0;

  return (
    <div className="rh-spec-card rh-spec-card-wide" data-testid="race-forecast" data-stance={stance || 'sem-objetivo'} style={{ padding: '10px 12px 12px' }}>
      <div className="w-full flex items-center justify-center relative">
        <span className="rh-spec-lbl">{target ? 'Objetivo e previsão' : 'Previsão'}</span>
        <button
          type="button"
          onClick={() => setShowHelp((p) => !p)}
          className={`tap-area-44 absolute right-0 top-1/2 -translate-y-1/2 rounded-full p-1 transition-all ${
            showHelp ? 'text-[var(--coach)] bg-[var(--surface-strong)]' : 'text-[var(--text-3)] hover:text-[var(--coach-soft)] active:bg-[var(--surface-strong)]'
          }`}
          aria-label="Como é calculada a previsão"
          aria-expanded={showHelp}
        >
          <Info size={14} />
        </button>
      </div>

      <div className="w-full flex items-start gap-3 mt-2 text-left">
        {target && <Coluna label="O teu objetivo" line={target} cor="var(--race)" />}
        <Coluna label="O treino aponta" line={predicted} cor="var(--run)" />
      </div>

      {/* A diferença é o que ele quer mesmo saber: quanto falta, ou quanta
          margem tem. Em número, não dentro de uma frase. */}
      {target && (
        <div
          data-testid="race-forecast-delta"
          className="w-full mt-2.5 pt-2.5 text-left"
          style={{ borderTop: '1px solid var(--border-glass)' }}
        >
          <div className="text-[12.5px] font-extrabold" style={{ color: STANCE_TOM[stance] || 'var(--text-2)' }}>
            {deltaSeconds === 0 ? 'Exatamente o mesmo tempo' : `${describeDelta(-deltaSeconds)} do que o objetivo`}
          </div>
          <p className="text-[12px] leading-[1.45] mt-1 m-0" style={{ color: 'var(--text-3)' }}>{forecast.line}</p>
        </div>
      )}
      {!target && (
        <p className="w-full text-[12px] leading-[1.45] mt-2 mb-0 text-left" style={{ color: 'var(--text-3)' }}>{forecast.line}</p>
      )}

      {lowConfidence && (
        <p data-testid="race-forecast-confianca" className="w-full text-[11px] leading-[1.4] mt-2 mb-0 text-left" style={{ color: 'var(--text-4)' }}>
          A corrida que sustenta esta previsão é bem mais curta do que a prova, por isso é uma extrapolação. Regista uma mais longa e o número aperta.
        </p>
      )}

      {showHelp && (
        <div className="w-full mt-2.5 pt-2.5 border-t border-[var(--border-glass)] text-left fade-in">
          <div className="bg-[var(--tint-coach-bg)] border border-[var(--tint-coach-bd)] text-[var(--coach-soft)] text-[11px] leading-relaxed p-3 rounded-xl flex items-start gap-2.5 shadow-lg">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-[var(--coach)]" />
            <p className="flex-1 font-medium m-0">
              O tempo que o treino aponta sai da fórmula de Riegel, a partir da tua corrida mais rápida recente, ajustada a esta distância e ao teu nível
              {trail ? ` (aqui, ${equiv} km — a distância real mais o desnível convertido em piso plano)` : ''}.
              O ritmo é sempre sobre a distância real da prova. Quanto mais perto a corrida de referência estiver desta distância, mais fiável é a estimativa.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
