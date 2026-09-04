import React, { useState, useMemo, useRef, useEffect } from 'react';
import Card from '../shared/Card';
import {
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Check, X as XIcon, Dumbbell as DumbbellIcon,
  Utensils, Coffee, Salad, Sunrise, Apple, Cherry, UtensilsCrossed, StickyNote, Clock, Flag, MessageCircle
} from 'lucide-react';
import { useAppStore } from '../../store';
import RunIcon from '../shared/RunIcon';
import CoachText from '../shared/CoachText';
import CarouselDots from '../shared/CarouselDots';
import { useCarouselHaptics } from '../../utils/haptics';
import { todayISO, addDaysISO } from '../../lib/utils';
import { parseMealSuggestion, macroShares, MEAL_ICON_BY_TIPO } from '../../utils/parseMealSuggestion';
import './WeeklyPlanCard.css';

const MEAL_ICON_COMPONENT = { Sunrise, Apple, Salad, Cherry, UtensilsCrossed, Coffee };

/* Plano do atleta no ecrã Início. Ver specs/plano-de-treino.md e

   Redesenho: aceitar/recusar propostas passou a viver no chat do Coach
   (ver Coach.jsx) — este cartão é só CONSULTA do plano já aceite +
   registo de execução (Concluir/Cancelar). A duração do plano é a que o
   atleta e o Coach acordaram (7, 14 dias, ou outra qualquer — nunca
   assumida), por isso o título e a numeração dos dias seguem o período
   real do(s) plano(s) aceite(s), não um horizonte fixo de 7 dias. */

export const PLAN_HORIZON_DAYS = 7;

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
  if (item.isRace) {
    return [
      'Prova',
      item.title,
      item.target_distance_km ? `${item.target_distance_km} km` : null,
    ].filter(Boolean).join(' · ');
  }
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
  if (item.isRace) return Flag;
  if (item.kind === 'corrida') return RunIcon;
  if (item.kind === 'ginasio') return DumbbellIcon;
  return Coffee;
}

function itemKindClass(item) {
  if (item.isRace) return 'coach';
  if (item.kind === 'corrida') return 'run';
  if (item.kind === 'ginasio') return 'gym';
  if (item.kind === 'corpo') return 'corpo';
  if (item.kind === 'nutricao') return 'nutri';
  return 'rest';
}

function MacroRing({ grams, share, color, label }) {
  const R = 31, C = 2 * Math.PI * R; // 194.8
  return (
    <div className="wpc-macro-ring">
      <div className="wpc-macro-ring-svg-wrap">
        <svg width="68" height="68" viewBox="0 0 74 74">
          <circle cx="37" cy="37" r={R} fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="5" />
          <circle cx="37" cy="37" r={R} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - share)} transform="rotate(-90 37 37)" />
        </svg>
        <div className="wpc-macro-ring-center">
          <span>{grams}</span><small>g</small>
        </div>
      </div>
      <div className="wpc-macro-ring-label">{label}</div>
    </div>
  );
}

