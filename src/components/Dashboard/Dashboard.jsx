import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '../../store';
import { Utensils, Dumbbell, User, Activity } from 'lucide-react';
import RunIcon from '../shared/RunIcon';
import { useCarouselHaptics } from '../../utils/haptics';

import Run from '../Run/Run';
import Gym from '../Gym/Gym';
import Nutrition from '../Nutrition/Nutrition';
import Body from '../Body/Body';
import CrossAnalyticsDashboard from './CrossAnalyticsDashboard';
import CoachInsightButton from '../BI/CoachInsightButton';
import CoachInsightModal from '../BI/CoachInsightModal';
import { detectCoachInsights } from '../../utils/biEngine';

const TABS = [
  { key: 'corrida', label: 'Corrida', icon: <RunIcon className="w-3.5 h-3.5" />, color: 'var(--mod-corrida-to, #c026d3)' },
  { key: 'ginasio', label: 'Ginásio', icon: <Dumbbell size={14} />, color: 'var(--mod-ginasio-to, #facc15)' },
  { key: 'nutricao', label: 'Nutrição', icon: <Utensils size={14} />, color: 'var(--mod-nutricao-to, #059669)' },
  { key: 'corpo', label: 'Corpo', icon: <User size={14} />, color: 'var(--mod-corpo-to, #e11d48)' },
  { key: 'holistica', label: 'Holística', icon: <Activity size={14} />, color: 'var(--mod-coach-to)' },
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

  // activeModule também muda por fora do carrossel (ex.: FAB "Registar
  // refeição" chama setActiveTab diretamente) — sincroniza o scroll nesses
  // casos. scrollTo já não faz nada se a posição for a mesma.
  useEffect(() => {
    if (currentIndex >= 0) scrollTo(currentIndex);
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
      <div className="relative flex gap-2 p-2 bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)] mb-4 overflow-hidden">
        {/* Sliding indicator — tint translúcido da cor do módulo em vez de
            preenchimento sólido, a condizer com o glassmorphism escuro do
            resto da app; o texto ativo fica na própria cor em vez de branco.
            Sem shadow-md: dentro de um contentor overflow-hidden a sombra
            fica cortada a direito mesmo junto ao canto arredondado do
            separador, em vez de esbater — mais visível na pílula da direita
            porque é onde o canto do indicador fica mais perto do canto do
            contentor. */}
        <div
          className="absolute top-[6px] bottom-[6px] rounded-lg transition-all duration-300 ease-in-out border"
          style={{
            // Calculado a partir de TABS.length em vez de fixo — um separador
            // a mais/a menos não desalinha o indicador outra vez.
            width: `calc((100% - ${(TABS.length - 1) * 8}px) / ${TABS.length})`,
            transform: `translateX(calc(${currentIndex} * 100% + ${currentIndex * 8}px))`,
            background: `color-mix(in srgb, ${TABS.find(t => t.key === activeModule)?.color || 'var(--accent)'} 18%, transparent)`,
            borderColor: `color-mix(in srgb, ${TABS.find(t => t.key === activeModule)?.color || 'var(--accent)'} 40%, transparent)`,
          }}
        />
        {TABS.map((t, i) => (
          <button
            key={t.key}
            onClick={() => scrollTo(i)}
            style={activeModule === t.key ? { color: t.color } : undefined}
            className={`relative z-10 flex-1 flex flex-col items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-lg transition-colors duration-300 ${
              activeModule === t.key ? '' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
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
        <div className="tab-swipe-page"><Run /></div>
        <div className="tab-swipe-page"><Gym /></div>
        <div className="tab-swipe-page"><Nutrition /></div>
        <div className="tab-swipe-page"><Body /></div>
        <div className="tab-swipe-page"><CrossAnalyticsDashboard /></div>
      </div>

      <CoachInsightButton insights={insights} onClick={() => setShowInsights(true)} />

      {showInsights && (
        <CoachInsightModal insights={insights} onClose={() => setShowInsights(false)} />
      )}
    </div>
  );
}
