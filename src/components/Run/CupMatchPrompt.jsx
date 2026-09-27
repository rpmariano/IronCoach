import React, { useState } from 'react';
import { useAppStore } from '../../store';
import Button from '../shared/Button';
import { Dialog } from '../shared/Sheet';
import { useToast } from '../shared/ToastProvider';
import { lugarOficial, pontosLabel, tempoOficial } from './CupClassificacao';

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
   (a pergunta desaparece — o foco não pode cair no body).

   A GERAL PELA CHAVE ALTERNATIVA (tarefa 9, 2026-09-27): quando o nome
   inteiro não acha a linha dele na classificação geral, o job tenta o 1.º e
   o último nome com o escalão, o clube e o ano, e deixa-a por confirmar.
   CupStandingPrompt pergunta "És tu? 12.º M40 na geral · 43 pontos." — só o
   lugar no escalão e o total, nunca um nome — com a mesma acessibilidade:
   "Sim, sou eu" → confirm_cup_standing; "Não sou eu" pede confirmação e
   reject_cup_standing (apaga-a e essa ligação nunca mais se propõe). Até ao
   "sim", os pontos das jornadas ficam provisórios. */

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

/** A pergunta da geral pela chave alternativa: { titulo, linha } — "12.º
 *  M40 na geral · 43 pontos." Só com a linha 'proposta' e um lugar. Pura. */
export function perguntaGeralDe(standing) {
  if (standing?.match_status !== 'proposta') return null;
  const rank = Number(standing.category_rank);
  if (!Number.isFinite(rank) || rank <= 0) return null;
  const code = standing.category_code ? `${standing.category_code} ` : '';
  const pts = pontosLabel(standing.total_points);
  return { titulo: 'És tu?', linha: `${rank}.º ${code}na geral${pts ? ` · ${pts}` : ''}.` };
}

/* O cartão da pergunta (o das jornadas e o da geral): o título, a linha
   (a descrição dos dois botões), a explicação, "Sim, sou eu" e "Não sou
   eu" com confirmação. `testId` é a base dos data-testid. */
function PerguntaEsTu({ q, status, testId, idPrefix, explicacao, more = 0, dialogo, onSim, onNao }) {
  const [busy, setBusy] = useState(null); // 'sim' | 'nao' | null
  const [perguntarNao, setPerguntarNao] = useState(false);
  const tituloId = `${idPrefix}-titulo`;
  const linhaId = `${idPrefix}-linha`;

  const sim = async () => {
    setBusy('sim');
    await onSim();
    setBusy(null);
  };

  const nao = async () => {
    setBusy('nao');
    await onNao();
    setBusy(null);
    setPerguntarNao(false);
  };

  return (
    <section
      aria-labelledby={tituloId}
      aria-busy={busy ? true : undefined}
      data-testid={testId}
      data-status={status}
      style={{ borderRadius: 20, background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', padding: 14 }}
    >
      <h2 id={tituloId} className="m-0 text-[14px] font-black" style={{ color: 'var(--text-1)' }}>{q.titulo}</h2>
      <p id={linhaId} className="m-0 text-[13px] font-bold mt-1" data-testid={`${testId}-linha`} style={{ color: 'var(--text-1)', lineHeight: 'var(--leading-normal)' }}>
        {q.linha}
      </p>
      {explicacao && (
        <p className="m-0 text-[12px] mt-1" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>{explicacao}</p>
      )}
      {more > 0 && (
        <p className="m-0 text-[12px] mt-1" data-testid={`${testId}-mais`} style={{ color: 'var(--text-3)' }}>
          {more === 1 ? 'E mais 1 por confirmar.' : `E mais ${more} por confirmar.`}
        </p>
      )}
      <div className="flex flex-wrap gap-2 mt-2.5">
        <Button
          variant="module"
          moduleColor="var(--race)"
          size="sm"
          style={BOTAO}
          data-testid={`${testId}-sim`}
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
          data-testid={`${testId}-nao`}
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
          testId={`${testId}-nao-dialog`}
          actions={(
            <>
              <Button variant="danger" className="flex-1" isLoading={busy === 'nao'} onClick={nao} data-testid={`${testId}-nao-confirmar`}>Não sou eu</Button>
              <Button variant="ghost" className="flex-1" disabled={busy === 'nao'} onClick={() => setPerguntarNao(false)}>Cancelar</Button>
            </>
          )}
        >
          <p className="m-0 text-[13px]" style={{ color: 'var(--text-2)', lineHeight: 'var(--leading-normal)' }}>{dialogo}</p>
        </Dialog>
      )}
    </section>
  );
}

