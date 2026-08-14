import React, { useState, useMemo, useRef } from 'react';
import {
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Check, X as XIcon, Dumbbell as DumbbellIcon,
  Utensils, Coffee, Award, StickyNote, Clock,
} from 'lucide-react';
import RunIcon from '../shared/RunIcon';
import CoachText from '../shared/CoachText';
import { useCarouselHaptics } from '../../utils/haptics';
import './WeeklyPlanCard.css';

/* Plano do atleta no ecrã Início. Ver specs/plano-de-treino.md e

   Redesenho: aceitar/recusar propostas passou a viver no chat do Coach
   (ver Coach.jsx) — este cartão é só CONSULTA do plano já aceite +
   registo de execução (Concluir/Cancelar). A duração do plano é a que o
   atleta e o Coach acordaram (7, 14 dias, ou outra qualquer — nunca
   assumida), por isso o título e a numeração dos dias seguem o período
   real do(s) plano(s) aceite(s), não um horizonte fixo de 7 dias. */

export const PLAN_HORIZON_DAYS = 7;

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function addDaysISO(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function diffDaysISO(aISO, bISO) {
  return Math.round((new Date(bISO + 'T00:00:00') - new Date(aISO + 'T00:00:00')) / 86400000);
}

/* Janela de dias a mostrar. Os planos aceites ainda relevantes — em
   curso/futuros (period_end >= hoje) ou já terminados mas com itens por
   resolver (ficam visíveis, com destaque de atraso, até o atleta confirmar
   ou recusar) — são agrupados em BLOCOS CONTÍGUOS, e mostra-se só o bloco
   em que hoje cai (ou o mais próximo, se hoje ainda não lá chegou).

   Unir todos os períodos às cegas dava planos absurdos: um microciclo de 7
   dias mais uma sugestão alimentar solta daí a um mês virava "Plano de 37
   dias" com 29 dias vazios pelo meio. Dois planos que se tocam continuam a
   contar como um só; um que está a um mês de distância é outro plano.
   Sem planos aceites relevantes, null. */
export function computeAcceptedWindow(plans = [], items = [], today = todayISO()) {
  const accepted = (plans || []).filter(p => p.status === 'aceite');
  if (accepted.length === 0) return null;

  const relevant = accepted.filter(p => {
    if (p.period_end >= today) return true;
    return (items || []).some(i => i.plan_id === p.id && i.status === 'pendente');
  });
  if (relevant.length === 0) return null;

  // Agrupa em blocos: um plano junta-se ao bloco anterior se começar antes
  // (ou logo a seguir) ao fim dele — sobreposto ou contíguo.
  const sorted = [...relevant].sort((a, b) => a.period_start.localeCompare(b.period_start));
  const blocks = [];
  for (const p of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && diffDaysISO(last.end, p.period_start) <= 1) {
      if (p.period_end > last.end) last.end = p.period_end;
    } else {
      blocks.push({ start: p.period_start, end: p.period_end });
    }
  }

  const current = blocks.find(b => today >= b.start && today <= b.end)
    ?? blocks.find(b => b.end >= today)
    ?? blocks[0];
  return { start: current.start, days: diffDaysISO(current.start, current.end) + 1 };
}

/* Título curto de um item, usado na linha fechada. */
function itemTitle(item) {
  if (item.kind === 'corrida') {
    return [
      item.training_type
        ? item.training_type[0].toUpperCase() + item.training_type.slice(1)
        : 'Corrida',
      item.target_distance_km ? `${item.target_distance_km} km` : null,
    ].filter(Boolean).join(' · ');
  }
  if (item.kind === 'ginasio') {
    return [
      item.categories?.length ? item.categories.join('/') : 'Ginásio',
      item.target_duration_min ? `${item.target_duration_min} min` : null,
    ].filter(Boolean).join(' · ');
  }
  return 'Descanso';
}

function itemIcon(item) {
  if (item.kind === 'corrida') return RunIcon;
  if (item.kind === 'ginasio') return DumbbellIcon;
  return Coffee;
}

function itemKindClass(item) {
  if (item.kind === 'corrida') return 'run';
  if (item.kind === 'ginasio') return 'gym';
  if (item.kind === 'corpo') return 'corpo';
  if (item.kind === 'nutricao') return 'nutri';
  return 'rest';
}

