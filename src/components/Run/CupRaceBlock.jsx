import React, { useRef, useState } from 'react';
import { ChevronRight, Trophy } from 'lucide-react';
import { useAppStore } from '../../store';
import Button from '../shared/Button';
import { Dialog } from '../shared/Sheet';
import { useToast } from '../shared/ToastProvider';
import { useCupForRace } from '../../utils/useCup';
import { CupNaoFuiDialog, CupStatus, provaDoAtleta } from './CupBits';
import CupRoundPlanControls, { jornadaDe } from './CupRoundPlanControls';
import { CupLink, pontosLabel, resultadoOficialPartes, temClube } from './CupClassificacao';
import CupMatchPrompt, { MATCH_ISSUE_TEXT } from './CupMatchPrompt';

/* O bloco Troféu no hub da prova (specs/trofeu.md §4.4–§4.5, Fase 3).
   2026-09-27.

   Só para a prova de uma jornada, com inscrição ativa e a jornada na vista
   (useCupForRace). Para todas as outras provas — as de quem nunca se
   inscreveu, e as normais de quem está — devolve null sem ler nada: o hub
   fica exatamente como era.

   - Sempre a migalha "Troféu de Cascais · J3 de 11 ›", que leva ao ecrã do
     Troféu com a folha desta jornada aberta.
   - Antes: o papel e a previsão (com o ícone de cálculo, nunca gravada), o
     prazo de inscrição, e "Não vou".
   - Passou sem registo: "Não fui" (o "Registar a prova" já é do hub).
   - Depois: o resultado oficial (tempo, lugar no escalão, pontos, link) ou,
     sem ele, o lugar que o próprio registou; a coletiva do clube dele. O
     dorsal nunca — o herói do hub já mostra o que o diploma trouxe.

   "Não vou" e "Não fui" tiram a prova do calendário (a sincronização
   apaga-a) — ou, se a prova já era dele antes da jornada, desligam-na e ela
   volta a ser uma prova normal (provaDoAtleta, CupBits.jsx): o hub fecha-se
   ANTES de gravar, para não ficar aberto numa prova que deixou de existir
   (ou de ser da jornada). O resultado sai num aviso.

   A migalha pede primeiro o separador e só depois fecha o hub: com os
   "Detalhes da prova" alterados e por gravar, o navGuard do hub (RunAgenda)
   recusa a mudança e pergunta "sair sem gravar?" — fechar antes deixava as
   alterações para trás sem a pergunta. "Não vou", "Não fui" e "Saltar"
   também fecham o hub: pedem o navGuard ANTES de abrir a confirmação
   (revisão da Fase 3, aviso [c]) — recusado, nada abre e fica a pergunta
   dele.

   Fase 4 (2026-09-27): com uma linha por confirmar, o "És tu?"
   (CupMatchPrompt) — esteja ou não a prova registada; com uma falha da
   correspondência, a frase única e [Rever o dorsal] (o ecrã do Troféu com o
   "Gerir inscrição" aberto, pelo mesmo caminho da migalha). Os pontos
   calculados pela app dizem-se "provisórios". */

const BLOCO = {
  borderRadius: 20,
  background: 'var(--surface-glass)',
  border: '1px solid rgba(251,191,36,.24)',
  padding: 14,
  marginTop: 12,
  marginBottom: 12,
};

