import { useCallback, useEffect, useMemo } from 'react';
import { useAppStore } from '../store';
import useBadges from './useBadges';
import { isFormOpen } from './formGuard';
import { colapsarMedios, planBadgeMoments } from './badgeMoment';

/* QUANDO é que o momento do badge aparece (fase 4 da reforma da
   gamificação). Nasceu do molde do momento da medalha, e de propósito: o
   Palmarés já tinha resolvido este problema, e quando saiu (fase C) esta
   passou a ser a única cerimónia do Início.

   - A sincronização é a do `useBadges` (uma vez por sessão, e outra quando
     muda o número de badges devidos ou o dia). Não há aqui uma segunda: a
     lista do que falta ver é UMA em toda a app, senão o mesmo badge tocava
     no Início e voltava a tocar na Vitrina.
   - Nunca com um formulário aberto (`isFormOpen`, utils/formGuard.js):
     openCreationMode, editingRaceId, editingRunId, navGuard
     e o onboarding. A RecordConfirmation vive DENTRO desses ecrãs de
     registo, por isso "formulário aberto" já cobre o fecho de um registo: o
     Início só volta a montar depois de ele sair — e é exatamente aí que o
     cartão médio entra por baixo.
   - Os GRANDES em fila: `grande` é sempre o primeiro da fila, e o seguinte
     só aparece depois de este ser dispensado (dispensá-lo tira-o do que
     falta ver, e o próximo passa a ser o primeiro).
   - Os MÉDIOS colapsados num cartão só, e à espera: enquanto houver um
     grande por dispensar, o cartão não entra. Duas cerimónias ao mesmo
     tempo não são duas cerimónias, são uma confusão.

   ── SEM A MIGRAÇÃO APLICADA ─────────────────────────────────────────────
   `20260922120000_user_badges.sql` continua por aplicar: `syncBadgeAwards`
   devolve `available: false` e `pending: []`, este hook devolve
   `grande: null` e `medio: null`, e não acontece nada. A Vitrina continua
   correta na mesma, porque tudo se recalcula dos dados. É por isso que o
   modo de demonstração abaixo existe — é a única forma de ver a cerimónia
   antes de a tabela existir.

   ?demo=true&badge=1 — mostra o momento com os badges que os dados de
   demonstração dão, sem tocar em `user_badges`. */

const demoSession = { feito: false };

/** Só para testes. */
export function resetBadgeMomentDemo() {
  demoSession.feito = false;
}

function demoPending(due = []) {
  return due.map((d, i) => ({
    id: `demo-${i}`,
    badge_key: d.badgeKey,
    tier: d.tier || '',
    period_key: d.periodKey ?? '',
    value: d.value ?? null,
    value_unit: d.valueUnit ?? null,
    race_id: d.raceId ?? null,
    awarded_at: d.awardedOn,
    title: d.title ?? null,
    line: d.line ?? null,
  }));
}

export default function useBadgeMoment() {
  const { badges, due, pending, marcarVistos, demonstrar } = useBadges();
  const formOpen = useAppStore(isFormOpen);

  useEffect(() => {
    if (demoSession.feito) return;
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    if (params?.get('demo') !== 'true' || params.get('badge') !== '1') return;
    demoSession.feito = true;
    demonstrar(demoPending(due || []));
  }, [due, demonstrar]);

  const plano = useMemo(() => planBadgeMoments(pending, badges), [pending, badges]);

  const grande = !formOpen && plano.grandes.length ? plano.grandes[0] : null;
  const medio = !formOpen && plano.grandes.length === 0 ? colapsarMedios(plano.medios) : null;

  const fecharGrande = useCallback(() => {
    const id = plano.grandes[0]?.award?.id;
    if (id) marcarVistos([id]);
  }, [plano, marcarVistos]);

  const fecharMedio = useCallback(() => {
    marcarVistos(colapsarMedios(plano.medios)?.ids || []);
  }, [plano, marcarVistos]);

  return {
    grande,
    medio,
    // Quantos grandes ficam para trás deste — o botão di-lo.
    filaRestante: grande ? plano.grandes.length - 1 : 0,
    fecharGrande,
    fecharMedio,
  };
}
