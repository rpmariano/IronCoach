import React, { useRef, useState } from 'react';
import { readDiploma, describeDiplomaReading } from '../../utils/diplomaReading';

/* A Carol lê o diploma (pedido 2026-09-13) — o cartão e o estado da leitura,
   partilhados pelo registo da prova (RunRegistration, bloco "Memórias") e
   pela persiana "Memórias" do hub (RaceMemoriesSheet). O diploma chega
   quase sempre depois da corrida, por e-mail, e junta-se onde calhar; a
   leitura tem de aparecer AO LADO do diploma, seja ele posto onde for —
   não numa secção lá em cima que o atleta já não está a ver.

   Estados: reading → ready (Aplicar/Ignorar) → applied (fica visível a
   confirmar o que entrou) | failed (a mensagem e a dica para preencher à
   mão). Nada se grava sem o atleta tocar em "Aplicar". */

export function useDiplomaReading() {
  const [state, setState] = useState(null);
  // Trocar de imagem a meio de uma leitura: só a resposta ao pedido mais
  // recente conta (revisão pré-deploy 2026-09-13).
  const requestRef = useRef(0);

  const ask = async (memory) => {
    if (!memory || memory.isPdf) return;
    const requestId = ++requestRef.current;
    setState({ status: 'reading', reading: null, error: '' });
    try {
      const reading = await readDiploma(memory);
      if (requestId !== requestRef.current) return;
      setState({ status: 'ready', reading, error: '' });
    } catch (err) {
      if (requestId !== requestRef.current) return;
      console.warn('Leitura do diploma falhou', err);
      setState({ status: 'failed', reading: null, error: err?.message || 'Não consegui ler o diploma.' });
    }
  };
  const clear = () => { requestRef.current += 1; setState(null); };
  const markApplying = () => setState((prev) => (prev ? { ...prev, applying: true, error: '' } : prev));
  const markApplied = () => setState((prev) => (prev ? { ...prev, status: 'applied', applying: false, error: '' } : prev));
  const failApply = (message) => setState((prev) => (prev ? { ...prev, applying: false, error: message || 'Não consegui gravar. Tenta outra vez.' } : prev));

  return { state, ask, clear, markApplying, markApplied, failApply };
}

const titleFor = (status, appliedLabel) => {
  if (status === 'reading') return 'A Carol está a ler o diploma…';
  if (status === 'ready') return 'A Carol leu o diploma';
  if (status === 'applied') return appliedLabel;
  return 'Diploma por ler';
};

export default function DiplomaReadingCard({
  state,
  onApply,
  onDismiss,
  applyLabel = 'Aplicar ao registo',
  appliedLabel = 'Aplicado ao registo',
  appliedHint = '',
  manualHint = 'Podes preencher à mão.',
}) {
  if (!state) return null;
  const { status, reading, error, applying } = state;
  const summary = describeDiplomaReading(reading);

  return (
    <div
      data-testid="diploma-reading"
      data-status={status}
      aria-live="polite"
      className="mt-3"
      style={{ borderRadius: 16, background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', padding: 12 }}
    >
      <div className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: '.06em', color: 'var(--coach-soft)' }}>
        {titleFor(status, appliedLabel)}
      </div>

      {status === 'reading' && (
        <div role="status" aria-label="A ler o diploma" className="flex flex-col gap-2 mt-2">
          <span className="block h-3 rounded-full w-full" style={{ background: 'rgba(255,255,255,.08)' }} />
          <span className="block h-3 rounded-full w-2/3" style={{ background: 'rgba(255,255,255,.08)' }} />
        </div>
      )}

      {(status === 'ready' || status === 'applied') && (
        <p className="text-[12.5px] leading-[1.5] mt-1.5" style={{ color: 'var(--text-1)' }}>{summary}</p>
      )}

      {status === 'ready' && (
        <>
          {reading?.athlete_name && (
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-4)' }}>Em nome de {reading.athlete_name}. Confirma antes de aplicar.</p>
          )}
          <div className="flex gap-2 mt-2.5">
            <button
              type="button"
              data-testid="diploma-reading-apply"
              onClick={onApply}
              disabled={!!applying}
              className="inline-flex items-center justify-center rounded-[11px] text-[12.5px] font-extrabold disabled:opacity-60"
              style={{ minHeight: 44, padding: '0 14px', background: 'var(--grad-coach-legible)', color: 'var(--coach-ink)', border: 'none' }}
            >
              {applying ? 'A aplicar…' : applyLabel}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              disabled={!!applying}
              className="inline-flex items-center justify-center rounded-[11px] text-[12.5px] font-bold disabled:opacity-60"
              style={{ minHeight: 44, padding: '0 12px', background: 'transparent', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' }}
            >
              Ignorar
            </button>
          </div>
          {error && <p role="alert" className="text-[12px] leading-[1.5] mt-2" style={{ color: 'var(--danger)' }}>{error}</p>}
        </>
      )}

      {status === 'applied' && appliedHint && (
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-4)' }}>{appliedHint}</p>
      )}

      {status === 'failed' && (
        <p className="text-[12px] leading-[1.5] mt-1.5" style={{ color: 'var(--text-3)' }}>{error} {manualHint}</p>
      )}
    </div>
  );
}