/* Um dia do plano. */
export function PlanDayCard({
  dateISO,
  dayNumber,
  items,
  isToday,
  isOverdue,
  onComplete,
  onCancel,
  onCompleteMeal,
  onCancelMeal,
  readOnly,
  expanded: controlledExpanded,
  onToggleExpand,
}) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : localExpanded;

  const d = new Date(dateISO + 'T00:00:00');
  const dayLabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

  const hasMeal = items.some(i => i.meal_suggestion);
  const empty = items.length === 0;

  // Um dia vazio não abre — não há detalhe nenhum por trás dele.
  const canExpand = !empty;

  const summary = empty
    ? 'Sem nada planeado'
    : items.map(itemTitle).join(' + ');

  const HeadIcon = empty ? Utensils : itemIcon(items[0]);
  const kindClass = empty ? 'empty' : itemKindClass(items[0]);

  const toggle = () => {
    if (canExpand) {
      if (onToggleExpand) {
        onToggleExpand(!isExpanded);
      } else {
        setLocalExpanded(e => !e);
      }
    }
  };

  return (
    <div className={`wpc-day-card ${kindClass} ${isToday ? 'is-today' : ''} ${isOverdue ? 'is-overdue' : ''}`}>
      <div className="wpc-day-content">
        <div className="wpc-day-header" onClick={toggle}>
          <div className="wpc-day-left">
            <div className={`wpc-icon-wrap ${kindClass}`}>
              <HeadIcon size={20} />
            </div>
            <div className="wpc-day-info">
              <h4 className="wpc-day-title">
                Dia {dayNumber} <span className="wpc-day-date">{dayLabel}</span>
                {isToday && <span className="wpc-today-tag">Hoje</span>}
                {isOverdue && <span className="wpc-overdue-tag"><Clock size={9} style={{ marginRight: 3, verticalAlign: '-1px' }} />Em atraso</span>}
              </h4>
              <p className="wpc-day-summary">{summary}</p>
            </div>
          </div>

          <div className="wpc-day-right">
            {hasMeal && (
              <span className="wpc-meal-indicator" title="Tem sugestão alimentar">
                <Utensils size={12} />
              </span>
            )}
            {canExpand && (
              <button
                type="button"
                aria-label={isExpanded ? `Fechar detalhes do dia ${dayNumber}` : `Ver detalhes do dia ${dayNumber}`}
                aria-expanded={isExpanded}
                className="tap-44 wpc-chevron"
                onClick={(e) => { e.stopPropagation(); toggle(); }}
              >
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="wpc-day-details fade-in">
            {items.map(item => (
              <div key={item.id} className="wpc-detail-item">
                {items.length > 1 && (
                  <p className={`wpc-detail-title ${itemKindClass(item)}`}>{itemTitle(item)}</p>
                )}

                {(item.notes || item.kind !== 'descanso') && (
                  <div className="wpc-info-box">
                    {item.notes && (
                      <div style={{ marginBottom: item.kind !== 'descanso' ? '12px' : 0 }}>
                        <div className={`wpc-info-box-header ${itemKindClass(item)}`}>
                          <StickyNote size={13} /> Instruções do Coach
                        </div>
                        <p className="wpc-info-box-text">{item.notes}</p>
                      </div>
                    )}
                    
                    {item.kind !== 'descanso' && (
                      <>
                        {!readOnly && item.status === 'pendente' && (
                          <div className="wpc-actions" style={{ marginTop: 0 }}>
                            <button onClick={() => onComplete(item)} className="wpc-btn wpc-btn-primary">
                              <Check size={14} /> Concluído
                            </button>
                            <button onClick={() => onCancel(item)} className="wpc-btn wpc-btn-secondary">
                              <XIcon size={14} /> Cancelado
                            </button>
                          </div>
                        )}
                        
                        {item.status === 'concluido' && (
                          <div className="wpc-pill-status success">
                            <Check size={14} /> Concluído{item.actual_date && item.actual_date !== item.planned_date ? ` a ${item.actual_date}` : ''}
                          </div>
                        )}
                        {item.status === 'cancelado' && (
                          <div className="wpc-pill-status danger">
                            <XIcon size={14} /> Cancelado
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {item.meal_suggestion && (
                  <div className="wpc-info-box" style={{ marginTop: '12px' }}>
                    <div className="wpc-info-box-header nutri">
                      <Award size={14} /> Sugestão alimentar
                    </div>
                    <div className="wpc-info-box-text text-sm font-normal text-slate-700">
                      <CoachText>{item.meal_suggestion}</CoachText>
                    </div>
                    <p className="wpc-info-box-disclaimer">
                      Sugestão, não prescrição — ajusta ao que te cai bem. Em caso de
                      dúvida clínica, fala com um nutricionista.
                    </p>
                    
                    {!readOnly && (!item.meal_status || item.meal_status === 'pendente') && (
                      <div className="wpc-actions" style={{ marginTop: '12px' }}>
                        <button onClick={() => onCompleteMeal(item)} className="wpc-btn wpc-btn-primary">
                          <Check size={14} /> Segui
                        </button>
                        <button onClick={() => onCancelMeal(item)} className="wpc-btn wpc-btn-secondary">
                          <XIcon size={14} /> Não segui
                        </button>
                      </div>
                    )}
                    
                    {item.meal_status === 'seguida' && (
                      <div className="wpc-pill-status success" style={{ marginTop: '12px' }}>
                        <Check size={14} /> Seguida
                      </div>
                    )}
                    {item.meal_status === 'nao_seguida' && (
                      <div className="wpc-pill-status danger" style={{ marginTop: '12px' }}>
                        <XIcon size={14} /> Não seguida
                      </div>
                    )}
                  </div>
                )}


              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* Constrói os dias do plano a partir de `from`, ao longo de `horizon` dias.
   Cada dia inclui dayNumber (1-indexed) para a numeração "Dia N". */
export function buildPlanDays(items, from = todayISO(), horizon = PLAN_HORIZON_DAYS) {
  const days = [];
  const today = todayISO();
  for (let i = 0; i < horizon; i++) {
    const dateISO = addDaysISO(from, i);
    const dayItems = (items || [])
      .filter(it => (it.status === 'concluido' ? (it.actual_date || it.planned_date) : it.planned_date) === dateISO)
      .sort((a, b) => a.kind.localeCompare(b.kind));
    days.push({
      dateISO,
      dayNumber: i + 1,
      isToday: dateISO === today,
      isOverdue: dateISO < today && dayItems.some(it => (it.kind !== 'descanso' && it.status === 'pendente') || (it.meal_suggestion && (!it.meal_status || it.meal_status === 'pendente'))),
      items: dayItems,
    });
  }
  return days;
}

/* Proposta ainda por aceitar — usada pelo chat do Coach (ver Coach.jsx),
   não pela Home. Exportada para reutilização; sem sítio de aceitar/recusar
   aqui na Home desde o redesenho — isso agora vive só no chat. */
export function PlanProposalCard({ plan, items, onRespond }) {
  const its = useMemo(() => items.filter(i => i.plan_id === plan.id), [items, plan.id]);
  const days = useMemo(
    () => buildPlanDays(its, plan.period_start, diffDaysISO(plan.period_start, plan.period_end) + 1).filter(d => d.items.length > 0),
    [its, plan.period_start, plan.period_end],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef(null);
  const { handleScroll, handleTouchMove, scrollTo } = useCarouselHaptics(
    scrollRef,
    days.length,
    currentIndex,
    setCurrentIndex
  );

  return (
    <div className="flex flex-col gap-3">

      
      <div className="wpc-card">
        <div className="wpc-glow-coach"></div>
        <div className="wpc-content">
          <h2 className="wpc-proposal-title">O Coach propôs um plano</h2>
          {plan.summary && <p className="wpc-proposal-summary">{plan.summary}</p>}

          <div 
            className="wpc-carousel"
            ref={scrollRef}
            onScroll={handleScroll}
            onTouchMove={handleTouchMove}
            style={{ scrollBehavior: 'smooth' }}
          >
            {days.map(day => (
              <PlanDayCard key={day.dateISO} dateISO={day.dateISO} dayNumber={day.dayNumber} items={day.items} isToday={false} isOverdue={false} readOnly />
            ))}
          </div>

          <div className="wpc-actions" style={{ marginTop: '16px' }}>
            <button onClick={() => onRespond(plan.id, true)} className="wpc-btn wpc-btn-primary">
              <Check size={15} /> Aceitar
            </button>
            <button onClick={() => onRespond(plan.id, false)} className="wpc-btn wpc-btn-secondary">
              <XIcon size={15} /> Recusar
            </button>
          </div>
          
          <div style={{ height: '32px' }} className="shrink-0" />
        </div>
        
        {days.length > 1 && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
            <div className="flex items-center gap-1.5 pointer-events-auto bg-black/10 px-2 py-1.5 rounded-full backdrop-blur-md">
              {days.map((_, idx) => (
                <button 
                  key={idx} 
                  type="button"
                  onClick={() => scrollTo(idx)}
                  aria-label={`Ver dia ${idx + 1}`}
                  className={`h-1.5 shrink-0 rounded-full transition-all duration-300 ${idx === currentIndex ? 'w-4 bg-[var(--fab-bg)]' : 'w-1.5 bg-[var(--fab-bg)] opacity-40'}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WeeklyPlanCard({ plans = [], planItems = [], onComplete, onCancel, onCompleteMeal, onCancelMeal, onNav }) {
  const pendingCount = useMemo(() => (plans || []).filter(p => p.status === 'proposto').length, [plans]);

  const window = useMemo(() => computeAcceptedWindow(plans, planItems), [plans, planItems]);
  const acceptedIds = useMemo(
    () => new Set((plans || []).filter(p => p.status === 'aceite').map(p => p.id)),
    [plans],
  );
  const accepted = useMemo(
    () => planItems.filter(i => acceptedIds.has(i.plan_id)),
    [planItems, acceptedIds],
  );
  const days = useMemo(
    () => (window ? buildPlanDays(accepted, window.start, window.days) : []),
    [accepted, window],
  );

  const PendingBanner = () => pendingCount > 0 && (
    <button onClick={() => onNav('coach')} className="wpc-pending-banner tap-scale" type="button">
      <span>🕓 Tens {pendingCount} sugestão{pendingCount > 1 ? 'ões' : ''} do Coach por rever</span>
      <span>Ver no chat →</span>
    </button>
  );

  if (!window) {
    return (
      <div className="w-full">
        <PendingBanner />
        <button onClick={() => onNav('coach')} className="wpc-card text-left tap-scale" style={{ border: 'none', background: 'rgba(255, 255, 255, 0.4)' }}>
          <div className="wpc-glow-coach"></div>
          <div className="wpc-content">
            <h2 className="wpc-proposal-title">Plano</h2>
            <p className="text-xs font-semibold text-slate-600 mt-1">
              Sem treinos acordados. Pede ao Coach um plano — as sugestões aparecem no chat para aceitares ou recusares.
            </p>
          </div>
        </button>
      </div>
    );
  }

  const [currentIndex, setCurrentIndex] = useState(0);
  const [allExpanded, setAllExpanded] = useState(false);
  const scrollRef = useRef(null);
  const { handleScroll, handleTouchMove, scrollTo } = useCarouselHaptics(
    scrollRef,
    days.length,
    currentIndex,
    setCurrentIndex
  );

  return (
    <div className="flex flex-col gap-3">


      <div className="wpc-card">
        <div className="wpc-glow-coach"></div>
        <div className="wpc-content">
          <PendingBanner />
          <div className="wpc-header-row mb-2">
            <span className="wpc-lbl">Plano de {window.days} dias</span>
          </div>
          
          <div 
            className="wpc-carousel"
            ref={scrollRef}
            onScroll={handleScroll}
            onTouchMove={handleTouchMove}
            style={{ scrollBehavior: 'smooth' }}
          >
            {days.map(day => (
              <PlanDayCard
                key={day.dateISO}
                dateISO={day.dateISO}
                dayNumber={day.dayNumber}
                items={day.items}
                isToday={day.isToday}
                isOverdue={day.isOverdue}
                onComplete={onComplete}
                onCancel={onCancel}
                onCompleteMeal={onCompleteMeal}
                onCancelMeal={onCancelMeal}
                expanded={allExpanded}
                onToggleExpand={setAllExpanded}
              />
            ))}
          </div>
          
          <div style={{ height: '32px' }} className="shrink-0" />
        </div>
        
        {days.length > 1 && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
            <div className="flex items-center gap-1.5 pointer-events-auto bg-black/10 px-2 py-1.5 rounded-full backdrop-blur-md">
              {days.map((_, idx) => (
                <button 
                  key={idx} 
                  type="button"
                  onClick={() => scrollTo(idx)}
                  aria-label={`Ver dia ${idx + 1}`}
                  className={`h-1.5 shrink-0 rounded-full transition-all duration-300 ${idx === currentIndex ? 'w-4 bg-[var(--fab-bg)]' : 'w-1.5 bg-[var(--fab-bg)] opacity-40'}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
