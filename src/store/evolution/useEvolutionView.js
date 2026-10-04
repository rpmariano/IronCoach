import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../index';
import { usePeriodStore, selectTabPeriod } from '../periodStore';
import { useTodayISO } from '../../utils/useTodayISO';
import { getEvolutionViewDef } from './registry';
import { getEvolutionView } from './cache';

const NO_DEPS = [];
const selectNoDeps = () => NO_DEPS;

/**
 * A vista pré-calculada de um separador da Evolução (2026-10-04, F6 / plano
 * §2.2). Lê os deps da vista registada com seletores (useShallow — só
 * redesenha quando uma das listas de que a vista depende muda, não a cada
 * set do store), o período do periodStore e o "hoje" reativo, e devolve a
 * vista da cache. Se a preparação em tempo morto ainda não lá chegou, calcula
 * aqui mesmo no render, como hoje — nunca spinner (plano §2.2 ponto 7).
 *
 * `options.period` substitui o período do store (ex.: o Geral a mostrar um
 * cartão de outro separador num período fixo). Devolve null se o separador
 * não tiver vista registada.
 */
export function useEvolutionView(tab, options) {
  const def = getEvolutionViewDef(tab);
  const deps = useAppStore(useShallow(def ? def.deps : selectNoDeps));
  const stored = usePeriodStore(useShallow(selectTabPeriod(tab)));
  const kind = options?.period?.kind ?? stored.kind;
  const offset = options?.period?.offset ?? stored.offset ?? 0;
  const today = useTodayISO();

  return useMemo(
    () => (def ? getEvolutionView(tab, { kind, offset }, deps, today) : null),
    [def, tab, kind, offset, deps, today],
  );
}

export default useEvolutionView;
