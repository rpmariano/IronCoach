/**
 * Registo das vistas pré-calculadas da Evolução (2026-10-04, F6 / plano §2.2).
 *
 * Cada separador (fases 4–6) regista UMA vista:
 *
 *   registerEvolutionView('nutricao', {
 *     deps: (state) => [state.meals, state.profile, state.goalHistory],
 *     build: ([meals, profile, goalHistory], period, todayISO) => ({ ... }),
 *     slices: ['meals', 'profile', 'goalHistory'], // opcional
 *   });
 *
 * - `deps(state)` devolve as listas/objetos do useAppStore de que a vista
 *   depende — e SÓ isso. É usado como seletor com useShallow (sem estado
 *   derivado nem arrays novos por elemento, senão o componente redesenha a
 *   cada mudança do store) e é a chave de invalidação da cache.
 * - `build(depsValues, period, todayISO)` tem de ser PURA: o resultado só
 *   pode depender destes três argumentos (é isso que permite reutilizá-lo
 *   quando os deps são os mesmos). `period` é `{ kind, offset }` do
 *   periodStore — a vista calcula o seu calendarPeriod. NÃO congelar o
 *   resultado: o Chart.js escreve nos arrays de `data` que recebe.
 * - `slices` (opcional): fatias do carregamento que a vista espera antes de
 *   ser preparada em tempo morto (ver sliceReady no store). Por omissão,
 *   EVOLUTION_TAB_SLICES[tab].
 *
 * Os módulos de vista vivem em `./views/<tab>.js` e registam-se ao serem
 * importados: o separador importa o seu diretamente, e a preparação em tempo
 * morto (prepare.js) carrega-os todos por import() quando chega a vez dela.
 */
const views = new Map();

export function registerEvolutionView(tab, def) {
  if (!tab || typeof tab !== 'string') throw new Error('registerEvolutionView: separador em falta');
  if (!def || typeof def.deps !== 'function' || typeof def.build !== 'function') {
    throw new Error(`registerEvolutionView(${tab}): é preciso { deps, build }`);
  }
  // Voltar a registar substitui (HMR do Vite reimporta o módulo da vista).
  views.set(tab, { tab, deps: def.deps, build: def.build, slices: def.slices || null });
  return () => {
    if (views.get(tab)?.build === def.build) views.delete(tab);
  };
}

export function getEvolutionViewDef(tab) {
  return views.get(tab) || null;
}

export function registeredEvolutionTabs() {
  return [...views.keys()];
}

/** Só para testes. */
export function resetEvolutionRegistry() {
  views.clear();
}
