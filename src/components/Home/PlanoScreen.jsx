import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, MessageCircle, Utensils } from 'lucide-react';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';
import { computeAcceptedWindow, buildPlanDays } from './WeeklyPlanCard';
import { planWeekLabel } from './DayPlanCard';
import { formatDayMonth, formatWeekday, dayTitle, dayStatus, mealsForDay, isRacePlanItem, isUnplannedDay, raceNameForDate, trainingItems } from '../../utils/homeModels';
import MealSheet from './MealSheet';

/* "O plano" — o plano acordado inteiro, dia a dia, em ecrã cheio
   (redesenho 2026-09-15). É para aqui que veio o trabalho do carrossel que
   vivia dentro do cartão "O que faço hoje": lá dava para ver um dia de cada
   vez, sem nunca se perceber a forma da semana nem quanto falta para a
   prova. Os dados são exatamente os mesmos (computeAcceptedWindow +
   buildPlanDays), só que rendidos como lista agrupada por semana.

   Mudar o plano continua a ser conversa com a Carol — o botão do fim leva
   lá, tal como o "Adaptar plano" que este ecrã substituiu. */

/* Segunda-feira da semana ISO a que esta data pertence. */
function weekStartISO(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  return addDaysISO(dateISO, -((d.getUTCDay() + 6) % 7));
}

/* "seg", "ter", "sáb" — as três primeiras letras do dia por extenso. O
   date-fns abrevia em pt com ponto ("seg.") e aqui a caixa da data é
   estreita; os sete dias portugueses distinguem-se todos em três letras. */
function shortWeekday(dateISO) {
  return formatWeekday(dateISO).slice(0, 3);
}

/* O estado do dia em uma palavra, como o mock. `dayStatus` dá o tom certo
   (é o mesmo que colore a data no cartão de hoje); aqui só se traduz para
   a etiqueta curta da lista, e um dia sem nada a dizer não leva nenhuma. */
function dayPill(day, today) {
  const status = dayStatus(day, today);
  if (status.tone === 'race') return { text: 'Prova', color: 'var(--race)' };
  if (day.dateISO === today) return { text: 'Hoje', color: 'var(--gym)' };
  if (status.label === 'Concluído') return { text: 'Feito', color: 'var(--ok)' };
  if (status.label === 'Em atraso') return { text: 'Em atraso', color: 'var(--warn)' };
  if (status.label === 'Cancelado') return { text: 'Cancelado', color: 'var(--danger)' };
  return null;
}

/* O resumo que fica no cabeçalho da semana fechada — é o que torna o
   colapso honesto: sem ele, fechar uma semana esconde informação em vez de
   a arrumar. "2/4" são as sessões dadas; uma semana sem nenhum treino
   planeado diz-se pelo nome, para não se confundir com "0/0 feitos". */
function weekSummary(week) {
  const items = (week?.days || []).flatMap((d) => trainingItems(d.items));
  if (items.length === 0) return 'Sem treinos';
  const done = items.filter((i) => i.status === 'concluido').length;
  return `${done}/${items.length} feitos`;
}

function StatTile({ value, suffix, label, testId }) {
  return (
    <div className="flex-1 text-center rounded-[12px]" style={{ padding: '8px 4px', background: 'rgba(255,255,255,.04)', border: '1px solid var(--border-glass)' }}>
      <div data-testid={testId} className="text-[18px] font-black" style={{ color: 'var(--text-1)' }}>
        {value}<span className="text-[11px] font-bold" style={{ color: 'var(--text-4)' }}>{suffix}</span>
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-4)' }}>{label}</div>
    </div>
  );
}

