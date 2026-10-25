import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import CarolCena, { CENA_AREAS, CENA_MODOS } from './CarolCena';
import { prefersReducedMotion } from '../../utils/coachBubbles';

/* A pré-visualização das cenas da análise para o Rui (?cenas=preview, só com
   ?demo=true ou em desenvolvimento): o CarolCena real, 4 áreas × 4 modos, cada
   célula com o seu «Repetir», mais um «Repetir tudo». Cada modo é forçado (a prop
   `modo`), por isso vê-se tal e qual como na espera de uma análise — com os
   assets verdadeiros. Um modo que precise de um SVG que a área ainda não tem mostra
   «sem ficheiro» (na análise a sério esse modo sai do sorteio). */

const MODOS = { mascara: 'Máscara', traco: 'Traço', carreiras: 'Carreiras', pontos: 'Pontos' };
const AREAS = [['run', 'Corrida'], ['gym', 'Ginásio'], ['body', 'Corporal'], ['meal', 'Alimentação']];

function Celula({ kind, modo, ronda }) {
  const [volta, setVolta] = useState(0);
  return (
    <div data-testid={`cena-celula-${kind}-${modo}`} className="flex flex-col items-center" style={{ gap: 8 }}>
      <p className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--text-3)' }}>{MODOS[modo]}</p>
      <div className="flex items-center justify-center" style={{ minHeight: 160, minWidth: 119 }}>
        <CarolCena
          key={`${ronda}-${volta}`}
          kind={kind}
          modo={modo}
          size={160}
          aoCarregar={<span className="text-[11px]" style={{ color: 'var(--text-4)' }}>a carregar…</span>}
          fallback={<span className="text-[11px]" style={{ color: 'var(--text-4)' }}>sem ficheiro</span>}
        />
      </div>
      <button
        type="button"
        onClick={() => setVolta((v) => v + 1)}
        className="inline-flex items-center justify-center gap-1.5 text-[12px] font-bold rounded-full"
        style={{ minHeight: 44, padding: '0 14px', border: '1px solid var(--border-glass)', background: 'var(--surface-soft)', color: 'var(--text-2)' }}
        aria-label={`Repetir a animação ${MODOS[modo]} (${kind})`}
      >
        <RefreshCw size={13} aria-hidden="true" /> Repetir
      </button>
    </div>
  );
}

export default function CarolCenasPreview() {
  const [ronda, setRonda] = useState(0);
  const reduzido = prefersReducedMotion();
  return (
    <div data-testid="cenas-preview" className="min-h-screen px-4 py-6" style={{ background: 'var(--bg, #0b1623)', color: 'var(--text-1)' }}>
      <div className="mx-auto" style={{ maxWidth: 760 }}>
        <h1 className="text-lg font-black">Cenas da análise</h1>
        <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-3)' }}>
          As quatro animações de cada área, como na espera de uma análise (cada uma dura cerca de 2 s e acaba na imagem inteira).
          Na análise a sério sai uma à sorte, nunca a mesma duas vezes seguidas.
        </p>
        {reduzido && (
          <p role="note" className="text-[12px] mt-2 rounded-xl px-3 py-2" style={{ background: 'var(--surface-soft)', color: 'var(--text-2)' }}>
            O teu sistema pede menos movimento: só se vê a imagem final, sem animação.
          </p>
        )}
        <button
          type="button"
          onClick={() => setRonda((r) => r + 1)}
          className="mt-3 inline-flex items-center gap-2 text-[13px] font-extrabold rounded-xl"
          style={{ minHeight: 44, padding: '0 16px', background: 'var(--coach)', color: 'var(--coach-ink, #062a33)' }}
        >
          <RefreshCw size={15} aria-hidden="true" /> Repetir tudo
        </button>
        {AREAS.map(([kind, nome]) => (
          <section key={kind} className="mt-6" aria-label={nome}>
            <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--coach-soft)' }}>{nome} <span className="font-normal" style={{ color: 'var(--text-4)' }}>· carol-cenas/{CENA_AREAS[kind]}</span></h2>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {CENA_MODOS.map((modo) => <Celula key={modo} kind={kind} modo={modo} ronda={ronda} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
