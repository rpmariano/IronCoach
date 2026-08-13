import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Sparkles, RefreshCw, History, AlertTriangle, Utensils, CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';
import { computeAcceptedWindow } from './WeeklyPlanCard';
import './CoachDailySummaryCard.css';

/* Card-resumo do Coach no Início. Ver specs/plano-de-treino.md §11 e
   specs/coach-investigacao.md, Bloco 7 (forma de entrega 3).

   Mesma família visual do NextRaceCard (glass, glow radial, 28px de raio),
   mas o conteúdo é ROTATIVO em vez de fixo: até quatro mensagens
   independentes (recapitulação, avisos, sugestão de refeição, preparação
   para amanhã), cada uma podendo estar ausente. */

function formatItemSummary(item) {
  if (item.kind === 'corrida') {
    const typeStr = item.training_type || 'corrida';
    const distStr = item.target_distance_km ? `${item.target_distance_km} km` : '';
    const durStr = item.target_duration_min ? `${item.target_duration_min} min` : '';
    const details = [typeStr, distStr, durStr].filter(Boolean).join(', ');
    return `Corrida (${details})`;
  }
  if (item.kind === 'ginasio') {
    const catStr = item.categories?.length ? item.categories.join('/') : 'Geral';
    const durStr = item.target_duration_min ? `${item.target_duration_min} min` : '';
    const details = [catStr, durStr].filter(Boolean).join(', ');
    return `Ginásio (${details})`;
  }
  return 'Descanso';
}