export default function PlanoScreen({ onClose }) {
  const { coachPlans, coachPlanItems, raceEvents, setActiveTab } = useAppStore();
  const today = todayISO();
  const [mealDay, setMealDay] = useState(null);

  const planWindow = useMemo(() => computeAcceptedWindow(coachPlans, coachPlanItems, today), [coachPlans, coachPlanItems, today]);
  const days = useMemo(() => {
    if (!planWindow) return [];
    const acceptedIds = new Set((coachPlans || []).filter((p) => p.status === 'aceite').map((p) => p.id));
    return buildPlanDays((coachPlanItems || []).filter((i) => acceptedIds.has(i.plan_id)), planWindow.start, planWindow.days);
  }, [coachPlans, coachPlanItems, planWindow]);

  // Semanas de segunda a domingo, pela ordem em que os dias vêm.
  const weeks = useMemo(() => {
    const out = [];
    days.forEach((d) => {
      const start = weekStartISO(d.dateISO);
      const last = out[out.length - 1];
      if (last && last.start === start) last.days.push(d);
      else out.push({ start, days: [d] });
    });
    return out;
  }, [days]);

  const week = planWeekLabel(planWindow, today);
  const thisWeekStart = weekStartISO(today);
  const currentWeek = weeks.find((w) => w.start === thisWeekStart);

  /* Semanas fechadas por omissão, menos a que está a correr (pedido do
     utilizador: um plano de 10 semanas abria com 70 linhas de dias, e a
     semana de hoje ficava perdida no meio). O estado guarda as semanas
     ABERTAS — assim uma semana que apareça depois (o plano cresce quando a
     Carol detalha o microciclo seguinte) nasce fechada, sem precisar de
     ser reconciliada aqui. */
  const [openWeeks, setOpenWeeks] = useState(() => new Set());
  const initialisedRef = useRef(false);
  useEffect(() => {
    if (initialisedRef.current || weeks.length === 0) return;
    initialisedRef.current = true;
    // Sem semana em curso (plano só no futuro), abre a primeira: um ecrã
    // inteiramente fechado não diz nada a quem acabou de entrar.
    setOpenWeeks(new Set([currentWeek ? currentWeek.start : weeks[0].start]));
  }, [weeks, currentWeek]);

  const toggleWeek = (start) => {
    setOpenWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(start)) next.delete(start);
      else next.add(start);
      return next;
    });
  };

  /* O foco na semana atual: se ela não é a primeira da lista, o ecrã abre
     com ela à vista em vez de obrigar a rolar. `block: 'start'` e não
     `center` — o cabeçalho da semana deve encostar ao topo, com os dias
     dela por baixo. */
  const currentWeekRef = useRef(null);
  const jaRolouRef = useRef(false);
  useEffect(() => {
    // Uma vez só, à entrada: sem esta guarda, abrir ou fechar qualquer
    // semana puxava o ecrã de volta para a de hoje a meio da leitura.
    if (jaRolouRef.current) return undefined;
    if (!currentWeek || weeks[0]?.start === currentWeek.start) return undefined;
    if (!openWeeks.has(currentWeek.start)) return undefined;
    const node = currentWeekRef.current;
    if (!node?.scrollIntoView) return undefined;
    /* Num frame à frente, e não já: o efeito que abre a semana em curso só
       produz o layout novo no commit seguinte, e rolar antes disso media a
       página toda colapsada — o destino saía calculado com as alturas
       erradas e a semana acabava fora do sítio. */
    jaRolouRef.current = true;
    const id = requestAnimationFrame(() => {
      node.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [currentWeek, weeks, openWeeks]);

  /* Dias sem plano nenhum: o atleta tem de poder pedir à Carol que os
     preencha. Um convite por dia vazio seria ruído num bloco de cinco dias
     seguidos, por isso só aparece no PRIMEIRO dia de cada bloco contíguo —
     e nunca no passado, que já não há plano a fazer para ontem. */
  const askPlanDates = useMemo(() => {
    const out = new Set();
    let prevUnplanned = false;
    days.forEach((d) => {
      const unplanned = isUnplannedDay(d.items);
      if (unplanned && !prevUnplanned && d.dateISO >= today) out.add(d.dateISO);
      prevUnplanned = unplanned;
    });
    return out;
  }, [days, today]);

  /* O resumo é sempre da semana em curso. Os quilómetros são os PLANEADOS
     dos treinos já dados — a distância real vive no registo da corrida, que
     este ecrã não carrega; para "quanto já fiz esta semana" o alvo cumprido
     chega, e não obriga a puxar o histórico todo para um cabeçalho. */
  const summary = useMemo(() => {
    const items = (currentWeek?.days || []).flatMap((d) => trainingItems(d.items));
    const done = items.filter((i) => i.status === 'concluido');
    const km = done.reduce((s, i) => s + (Number(i.target_distance_km) || 0), 0);
    return { done: done.length, total: items.length, km: Math.round(km) };
  }, [currentWeek]);

  // A prova a que este plano leva: a que cai dentro da janela acordada.
  const raceName = useMemo(() => {
    if (!planWindow) return null;
    const end = addDaysISO(planWindow.start, planWindow.days - 1);
    const race = (raceEvents || []).find((r) => r && typeof r.date === 'string' && r.date.slice(0, 10) >= planWindow.start && r.date.slice(0, 10) <= end);
    return race?.name || null;
  }, [raceEvents, planWindow]);

  const goCoach = (intent) => {
    if (intent) useAppStore.getState().setCoachIntent(intent);
    onClose?.();
    setActiveTab?.('coach');
  };

  const Header = ({ subtitle }) => (
    <div className="flex items-center gap-2.5" style={{ minHeight: 44 }}>
      <button type="button" aria-label="Voltar" onClick={() => onClose?.()} className="flex items-center justify-center shrink-0" style={{ width: 44, height: 44, marginLeft: -10, color: 'var(--text-3)' }}>
        <ChevronLeft size={20} />
      </button>
      <div className="min-w-0">
        <h2 className="text-[16px] font-black" style={{ color: 'var(--text-1)', letterSpacing: '-.02em' }}>O plano</h2>
        {subtitle && <div className="text-[11.5px]" style={{ color: 'var(--text-4)' }}>{subtitle}</div>}
      </div>
    </div>
  );

  if (!planWindow) {
    return (
      <div className="flex flex-col gap-3 fade-in pb-2" data-testid="plano-screen">
        <Header />
        <div className="rounded-[24px]" style={{ background: 'var(--surface-glass)', border: '1px solid var(--border-glass)', padding: 16 }}>
          <h3 className="text-[16px] font-black leading-[1.15]" style={{ color: 'var(--text-1)', letterSpacing: '-.02em' }}>Sem plano acordado</h3>
          <p className="text-[12.5px] leading-[1.45] mt-1.5" style={{ color: 'var(--text-3)' }}>
            Pede-me um plano. As propostas aparecem no chat, para aceitares ou recusares.
          </p>
          <button type="button" onClick={() => goCoach(null)} className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] mt-3 rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', color: 'var(--coach)' }}>
            <MessageCircle size={15} /> Pedir plano à Carol
          </button>
        </div>
      </div>
    );
  }

  const endISO = addDaysISO(planWindow.start, planWindow.days - 1);
  const subtitle = [`${formatDayMonth(planWindow.start)} – ${formatDayMonth(endISO)}`, raceName ? `para a ${raceName}` : null].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-2 fade-in pb-2" data-testid="plano-screen">
      <Header subtitle={subtitle} />

      <div className="flex gap-1.5">
        <StatTile testId="plano-sessoes" value={summary.done} suffix={`/${summary.total}`} label="sessões feitas" />
        <StatTile testId="plano-km" value={summary.km} suffix=" km" label="esta semana" />
        <StatTile testId="plano-semana" value={week.current} suffix={`/${week.total}`} label="semana" />
      </div>

      <div className="rounded-[24px]" style={{ background: 'var(--surface-glass)', border: '1px solid var(--border-glass)', padding: '4px 16px 8px', boxShadow: 'var(--shadow-card)' }}>
        {weeks.map((w) => {
          const isOpen = openWeeks.has(w.start);
          const isCurrent = w.start === thisWeekStart;
          const label = isCurrent ? 'Esta semana'
            : w.start === addDaysISO(thisWeekStart, 7) ? 'Próxima semana'
              : `Semana de ${formatDayMonth(w.start)} a ${formatDayMonth(addDaysISO(w.start, 6))}`;
          return (
          <div key={w.start} ref={isCurrent ? currentWeekRef : null} style={{ scrollMarginTop: 12 }}>
            <button
              type="button"
              data-testid={`plano-semana-${w.start}`}
              aria-expanded={isOpen}
              onClick={() => toggleWeek(w.start)}
              className="w-full flex items-center gap-2 text-left"
              style={{ minHeight: 44, padding: '10px 0 6px' }}
            >
              <span className="text-[11px] font-extrabold uppercase flex-1 min-w-0 truncate" style={{ color: isCurrent ? 'var(--text-2)' : 'var(--text-4)', letterSpacing: 'var(--tracking-eyebrow)' }}>
                {label}
              </span>
              <span className="shrink-0 text-[11px] font-bold" style={{ color: 'var(--text-4)' }}>{weekSummary(w)}</span>
              {isOpen
                ? <ChevronUp size={14} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
                : <ChevronDown size={14} style={{ color: 'var(--text-4)', flexShrink: 0 }} />}
            </button>
            {isOpen && w.days.map((d, i) => {
              const pill = dayPill(d, today);
              const meals = mealsForDay(d.items);
              const unplanned = isUnplannedDay(d.items);
              const notes = trainingItems(d.items).filter((it) => !isRacePlanItem(it) && typeof it.notes === 'string' && it.notes.trim());
              return (
                <div
                  key={d.dateISO}
                  data-testid={`plano-dia-${d.dateISO}`}
                  className="flex gap-3"
                  style={{
                    padding: '12px 0',
                    borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,.08)',
                    ...(d.isToday ? { margin: '0 -16px', padding: '12px 16px', background: 'rgba(158,195,210,.06)', borderTopColor: 'rgba(158,195,210,.2)' } : null),
                  }}
                >
                  <div className="flex flex-col items-center justify-center shrink-0 rounded-[12px]" style={{ width: 44, height: 44, background: d.isToday ? 'rgba(158,195,210,.16)' : 'rgba(255,255,255,.06)', border: `1px solid ${d.isToday ? 'rgba(158,195,210,.4)' : 'var(--border-glass-strong)'}`, color: 'var(--text-2)' }}>
                    <b className="text-[15px] font-black leading-none">{d.dateISO.slice(8, 10)}</b>
                    <small className="text-[11px] font-extrabold uppercase leading-none mt-[3px]">{shortWeekday(d.dateISO)}</small>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-extrabold" style={{ color: unplanned ? 'var(--text-4)' : 'var(--text-1)' }}>{dayTitle(d.items, raceNameForDate(raceEvents, d.dateISO))}</div>
                    {askPlanDates.has(d.dateISO) && (
                      <button
                        type="button"
                        data-testid={`plano-pedir-${d.dateISO}`}
                        onClick={() => goCoach('adapt_plan')}
                        className="inline-flex items-center gap-1.5 min-h-[44px] -my-[7px] text-[11.5px] font-bold text-left"
                        style={{ color: 'var(--coach)' }}
                      >
                        <MessageCircle size={13} />
                        Pedir-me um plano para estes dias
                        <ChevronRight size={12} />
                      </button>
                    )}
                    {notes.map((it) => (
                      <p key={it.id} className="text-[12px] leading-[1.45] mt-[3px]" style={{ color: 'var(--text-3)', whiteSpace: 'pre-line' }}>{it.notes.trim()}</p>
                    ))}
                    {meals && (
                      <button type="button" data-testid={`plano-refeicoes-${d.dateISO}`} onClick={() => setMealDay({ dateISO: d.dateISO, items: d.items })} className="inline-flex items-center gap-1.5 min-h-[44px] -my-[7px] text-[11.5px] font-bold" style={{ color: 'var(--text-4)' }}>
                        <Utensils size={13} style={{ color: 'var(--gym)' }} />
                        Refeições sugeridas{meals.kcal ? ` · ~${meals.kcal} kcal` : ''}
                        <ChevronRight size={12} />
                      </button>
                    )}
                  </div>

                  {pill && <span className="shrink-0 self-start text-[11px] font-extrabold uppercase mt-0.5" style={{ color: pill.color, letterSpacing: '.04em' }}>{pill.text}</span>}
                </div>
              );
            })}
          </div>
          );
        })}
      </div>

      <button type="button" data-testid="plano-adaptar" onClick={() => goCoach('adapt_plan')} className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] mt-1 rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', color: 'var(--coach)' }}>
        Adaptar o plano com a Carol
      </button>

      {mealDay && <MealSheet day={mealDay} onClose={() => setMealDay(null)} />}
    </div>
  );
}
