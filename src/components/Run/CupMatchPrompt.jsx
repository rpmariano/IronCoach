import React, { useState } from 'react';
import { useAppStore } from '../../store';
import Button from '../shared/Button';
import { Dialog } from '../shared/Sheet';
import { useToast } from '../shared/ToastProvider';
import { lugarOficial, tempoOficial } from './CupClassificacao';

/* "És tu?" — a 1.ª correspondência de cada edição com a classificação
   oficial (specs/trofeu.md §7, Fase 4). 2026-09-27.

   O job liga pelo DORSAL a linha da classificação de uma jornada à inscrição
   (só se o escalão e o clube baterem) e deixa-a 'proposta': a primeira de
   cada edição e de cada dorsal pergunta-se aqui; as seguintes ligam-se
   sozinhas enquanto o escalão e o clube baterem. Se a linha dele mudar de
   identidade numa leitura seguinte ('perdida' com dados), pergunta-se de
   novo: "A tua linha mudou".

   - "Sim, sou eu" → confirm_cup_result (e o servidor confirma com ela as
     outras propostas do mesmo dorsal).
   - "Não sou eu" → pede confirmação e só depois reject_cup_result: apaga as
     linhas não confirmadas desse dorsal e a correspondência nunca mais o
     liga nesta edição (só mudar de dorsal desbloqueia).

   PRIVACIDADE. A linha mostra só o que é DELE e já está na BD: o lugar no
   escalão e o tempo (resultadoOficialPartes/lugarOficial/tempoOficial, sem
   pontos). Nunca um nome, um dorsal ou um clube — nem o dele: a proposta
   nem os traz (cupSlice lê coluna a coluna).

   Aparece no ecrã do Troféu (a mais antiga por confirmar, logo a seguir ao
   cabeçalho), na folha da jornada e no hub da prova. `idPrefix` dá ids
   únicos a cada sítio (o do topo e o da folha podem estar montados ao mesmo
   tempo); `onConfirmed`/`onRejected` levam o foco para onde cada ecrã quer
   (a pergunta desaparece — o foco não pode cair no body). */

const BOTAO = { minHeight: 44 };

/** As frases de falha da correspondência (view: round.matchIssue). Todas as
 *  falhas dão a mesma frase (§7) — um dorsal errado, um vizinho de 1 dígito,
 *  um escalão ou um clube que não batem —; só a falta de dorsal tem outra,
 *  porque aí o que fazer é diferente. */
export const MATCH_ISSUE_TEXT = Object.freeze({
  rever_dorsal: 'Não consegui confirmar. Revê o dorsal ou fala com o suporte.',
  sem_dorsal: 'Sem dorsal não consigo ler o teu resultado oficial. Junta-o em «Gerir inscrição».',
});

/** O texto da pergunta: { titulo, linha }. Pura (para os testes). */
export function perguntaDe(round) {
  const p = round?.proposal;
  if (!p) return null;
  const qual = [round.chip, round.name].filter(Boolean).join(' · ') || 'Esta jornada';
  const dados = [lugarOficial(p, { escalao: true }), tempoOficial(p)].filter(Boolean).join(', ');
  if (p.match_status === 'perdida') {
    return { titulo: 'A tua linha mudou', linha: `${qual}: agora ${dados}. Continua a ser tu?`, perdida: true };
  }
  return { titulo: 'És tu?', linha: `${qual}: ${dados}.`, perdida: false };
}

export default function CupMatchPrompt({ round, more = 0, idPrefix = 'cup-match', onConfirmed, onRejected }) {
  const confirmCupResult = useAppStore((s) => s.confirmCupResult);
  const rejectCupResult = useAppStore((s) => s.rejectCupResult);
  const { showToast } = useToast();
  const [busy, setBusy] = useState(null); // 'sim' | 'nao' | null
  const [perguntarNao, setPerguntarNao] = useState(false);

  const q = perguntaDe(round);
  if (!q) return null;
  const tituloId = `${idPrefix}-titulo`;
  const linhaId = `${idPrefix}-linha`;

  const sim = async () => {
    setBusy('sim');
    const res = await confirmCupResult(round.id);
    setBusy(null);
    if (!res?.ok) { showToast(res?.error?.message || 'Não foi possível confirmar.', 'error'); return; }
    showToast('Resultado confirmado.', 'success');
    onConfirmed?.();
  };

  const nao = async () => {
    setBusy('nao');
    const res = await rejectCupResult(round.id);
    setBusy(null);
    setPerguntarNao(false);
    if (!res?.ok) { showToast(res?.error?.message || 'Não foi possível apagar.', 'error'); return; }
    showToast('Apagado. Revê o dorsal em «Gerir inscrição».', 'success');
    onRejected?.();
  };

  return (
    <section
      aria-labelledby={tituloId}
      aria-busy={busy ? true : undefined}
      data-testid="cup-match"
      data-status={round.proposal.match_status}
      style={{ borderRadius: 20, background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', padding: 14 }}
    >
      <h2 id={tituloId} className="m-0 text-[14px] font-black" style={{ color: 'var(--text-1)' }}>{q.titulo}</h2>
      <p id={linhaId} className="m-0 text-[13px] font-bold mt-1" data-testid="cup-match-linha" style={{ color: 'var(--text-1)', lineHeight: 'var(--leading-normal)' }}>
        {q.linha}
      </p>
      {!q.perdida && (
        <p className="m-0 text-[12px] mt-1" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>
          Encontrámos esta linha pelo teu dorsal na classificação oficial. Confirma só se fores tu — as seguintes
          ligam-se sozinhas enquanto o escalão e o clube baterem.
        </p>
      )}
      {more > 0 && (
        <p className="m-0 text-[12px] mt-1" data-testid="cup-match-mais" style={{ color: 'var(--text-3)' }}>
          {more === 1 ? 'E mais 1 por confirmar.' : `E mais ${more} por confirmar.`}
        </p>
      )}
      <div className="flex flex-wrap gap-2 mt-2.5">
        <Button
          variant="module"
          moduleColor="var(--race)"
          size="sm"
          style={BOTAO}
          data-testid="cup-match-sim"
          aria-describedby={linhaId}
          isLoading={busy === 'sim'}
          disabled={!!busy}
          onClick={sim}
        >
          Sim, sou eu
        </Button>
        <Button
          variant="light"
          size="sm"
          style={BOTAO}
          data-testid="cup-match-nao"
          aria-describedby={linhaId}
          disabled={!!busy}
          onClick={() => setPerguntarNao(true)}
        >
          Não sou eu
        </Button>
      </div>

      {perguntarNao && (
        <Dialog
          title="Não és tu?"
          tone="warn"
          onClose={() => { if (!busy) setPerguntarNao(false); }}
          testId="cup-match-nao-dialog"
          actions={(
            <>
              <Button variant="danger" className="flex-1" isLoading={busy === 'nao'} onClick={nao} data-testid="cup-match-nao-confirmar">Não sou eu</Button>
              <Button variant="ghost" className="flex-1" disabled={busy === 'nao'} onClick={() => setPerguntarNao(false)}>Cancelar</Button>
            </>
          )}
        >
          <p className="m-0 text-[13px]" style={{ color: 'var(--text-2)', lineHeight: 'var(--leading-normal)' }}>
            Apagamos esta linha e deixamos de procurar resultados com este dorsal. Se o dorsal estiver errado,
            corrige-o em «Gerir inscrição».
          </p>
        </Dialog>
      )}
    </section>
  );
}
