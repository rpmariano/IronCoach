import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '../../store';
import { Utensils, Dumbbell, User, LayoutDashboard } from 'lucide-react';
import RunIcon from '../shared/RunIcon';
import { useCarouselHaptics } from '../../utils/haptics';

import Run from '../Run/Run';
import Gym from '../Gym/Gym';
import Nutrition from '../Nutrition/Nutrition';
import Body from '../Body/Body';
import OverviewDashboard from './OverviewDashboard';
import CoachInsightButton from '../BI/CoachInsightButton';
import CoachInsightModal from '../BI/CoachInsightModal';
import { detectCoachInsights } from '../../utils/biEngine';

const TABS = [
  { key: 'hub', label: 'Visão Geral', icon: <LayoutDashboard size={14} />, color: '#0ea5e9' },
  { key: 'corrida', label: 'Corrida', icon: <RunIcon className="w-3.5 h-3.5" />, color: 'var(--mod-corrida-to, #c026d3)' },
  { key: 'ginasio', label: 'Ginásio', icon: <Dumbbell size={14} />, color: 'var(--mod-ginasio-to, #facc15)' },
  { key: 'nutricao', label: 'Nutrição', icon: <Utensils size={14} />, color: 'var(--mod-nutricao-to, #059669)' },
  { key: 'corpo', label: 'Corpo', icon: <User size={14} />, color: 'var(--mod-corpo-to, #e11d48)' },
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
  const subnavRef = useRef(null);
  const tabRefs = useRef([]);
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

  // Indicador do subnav em "pílula elástica": ao trocar de separador, em vez
  // de deslizar em linha reta, estica primeiro a cobrir todo o trajeto entre
  // o separador antigo e o novo (engolindo os que ficam pelo meio) e só
  // depois contrai até assentar só no novo, revelando-os outra vez à medida
  // que recua. Mede as posições reais dos botões em vez de usar % fixas —
  // só assim dá para calcular o "span" entre dois separadores quaisquer.
  const [indicatorStyle, setIndicatorStyle] = useState(null);
  const prevIndicatorIndex = useRef(currentIndex);

  const measureTab = useCallback((idx) => {
    const container = subnavRef.current;
    const btn = tabRefs.current[idx];
    if (!container || !btn) return null;
    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    return { left: bRect.left - cRect.left, width: bRect.width };
  }, []);

  useEffect(() => {
    const target = measureTab(currentIndex);
    if (!target) return;
    const prevIdx = prevIndicatorIndex.current;

    if (prevIdx === currentIndex) {
      // Montagem inicial (ou re-render sem troca real) — posiciona sem animar.
      if (!indicatorStyle) setIndicatorStyle({ ...target, transition: 'none' });
      return;
    }

    const prevRect = measureTab(prevIdx) || target;
    const spanLeft = Math.min(prevRect.left, target.left);
    const spanRight = Math.max(prevRect.left + prevRect.width, target.left + target.width);

    // Fase 1 (160ms): estica a cobrir o trajeto todo.
    setIndicatorStyle({
      left: spanLeft,
      width: spanRight - spanLeft,
      transition: 'left 160ms cubic-bezier(0.4,0,0.2,1), width 160ms cubic-bezier(0.4,0,0.2,1)',
    });

    // Fase 2 (280ms, com leve overshoot): contrai até ao separador novo.
    const t = setTimeout(() => {
      setIndicatorStyle({
        ...target,
        transition: 'left 280ms cubic-bezier(0.34,1.56,0.64,1), width 280ms cubic-bezier(0.34,1.56,0.64,1)',
      });
    }, 160);

    prevIndicatorIndex.current = currentIndex;
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, measureTab]);

  // Reajusta a posição (sem animar) se a largura do ecrã mudar — ex.: rodar
  // o telemóvel a meio de uma troca de separador.
  useEffect(() => {
    const onResize = () => {
      const target = measureTab(currentIndex);
      if (target) setIndicatorStyle({ ...target, transition: 'none' });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [currentIndex, measureTab]);

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
      {/* Subnav com estética clara da Homepage (Glassmorphism) */}
      <div ref={subnavRef} className="relative flex gap-2 p-2 bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)] mb-4 overflow-hidden">
        {/* Indicador "pílula elástica" — tint translúcido da cor do módulo em
            vez de preenchimento sólido, a condizer com o glassmorphism escuro
            do resto da app; o texto ativo fica na própria cor em vez de
            branco. Sem shadow-md: dentro de um contentor overflow-hidden a
            sombra fica cortada a direito mesmo junto ao canto arredondado do
            separador, em vez de esbater — mais visível na pílula da direita
            porque é onde o canto do indicador fica mais perto do canto do
            contentor. Posição/largura em px medidos (ver measureTab acima),
            não % fixas — é o que permite esticar o indicador a cobrir
            qualquer par de separadores antes de contrair no novo. */}
        {indicatorStyle && (
          <div
            aria-hidden="true"
            className="absolute top-[6px] bottom-[6px] rounded-lg border"
            style={{
              left: indicatorStyle.left,
              width: indicatorStyle.width,
              transition: indicatorStyle.transition,
              background: `color-mix(in srgb, ${TABS.find(t => t.key === activeModule)?.color || 'var(--accent)'} 18%, transparent)`,
              borderColor: `color-mix(in srgb, ${TABS.find(t => t.key === activeModule)?.color || 'var(--accent)'} 40%, transparent)`,
            }}
          />
        )}
        {TABS.map((t, i) => (
          <button
            key={t.key}
            ref={el => { tabRefs.current[i] = el; }}
            onClick={() => scrollTo(i)}
            style={activeModule === t.key ? { color: t.color } : undefined}
            className={`relative z-10 flex-1 flex flex-col items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-lg transition-colors duration-300 ${
              activeModule === t.key ? '' : 'text-slate-500 hover:text-slate-200 hover:bg-white/50'
            }`}
          >
            {t.icon}
            <span className="text-[10px]">{t.label}</span>
          </button>
        ))}
      </div>

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
        <div className="tab-swipe-page"><OverviewDashboard scrollToTab={scrollToTab} /></div>
        <div className="tab-swipe-page"><Run /></div>
        <div className="tab-swipe-page"><Gym /></div>
        <div className="tab-swipe-page"><Nutrition /></div>
        <div className="tab-swipe-page"><Body /></div>
      </div>

      <CoachInsightButton insights={insights} onClick={() => setShowInsights(true)} />

      {showInsights && (
        <CoachInsightModal insights={insights} onClose={() => setShowInsights(false)} />
      )}
    </div>
  );
}
