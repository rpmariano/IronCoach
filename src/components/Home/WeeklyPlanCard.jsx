import React, { useState, useMemo } from 'react';
import {
  ChevronDown, ChevronUp, Check, X as XIcon, Dumbbell as DumbbellIcon,
  Footprints, Utensils, Moon, Award, StickyNote,
} from 'lucide-react';

/* Plano da semana no ecrã Início. Ver specs/plano-de-treino.md e
   specs/coach-investigacao.md (Bloco 7, forma de entrega 2).

   Duas decisões que explicam a forma do componente:

   1. HORIZONTE FIXO de 7 dias, sempre. A versão anterior listava só os itens
      pendentes, o que fazia o cartão encolher e crescer conforme a semana ia
      andando — e um dia sem treino desaparecia, mesmo quando tinha sugestão
      alimentar. Sete linhas fixas dão à semana uma forma estável e dão lugar
      aos dias que só têm refeição.

   2. RESUMO + EXPANSÃO, no molde do MealCard: a linha fechada diz o
      essencial, e o detalhe (instruções, sugestão alimentar, botões) só
      aparece a pedido. Sete dias abertos de uma vez seriam ilegíveis. */

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

function statCardBg(color) {
  return {
    background: `radial-gradient(130% 150% at 100% 0%, color-mix(in srgb, ${color} 10%, transparent) 0%, transparent 60%), linear-gradient(165deg, #ffffff, var(--surf-800))`,
    borderStyle: 'solid',
    borderWidth: '1px 1px 1px 3px',
    borderColor: `var(--brd-700) var(--brd-700) var(--brd-700) color-mix(in srgb, ${color} 70%, var(--brd-700))`,
    boxShadow: '0 1px 2px rgba(15,23,42,0.06), 0 4px 14px -5px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.6)',
  };
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

function itemColor(item) {
  if (item.kind === 'corrida') return 'var(--mod-corrida-to)';
  if (item.kind === 'ginasio') return 'var(--mod-ginasio-to)';
  return 'var(--green)';
}

/* Um dia do plano. Recebe já os itens desse dia (normalmente zero ou um; dois
   quando o coach marca corrida de manhã e ginásio à tarde). */
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
  const headColor = empty ? 'var(--brd-700)' : itemColor(items[0]);

  const toggle = () => { if (canExpand) setExpanded(e => !e); };

  return (
    <div
      className="bg-[var(--surf-detail)] border rounded-2xl p-3 shadow-xs transition"
      style={{
        borderColor: isToday ? 'color-mix(in srgb, var(--mod-coach-to) 45%, transparent)' : 'rgba(203,213,225,0.8)',
        opacity: empty ? 0.65 : 1,
      }}
    >
      <div
        onClick={toggle}
        className={`flex items-center justify-between ${canExpand ? 'cursor-pointer' : ''} select-none`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: `color-mix(in srgb, ${headColor} 15%, transparent)`, color: headColor }}
          >
            <HeadIcon size={16} />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-slate-800 leading-tight">
              {weekday} <span className="font-medium text-slate-400">{dayLabel}</span>
              {isToday && (
                <span
                  className="ml-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide align-middle"
                  style={{ background: 'color-mix(in srgb, var(--mod-coach-to) 15%, transparent)', color: 'var(--mod-coach-to)' }}
                >
                  Hoje
                </span>
              )}
            </h4>
            <p className="text-[11px] text-slate-500 font-medium truncate">{summary}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasMeal && (
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center"
              title="Tem sugestão alimentar"
              style={{ background: 'var(--surf-success-soft)', color: '#047857' }}
            >
              <Utensils size={12} />
            </span>
          )}
          {canExpand && (
            <button
              onClick={(e) => { e.stopPropagation(); toggle(); }}
              type="button"
              aria-label={expanded ? `Fechar detalhes de ${weekday}` : `Ver detalhes de ${weekday}`}
              aria-expanded={expanded}
              className="tap-44 text-slate-400 hover:text-slate-600 shrink-0"
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="space-y-2.5 pt-2.5 mt-2.5 border-t border-slate-200/60 fade-in">
          {items.map(item => (
            <div key={item.id} className="space-y-2.5">
              {items.length > 1 && (
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {itemTitle(item)}
                </p>
              )}

              {item.status === 'concluido' && (
                <p className="text-[11px] font-semibold" style={{ color: 'var(--color-success)' }}>
                  Concluído{item.actual_date && item.actual_date !== item.planned_date ? ` a ${item.actual_date}` : ''}
                </p>
              )}

              {item.notes && (
                <div className="bg-white border border-slate-200/60 rounded-xl p-3 shadow-xs">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 mb-1">
                    <StickyNote size={13} className="text-slate-400" /> Instruções do Coach
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{item.notes}</p>
                </div>
              )}

              {/* Sugestão alimentar — deliberadamente com a mesma pele da
                  "Análise do Coach" do MealCard, para o atleta reconhecer a
                  voz. O rodapé não é decorativo: o enquadramento decidido no
                  Bloco 7 é sugestão educativa, nunca prescrição. */}
              {item.meal_suggestion && (
                <div className="bg-[var(--surf-success-soft)] border border-emerald-200/80 rounded-2xl p-3 space-y-1.5 shadow-xs">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800">
                    <Award size={14} className="text-emerald-600 shrink-0" />
                    Sugestão alimentar
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed">{item.meal_suggestion}</p>
                  <p className="text-[10px] text-emerald-700/80 leading-relaxed pt-0.5">
                    Sugestão, não prescrição — ajusta ao que te cai bem. Em caso de
                    dúvida clínica, fala com um nutricionista.
                  </p>
                </div>
              )}

              {!readOnly && item.kind !== 'descanso' && item.status === 'pendente' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onComplete(item)}
                    className="flex-1 tap-h-44 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition"
                    style={{ background: 'var(--color-success)', color: '#fff' }}
                  >
                    <Check size={14} /> Concluir
                  </button>
                  <button
                    onClick={() => onCancel(item)}
                    className="flex-1 tap-h-44 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition"
                    style={{ background: 'rgba(15,23,42,0.08)', color: 'var(--green)' }}
                  >
                    <XIcon size={14} /> Cancelar
                  </button>
                </div>
              )}

              {!readOnly && isPast && item.status === 'pendente' && item.kind !== 'descanso' && (
                <p className="text-[10px] font-semibold" style={{ color: 'var(--color-error)' }}>
                  Este treino já passou e continua por resolver.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Constrói os 7 dias a partir de hoje e distribui os itens por eles. Itens
   fora da janela não aparecem — o cartão é a semana, não o plano inteiro. */
export function buildPlanDays(items, from = todayISO(), horizon = PLAN_HORIZON_DAYS) {
  const days = [];
  for (let i = 0; i < horizon; i++) {
    const dateISO = addDaysISO(from, i);
    days.push({
      dateISO,
      isToday: i === 0,
      items: (items || [])
        .filter(it => it.status !== 'cancelado')
        // Um item concluído noutro dia conta para o dia em que aconteceu —
        // a mesma regra que planAffectsDay() usa para a nutrição.
        .filter(it => (it.status === 'concluido' ? (it.actual_date || it.planned_date) : it.planned_date) === dateISO)
        .sort((a, b) => a.kind.localeCompare(b.kind)),
    });
  }
  return days;
}

/* Proposta ainda por aceitar — o coach criou-a no chat, o atleta decide aqui.
   Enquanto 'proposto', os treinos não contam para nada (nem aparecem como
   treinos a fazer, nem ajustam objetivos de nutrição). */
function PlanProposalCard({ plan, items, onRespond }) {
  const its = useMemo(() => items.filter(i => i.plan_id === plan.id), [items, plan.id]);
  // A proposta mostra-se pelo seu próprio período, não pelos próximos 7 dias
  // — pode começar amanhã ou na semana seguinte.
  const days = useMemo(
    () => buildPlanDays(its, plan.period_start, PLAN_HORIZON_DAYS).filter(d => d.items.length > 0),
    [its, plan.period_start],
  );

  return (
    <div className="rounded-2xl p-3.5 space-y-2.5" style={statCardBg('var(--mod-coach-to)')}>
      <h2 className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--green)' }}>
        O Coach propôs um plano
      </h2>
      {plan.summary && <p className="text-xs" style={{ color: 'var(--text-main)' }}>{plan.summary}</p>}

      <div className="space-y-2">
        {days.map(day => (
          <PlanDayCard key={day.dateISO} dateISO={day.dateISO} items={day.items} isToday={false} readOnly />
        ))}
      </div>

      <div className="flex gap-2">
        <button onClick={() => onRespond(plan.id, true)}
          className="tap-h-44 flex-1 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition"
          style={{ background: 'var(--color-success)', color: '#fff' }}>
          <Check size={15} /> Aceitar
        </button>
        <button onClick={() => onRespond(plan.id, false)}
          className="tap-h-44 flex-1 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition"
          style={{ background: 'rgba(15,23,42,0.08)', color: 'var(--green)' }}>
          <XIcon size={15} /> Recusar
        </button>
      </div>
    </div>
  );
}

export default function WeeklyPlanCard({ plans = [], planItems = [], onComplete, onCancel, onRespond, onNav }) {
  // Uma proposta por aceitar tem precedência — mostra-se essa em vez da
  // semana, para a decisão não ficar escondida.
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
      <button onClick={() => onNav('coach')} className="w-full text-left rounded-2xl p-3.5 active:scale-[0.98] transition" style={statCardBg('var(--mod-coach-to)')}>
        <h2 className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--green)' }}>Plano da semana</h2>
        <p className="text-xs" style={{ color: 'var(--green)' }}>
          Sem treinos acordados. Pede ao Coach um plano para a próxima semana.
        </p>
      </button>
    );
  }

  return (
    <div className="rounded-2xl p-3.5" style={statCardBg('var(--mod-coach-to)')}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--green)' }}>Plano da semana</h2>
        <button onClick={() => onNav('coach')} className="text-[10px] font-semibold" style={{ color: 'var(--mod-coach-to)' }}>Ver no Coach</button>
      </div>
      <div className="space-y-2">
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
  );
}
