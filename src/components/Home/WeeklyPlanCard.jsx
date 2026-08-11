import React, { useState, useMemo } from 'react';
import {
  ChevronDown, ChevronUp, Check, X as XIcon, Dumbbell as DumbbellIcon,
  Footprints, Utensils, Moon, Award, StickyNote,
} from 'lucide-react';
import './WeeklyPlanCard.css';

/* Plano da semana no ecrã Início. Ver specs/plano-de-treino.md e
   specs/coach-investigacao.md (Bloco 7, forma de entrega 2). */

export const PLAN_HORIZON_DAYS = 7;
const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

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
  if (item.kind === 'corrida') return Footprints;
  if (item.kind === 'ginasio') return DumbbellIcon;
  return Moon;
}

function itemKindClass(item) {
  if (item.kind === 'corrida') return 'run';
  if (item.kind === 'ginasio') return 'gym';
  return 'nutri';
}

/* Um dia do plano. */
function PlanDayCard({ dateISO, items, isToday, onComplete, onCancel, readOnly }) {
  const [expanded, setExpanded] = useState(false);

  const d = new Date(dateISO + 'T00:00:00');
  const weekday = WEEKDAY_LABELS[d.getDay()];
  const dayLabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

  const isPast = dateISO < todayISO();
  const hasMeal = items.some(i => i.meal_suggestion);
  const empty = items.length === 0;

  // Um dia vazio não abre — não há detalhe nenhum por trás dele.
  const canExpand = !empty;

  const summary = empty
    ? 'Sem nada planeado'
    : items.map(itemTitle).join(' + ');

  const HeadIcon = empty ? Utensils : itemIcon(items[0]);
  const kindClass = empty ? 'empty' : itemKindClass(items[0]);

  const toggle = () => { if (canExpand) setExpanded(e => !e); };

  return (
    <div className={`wpc-day-card ${isToday ? 'is-today' : ''} ${empty ? 'is-empty' : ''}`}>
      {!empty && <div className={`wpc-day-glow ${kindClass}`}></div>}
      
      <div className="wpc-day-content">
        <div className="wpc-day-header" onClick={toggle}>
          <div className="wpc-day-left">
            <div className={`wpc-icon-wrap ${kindClass}`}>
              <HeadIcon size={16} />
            </div>
            <div className="wpc-day-info">
              <h4 className="wpc-day-title">
                {weekday} <span className="wpc-day-date">{dayLabel}</span>
                {isToday && <span className="wpc-today-tag">Hoje</span>}
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
                aria-label={expanded ? `Fechar detalhes de ${weekday}` : `Ver detalhes de ${weekday}`}
                aria-expanded={expanded}
                className="tap-44 wpc-chevron"
                onClick={(e) => { e.stopPropagation(); toggle(); }}
              >
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="wpc-day-details fade-in">
            {items.map(item => (
              <div key={item.id} className="wpc-detail-item">
                {items.length > 1 && (
                  <p className="wpc-detail-title">{itemTitle(item)}</p>
                )}

                {item.status === 'concluido' && (
                  <p className="wpc-detail-status">
                    Concluído{item.actual_date && item.actual_date !== item.planned_date ? ` a ${item.actual_date}` : ''}
                  </p>
                )}

                {item.notes && (
                  <div className="wpc-info-box">
                    <div className="wpc-info-box-header">
                      <StickyNote size={13} /> Instruções do Coach
                    </div>
                    <p className="wpc-info-box-text">{item.notes}</p>
                  </div>
                )}

                {item.meal_suggestion && (
                  <div className="wpc-info-box">
                    <div className="wpc-info-box-header nutri">
                      <Award size={14} /> Sugestão alimentar
                    </div>
                    <p className="wpc-info-box-text">{item.meal_suggestion}</p>
                    <p className="wpc-info-box-disclaimer">
                      Sugestão, não prescrição — ajusta ao que te cai bem. Em caso de
                      dúvida clínica, fala com um nutricionista.
                    </p>
                  </div>
                )}

                {!readOnly && item.kind !== 'descanso' && item.status === 'pendente' && (
                  <div className="wpc-actions">
                    <button onClick={() => onComplete(item)} className="wpc-btn wpc-btn-primary">
                      <Check size={14} /> Concluir
                    </button>
                    <button onClick={() => onCancel(item)} className="wpc-btn wpc-btn-secondary">
                      <XIcon size={14} /> Cancelar
                    </button>
                  </div>
                )}

                {!readOnly && isPast && item.status === 'pendente' && item.kind !== 'descanso' && (
                  <p className="wpc-past-warning">
                    Este treino já passou e continua por resolver.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* Constrói os 7 dias a partir de hoje e distribui os itens por eles. */
export function buildPlanDays(items, from = todayISO(), horizon = PLAN_HORIZON_DAYS) {
  const days = [];
  for (let i = 0; i < horizon; i++) {
    const dateISO = addDaysISO(from, i);
    days.push({
      dateISO,
      isToday: i === 0,
      items: (items || [])
        .filter(it => it.status !== 'cancelado')
        .filter(it => (it.status === 'concluido' ? (it.actual_date || it.planned_date) : it.planned_date) === dateISO)
        .sort((a, b) => a.kind.localeCompare(b.kind)),
    });
  }
  return days;
}

/* Proposta ainda por aceitar */
function PlanProposalCard({ plan, items, onRespond }) {
  const its = useMemo(() => items.filter(i => i.plan_id === plan.id), [items, plan.id]);
  const days = useMemo(
    () => buildPlanDays(its, plan.period_start, PLAN_HORIZON_DAYS).filter(d => d.items.length > 0),
    [its, plan.period_start],
  );

  return (
    <div className="wpc-card">
      <div className="wpc-glow-coach"></div>
      <div className="wpc-content">
        <h2 className="wpc-proposal-title">O Coach propôs um plano</h2>
        {plan.summary && <p className="wpc-proposal-summary">{plan.summary}</p>}

        <div>
          {days.map(day => (
            <PlanDayCard key={day.dateISO} dateISO={day.dateISO} items={day.items} isToday={false} readOnly />
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
      </div>
    </div>
  );
}

export default function WeeklyPlanCard({ plans = [], planItems = [], onComplete, onCancel, onRespond, onNav }) {
  const proposal = plans.find(p => p.status === 'proposto');
  const acceptedPlanIds = useMemo(
    () => new Set(plans.filter(p => p.status === 'aceite').map(p => p.id)),
    [plans],
  );
  const accepted = useMemo(
    () => planItems.filter(i => acceptedPlanIds.has(i.plan_id)),
    [planItems, acceptedPlanIds],
  );
  const days = useMemo(() => buildPlanDays(accepted), [accepted]);
  const hasAnything = days.some(d => d.items.length > 0);

  if (proposal) {
    return <PlanProposalCard plan={proposal} items={planItems} onRespond={onRespond} />;
  }

  if (!hasAnything) {
    return (
      <button onClick={() => onNav('coach')} className="wpc-card text-left tap-scale" style={{ border: 'none', background: 'rgba(255, 255, 255, 0.4)' }}>
        <div className="wpc-glow-coach"></div>
        <div className="wpc-content">
          <h2 className="wpc-proposal-title">Plano da semana</h2>
          <p className="text-xs font-semibold text-slate-600 mt-1">
            Sem treinos acordados. Pede ao Coach um plano para a próxima semana.
          </p>
        </div>
      </button>
    );
  }

  return (
    <div className="wpc-card">
      <div className="wpc-glow-coach"></div>
      <div className="wpc-content">
        <div className="wpc-header-row">
          <span className="wpc-lbl">Plano da semana</span>
          <button onClick={() => onNav('coach')} className="wpc-coach-link">Ver no Coach</button>
        </div>
        <div>
          {days.map(day => (
            <PlanDayCard
              key={day.dateISO}
              dateISO={day.dateISO}
              items={day.items}
              isToday={day.isToday}
              onComplete={onComplete}
              onCancel={onCancel}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
