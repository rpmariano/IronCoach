import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '../../store';
import { Utensils, Dumbbell, User, LayoutDashboard } from 'lucide-react';
import RunIcon from '../shared/RunIcon';
import { useCarouselHaptics } from '../../utils/haptics';
import SubNav from '../shared/SubNav';
import { useTabEnter } from '../../utils/useTabEnter';

import Run from '../Run/Run';
import Gym from '../Gym/Gym';
import Nutrition from '../Nutrition/Nutrition';
import Body from '../Body/Body';
import OverviewDashboard from './OverviewDashboard';
import CoachInsightButton from '../BI/CoachInsightButton';
import CoachInsightModal from '../BI/CoachInsightModal';
import { detectCoachInsights } from '../../utils/biEngine';

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

export default function Dashboard({ activeModule }) {
  const { setActiveTab, runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, profile, insightStates, shoes } = useAppStore();
  const [showInsights, setShowInsights] = useState(false);

  const insights = useMemo(() => {
    const all = detectCoachInsights({ runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes }, profile);
    // Remove os que ja foram "Entendidos" (desativados).
    // Filtra apenas os que não são relativos ao ecrã inicial (ex: adesão ao plano).
    return all.filter(i => insightStates[i.id] !== 'understood' && i.module !== 'coach');
  }, [runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, profile, insightStates]);

  const currentIndex = TABS.findIndex(t => t.key === activeModule);
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
    if (!key || key === activeModule) return;
    const ok = setActiveTab(key);
    if (!ok) scrollToRef.current(currentIndex);
  }, [activeModule, currentIndex, setActiveTab]);

  const { handleScroll, handleTouchMove, scrollTo } = useCarouselHaptics(
    scrollRef, TABS.length, currentIndex, handleIndexChange
  );
  scrollToRef.current = scrollTo;

  // "O conteúdo segue a pílula": o módulo que fica ativo entra do lado de
  // onde veio, 14px e uma pitada de opacidade, em 280ms.
  const setPageRef = useTabEnter(currentIndex);

  // scrollToTab: permite que o OverviewDashboard navegue para um tab por key
  const scrollToTab = useCallback((key) => {
    const idx = TABS.findIndex(t => t.key === key);
    if (idx >= 0) {
      setActiveTab(key);
      scrollTo(idx);
    }
  }, [setActiveTab, scrollTo]);

  // activeModule também muda por fora do carrossel (ex.: FAB "Registar
  // refeição" chama setActiveTab diretamente) — sincroniza o scroll nesses
  // casos. scrollTo já não faz nada se a posição for a mesma.
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (currentIndex >= 0) {
      scrollTo(currentIndex, isInitialMount.current);
      isInitialMount.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // JS avancado: Ajusta dinamicamente a altura do carrossel para a aba ativa.
  // Evita o espaco vazio no fundo das abas mais curtas.
  useEffect(() => {
    const carousel = scrollRef.current;
    if (!carousel) return;
    
    // Permite transicao suave da altura (desligar se causar artefactos com swiper rapido)
    carousel.style.transition = 'height 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
    carousel.style.overflowY = 'hidden';

    let activePage = null;
    let observer = null;

    const updateHeight = () => {
      activePage = carousel.children[currentIndex];
      if (!activePage) return;
      
      const newHeight = activePage.scrollHeight; // scrollHeight acomoda melhor margens ocultas
      if (newHeight > 0) {
        carousel.style.height = `${newHeight}px`;
      }
    };

    updateHeight();

    if (window.ResizeObserver && activePage) {
      observer = new ResizeObserver(() => {
        updateHeight();
      });
      observer.observe(activePage);
    }

    return () => {
      if (observer) observer.disconnect();
    };
  }, [currentIndex]);

  return (
    <div className="space-y-4 fade-in">
      {/* Subnav — SubNav.jsx (ponto 4 do handoff): minhoca a 320ms na cor do
          módulo ativo, ícone + rótulo em cada um dos cinco separadores. */}
      <SubNav
        items={TABS}
        activeIndex={currentIndex}
        onChange={(i) => scrollTo(i)}
        className="mb-4"
      />

      {/* Módulos lado a lado num carrossel — desliza tal como os do Início,
          em vez de só ser possível trocar tocando no separador. Os 5 ficam
          montados ao mesmo tempo (o scroll nativo exige-o), o que também
          preserva o estado de cada um (filtros, período ativo) ao deslizar
          para outro e voltar. */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchMove={handleTouchMove}
        className="tab-swipe-carousel"
      >
        <div ref={setPageRef(0)} className="tab-swipe-page"><OverviewDashboard scrollToTab={scrollToTab} /></div>
        <div ref={setPageRef(1)} className="tab-swipe-page"><Run /></div>
        <div ref={setPageRef(2)} className="tab-swipe-page"><Gym /></div>
        <div ref={setPageRef(3)} className="tab-swipe-page"><Nutrition /></div>
        <div ref={setPageRef(4)} className="tab-swipe-page"><Body /></div>
      </div>

      <CoachInsightButton insights={insights} onClick={() => setShowInsights(true)} />

      {showInsights && (
        <CoachInsightModal insights={insights} onClose={() => setShowInsights(false)} />
      )}
    </div>
  );
}
