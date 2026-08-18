import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Sparkles, RefreshCw, History, AlertTriangle, Utensils, CalendarClock, Lightbulb } from 'lucide-react';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';
import { computeAcceptedWindow } from './WeeklyPlanCard';
import { useCarouselHaptics } from '../../utils/haptics';
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
    if (waterGoal && waterTotal === 0) {
      // Nunca registou água hoje
      const waterRem = ` Ainda não registaste consumo de água hoje. Começa a hidratar-te desde já.`;
      msg = msg ? `${msg}${waterRem}` : waterRem.trim();
    } else if (waterGoal && waterTotal < waterGoal / 2) {
      // Registou, mas ainda abaixo de metade da meta
      const waterRem = ` Só registaste ${waterTotal} ml. Continua a hidratar-te para atingir a tua meta.`;
      msg = msg ? `${msg}${waterRem}` : waterRem.trim();
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
      list.push({ key: 'recap', label: 'Recapitulação', Icon: History, color: '#22d3ee', text: dailySummary.recap.trim() });
    }
    if (warningsText) {
      list.push({ key: 'warnings', label: 'Aviso de hoje', Icon: AlertTriangle, color: '#fbbf24', text: warningsText });
    }
    if (dailySummary?.meal_suggestion) {
      list.push({ key: 'meal_suggestion', label: 'Sugestão alimentar', Icon: Utensils, color: '#34d399', text: dailySummary.meal_suggestion.trim() });
    }
    if (tomorrowPrepText) {
      list.push({ key: 'tomorrow_prep', label: 'Preparar amanhã', Icon: CalendarClock, color: '#a78bfa', text: tomorrowPrepText });
    }
    if (dailySummary?.daily_concept?.body) {
      list.push({
        key: 'daily_concept',
        label: dailySummary.daily_concept.title,
        Icon: Lightbulb,
        color: '#fbbf24',
        text: dailySummary.daily_concept.body,
      });
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
  const { handleScroll, handleTouchMove, scrollTo } = useCarouselHaptics(
    scrollRef,
    messages.length,
    safeIndex,
    setIndex
  );

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
            onTouchMove={handleTouchMove}
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
          <div style={{ height: '32px' }} className="shrink-0" />
        </div>
        
        {messages.length > 1 && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
            <div className="flex items-center gap-1.5 pointer-events-auto bg-white/10 border border-white/5 shadow-sm px-2 py-1.5 rounded-full backdrop-blur-md">
              {messages.map((_, idx) => (
                <button 
                  key={idx} 
                  type="button"
                  onClick={() => scrollTo(idx)}
                  aria-label={`Ver mensagem ${idx + 1}`}
                  className={`h-1.5 shrink-0 rounded-full transition-all duration-300 ${idx === index ? 'w-4 bg-slate-300' : 'w-1.5 bg-slate-300 opacity-40'}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