export default function CoachDailySummaryCard() {
  const { coachPlans, coachPlanItems, dailySummary, dailySummaryLoading, loadDailySummary, todayWater, profile } = useAppStore();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    loadDailySummary({ reload: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);

  // Isola estritamente o plano ativo atual para hoje e amanhã
  const activePlanItems = useMemo(() => {
    const window = computeAcceptedWindow(coachPlans, coachPlanItems, today);
    if (!window) return { today: [], tomorrow: [] };
    const accepted = (coachPlans || []).filter(p => p.status === 'aceite');
    const relevant = accepted.filter(p => p.period_end >= today || (coachPlanItems || []).some(i => i.plan_id === p.id && i.status === 'pendente'));
    const sorted = [...relevant].sort((a, b) => a.period_start.localeCompare(b.period_start));
    const activePlan = sorted[sorted.length - 1];
    if (!activePlan) return { today: [], tomorrow: [] };
    const items = (coachPlanItems || []).filter(i => i.plan_id === activePlan.id && i.status !== 'cancelado');
    return {
      today: items.filter(i => i.planned_date === today),
      tomorrow: items.filter(i => i.planned_date === tomorrow),
    };
  }, [coachPlans, coachPlanItems, today, tomorrow]);

  const warningsText = useMemo(() => {
    const nonRest = activePlanItems.today.filter(i => i.kind !== 'descanso');
    let msg = '';
    if (nonRest.length > 0) {
      const itemsDesc = nonRest.map(formatItemSummary).join(' e ');
      msg = `Para hoje tens agendado: ${itemsDesc}.`;
    }
    const waterTotal = (todayWater || []).reduce((s, w) => s + (w.amount_ml || 0), 0);
    const waterGoal = profile?.water_goal_ml;
    if (waterGoal && waterTotal < waterGoal / 2) {
      const waterRem = ` Não te esqueças de começar a beber água desde já para manteres a hidratação.`;
      msg = msg ? `${msg}${waterRem}` : `Ainda não registaste consumo de água hoje. Começa a hidratar-te desde já.`;
    }
    if (msg) return msg;
    return typeof dailySummary?.warnings === 'string' && dailySummary.warnings.trim() ? dailySummary.warnings.trim() : null;
  }, [activePlanItems.today, todayWater, profile, dailySummary]);

  const tomorrowPrepText = useMemo(() => {
    const nonRest = activePlanItems.tomorrow.filter(i => i.kind !== 'descanso');
    if (nonRest.length === 0) {
      return typeof dailySummary?.tomorrow_prep === 'string' && dailySummary.tomorrow_prep.trim() ? dailySummary.tomorrow_prep.trim() : null;
    }
    const itemsDesc = nonRest.map(formatItemSummary).join(' e ');
    const hasRun = nonRest.some(i => i.kind === 'corrida');
    const hasGym = nonRest.some(i => i.kind === 'ginasio');
    let tip = 'Deixa o equipamento já organizado hoje à noite.';
    if (hasRun && !hasGym) tip = 'Deixa o teu equipamento de corrida pronto.';
    else if (hasGym && !hasRun) tip = 'Deixa a tua sacola de treino pronta para o ginásio.';
    return `Amanhã o plano aponta para: ${itemsDesc}. ${tip}`;
  }, [activePlanItems.tomorrow, dailySummary]);

  const messages = useMemo(() => {
    const list = [];
    if (dailySummary?.recap) {
      list.push({ key: 'recap', label: 'Recapitulação', Icon: History, color: '#0e7490', text: dailySummary.recap.trim() });
    }
    if (warningsText) {
      list.push({ key: 'warnings', label: 'Aviso de hoje', Icon: AlertTriangle, color: '#b45309', text: warningsText });
    }
    if (dailySummary?.meal_suggestion) {
      list.push({ key: 'meal_suggestion', label: 'Sugestão alimentar', Icon: Utensils, color: '#047857', text: dailySummary.meal_suggestion.trim() });
    }
    if (tomorrowPrepText) {
      list.push({ key: 'tomorrow_prep', label: 'Preparar amanhã', Icon: CalendarClock, color: '#6d28d9', text: tomorrowPrepText });
    }
    return list;
  }, [dailySummary, warningsText, tomorrowPrepText]);

  // O índice pode ficar fora de alcance depois de um refresh que muda quantas
  // mensagens existem — repõe-se em vez de mostrar um cartão vazio.
  const safeIndex = messages.length ? Math.min(index, messages.length - 1) : 0;
  const current = messages[safeIndex];

  const handleRefresh = () => {
    setIndex(0);
    loadDailySummary({ force: true });
  };

  const scrollRef = useRef(null);

  const handleScroll = () => {
    if (scrollRef.current && scrollRef.current.offsetWidth > 0) {
      const idx = Math.round(scrollRef.current.scrollLeft / scrollRef.current.offsetWidth);
      setIndex(idx);
    }
  };

  const scrollTo = (idx) => {
    setIndex(idx);
    if (scrollRef.current) {
      if (typeof scrollRef.current.scrollTo === 'function') {
        scrollRef.current.scrollTo({ left: idx * (scrollRef.current.offsetWidth || 0), behavior: 'smooth' });
      } else {
        scrollRef.current.scrollLeft = idx * (scrollRef.current.offsetWidth || 0);
      }
    }
  };

  if (dailySummaryLoading && !dailySummary) {
    return (
      <div className="cds-card">
        <div className="cds-glow" />
        <div className="cds-header">
          <span className="cds-lbl"><Sparkles size={12} /> Resumo do Coach</span>
        </div>
        <div className="cds-body">
          <div className="cds-skeleton">
            <div className="cds-skeleton-line" />
            <div className="cds-skeleton-line" />
          </div>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="cds-card">
        <div className="cds-glow" />
        <div className="cds-header">
          <span className="cds-lbl"><Sparkles size={12} /> Resumo do Coach</span>
          <button type="button" onClick={handleRefresh} disabled={dailySummaryLoading} aria-label="Atualizar resumo" className="cds-refresh" data-spinning={dailySummaryLoading}>
            <RefreshCw size={13} />
          </button>
        </div>
        <div className="cds-body">
          <p className="cds-empty">Sem nada a assinalar por agora — regista uma refeição ou um treino para o Coach ter o que comentar.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Navegação no topo (tal como nas Provas) */}
      {messages.length > 1 && (
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-1.5">
            {messages.map((_, idx) => (
              <span 
                key={idx} 
                className={`h-1.5 rounded-full transition-all duration-300 ${idx === index ? 'w-4 bg-cyan-500' : 'w-1.5 bg-cyan-500/30'}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={() => scrollTo(Math.max(0, index - 1))}
              disabled={index === 0}
              aria-label="Mensagem anterior"
              className="w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400 hover:text-cyan-500 disabled:opacity-30 transition"
            >
              <ChevronLeft size={14} />
            </button>
            <button 
              type="button"
              onClick={() => scrollTo(Math.min(messages.length - 1, index + 1))}
              disabled={index === messages.length - 1}
              aria-label="Próxima mensagem"
              className="w-7 h-7 bg-white rounded-full flex items-center justify-center shadow-sm text-cyan-500 disabled:opacity-30 transition"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="cds-card w-full">
        <div className="cds-glow" />

        {/* Cabeçalho Único */}
        <div className="cds-header">
          <span className="cds-lbl"><Sparkles size={12} /> Resumo do Coach</span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={dailySummaryLoading}
            aria-label="Atualizar resumo"
            className="cds-refresh shrink-0"
            data-spinning={dailySummaryLoading}
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {/* Corpo com Carrossel Horizontal */}
        <div className="cds-body mt-2">
          <div 
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
            style={{ scrollBehavior: 'smooth' }}
          >
            {messages.map((m, i) => (
              <div key={m.key} className="w-full shrink-0 snap-center">
                <div className="cds-msg" data-active={i === index}>
                  <span className="cds-msg-icon" style={{ background: `${m.color}1a`, color: m.color }}>
                    <m.Icon size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="cds-msg-title" style={{ color: m.color }}>{m.label}</p>
                    <p className="cds-msg-text">{m.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
