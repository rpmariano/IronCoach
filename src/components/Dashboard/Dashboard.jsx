import React, { useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { useAppStore, sliceReady, EVOLUTION_TAB_SLICES } from '../../store';
import { Utensils, Dumbbell, User, LayoutDashboard } from 'lucide-react';
import RunIcon from '../shared/RunIcon';
import { useCarouselHaptics } from '../../utils/haptics';
import SubNav from '../shared/SubNav';
import useCarouselActiveHeight from '../../utils/useCarouselActiveHeight';
import { useReducedMotion } from '../../utils/useReducedMotion';
import {
  TabPageContext,
  TabReadyContext,
  setSettledIndex,
  resetSettledTab,
  carouselPageWidth,
  settleTolerance,
  useLastSettledIndex,
  useSettledTabTracker,
} from '../../utils/settledTab';

import Run from '../Run/Run';
import Gym from '../Gym/Gym';
import Nutrition from '../Nutrition/Nutrition';
import Body from '../Body/Body';
import OverviewDashboard from './OverviewDashboard';
import CoachInsightsDock from '../BI/CoachInsightsDock';

/* Cinco separadores em 390px não cabem com "Visão Geral" por extenso a 11px
   (auditoria, achado 1) — o mock "Dashboard · Visão Geral" resolve-o a
   encurtar o rótulo para "Geral" e a manter ícone + rótulo em todos, sem
   scroll horizontal. `srLabel` guarda o nome por extenso para o leitor de
   ecrã. O tom é o do módulo: Geral e Corrida em ciano (--run), como o mock. */
const TABS = [
  { key: 'hub', label: 'Geral', srLabel: 'Visão Geral', icon: <LayoutDashboard size={15} />, tone: 'run' },
  { key: 'corrida', label: 'Corrida', icon: <RunIcon className="w-[15px] h-[15px]" />, tone: 'run' },
  { key: 'ginasio', label: 'Ginásio', icon: <Dumbbell size={15} />, tone: 'gym' },
  { key: 'nutricao', label: 'Nutrição', icon: <Utensils size={15} />, tone: 'nutrition' },
  { key: 'corpo', label: 'Corpo', icon: <User size={15} />, tone: 'body' },
];

/* 'holistica' ainda vive em DASHBOARD_TABS e no localStorage antigo
   (`ironcoach_last_module`) — o separador saiu a 2026-08-23 e o Geral ocupou
   o lugar. Sem esta tradução o índice era −1: o carrossel não sincronizava e
   nenhuma página ficava assente (2026-10-04). */
const TAB_ALIASES = { holistica: 'hub' };

/** Bit i ligado = os dados do separador i já chegaram (sliceReady das fatias
 *  de EVOLUTION_TAB_SLICES, não o `dataPending` global — 2026-10-04). Um
 *  número, para o seletor do zustand comparar por valor: o Dashboard só
 *  redesenha quando a máscara muda, não a cada fatia que chega. Numa
 *  abertura a frio a máscara fica a 0 até ao fim do orçamento de 10 s (ou
 *  até tudo chegar); daí em diante cada separador liga quando as fatias da
 *  sua lista que faltavam chegam (2026-10-05). */
function readyMask(state) {
  let mask = 0;
  TABS.forEach((t, i) => {
    if (sliceReady(state, EVOLUTION_TAB_SLICES[t.key] || [])) mask |= 1 << i;
  });
  return mask;
}

/** Uma página do carrossel: diz aos gráficos lá dentro em que página vivem
 *  (para saberem se o separador está assente) e se os dados dela chegaram. */
function TabPage({ index, ready, pageRef, children }) {
  return (
    <TabPageContext.Provider value={index}>
      <TabReadyContext.Provider value={ready}>
        <div ref={pageRef} className="tab-swipe-page">{children}</div>
      </TabReadyContext.Provider>
    </TabPageContext.Provider>
  );
}

export default function Dashboard({ activeModule }) {
  // Seletores, não o store inteiro (2026-10-04): o Dashboard redesenhava a
  // cada mudança do store, e com ele os elementos dos cinco separadores.
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const readyBits = useAppStore(readyMask);

  const moduleKey = TAB_ALIASES[activeModule] || activeModule;
  const currentIndex = TABS.findIndex(t => t.key === moduleKey);
  const scrollRef = useRef(null);
  // scrollTo só existe depois de chamar o hook, mas o setter que lhe passamos
  // (handleIndexChange) precisa de lhe chamar quando o navGuard recusa a
  // troca — guarda-se numa ref para partir o ciclo sem duplicar a lógica do
  // hook aqui.
  const scrollToRef = useRef(() => {});

  // Trocar de módulo a deslizar passa pelo mesmo setActiveTab do separador
  // (localStorage, lastDashboardTab e — sobretudo — o navGuard: um
  // formulário aberto com alterações por gravar recusa a troca tal como já
  // recusava um toque no separador). Se recusar, repõe a posição visual do
  // carrossel em vez de o deixar preso a meio de um deslize.
  const handleIndexChange = useCallback((idx) => {
    const key = TABS[idx]?.key;
    if (!key || key === moduleKey) return;
    const ok = setActiveTab(key);
    if (!ok) scrollToRef.current(currentIndex);
  }, [moduleKey, currentIndex, setActiveTab]);

  const { handleScroll, handleTouchMove, scrollTo } = useCarouselHaptics(
    scrollRef, TABS.length, currentIndex, handleIndexChange
  );
  scrollToRef.current = scrollTo;

  /* Separador ASSENTE (2026-10-04, F5): o carrossel parado, sem toque, numa
     página — o gatilho das animações dos gráficos (settledTab.js). Não é o
     `currentIndex`, que muda a meio do gesto. */
  useSettledTabTracker(scrollRef, TABS.length);

  /* A altura do carrossel segue o módulo ativo: sem isto o contentor tinha
     sempre a altura do módulo mais alto dos cinco, e num módulo curto
     sobrava esse vão como scroll vazio (relatado pelo utilizador a partir
     do Perfil — o mesmo carrossel).
     2026-10-04: segue a página ASSENTE, não o `currentIndex` — mudava a meio
     do gesto e a página encolhia/crescia enquanto ainda se deslizava. Antes
     da primeira (−1) vale o separador pedido. */
  const pageRefs = useRef([]);
  const pageRefSetters = useMemo(
    () => TABS.map((_, i) => (el) => { pageRefs.current[i] = el; }),
    []
  );
  const lastSettled = useLastSettledIndex();
  const heightIndex = lastSettled >= 0 ? lastSettled : currentIndex;
  useCarouselActiveHeight(scrollRef, pageRefs, heightIndex);
  // Com reduced-motion a altura muda sem transição. Declarado depois do
  // hook de propósito: os efeitos correm por ordem, e este tira a transição
  // que ele acabou de pôr antes de o browser a usar.
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced && scrollRef.current) scrollRef.current.style.transition = 'none';
  }, [reduced, heightIndex]);

  const lastScrolledIndexRef = useRef(currentIndex);

  // scrollToTab: permite que o OverviewDashboard navegue para um tab por key.
  // Estável (2026-10-04): o `scrollTo` do hook muda a cada troca de separador
  // e arrastava com ele o scrollToTab — o Geral (React.memo) redesenhava a
  // cada deslize só por isso. Vai pela ref.
  const scrollToTab = useCallback((key) => {
    const idx = TABS.findIndex(t => t.key === key);
    if (idx >= 0) {
      lastScrolledIndexRef.current = idx;
      setActiveTab(key);
      scrollToRef.current(idx);
    }
  }, [setActiveTab]);

  // O salto inicial para o separador pedido: antes de pintar (useLayoutEffect
  // — com o useEffect o 1.º frame podia mostrar o Geral antes do salto) e sem
  // vibrar (o scrollTo do hook vibrava 30 ms a cada entrada na Evolução, por
  // "voltar" ao índice em que já estava). A página fica logo assente: entrar
  // não espera por nenhum evento de scroll para os gráficos mexerem.
  const initialIndexRef = useRef(currentIndex);
  useLayoutEffect(() => {
    const idx = initialIndexRef.current >= 0 ? initialIndexRef.current : 0;
    const el = scrollRef.current;
    if (el) {
      // Largura fracionária (2026-10-05, A1): com `offsetWidth` o salto ia
      // para idx × 379 num carrossel de 379,43 px, o snap corrigia para a
      // posição verdadeira e esse scroll desfazia o assentamento da entrada.
      const width = carouselPageWidth(el);
      if (width > 0 && Math.abs(el.scrollLeft - idx * width) > settleTolerance(width)) el.scrollLeft = idx * width;
    }
    setSettledIndex(idx);
    // Ao sair da Evolução: a próxima entrada começa do zero (sem a altura nem
    // a página assente desta).
    return () => resetSettledTab();
  }, []);

  // activeModule também muda por fora do carrossel (ex.: FAB "Registar
  // refeição" chama setActiveTab diretamente) — sincroniza o scroll nesses
  // casos. Se o utilizador já deslizou até ao separador pretendido, evita
  // chamar scrollTo novamente para não criar saltos ou conflitos com o swipe.
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      // O 1.º já foi tratado no useLayoutEffect acima.
      isInitialMount.current = false;
      lastScrolledIndexRef.current = currentIndex;
      return;
    }
    if (currentIndex >= 0 && scrollRef.current) {
      const el = scrollRef.current;
      const width = carouselPageWidth(el);
      const currentScrollIndex = width > 0 ? Math.round(el.scrollLeft / width) : -1;
      if (currentScrollIndex !== currentIndex && lastScrolledIndexRef.current !== currentIndex) {
        scrollToRef.current(currentIndex, false);
      }
      // Também depois de um deslize (que não passa por scrollTab/SubNav):
      // sem isto a ref ficava no separador antigo e uma troca vinda de fora
      // de volta a ele era ignorada, deixando o carrossel noutro módulo.
      lastScrolledIndexRef.current = currentIndex;
    }
  }, [currentIndex]);

  const ready = (i) => (readyBits & (1 << i)) !== 0;

  return (
    <div className="space-y-4 fade-in">
      {/* Subnav — SubNav.jsx (ponto 4 do handoff): minhoca a 320ms na cor do
          módulo ativo, ícone + rótulo em cada um dos cinco separadores. */}
      <SubNav
        items={TABS}
        activeIndex={currentIndex}
        onChange={(i) => {
          lastScrolledIndexRef.current = i;
          scrollTo(i);
        }}
        className="mb-4"
      />

      {/* Módulos lado a lado num carrossel — desliza tal como os do Início,
          em vez de só ser possível trocar tocando no separador. Os 5 ficam
          montados ao mesmo tempo (o scroll nativo exige-o), o que também
          preserva o estado de cada um (filtros, período ativo) ao deslizar
          para outro e voltar. Cada página diz aos gráficos que tem dentro
          qual é (TabPage) — é assim que só animam com o separador assente. */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchMove={handleTouchMove}
        className="tab-swipe-carousel"
      >
        <TabPage index={0} ready={ready(0)} pageRef={pageRefSetters[0]}><OverviewDashboard scrollToTab={scrollToTab} /></TabPage>
        <TabPage index={1} ready={ready(1)} pageRef={pageRefSetters[1]}><Run /></TabPage>
        <TabPage index={2} ready={ready(2)} pageRef={pageRefSetters[2]}><Gym /></TabPage>
        <TabPage index={3} ready={ready(3)} pageRef={pageRefSetters[3]}><Nutrition /></TabPage>
        <TabPage index={4} ready={ready(4)} pageRef={pageRefSetters[4]}><Body /></TabPage>
      </div>

      {/* Os avisos da Carol: os mesmos de todos os ecrãs (pedido 2026-09-27).
          Eram os insights todos menos o do plano, que só o Início mostrava. */}
      <CoachInsightsDock />
    </div>
  );
}