function MacroRings({ totais }) {
  const shares = macroShares(totais);
  return (
    <div className="wpc-macro-rings">
      <MacroRing grams={totais.proteina_g} share={shares.proteina} color="var(--data-proteina-ink)" label="Proteína" />
      <MacroRing grams={totais.hidratos_g} share={shares.hidratos} color="var(--data-hidratos-ink)" label="Hidratos" />
      <MacroRing grams={totais.gordura_g} share={shares.gordura} color="var(--data-gordura-ink)" label="Gordura" />
    </div>
  );
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

                {item.meal_suggestion && (() => {
                  const parsed = parseMealSuggestion(item.meal_suggestion);
                  return (
                    <div className="wpc-info-box" style={{ marginTop: '12px' }}>
                      <details className="wpc-info-box-details">
                        <summary className="wpc-info-box-header nutri" style={{ cursor: 'pointer', outline: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Salad size={14} /> Sugestão alimentar e nutricional
                          </div>
                          <ChevronDown size={14} className="details-chevron" />
                        </summary>

                        {parsed ? (
                          <div className="wpc-nutri-body">
                            <div className="wpc-nutri-total">
                              <div className="wpc-nutri-total-value">
                                <span>~{parsed.totais.kcal}</span><small>kcal</small>
                              </div>
                              <div className="wpc-nutri-total-label">Total estimado do dia</div>
                            </div>

                            <MacroRings totais={parsed.totais} />
                            <div className="wpc-nutri-ring-legend">anel = % da energia total</div>

                            <div className="wpc-nutri-meals">
                              {parsed.refeicoes.map((r) => {
                                const Icon = MEAL_ICON_COMPONENT[MEAL_ICON_BY_TIPO[r.tipo]];
                                const principal = ['pequeno_almoco', 'almoco', 'jantar'].includes(r.tipo);
                                return (
                                  <div className="wpc-nutri-meal-row" key={r.tipo}>
                                    <span className={`wpc-nutri-meal-icon ${principal ? 'is-main' : ''}`}>
                                      {Icon && <Icon size={18} />}
                                    </span>
                                    <div>
                                      <div className="wpc-nutri-meal-name">{r.label}</div>
                                      <p className="wpc-nutri-meal-text">{r.texto}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {parsed.racional && (
                              <div className="wpc-nutri-racional">
                                <div className="wpc-nutri-racional-label">Racional</div>
                                <p className="wpc-nutri-racional-text">{parsed.racional}</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="wpc-info-box-text text-sm font-normal text-slate-700 mt-2" style={{ whiteSpace: 'pre-wrap' }}>
                            <CoachText>{item.meal_suggestion}</CoachText>
                          </div>
                        )}

                        <p className="wpc-info-box-disclaimer mt-2">
                          Sugestão, não prescrição — ajusta ao que te cai bem. Em caso de
                          dúvida clínica, fala com um nutricionista.
                        </p>
                      </details>
                    </div>
                  );
                })()}


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
      isOverdue: dateISO < today && dayItems.some(it => it.kind !== 'descanso' && it.status === 'pendente'),
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
            <div className="flex items-center gap-1.5 pointer-events-auto bg-white/10 border border-white/5 shadow-sm px-2 py-1.5 rounded-full backdrop-blur-md">
              <CarouselDots count={days.length} currentIndex={currentIndex} onSelect={scrollTo} ariaLabelPrefix="Ver dia" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WeeklyPlanCard({ plans = [], planItems = [], onComplete, onCancel, onNav }) {
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
      <span className="flex items-start gap-1.5 flex-1">
        <MessageCircle size={14} className="mt-0.5 shrink-0" /> 
        <span>Tens {pendingCount} sugestão{pendingCount > 1 ? 'ões' : ''} do Coach por rever</span>
      </span>
      <span className="wpc-pending-link">
        Ver no chat <ChevronRight size={12} strokeWidth={3} />
      </span>
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

  const todayIdx = useMemo(() => {
    const idx = days.findIndex(d => d.isToday);
    return idx !== -1 ? idx : 0;
  }, [days]);

  const [currentIndex, setCurrentIndex] = useState(todayIdx);
  const [allExpanded, setAllExpanded] = useState(false);
  const scrollRef = useRef(null);

  const { handleScroll, handleTouchMove, scrollTo } = useCarouselHaptics(
    scrollRef,
    days.length,
    currentIndex,
    setCurrentIndex
  );

  const isInitialMount = useRef(true);
  useEffect(() => {
    if (currentIndex >= 0) {
      scrollTo(currentIndex, isInitialMount.current);
      isInitialMount.current = false;
    }
  }, [currentIndex, scrollTo]);

  return (
    <div className="flex flex-col gap-3">


      <div className="wpc-card">
        <div className="wpc-glow-coach"></div>
        <div className="wpc-content">
          <PendingBanner />
          <div className="wpc-header-row mb-2 flex justify-between items-center">
            <span className="wpc-lbl">Plano de {window.days} dias</span>
            <button 
              onClick={() => {
                useAppStore.getState().setCoachIntent('adapt_plan');
                onNav('coach');
              }}
              className="text-xs font-semibold px-2 py-1 rounded-md"
              style={{ color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 15%, transparent)' }}
            >
              Adaptar Plano
            </button>
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
                expanded={allExpanded}
                onToggleExpand={setAllExpanded}
              />
            ))}
          </div>
          
          <div style={{ height: '32px' }} className="shrink-0" />
        </div>
        
        {days.length > 1 && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
            <div className="flex items-center gap-1.5 pointer-events-auto bg-white/10 border border-white/5 shadow-sm px-2 py-1.5 rounded-full backdrop-blur-md">
              <CarouselDots count={days.length} currentIndex={currentIndex} onSelect={scrollTo} ariaLabelPrefix="Ver dia" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