export default function CupRaceBlock({ race }) {
  const cup = useCupForRace(race);
  const setCupParticipation = useAppStore((s) => s.setCupParticipation);
  const markCupRoundNotAttended = useAppStore((s) => s.markCupRoundNotAttended);
  const { showToast } = useToast();
  const [confirmarNaoVou, setConfirmarNaoVou] = useState(false);
  const [confirmarNaoFui, setConfirmarNaoFui] = useState(false);
  const migalhaRef = useRef(null);

  if (!cup) return null;
  const { view, round } = cup;
  const which = jornadaDe(view, round);
  const total = view.progress?.total ?? null;
  const today = view.today || '';
  const day = typeof round.date === 'string' ? round.date.slice(0, 10) : null;
  const passada = !!day && day < today;
  const cancelada = round.date_status === 'cancelada';
  const status = round.status;
  const clube = temClube(view.enrollment, view.teams);
  const rotulo = String(view.roundLabel || 'Jornada').toLowerCase();

  const fecharHub = () => useAppStore.getState().setEditingRaceId(null);

  // O hub pode fechar? Com os "Detalhes da prova" por gravar, o navGuard
  // (RunAgenda) diz que não e pergunta "sair sem gravar?" — a mesma pergunta
  // da migalha, pedida antes de qualquer confirmação.
  const podeSair = () => {
    const s = useAppStore.getState();
    return !s.navGuard || s.navGuard(s.activeTab) !== false;
  };

  const abrirTrofeu = (pedido = { roundId: round.id }) => {
    const store = useAppStore.getState();
    // O separador primeiro: recusado (alterações por gravar), o hub fica
    // aberto com a pergunta do navGuard e não fica nenhum pedido pendurado.
    if (store.setActiveTab('provas') === false) return;
    store.setEditingRaceId(null);
    store.requestCupScreen(pedido);
  };

  const naoVou = async () => {
    setConfirmarNaoVou(false);
    fecharHub();
    const res = await setCupParticipation(round.id, { decision: 'nao_vou', decision_source: 'atleta' });
    showToast(res?.ok ? `A ${which} ficou como «Não vou».` : (res?.error?.message || 'Não foi possível gravar.'), res?.ok ? 'success' : 'error');
  };

  const naoFui = async () => {
    setConfirmarNaoFui(false);
    fecharHub();
    const res = await markCupRoundNotAttended(round.id);
    showToast(res?.ok ? 'Ficou como «Não fui».' : (res?.error?.message || 'Não foi possível gravar.'), res?.ok ? 'success' : 'error');
  };

  const oficiais = resultadoOficialPartes(round.result, { escalao: true });
  // A pergunta desaparece depois de responder: o foco fica na migalha (o
  // resultado confirmado aparece logo abaixo dela).
  const focarMigalha = () => setTimeout(() => migalhaRef.current?.focus(), 0);
  const lugarProprio = Number(round.run?.details?.age_group_position) > 0 ? Number(round.run.details.age_group_position) : null;
  const team = round.teamResult && clube ? round.teamResult : null;
  const teamPos = Number(team?.position) > 0 ? Number(team.position) : null;
  const linhaClube = team
    ? [teamPos ? `O teu clube ficou em ${teamPos}.º na coletiva desta ${rotulo}` : `A coletiva desta ${rotulo} já saiu`, pontosLabel(team.points)].filter(Boolean).join(' · ')
      + (team.points_source === 'calculado' ? ' (conta da app a partir da geral oficial)' : '')
    : null;
  const falha = !round.proposal && round.matchIssue ? MATCH_ISSUE_TEXT[round.matchIssue] || null : null;

  return (
    <div data-testid="cup-race-block" style={BLOCO}>
      <button
        ref={migalhaRef}
        type="button"
        data-testid="cup-race-migalha"
        onClick={() => abrirTrofeu()}
        aria-label={`Abrir o ${view.shortName}: ${which}${total ? ` de ${total}` : ''}`}
        className="w-full flex items-center gap-2 text-left"
        style={{ minHeight: 44, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--race)' }}
      >
        <Trophy size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span className="min-w-0 flex-1 truncate text-[12px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)' }}>
          {view.shortName} · {round.chip}{total ? ` de ${total}` : ''}
        </span>
        <ChevronRight size={16} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-4)' }} />
      </button>

      <p className="m-0 text-[12.5px] mt-1"><CupStatus status={status} /></p>

      {!round.done && !passada && !cancelada && (
        <div className="flex flex-col gap-2 mt-2.5">
          <CupRoundPlanControls
            view={view}
            round={round}
            canLeave={podeSair}
            onLeave={fecharHub}
          />
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            style={{ minHeight: 44 }}
            data-testid="cup-race-nao-vou"
            onClick={() => { if (podeSair()) setConfirmarNaoVou(true); }}
          >
            Não vou
          </Button>
        </div>
      )}

      {!round.done && passada && (status?.actions || []).includes('nao_fui') && (
        <div className="mt-2.5">
          <Button variant="light" size="sm" style={{ minHeight: 44 }} data-testid="cup-race-nao-fui" onClick={() => { if (podeSair()) setConfirmarNaoFui(true); }}>
            Não fui
          </Button>
        </div>
      )}

      {round.proposal && (
        <div className="mt-2.5">
          <CupMatchPrompt
            round={round}
            idPrefix={`cup-match-hub-${round.id}`}
            onConfirmed={focarMigalha}
            onRejected={focarMigalha}
          />
        </div>
      )}

      {falha && (
        <div className="flex flex-col gap-1.5 mt-2.5" data-testid="cup-race-correspondencia">
          <p className="m-0 text-[12.5px] font-bold" style={{ color: 'var(--warn)', lineHeight: 'var(--leading-normal)' }}>{falha}</p>
          <Button
            variant="light"
            size="sm"
            className="self-start"
            style={{ minHeight: 44 }}
            data-testid="cup-race-rever-dorsal"
            onClick={() => abrirTrofeu({ mode: 'gerir' })}
          >
            Rever o dorsal
          </Button>
        </div>
      )}

      {round.done && (
        <div className="flex flex-col gap-1 mt-2" data-testid="cup-race-resultado">
          {/* Com a linha por confirmar, a pergunta (acima) está no lugar dela. */}
          {round.proposal ? null : oficiais.length > 0 ? (
            <>
              <p className="m-0 text-[13px] font-bold" style={{ color: 'var(--text-1)' }}>{oficiais.join(' · ')}</p>
              {round.results_url
                ? <CupLink href={round.results_url} label={`Classificação da ${round.chip}`} testId="cup-race-link-classificacao" />
                : <CupLink href={view.edition?.standings_url} label="Classificação geral" testId="cup-race-link-classificacao" />}
            </>
          ) : (
            <>
              <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-3)' }}>Ainda sem classificação oficial.</p>
              {lugarProprio && (
                <p className="m-0 text-[12.5px]" data-testid="cup-race-lugar-proprio" style={{ color: 'var(--text-2)' }}>
                  Lugar no escalão (registado por ti): {lugarProprio}.º
                </p>
              )}
            </>
          )}
          {linhaClube && (
            <p className="m-0 text-[12.5px] mt-1" data-testid="cup-race-coletiva" style={{ color: 'var(--text-2)' }}>{linhaClube}</p>
          )}
          {clube && <CupLink href={round.team_results_url} label={`Coletiva da ${round.chip}`} testId="cup-race-link-coletiva" />}
        </div>
      )}

      {confirmarNaoVou && (
        <Dialog
          title={`Não vais à ${which}?`}
          tone="warn"
          onClose={() => setConfirmarNaoVou(false)}
          testId="cup-race-nao-vou-dialog"
          actions={(
            <>
              <Button variant="danger" className="flex-1" onClick={naoVou} data-testid="cup-race-nao-vou-confirmar">Não vou</Button>
              <Button variant="ghost" className="flex-1" onClick={() => setConfirmarNaoVou(false)}>Cancelar</Button>
            </>
          )}
        >
          <p className="m-0 text-[13px]" style={{ color: 'var(--text-2)', lineHeight: 'var(--leading-normal)' }}>
            {provaDoAtleta(round)
              ? `A ${rotulo} fica «Não vou». A prova já era tua antes da ${rotulo}: não sai do calendário, volta a ser uma prova normal.`
              : `A prova sai do calendário e a ${rotulo} fica «Não vou».`}
          </p>
        </Dialog>
      )}

      {confirmarNaoFui && (
        <CupNaoFuiDialog
          round={round}
          roundLabel={view.roundLabel}
          onConfirm={naoFui}
          onClose={() => setConfirmarNaoFui(false)}
        />
      )}
    </div>
  );
}
