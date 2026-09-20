import React, { useRef, useState } from 'react';
import { readDiploma, describeDiplomaReading } from '../../utils/diplomaReading';

/* A Carol lê o diploma (pedido 2026-09-13) — o cartão e o estado da leitura,
   partilhados pelo registo da prova (RunRegistration, bloco "Memórias") e
   pela persiana "Memórias" do hub (RaceMemoriesSheet). O diploma chega
   quase sempre depois da corrida, por e-mail, e junta-se onde calhar; a
   leitura tem de aparecer AO LADO do diploma, seja ele posto onde for —
   não numa secção lá em cima que o atleta já não está a ver.

   Estados: reading → applied (fica visível a confirmar o que entrou) |
   failed (a mensagem e a dica para preencher à mão).

   O diploma É o documento oficial da prova: o que se conseguir ler dele
   ganha ao que foi escrito à mão, e aplica-se sozinho — pedido do
   utilizador, depois de a leitura ter corrido três vezes com sucesso e os
   números nunca terem chegado à corrida por faltar o toque em "Aplicar".
   O passo `ready`, com o botão, deixou de existir; o cartão passa a dizer
   o que entrou em vez de pedir licença. Enganando-se a leitura, o atleta
   corrige em "Editar a corrida" — caminho que o cartão indica. */

export function useDiplomaReading() {
  const [state, setState] = useState(null);
  // Trocar de imagem a meio de uma leitura: só a resposta ao pedido mais
  // recente conta (revisão pré-deploy 2026-09-13).
  const requestRef = useRef(0);
  const clear = () => { requestRef.current += 1; setState(null); };

  const ask = async (memory) => {
    // Trocar a imagem por um PDF: a leitura anterior já não é deste ficheiro.
    if (!memory || memory.isPdf) { clear(); return null; }
    const requestId = ++requestRef.current;
    setState({ status: 'reading', reading: null, error: '' });
    try {
      const reading = await readDiploma(memory);
      if (requestId !== requestRef.current) return null;
      // Fica em 'reading' até quem chamou aplicar: o cartão nunca chega a
      // mostrar um estado à espera de decisão que já não existe.
      setState({ status: 'reading', reading, error: '' });
      return reading;
    } catch (err) {
      if (requestId !== requestRef.current) return null;
      console.warn('Leitura do diploma falhou', err);
      setState({ status: 'failed', reading: null, error: err?.message || 'Não consegui ler o diploma.' });
    }
    return null;
  };
  const markApplying = () => setState((prev) => (prev ? { ...prev, applying: true, error: '' } : prev));
  const markApplied = () => setState((prev) => (prev ? { ...prev, status: 'applied', applying: false, error: '' } : prev));
  const failApply = (message) => setState((prev) => (prev ? { ...prev, applying: false, error: message || 'Não consegui gravar. Tenta outra vez.' } : prev));

  return { state, ask, clear, markApplying, markApplied, failApply };
}

const titleFor = (status, appliedLabel) => {
  if (status === 'reading') return 'A Carol está a ler o diploma…';
  if (status === 'applied') return appliedLabel;
  return 'Diploma por ler';
};

export default function DiplomaReadingCard({
  state,
  appliedLabel = 'Aplicado ao registo',
  appliedHint = '',
  manualHint = 'Podes preencher à mão.',
}) {
  if (!state) return null;
  const { status, reading, error } = state;
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
        <div aria-label="A ler o diploma" className="flex flex-col gap-2 mt-2">
          <span className="block h-3 rounded-full w-full" style={{ background: 'rgba(255,255,255,.08)' }} />
          <span className="block h-3 rounded-full w-2/3" style={{ background: 'rgba(255,255,255,.08)' }} />
        </div>
      )}

      {status === 'applied' && (
        <p className="text-[12.5px] leading-[1.5] mt-1.5" style={{ color: 'var(--text-1)' }}>{summary}</p>
      )}

      {status === 'applied' && (
        <>
          {reading?.athlete_name && (
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-4)' }}>Em nome de {reading.athlete_name}.</p>
          )}
          {appliedHint && <p className="text-[11px] mt-1" style={{ color: 'var(--text-4)' }}>{appliedHint}</p>}
          {error && <p data-testid="diploma-reading-error" className="text-[12px] leading-[1.5] mt-2" style={{ color: 'var(--danger)' }}>{error}</p>}
        </>
      )}

      {status === 'failed' && (
        <p className="text-[12px] leading-[1.5] mt-1.5" style={{ color: 'var(--text-3)' }}>{error} {manualHint}</p>
      )}
    </div>
  );
}
