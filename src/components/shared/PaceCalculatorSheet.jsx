import React, { useState } from 'react';
import { Calculator } from 'lucide-react';
import { Sheet } from './Sheet';
import GlassCard from './GlassCard';
import SectionLabel from './SectionLabel';
import Chip from './Chip';
import DurationInput from './DurationInput';
import { parseDurationToSeconds, formatDuration, formatPace } from '../../utils/run';
import {
  paceFromTotal, totalFromPace, parseDistanceKm, formatDistanceKm, DISTANCIAS_RAPIDAS,
} from '../../utils/paceMath';

/* Calculadora de ritmo — o atleta põe a distância e UM dos dois valores
   (ritmo ou tempo total), e o outro sai sozinho.

   Porque é que há um `ultimo` em vez de calcular os dois sempre: com dois
   campos ligados, quem escreve tem de mandar. Sem isto, escrever "5" no
   ritmo recalculava o tempo, que recalculava o ritmo, e o campo mexia-se
   debaixo dos dedos. `ultimo` guarda qual foi o campo escrito à mão — esse
   fica intocável e o outro é derivado. Mudar a distância recalcula o
   derivado, mantendo o que foi escrito: pôr 5:00/km e depois trocar de 5 km
   para 10 km responde "50:00", que é a pergunta que se estava a fazer.

   Os dois campos usam a máscara do DurationInput (dígitos da direita para a
   esquerda, os ":" nascem sozinhos) porque o teclado numérico do telemóvel
   não tem ":" — a mesma razão pela qual os registos de corrida já a usam. */
export default function PaceCalculatorSheet({ onClose }) {
  const [distancia, setDistancia] = useState('10');
  const [ritmo, setRitmo] = useState('5:30');
  const [tempo, setTempo] = useState('');
  const [ultimo, setUltimo] = useState('ritmo');

  const km = parseDistanceKm(distancia);
  const ritmoSeg = parseDurationToSeconds(ritmo);
  const tempoSeg = parseDurationToSeconds(tempo);

  // O derivado nunca vive em estado próprio: é sempre recalculado do que foi
  // escrito. Assim não há hipótese de ficar um valor velho no ecrã.
  const ritmoDerivado = ultimo === 'tempo' ? paceFromTotal(km, tempoSeg) : null;
  const tempoDerivado = ultimo === 'ritmo' ? totalFromPace(km, ritmoSeg) : null;

  const ritmoMostrado = ultimo === 'ritmo' ? ritmo : (ritmoDerivado ? formatDuration(ritmoDerivado) : '');
  const tempoMostrado = ultimo === 'tempo' ? tempo : (tempoDerivado ? formatDuration(tempoDerivado) : '');

  const ritmoFinal = ultimo === 'ritmo' ? ritmoSeg : ritmoDerivado;
  const tempoFinal = ultimo === 'tempo' ? tempoSeg : tempoDerivado;
  const completo = km && ritmoFinal && tempoFinal;

  const escolherDistancia = (valor) => setDistancia(String(valor).replace('.', ','));

  return (
    <Sheet eyebrow="Ferramentas" eyebrowTone="run" title="Calculadora de ritmo" onClose={onClose} maxHeight="70dvh" testId="pace-calculator">
      <div className="flex flex-col gap-3 pb-1">
        <SectionLabel tone="run">A distância</SectionLabel>
        <GlassCard padding={14} radius={20}>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-label="Distância em quilómetros"
              data-testid="pace-distancia"
              value={distancia}
              onChange={(e) => setDistancia(e.target.value)}
              placeholder="Ex.: 21,1"
              className="flex-1 min-w-0 bg-[var(--surface-soft)] border border-[var(--border-glass)] rounded-xl px-3 outline-none transition-colors focus:border-[var(--run)]"
              style={{ minHeight: 'var(--tap)', color: 'var(--text-1)', fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
            />
            <span className="text-[13px] font-bold shrink-0" style={{ color: 'var(--text-4)' }}>km</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {DISTANCIAS_RAPIDAS.map((d) => (
              <Chip
                key={d.km}
                variant="run"
                active={km === d.km}
                onClick={() => escolherDistancia(d.km)}
                aria-label={`Distância ${d.label}`}
              >
                {d.label}
              </Chip>
            ))}
          </div>
        </GlassCard>

        <SectionLabel tone="run">Escreve um, sai o outro</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <CampoTempo
            id="pace-calc-ritmo"
            rotulo="Ritmo"
            sufixo="/km"
            valor={ritmoMostrado}
            derivado={ultimo !== 'ritmo'}
            onChange={(v) => { setRitmo(v); setUltimo('ritmo'); }}
          />
          <CampoTempo
            id="pace-calc-tempo"
            rotulo="Tempo total"
            sufixo=""
            valor={tempoMostrado}
            derivado={ultimo !== 'tempo'}
            onChange={(v) => { setTempo(v); setUltimo('tempo'); }}
          />
        </div>

        {/* O resultado por extenso, na convenção da app para o ritmo (5.20/km).
            Não repete os campos por decoração: é a frase que se lê de uma vez,
            e é ela que confirma qual das três coisas mudou. */}
        <GlassCard tone="run" glow padding={14} radius={20}>
          {completo ? (
            <p className="text-[15px] font-black leading-snug" style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }} data-testid="pace-resultado">
              {formatDistanceKm(km)} a{' '}
              <span style={{ color: 'var(--run)' }}>{formatPace(ritmoFinal)}/km</span>
              {' '}são{' '}
              <span style={{ color: 'var(--run)' }}>{formatDuration(tempoFinal)}</span>
            </p>
          ) : (
            <p className="text-[12.5px]" style={{ color: 'var(--text-3)' }} data-testid="pace-resultado-vazio">
              Põe a distância e o ritmo (ou o tempo) e eu faço a conta.
            </p>
          )}
        </GlassCard>
      </div>
    </Sheet>
  );
}

/* Um campo de tempo com rótulo. `derivado` marca o que a calculadora
   preencheu: fica na cor da corrida e diz "calculado" por baixo, para o
   atleta nunca ter dúvidas sobre qual dos dois é a resposta. Continua
   editável — escrever nele passa a ser o valor escrito e inverte os papéis. */
function CampoTempo({ id, rotulo, sufixo, valor, derivado, onChange }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-[11px] font-bold block mb-1" style={{ color: 'var(--text-3)' }}>
        {rotulo}
      </label>
      <div className="relative">
        <DurationInput
          id={id}
          value={valor}
          onChange={onChange}
          placeholder="0:00"
          className="w-full bg-[var(--surface-soft)] border rounded-xl px-3 outline-none transition-colors focus:border-[var(--run)]"
          style={{
            minHeight: 'var(--tap)',
            paddingRight: sufixo ? 34 : 12,
            fontSize: 17,
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
            color: derivado ? 'var(--run)' : 'var(--text-1)',
            borderColor: derivado ? 'var(--tint-run-bd)' : 'var(--border-glass)',
            background: derivado ? 'var(--tint-run-bg)' : 'var(--surface-soft)',
          }}
        />
        {sufixo && (
          <span
            aria-hidden="true"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold pointer-events-none"
            style={{ color: 'var(--text-4)' }}
          >
            {sufixo}
          </span>
        )}
      </div>
      <span className="text-[11px] block mt-1" style={{ color: derivado ? 'var(--run)' : 'var(--text-muted)' }}>
        {derivado ? 'calculado' : 'escrito por ti'}
      </span>
    </div>
  );
}

export { Calculator as PaceCalculatorIcon };