export default function CupMatchPrompt({ round, more = 0, idPrefix = 'cup-match', onConfirmed, onRejected }) {
  const confirmCupResult = useAppStore((s) => s.confirmCupResult);
  const rejectCupResult = useAppStore((s) => s.rejectCupResult);
  const { showToast } = useToast();

  const q = perguntaDe(round);
  if (!q) return null;

  const sim = async () => {
    const res = await confirmCupResult(round.id);
    if (!res?.ok) { showToast(res?.error?.message || 'Não foi possível confirmar.', 'error'); return; }
    showToast('Resultado confirmado.', 'success');
    onConfirmed?.();
  };

  const nao = async () => {
    const res = await rejectCupResult(round.id);
    if (!res?.ok) { showToast(res?.error?.message || 'Não foi possível apagar.', 'error'); return; }
    showToast('Apagado. Revê o dorsal em «Gerir inscrição».', 'success');
    onRejected?.();
  };

  return (
    <PerguntaEsTu
      q={q}
      status={round.proposal.match_status}
      testId="cup-match"
      idPrefix={idPrefix}
      more={more}
      explicacao={q.perdida ? null : 'Encontrámos esta linha pelo teu dorsal na classificação oficial. Confirma só se fores tu — as seguintes ligam-se sozinhas enquanto o escalão e o clube baterem.'}
      dialogo="Apagamos esta linha e deixamos de procurar resultados com este dorsal. Se o dorsal estiver errado, corrige-o em «Gerir inscrição»."
      onSim={sim}
      onNao={nao}
    />
  );
}

/** "És tu?" da classificação GERAL (a chave alternativa, por confirmar). */
export function CupStandingPrompt({ standing, enrollmentId, idPrefix = 'cup-match-geral', onConfirmed, onRejected }) {
  const confirmCupStanding = useAppStore((s) => s.confirmCupStanding);
  const rejectCupStanding = useAppStore((s) => s.rejectCupStanding);
  const { showToast } = useToast();

  const q = perguntaGeralDe(standing);
  if (!q || !enrollmentId) return null;

  const sim = async () => {
    const res = await confirmCupStanding(enrollmentId);
    if (!res?.ok) { showToast(res?.error?.message || 'Não foi possível confirmar.', 'error'); return; }
    showToast('Classificação geral confirmada.', 'success');
    onConfirmed?.();
  };

  const nao = async () => {
    const res = await rejectCupStanding(enrollmentId);
    if (!res?.ok) { showToast(res?.error?.message || 'Não foi possível apagar.', 'error'); return; }
    showToast('Apagado. Não voltamos a propor esta linha da geral.', 'success');
    onRejected?.();
  };

  return (
    <PerguntaEsTu
      q={q}
      status="proposta"
      testId="cup-match-geral"
      idPrefix={idPrefix}
      explicacao="Encontrámos esta linha na classificação geral com o teu escalão, o teu clube e o teu ano, mas com o nome escrito de outra forma. Confirma só se fores tu — até lá, os pontos das jornadas ficam provisórios."
      dialogo="Apagamos esta linha da classificação geral e não a voltamos a propor. Os teus resultados das jornadas ficam como estão."
      onSim={sim}
      onNao={nao}
    />
  );
}
