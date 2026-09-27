import React, { useMemo, useState } from 'react';
import { useAppStore } from '../../store';
import Button from '../shared/Button';
import { Dialog } from '../shared/Sheet';
import { useToast } from '../shared/ToastProvider';
import { promotionPreview } from '../../utils/cupCalendar';
import { useCupForRace } from '../../utils/useCup';
import { jornadaDe } from './CupRoundPlanControls';

/* Promover uma jornada a principal (specs/trofeu.md §4.3, Fase 3) — "ação no
   ecrã do Troféu com o custo dito antes". 2026-09-27.

   O custo diz-se ANTES de gravar, com as contas de promotionPreview (as
   mesmas regras dos papéis e do taper que a Carol usa): os dias de afinação
   e de recuperação de uma principal, as outras jornadas que mudam de papel,
   e as principais de fora que ficam perto — essas mandam sempre, e a Carol
   vai pedir para escolherem juntos. "Cancelar" não grava nada.

   `onConfirm` (opcional): quem abre o diálogo trata da escrita. É o caso do
   seletor "Prioridade desta prova" nos detalhes do hub (RunAgenda): lá a
   escolha entra no rascunho e grava-se com o resto do formulário — o
   diálogo só diz o custo antes. Sem ele, "Promover" grava logo. */
export default function CupPromoteDialog({ view, round, onClose, onConfirm = null }) {
  const raceEvents = useAppStore((s) => s.raceEvents);
  const coachPlans = useAppStore((s) => s.coachPlans);
  const profile = useAppStore((s) => s.profile);
  const runs = useAppStore((s) => s.runs);
  const setCupRoundPriority = useAppStore((s) => s.setCupRoundPriority);
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const preview = useMemo(
    () => (round?.id ? promotionPreview(view, round.id, { raceEvents, coachPlans, profile, runs, today: view?.today }) : null),
    [view, round?.id, raceEvents, coachPlans, profile, runs],
  );
  const which = jornadaDe(view, round);

  const promover = async () => {
    if (onConfirm) { onConfirm(); return; }
    setBusy(true);
    const res = await setCupRoundPriority(round.id, 'a');
    setBusy(false);
    if (!res?.ok) { showToast(res?.error?.message || 'Não foi possível promover.', 'error'); return; }
    showToast(`A ${which} passou a principal.`, 'success');
    onClose();
  };

  return (
    <Dialog
      title={`Promover a ${which} a principal?`}
      tone="warn"
      onClose={onClose}
      testId="cup-promover-dialog"
      actions={(
        <>
          <Button variant="module" moduleColor="var(--race)" className="flex-1" isLoading={busy} disabled={!preview} onClick={promover} data-testid="cup-promover-confirmar">
            Promover
          </Button>
          <Button variant="ghost" className="flex-1" disabled={busy} onClick={onClose} data-testid="cup-promover-cancelar">
            Cancelar
          </Button>
        </>
      )}
    >
      {preview ? (
        preview.lines.map((line) => (
          <p key={line} className="m-0 text-[13px]" data-testid="cup-promover-linha" style={{ color: 'var(--text-2)', lineHeight: 'var(--leading-normal)' }}>
            {line}
          </p>
        ))
      ) : (
        <p className="m-0 text-[13px]" style={{ color: 'var(--text-3)', lineHeight: 'var(--leading-normal)' }}>
          Esta {String(view?.roundLabel || 'Jornada').toLowerCase()} ainda não tem prova no teu calendário.
        </p>
      )}
    </Dialog>
  );
}

/* O seletor "Prioridade desta prova" nos detalhes do hub (RunAgenda) também
   promove — e gravava 'a' numa jornada sem dizer o custo (revisão da Fase
   3). Com esta guarda, escolher "Principal" numa jornada do Troféu abre
   primeiro este diálogo; só o "Promover" dele põe a 'a' no rascunho, que se
   grava com o resto do formulário. Voltar a secundária, ou passar a treino,
   continua direto.

   `race`: a prova em edição — só uma com `cup_round_id` lê alguma coisa
   (useCupForRace); para as outras, e sem inscrição ou sem a jornada na
   vista (outra época), a guarda não interceta nada e o seletor fica como
   era. `onPromote`: põe a 'a' no rascunho. Devolve { intercept(valor,
   atual) → true se abriu o diálogo, dialog }. */
export function useCupPromoteGuard(race, onPromote) {
  const cup = useCupForRace(race);
  const [aberto, setAberto] = useState(false);
  const intercept = (value, current) => {
    if (!cup || value !== 'a' || current === 'a') return false;
    setAberto(true);
    return true;
  };
  const dialog = aberto && cup ? (
    <CupPromoteDialog
      view={cup.view}
      round={cup.round}
      onClose={() => setAberto(false)}
      onConfirm={() => { setAberto(false); onPromote?.(); }}
    />
  ) : null;
  return { intercept, dialog };
}
