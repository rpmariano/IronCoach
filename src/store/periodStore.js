import { useLayoutEffect } from 'react';
import { create } from 'zustand';
import { calendarPeriod, previousPeriod } from '@formulas/calendarPeriod.ts';
import { useTodayISO } from '../utils/useTodayISO';

/**
 * Período seleccionado por separador (2026-10-04, fase 3 da evolução).
 *
 * Store zustand PEQUENO e À PARTE do useAppStore de propósito: cada toque numa
 * seta ‹ › muda isto, e se vivesse no store da app redesenhava a App inteira.
 * Não é persistido — ao reabrir a app cada separador volta à sua omissão.
 *
 * `offset` 0 = período atual, -1 = anterior, … nunca > 0 (não há futuro).
 */
export const PERIOD_TABS = ['nutricao', 'corrida', 'ginasio', 'corpo', 'hub'];

export const DEFAULT_KINDS = {
  nutricao: 'semana',
  corrida: 'mes',
  ginasio: 'mes',
  corpo: 'trimestre',
  hub: 'semana',
};

const initial = () =>
  Object.fromEntries(PERIOD_TABS.map((t) => [t, { kind: DEFAULT_KINDS[t], offset: 0 }]));

/* Separadores que, ao abrir, saltam para o período ANTERIOR quando o da omissão
   ainda não tem nenhum dia fechado (2026-10-05, limiares).

   Corrida e Ginásio abrem no mês e o Corpo no trimestre: no dia 1 desses
   períodos ("a começar") e nos dias seguintes quase tudo fecha-se, e o atleta
   via um cartão sem números quando o mês passado estava completo. Abre-se no
   período anterior e a seta › leva ao período a começar (o ecrã "a começar" do
   mock-up continua lá).

   Nutrição e Geral ficam de fora de propósito: abrem na semana e o ecrã "Semana
   · segunda-feira" É o ecrã aprovado do mock-up para esse dia. */
export const AUTO_OPEN_PREVIOUS_TABS = ['corrida', 'ginasio', 'corpo'];

export const usePeriodStore = create((set, get) => ({
  tabs: initial(),
  /* Separadores que já "abriram" (a omissão foi avaliada) ou em que o atleta
     escolheu um período. Só se avalia UMA vez por sessão, e nunca por cima de
     uma escolha: quem tocou numa seta não volta a ser mexido. Fora de `tabs` de
     propósito: o formato { kind, offset } de cada separador não muda. */
  opened: {},

  /**
   * Chamado quando um separador abre (useOpenInClosedPeriod): se o período da
   * omissão ainda não tem dias fechados ('a_comecar') e o atleta já tem dados
   * antes dele, abre no anterior. `dataStartISO` é o 1.º registo do separador:
   * sem ele (undefined = ainda não carregou) não se decide; null = nunca
   * registou e fica no período a começar (o convite de quem acaba de chegar).
   * Quem chama tem de passar undefined enquanto a fatia de dados do separador
   * não chegou (sliceReady) — a decisão grava-se e não se reavalia.
   * Devolve true se mudou o período.
   */
  openTab: (tab, todayISO, { dataStartISO } = {}) => {
    const s = get();
    if (s.opened[tab] || dataStartISO === undefined) return false;
    set((st) => ({ opened: { ...st.opened, [tab]: true } }));
    if (!AUTO_OPEN_PREVIOUS_TABS.includes(tab)) return false;
    const cur = s.tabs[tab];
    if (!cur || cur.kind !== DEFAULT_KINDS[tab] || cur.offset !== 0 || !todayISO) return false;
    const period = calendarPeriod(cur.kind, todayISO, 0);
    if (period.closedDays !== 0) return false;
    const ds = typeof dataStartISO === 'string' ? dataStartISO.slice(0, 10) : null;
    if (!ds || ds > previousPeriod(period, todayISO).end) return false;
    set((st) => ({ tabs: { ...st.tabs, [tab]: { kind: cur.kind, offset: -1 } } }));
    return true;
  },

  // Mudar de granularidade repõe o offset: "3 períodos atrás" não tem sentido noutra unidade.
  setKind: (tab, kind) =>
    set((s) => ({ tabs: { ...s.tabs, [tab]: { kind, offset: 0 } }, opened: { ...s.opened, [tab]: true } })),

  // delta negativo = para trás; o resultado é limitado a 0 (nunca para o futuro).
  shift: (tab, delta) => {
    const cur = get().tabs[tab];
    if (!cur) return;
    const offset = Math.min(0, cur.offset + delta);
    if (offset === cur.offset) return;
    set((s) => ({ tabs: { ...s.tabs, [tab]: { ...cur, offset } }, opened: { ...s.opened, [tab]: true } }));
  },

  // Para o Geral abrir um separador já num período (ex.: "semana passada").
  setPeriod: (tab, kind, offset = 0) =>
    set((s) => ({ tabs: { ...s.tabs, [tab]: { kind, offset: Math.min(0, offset) } }, opened: { ...s.opened, [tab]: true } })),

  reset: () => set({ tabs: initial(), opened: {} }),
}));

/**
 * Abre o separador no período anterior quando o da omissão está 'a_comecar'
 * (ver AUTO_OPEN_PREVIOUS_TABS). Chama-se no topo do dashboard do separador,
 * com o 1.º registo da vista: `undefined` enquanto a vista não existe, null
 * sem registos. useLayoutEffect para a mudança acontecer antes de pintar — o
 * atleta nunca vê o cartão "a começar" a piscar antes do mês passado.
 */
export function useOpenInClosedPeriod(tab, dataStartISO) {
  const today = useTodayISO();
  const openTab = usePeriodStore((s) => s.openTab);
  useLayoutEffect(() => {
    openTab(tab, today, { dataStartISO });
  }, [openTab, tab, today, dataStartISO]);
}

// 2026-10-04: o fallback tem de ser ESTÁVEL (mesma referência por separador). Um objeto novo
// a cada chamada faz o zustand 5 entrar em ciclo infinito ("Maximum update depth") com um
// separador desconhecido (gralha, 'geral', separador novo).
const FALLBACKS = {};
const fallbackFor = (tab) =>
  (FALLBACKS[tab] ||= Object.freeze({ kind: DEFAULT_KINDS[tab] || 'semana', offset: 0 }));

export const selectTabPeriod = (tab) => (s) => s.tabs[tab] || fallbackFor(tab);
