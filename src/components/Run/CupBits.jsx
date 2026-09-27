import React from 'react';
import { Calculator } from 'lucide-react';
import Button from '../shared/Button';
import { Dialog } from '../shared/Sheet';
import { dataLonga } from '../../utils/cupCalendar';

/* As peças pequenas do calendário do Troféu (specs/trofeu.md §4.3–§4.5,
   Fase 3), as mesmas em todos os ecrãs: o estado de uma jornada, a previsão
   calculada, o chip "J3" e a confirmação do "Não fui". 2026-09-27.

   Acessibilidade (§4.3): o estado vai SEMPRE em texto, com o ícone ao lado
   (escondido do leitor de ecrã — o texto já o diz), nunca só pela cor; o
   chip "J3" lê-se "Jornada 3"; a previsão diz ao leitor que é calculada. */

/** O estado de uma jornada (cupRoundStatus): ícone + texto, e o detalhe. */
export function CupStatus({ status, showDetail = true, className = '', style }) {
  if (!status) return null;
  return (
    <span className={`inline-flex items-baseline gap-1 min-w-0 ${className}`} style={style} data-testid="cup-status" data-status={status.key}>
      <span aria-hidden="true" className="shrink-0" style={{ color: status.color, fontWeight: 900 }}>{status.icon}</span>
      <span className="min-w-0">
        <span className="font-extrabold" style={{ color: status.color }}>{status.label}</span>
        {showDetail && status.detail ? <span style={{ color: 'var(--text-3)' }}> · {status.detail}</span> : null}
      </span>
    </span>
  );
}

/** A previsão de tempo, com o ícone de cálculo. Nunca se grava (§2.6). */
export function CupPrevisao({ label, className = '' }) {
  if (!label) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      title="Previsão calculada pelo teu treino — não fica gravada"
      data-testid="cup-previsao"
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      <Calculator size={12} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span><span className="sr-only">previsão calculada: </span>{label}</span>
    </span>
  );
}

/** O chip "J3" (a pílula da lista de provas, no tom da prova). */
export function JornadaChip({ chip, roundNo, roundLabel = 'Jornada' }) {
  if (!chip) return null;
  return (
    <span
      className="inline-flex items-center text-[11px] font-extrabold uppercase shrink-0"
      data-testid="cup-jornada-chip"
      style={{ height: 24, padding: '0 8px', borderRadius: 99, letterSpacing: '.04em', background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', color: 'var(--race)' }}
    >
      <span aria-hidden="true">{chip}</span>
      <span className="sr-only">{`${roundLabel} ${roundNo ?? ''}`.trim()}</span>
    </span>
  );
}

/** A prova da jornada é do próprio atleta: já a tinha marcada nesse dia e a
 *  sincronização ligou-a à jornada (race_events.cup_link_origin, §3.5).
 *  Quando a jornada deixa de a pedir ("Não vou", "Saltar", "Não fui"), essa
 *  NÃO se apaga — desliga-se e volta a ser a prova dele, como era
 *  (cup_release_race, M1). Só a que a sincronização criou sai. Os textos
 *  das confirmações dizem o que vai mesmo acontecer. */
export function provaDoAtleta(round) {
  return round?.race?.cup_link_origin != null;
}

/** A confirmação do "Não fui" (§4.5): grava 'nao_fui' e a prova sai das
 *  provas dele — ou, se já era dele antes da jornada (provaDoAtleta), volta
 *  a ser uma prova normal. O título diz o rótulo e o número ("Não foste à
 *  jornada 2?") — o nome da prova não diz o género ("à Légua", "ao
 *  Corta-mato"); o nome e a data vão logo a seguir. */
export function CupNaoFuiDialog({ round, roundLabel = 'Jornada', busy = false, onConfirm, onClose }) {
  if (!round) return null;
  const rotulo = String(roundLabel || 'Jornada').toLowerCase();
  const which = `${rotulo} ${round.round_no ?? ''}`.trim();
  const quando = dataLonga(round.date);
  return (
    <Dialog
      title={`Não foste à ${which}?`}
      tone="danger"
      onClose={onClose}
      testId="cup-nao-fui-dialog"
      actions={(
        <>
          <Button variant="danger" className="flex-1" isLoading={busy} onClick={onConfirm} data-testid="cup-nao-fui-confirmar">
            Não fui
          </Button>
          <Button variant="ghost" className="flex-1" disabled={busy} onClick={onClose} data-testid="cup-nao-fui-cancelar">
            Cancelar
          </Button>
        </>
      )}
    >
      {(round.name || quando) && (
        <p className="m-0 text-[13px] font-extrabold" style={{ color: 'var(--text-1)' }}>
          {[round.name, quando].filter(Boolean).join(' · ')}
        </p>
      )}
      <p className="m-0 text-[13px]" data-testid="cup-nao-fui-texto" style={{ color: 'var(--text-2)' }}>
        {provaDoAtleta(round)
          ? `A ${rotulo} fica como «Não fui». A prova já era tua antes da ${rotulo}: não se apaga, volta a ser uma prova normal (podes apagá-la no hub dela). Se afinal correste, usa «Registar».`
          : `A prova sai das tuas provas e a ${rotulo} fica como «Não fui». Se afinal correste, usa «Registar».`}
      </p>
    </Dialog>
  );
}

export default CupStatus;
