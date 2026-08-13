import React, { useEffect, useMemo, useState } from 'react';
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
    const waterGoal = profile?.water_goal_ml || 2000;
    if (waterGoal && waterTotal < waterGoal / 2) {
      const waterRem = ` Não te esqueças de começar a beber água desde já para manteres a hidratação.`;
      msg = msg ? `${msg}${waterRem}` : `Ainda não registaste consumo de água hoje. Começa a hidratar-te desde já.`;
    }
    return msg || null;
  }, [activePlanItems.today, todayWater, profile]);

  const tomorrowPrepText = useMemo(() => {
    const nonRest = activePlanItems.tomorrow.filter(i => i.kind !== 'descanso');
    if (nonRest.length === 0) return null;
    const itemsDesc = nonRest.map(formatItemSummary).join(' e ');
    const hasRun = nonRest.some(i => i.kind === 'corrida');
    const hasGym = nonRest.some(i => i.kind === 'ginasio');
    let tip = 'Deixa o equipamento já organizado hoje à noite.';
    if (hasRun && !hasGym) tip = 'Deixa o teu equipamento de corrida pronto.';
    else if (hasGym && !hasRun) tip = 'Deixa a tua sacola de treino pronta para o ginásio.';
    return `Amanhã o plano aponta para: ${itemsDesc}. ${tip}`;
  }, [activePlanItems.tomorrow]);

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

  return (
    <div className="cds-card">
      <div className="cds-glow" />

      <div className="cds-header">
        <span className="cds-lbl"><Sparkles size={12} /> Resumo do Coach</span>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={dailySummaryLoading}
          aria-label="Atualizar resumo"
          className="cds-refresh"
          data-spinning={dailySummaryLoading}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="cds-body">
        {dailySummaryLoading && !dailySummary ? (
          <div className="cds-skeleton">
            <div className="cds-skeleton-line" />
            <div className="cds-skeleton-line" />
          </div>
        ) : !current ? (
          <p className="cds-empty">Sem nada a assinalar por agora — regista uma refeição ou um treino para o Coach ter o que comentar.</p>
        ) : (
          /* As mensagens ficam TODAS empilhadas na mesma célula da grelha
             (grid-area 1/1 em cada uma) em vez de só a atual ser montada. O
             CSS Grid dimensiona a linha pela mais alta de todas — por isso a
             altura do cartão passa a ser a da mensagem mais longa do
             conjunto atual, fixa enquanto não se muda de resumo. Sem isto, a
             troca de mensagem (recap curto → sugestão de refeição longa)
             fazia o cartão saltar de tamanho a cada toque. Nada de scroll
             nem de cortar texto — só reservar sempre o espaço necessário. */
          <div className="cds-stack">
            {messages.map((m, i) => (
              <div key={m.key} className="cds-msg" data-active={i === safeIndex} aria-hidden={i !== safeIndex}>
                <span className="cds-msg-icon" style={{ background: `${m.color}1a`, color: m.color }}>
                  <m.Icon size={15} />
                </span>
                <div className="min-w-0">
                  <p className="cds-msg-title" style={{ color: m.color }}>{m.label}</p>
                  <p className="cds-msg-text">{m.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {messages.length > 1 && (
        <div className="cds-footer">
          <div className="cds-dots">
            {messages.map((m, i) => (
              <span key={m.key} className="cds-dot" data-active={i === safeIndex} />
            ))}
          </div>
          <div className="cds-nav">
            <button
              type="button"
              onClick={() => setIndex(i => Math.max(0, i - 1))}
              disabled={safeIndex === 0}
              aria-label="Mensagem anterior"
              className="cds-nav-btn"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => setIndex(i => Math.min(messages.length - 1, i + 1))}
              disabled={safeIndex === messages.length - 1}
              aria-label="Próxima mensagem"
              className="cds-nav-btn"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
