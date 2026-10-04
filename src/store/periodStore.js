import { create } from 'zustand';

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

export const usePeriodStore = create((set, get) => ({
  tabs: initial(),

  // Mudar de granularidade repõe o offset: "3 períodos atrás" não tem sentido noutra unidade.
  setKind: (tab, kind) =>
    set((s) => ({ tabs: { ...s.tabs, [tab]: { kind, offset: 0 } } })),

  // delta negativo = para trás; o resultado é limitado a 0 (nunca para o futuro).
  shift: (tab, delta) => {
    const cur = get().tabs[tab];
    if (!cur) return;
    const offset = Math.min(0, cur.offset + delta);
    if (offset === cur.offset) return;
    set((s) => ({ tabs: { ...s.tabs, [tab]: { ...cur, offset } } }));
  },

  // Para o Geral abrir um separador já num período (ex.: "semana passada").
  setPeriod: (tab, kind, offset = 0) =>
    set((s) => ({ tabs: { ...s.tabs, [tab]: { kind, offset: Math.min(0, offset) } } })),

  reset: () => set({ tabs: initial() }),
}));

// 2026-10-04: o fallback tem de ser ESTÁVEL (mesma referência por separador). Um objeto novo
// a cada chamada faz o zustand 5 entrar em ciclo infinito ("Maximum update depth") com um
// separador desconhecido (gralha, 'geral', separador novo).
const FALLBACKS = {};
const fallbackFor = (tab) =>
  (FALLBACKS[tab] ||= Object.freeze({ kind: DEFAULT_KINDS[tab] || 'semana', offset: 0 }));

export const selectTabPeriod = (tab) => (s) => s.tabs[tab] || fallbackFor(tab);
