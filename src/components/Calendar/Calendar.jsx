import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { useToast } from '../shared/ToastProvider';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { pt } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react';
import { isWalk } from '@formulas/runKinds.ts';

import RunCard from '../Run/RunCard';
import RaceCard from '../Run/RaceCard';
import GymSessionCard from '../Gym/GymSessionCard';
import MealCard from '../Nutrition/MealCard';
import BodyAssessmentCard from '../Body/BodyAssessmentCard';

import RunRegistration from '../Run/RunRegistration';
import GymRegistration from '../Gym/GymRegistration';
import MealRegistration from '../Nutrition/MealRegistration';
import BodyRegistration from '../Body/BodyRegistration';
import CreatedRecordModal from '../shared/CreatedRecordModal';
import CoachInsightsDock from '../BI/CoachInsightsDock';
import { Dialog } from '../shared/Sheet';
import { orderDayRecords } from '../../utils/dayOrder';
import { scrollToTop } from '../../utils/scrollToTop';
import {
  CALENDAR_ALL,
  CALENDAR_FILTER_ALL,
  CALENDAR_RECORD_TYPES,
  RACE_STATUS_FILTERS,
  normalizeCalendarFilter,
  filterCalendarRecords,
  isCalendarFilterActive,
  calendarFilterLabel,
  emptyDayMessage,
  listRacesByStatus,
  pageOf,
} from '../../utils/calendarFilter';

const isoDay = (d) => format(d, 'yyyy-MM-dd');
const fromIsoDay = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/* Um botão do filtro da agenda: a cor do tipo (a mesma dos tracinhos da
   grelha — o filtro é também a legenda) e o nome. Escolhido, pinta-se na
   tinta dessa cor; "Tudo" não tem cor de registo e fica no neutro. O nome
   escolhido fica em --text-1: na cor do tipo, por cima da tinta e dos dois
   vidros, "Nutrição" e "Corpo" ficavam em 4,3:1 (revisão pré-deploy). */
function FilterChip({ label, color, tone, active, onClick, testId }) {
  const activeStyle = tone
    ? { background: `var(--tint-${tone}-bg)`, borderColor: `var(--tint-${tone}-bd)`, color: 'var(--text-1)' }
    : { background: 'rgba(255,255,255,.08)', borderColor: 'var(--border-glass-strong)', color: 'var(--text-1)' };
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      data-testid={testId}
      className="min-h-[44px] min-w-0 px-1.5 rounded-[12px] border inline-flex items-center justify-center gap-1.5 text-[11.5px] font-bold transition-colors"
      style={active ? activeStyle : { background: 'transparent', borderColor: 'transparent', color: 'var(--text-3)' }}
    >
      {color && <span aria-hidden="true" className="w-3.5 h-1.5 rounded-[2px] shrink-0" style={{ background: color }} />}
      <span className="truncate">{label}</span>
    </button>
  );
}

export default function Calendar() {
  const { runs, raceEvents, gymSessions, meals, bodyAssessments, setRuns, setRaceEvents, setMeals, setBodyAssessments, setEditingRaceId, pendingCalendarDate, clearPendingCalendarDate, calendarView } = useAppStore();
  const { showToast } = useToast();

  // Onde abrir. Gravar uma prova nova (RunAgenda) deixa aqui a data da
  // prova, para o Calendário abrir logo nesse dia/mês em vez do de hoje —
  // ver pendingCalendarDate no store; com ela o filtro volta a "Tudo", para
  // o registo acabado de gravar não ficar escondido por ele. Sem ela, o
  // sítio onde o Calendário estava antes de um ecrã de topo o tapar (o hub
  // de uma prova, um registo — calendarView no store). Senão, hoje e sem
  // filtro. Lido só na inicialização (lazy); pendingCalendarDate é
  // consumido uma única vez pelo useEffect abaixo, para não voltar a
  // aplicar-se numa visita normal e futura ao Calendário.
  const [initialView] = useState(() => {
    const pending = pendingCalendarDate ? fromIsoDay(pendingCalendarDate) : null;
    if (pending) return { month: pending, selected: pending, filter: CALENDAR_FILTER_ALL, racePage: 0 };
    const month = calendarView?.month ? fromIsoDay(calendarView.month) : null;
    const selected = calendarView?.selected ? fromIsoDay(calendarView.selected) : null;
    if (month && selected) {
      return { month, selected, filter: normalizeCalendarFilter(calendarView.filter), racePage: Number.isInteger(calendarView.racePage) ? calendarView.racePage : 0 };
    }
    const today = new Date();
    return { month: today, selected: today, filter: CALENDAR_FILTER_ALL, racePage: 0 };
  });
  const [currentDate, setCurrentDate] = useState(initialView.month);
  const [selectedDate, setSelectedDate] = useState(initialView.selected);
  // O filtro da agenda (pedido 2026-09-27) — ver utils/calendarFilter.js.
  const [filter, setFilter] = useState(initialView.filter);
  // A página da lista de provas (na "Prova", 5 de cada vez).
  const [racePage, setRacePage] = useState(initialView.racePage);

  useEffect(() => {
    if (pendingCalendarDate) {
      const d = fromIsoDay(pendingCalendarDate);
      if (d) {
        setCurrentDate(d);
        setSelectedDate(d);
        setFilter(CALENDAR_FILTER_ALL);
        setRacePage(0);
      }
      clearPendingCalendarDate();
    }
  }, [pendingCalendarDate, clearPendingCalendarDate]);

  // Desmontado por baixo de um ecrã de topo (o separador continua a ser o
  // Calendário): guarda onde estava, para o "voltar" o repor tal e qual.
  // Mudar de separador já apagou o calendarView (setActiveTab) e aqui não
  // se volta a escrever — a próxima visita começa em hoje. Sem sessão
  // (saiu-se da conta com o Calendário aberto) também não: quem entrar a
  // seguir neste telemóvel não herda o sítio de quem saiu.
  const viewRef = useRef(null);
  viewRef.current = { month: isoDay(currentDate), selected: isoDay(selectedDate), filter, racePage };
  useEffect(() => () => {
    const s = useAppStore.getState();
    if (s.activeTab === 'calendario' && s.session) s.setCalendarView?.(viewRef.current);
  }, []);

  // Tocar no tipo que já está escolhido volta a "Tudo": o botão aceso é
  // também a saída do filtro. O estado das provas só existe dentro de
  // "Prova" (normalizeCalendarFilter).
  // Mudar de filtro volta sempre à primeira página da lista de provas.
  const chooseType = (type) => {
    setRacePage(0);
    setFilter((prev) => (
      type === CALENDAR_ALL || prev.type === type
        ? CALENDAR_FILTER_ALL
        : normalizeCalendarFilter({ type, raceStatus: prev.raceStatus })
    ));
  };
  const chooseRaceStatus = (raceStatus) => {
    setRacePage(0);
    setFilter(normalizeCalendarFilter({ type: 'prova', raceStatus }));
  };
  const clearFilter = () => {
    setRacePage(0);
    setFilter(CALENDAR_FILTER_ALL);
  };
  const filterActive = isCalendarFilterActive(filter);
  const activeFilterLabel = calendarFilterLabel(filter);
  const activeFilterTone = CALENDAR_RECORD_TYPES.find((t) => t.key === filter.type)?.tone;

  const [editingRunId, setEditingRunId] = useState(null);
  const [editingGymId, setEditingGymId] = useState(null);
  const [editingMealId, setEditingMealId] = useState(null);
  const [editingBodyId, setEditingBodyId] = useState(null);

  const isEditingAny = !!(editingRunId || editingGymId || editingMealId || editingBodyId);
  const prevEditingRef = useRef(isEditingAny);
  useEffect(() => {
    if (prevEditingRef.current !== isEditingAny) {
      prevEditingRef.current = isEditingAny;
      scrollToTop();
    }
  }, [isEditingAny]);
  // Prova cuja eliminação está por confirmar. Era um window.confirm — o
  // popup do sistema não fala a língua da app, não diz o que se perde e
  // não respeita os 44px de toque (auditoria a11y). Passa pelo Dialog
  // partilhado, como a confirmação de dispensar um assunto da Carol.
  const [raceToDelete, setRaceToDelete] = useState(null);

  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentDate),
      end: endOfMonth(currentDate)
    });
  }, [currentDate]);

  /* Na "Prova" (pedido 2026-09-27) a agenda deixa de mostrar o dia
     escolhido e lista todas as provas do estado escolhido — por realizar ou
     concluídas —, 5 de cada vez. A grelha continua a acender os dias delas. */
  const isRaceList = filter.type === 'prova';
  const raceList = useMemo(
    () => (isRaceList ? listRacesByStatus(raceEvents, filter.raceStatus) : []),
    [isRaceList, raceEvents, filter.raceStatus],
  );
  const racePageInfo = pageOf(raceList, racePage);
  // A lista encolheu (uma prova apagada ou concluída) e a página guardada
  // ficou para lá do fim: o estado acompanha a página que se vê, para não
  // ficar guardado no calendarView um número que já não existe.
  useEffect(() => {
    if (isRaceList && racePageInfo.page !== racePage) setRacePage(racePageInfo.page);
  }, [isRaceList, racePageInfo.page, racePage]);
  const raceListRef = useRef(null);
  const raceListTitleRef = useRef(null);
  const goToRacePage = (next) => {
    setRacePage(next);
    // A página nova começa no topo da lista, não onde estava o botão. O
    // foco vai para o título: na última página o "Seguintes" desativa-se, e
    // com o foco nele o teclado e o leitor de ecrã ficavam sem sítio.
    raceListRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    raceListTitleRef.current?.focus?.({ preventScroll: true });
  };
  // "3 provas por realizar", "1 prova concluída": o título diz o que a lista
  // é — tocar num dia da grelha não a muda.
  const raceListTitle = (() => {
    const n = racePageInfo.total;
    const provas = n === 1 ? 'prova' : 'provas';
    if (filter.raceStatus === 'concluida') return `${n} ${provas} ${n === 1 ? 'concluída' : 'concluídas'}`;
    return `${n} ${provas} por realizar`;
  })();

  // A grelha e a lista do dia leem os mesmos registos já filtrados: um dia
  // só se acende com o que o filtro deixa ver.
  const { runsByDay, racesByDay, gymByDay, mealsByDay, bodyByDay } = useMemo(() => {
    const visible = filterCalendarRecords({ runs, raceEvents, gymSessions, meals, bodyAssessments }, filter);
    const groupBy = (rows) => {
      const map = new Map();
      for (const row of rows || []) {
        if (!map.has(row.date)) map.set(row.date, []);
        map.get(row.date).push(row);
      }
      return map;
    };
    return {
      runsByDay: groupBy(visible.runs),
      racesByDay: groupBy(visible.raceEvents),
      gymByDay: groupBy(visible.gymSessions),
      mealsByDay: groupBy(visible.meals),
      bodyByDay: groupBy(visible.bodyAssessments),
    };
  }, [runs, raceEvents, gymSessions, meals, bodyAssessments, filter]);

  /* Apagar a corrida que cumpriu um treino do plano, ou que concluiu uma
     prova, solta-os na BD (trigger 20260928205037 e seguinte): o treino
     passa para outro registo desse dia ou volta a pendente, e a prova volta
     a agendada. O store relê os dois (reloadAfterRunDeleted). */
  const reloadAfterRunDelete = () => {
    Promise.resolve(useAppStore.getState().reloadAfterRunDeleted?.()).catch(() => {});
  };

  // Delete handlers
  const handleDeleteRun = async (id) => {
    const previous = [...runs];
    setRuns(runs.filter(r => r.id !== id));
    try {
      const { error } = await supabase.from('runs').delete().eq('id', id);
      if (error) throw error;
      showToast('Corrida eliminada');
      reloadAfterRunDelete();
    } catch (err) {
      showToast('Erro ao eliminar corrida.', 'error');
      setRuns(previous);
    }
  };

  const handleDeleteMeal = async (id) => {
    const previous = [...meals];
    setMeals(meals.filter(m => m.id !== id));
    try {
      const { error } = await supabase.from('meals').delete().eq('id', id);
      if (error) throw error;
      showToast('Refeição eliminada');
    } catch (err) {
      showToast('Erro ao eliminar refeição.', 'error');
      setMeals(previous);
    }
  };

  const handleDeleteBody = async (id) => {
    const previous = [...bodyAssessments];
    setBodyAssessments(bodyAssessments.filter(a => a.id !== id));
    try {
      const { error } = await supabase.from('body_assessments').delete().eq('id', id);
      if (error) throw error;
      showToast('Avaliação eliminada');
    } catch (err) {
      showToast('Erro ao eliminar avaliação.', 'error');
      setBodyAssessments(previous);
    }
  };

  if (editingRunId) return <RunRegistration onClose={() => setEditingRunId(null)} runIdToEdit={editingRunId} />;
  if (editingGymId) return <GymRegistration onClose={() => setEditingGymId(null)} sessionIdToEdit={editingGymId} />;
  // raceEvents toggle status and delete are handled inside RaceCard via optimistic updates, 
  // but to keep it simple, we can pass them down.
  const handleToggleRaceStatus = async (ev) => {
    const newStatus = ev.status === 'concluida' ? 'agendada' : 'concluida';
    setRaceEvents(raceEvents.map(e => e.id === ev.id ? { ...e, status: newStatus } : e));
    try {
      const { error } = await supabase.from('race_events').update({ status: newStatus }).eq('id', ev.id);
      if (error) throw error;
      showToast('Estado da prova atualizado');
    } catch (err) {
      console.error(err);
      setRaceEvents(raceEvents);
    }
  };

  const handleDeleteRace = async (id) => {
    const previous = [...raceEvents];
    setRaceEvents(raceEvents.filter(e => e.id !== id));
    try {
      const { error } = await supabase.from('race_events').delete().eq('id', id);
      if (error) throw error;
      showToast('Prova eliminada');
    } catch (err) {
      console.error(err);
      setRaceEvents(previous);
      showToast('Não consegui eliminar a prova. Tenta outra vez.', 'error');
    }
  };

  const confirmDeleteRace = () => {
    const alvo = raceToDelete;
    setRaceToDelete(null);
    if (alvo) handleDeleteRace(alvo.id);
  };

  /* Registar a prova abre o registo de corrida em MODO PROVA, pelo store
     (specs/prova-concluida.md §3) — ecrã de topo no separador Corrida, como
     as outras duas entradas. Antes disto era um planItemPrefill montado à
     mão que abria o formulário aqui dentro, sem ligação nenhuma à prova: a
     corrida ficava órfã e o hub só a encontrava por coincidência de data. */
  const handleRegisterRace = (ev) => useAppStore.getState().openRaceRun(ev.id);

  if (editingRunId) return <RunRegistration onClose={() => setEditingRunId(null)} runIdToEdit={editingRunId} />;
  if (editingGymId) return <GymRegistration onClose={() => setEditingGymId(null)} sessionIdToEdit={editingGymId} />;
  if (editingMealId) return <MealRegistration onClose={() => setEditingMealId(null)} mealIdToEdit={editingMealId} />;
  if (editingBodyId) return <BodyRegistration onClose={() => setEditingBodyId(null)} assessmentIdToEdit={editingBodyId} />;

  const firstWeekday = (startOfMonth(currentDate).getDay() + 6) % 7;
  const selectedDayStr = format(selectedDate, 'yyyy-MM-dd');

  const selectedRuns = runsByDay.get(selectedDayStr) || [];
  const selectedRaces = racesByDay.get(selectedDayStr) || [];
  const selectedGym = gymByDay.get(selectedDayStr) || [];
  const selectedMeals = mealsByDay.get(selectedDayStr) || [];
  const selectedBody = bodyByDay.get(selectedDayStr) || [];

  const hasRecords = selectedRuns.length > 0 || selectedRaces.length > 0 || selectedGym.length > 0 || selectedMeals.length > 0 || selectedBody.length > 0;

  return (
    <div className="space-y-4 fade-in pb-8">
      
      {/* Calendar Card styled with Homepage aesthetic (Glassmorphism Light) */}
      <div className="rounded-[28px] p-5 bg-[var(--surface-dim)] backdrop-blur-[20px] border border-[var(--border-glass)] shadow-[0_12px_32px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between mb-5">
          <button type="button" aria-label="Mês anterior" onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="tap-44 flex items-center justify-center text-[var(--text-3)] hover:text-[var(--text-1)] transition">
            <ChevronLeft size={16} />
          </button>
          <span className="text-[15px] font-bold capitalize text-[var(--text-1)] tracking-tight">{format(currentDate, 'MMMM yyyy', { locale: pt })}</span>
          <button type="button" aria-label="Mês seguinte" onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="tap-44 flex items-center justify-center text-[var(--text-3)] hover:text-[var(--text-1)] transition">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* -mx-4: as sete células a 44px (piso de toque) precisam de
            7x44 + 6x4 = 332px e o interior do cartão só dá 301 — a grelha
            sai 16px para cada lado do padding do cartão, que lhe passa a
            dar 333. O cabeçalho dos dias sai com ela, senão desalinhava. */}
        <div className="grid grid-cols-7 gap-y-3 gap-x-1 text-center mb-4 -mx-4">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d, i) => (
            <span className="text-[11px] font-extrabold text-[var(--text-2)] uppercase tracking-wide" key={i}>{d}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-3 gap-x-1 text-center -mx-4">
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <div key={`empty-${i}`} className="flex justify-center items-center"></div>
          ))}

          {daysInMonth.map(date => {
            const dayNum = date.getDate();
            const dayStr = format(date, 'yyyy-MM-dd');
            const isSelected = isSameDay(date, selectedDate);
            
            const dayRuns = runsByDay.get(dayStr) || [];
            const dayRaces = racesByDay.get(dayStr) || [];
            const dayGym = gymByDay.get(dayStr) || [];
            const dayMeals = mealsByDay.get(dayStr) || [];
            const dayBody = bodyByDay.get(dayStr) || [];

            return (
              <div className="flex justify-center items-center" key={dayStr}>
                <button
                  type="button"
                  data-testid={`calendar-day-${dayStr}`}
                  onClick={() => setSelectedDate(date)}
                  className={`w-[44px] h-[46px] rounded-xl flex flex-col items-center justify-between py-1.5 border-[1.5px] transition cursor-pointer outline-none ${
                    isSelected 
                      ? 'bg-[var(--surface-faint)] border-[var(--green)] text-[var(--text-1)] shadow-[0_4px_15px_rgba(0,0,0,0.08)] scale-[1.05] font-black' 
                      : dayRaces.length > 0
                        ? 'bg-[linear-gradient(135deg,var(--race-from),var(--race-to))] border-transparent text-white shadow-[0_2px_8px_var(--race-glow)] hover:opacity-90'
                        : 'bg-[var(--surface-faint)] border-transparent shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-[var(--text-2)] hover:bg-[var(--surface-soft)]'
                  }`}
                >
                  <span className="text-xs font-bold leading-none mt-[1px]">{dayNum}</span>
                  <div className="flex gap-[3px] justify-center w-full px-1.5 h-1">
                    {dayRaces.length > 0 && <span className="flex-1 rounded-[2px]" style={{ backgroundColor: isSelected ? 'var(--mod-prova)' : 'rgba(255,255,255,0.7)' }} />}
                    {/* Só caminhadas nesse dia: a mesma cor, mais apagada (2026-10-05) —
                        a caminhada é do módulo da corrida mas não é corrida. */}
                    {dayRuns.length > 0 && (dayRuns.every(isWalk)
                      ? <span data-testid={`calendar-walk-${dayStr}`} className="flex-1 rounded-[2px] bg-[var(--mod-corrida)] opacity-50" />
                      : <span className="flex-1 rounded-[2px] bg-[var(--mod-corrida)]" />)}
                    {dayGym.length > 0 && <span className="flex-1 rounded-[2px] bg-[var(--mod-ginasio)]" />}
                    {dayMeals.length > 0 && <span className="flex-1 rounded-[2px] bg-[var(--mod-nutricao)]" />}
                    {dayBody.length > 0 && <span className="flex-1 rounded-[2px] bg-[var(--mod-corpo)]" />}
                    
                    {!dayRaces.length && !dayRuns.length && !dayGym.length && !dayMeals.length && !dayBody.length && isSelected && (
                       <span className="flex-[0_0_14px] mx-auto rounded-[2px] bg-[var(--text-3)] opacity-50" />
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {/* Legenda e filtro num só (pedido 2026-09-27): cada tipo é a
            legenda da sua cor na grelha e, ao toque, o filtro da agenda por
            ele. Na "Prova" abre-se uma segunda linha com o estado — por
            realizar ou concluídas. */}
        <div
          role="group"
          aria-label="Filtrar a agenda"
          data-testid="calendar-filter"
          className="mt-6 p-1.5 bg-[var(--surface-glass)] rounded-[16px] border border-[var(--border-glass)]"
        >
          <div className="grid grid-cols-3 gap-1">
            <FilterChip label="Tudo" active={filter.type === CALENDAR_ALL} onClick={() => chooseType(CALENDAR_ALL)} testId="calendar-filter-todos" />
            {CALENDAR_RECORD_TYPES.map((t) => (
              <FilterChip
                key={t.key}
                label={t.label}
                color={t.color}
                tone={t.tone}
                active={filter.type === t.key}
                onClick={() => chooseType(t.key)}
                testId={`calendar-filter-${t.key}`}
              />
            ))}
          </div>
          {filter.type === 'prova' && (
            <div role="group" aria-label="Estado das provas" className="grid grid-cols-2 gap-1 mt-1 pt-1 border-t border-[var(--border-glass)] fade-in">
              {RACE_STATUS_FILTERS.map((s) => (
                <FilterChip
                  key={s.key}
                  label={s.label}
                  tone="race"
                  active={filter.raceStatus === s.key}
                  onClick={() => chooseRaceStatus(s.key)}
                  testId={`calendar-filter-prova-${s.key}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Selected Date Details */}
      <div className="space-y-3">
        {/* Com um filtro ligado, o nome dele fica ao lado do dia — a lista
            está lá em baixo, longe dos botões do filtro, e um dia "vazio"
            tem de dizer porquê. Tocar tira o filtro. */}
        <div ref={raceListRef} className="flex items-center justify-between gap-2 px-1 pt-2" style={{ scrollMarginTop: 'calc(var(--header-h) + 8px)' }}>
          <h3
            ref={raceListTitleRef}
            tabIndex={isRaceList ? -1 : undefined}
            className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide outline-none"
            data-testid="calendar-list-title"
          >
            {isRaceList ? raceListTitle : format(selectedDate, 'dd MMMM yyyy', { locale: pt })}
          </h3>
          {filterActive && (
            <button
              type="button"
              onClick={clearFilter}
              data-testid="calendar-filter-clear"
              aria-label={`Tirar o filtro: ${activeFilterLabel}`}
              className="inline-flex items-center min-h-[44px] -my-2 shrink-0"
            >
              <span
                className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-full border text-[11px] font-bold"
                style={{ background: `var(--tint-${activeFilterTone}-bg)`, borderColor: `var(--tint-${activeFilterTone}-bd)`, color: `var(--${activeFilterTone})` }}
              >
                {activeFilterLabel}
                <X size={12} aria-hidden="true" />
              </span>
            </button>
          )}
        </div>

        {(isRaceList ? racePageInfo.total === 0 : !hasRecords) && (
          <div className="rounded-2xl p-6 bg-[var(--surface-dim)] border border-white/15 border-dashed flex flex-col items-center justify-center text-[var(--text-3)]">
            <CalendarIcon size={24} className="opacity-40 mb-2" />
            <p className="text-[11px]">{emptyDayMessage(filter)}</p>
          </div>
        )}

        {isRaceList && racePageInfo.items.map(race => (
          <RaceCard
            key={race.id}
            ev={race}
            onEdit={setEditingRaceId}
            onRegisterRace={handleRegisterRace}
            onViewRun={setEditingRunId}
            onToggleStatus={handleToggleRaceStatus}
            onDelete={() => setRaceToDelete(race)}
          />
        ))}

        {isRaceList && racePageInfo.pages > 1 && (
          <nav aria-label="Páginas das provas" data-testid="race-list-pager" className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => goToRacePage(racePageInfo.page - 1)}
              disabled={racePageInfo.page === 0}
              className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-[12px] text-[12px] font-bold border border-[var(--border-glass)] text-[var(--text-2)] disabled:opacity-40"
            >
              <ChevronLeft size={14} aria-hidden="true" /> Anteriores
            </button>
            <span className="text-[11.5px] font-bold text-[var(--text-3)]" aria-live="polite">
              Página {racePageInfo.page + 1} de {racePageInfo.pages}
            </span>
            <button
              type="button"
              onClick={() => goToRacePage(racePageInfo.page + 1)}
              disabled={racePageInfo.page === racePageInfo.pages - 1}
              className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-[12px] text-[12px] font-bold border border-[var(--border-glass)] text-[var(--text-2)] disabled:opacity-40"
            >
              Seguintes <ChevronRight size={14} aria-hidden="true" />
            </button>
          </nav>
        )}

        {!isRaceList && selectedRaces.map(race => (
          <RaceCard
            key={race.id}
            ev={race}
            onEdit={setEditingRaceId}
            onRegisterRace={handleRegisterRace}
            onViewRun={setEditingRunId}
            onToggleStatus={handleToggleRaceStatus}
            onDelete={() => setRaceToDelete(race)}
          />
        ))}
        {/* Os registos do dia pela hora (utils/dayOrder.js), não por tipo —
            o treino das 07:00 antes do almoço, a corrida das 18:30 depois
            (pedido 2026-09-13). As provas ficam em cima: são o dia. */}
        {!isRaceList && orderDayRecords({ runs: selectedRuns, gym: selectedGym, meals: selectedMeals, body: selectedBody }).map(({ kind, item }) => {
          if (kind === 'run') return <RunCard key={`run-${item.id}`} run={item} onEdit={setEditingRunId} onDelete={handleDeleteRun} />;
          if (kind === 'gym') return <GymSessionCard key={`gym-${item.id}`} session={item} onEdit={setEditingGymId} />;
          if (kind === 'meal') return <MealCard key={`meal-${item.id}`} meal={item} onEdit={setEditingMealId} onDelete={handleDeleteMeal} />;
          return <BodyAssessmentCard key={`body-${item.id}`} assessment={item} onEdit={setEditingBodyId} onDelete={handleDeleteBody} />;
        })}
      </div>
      
      {raceToDelete && (
        <Dialog
          title="Eliminar esta prova?"
          tone="race"
          onClose={() => setRaceToDelete(null)}
          actions={(
            <>
              <button type="button" onClick={confirmDeleteRace} className="flex-1 min-h-[44px] rounded-[11px] text-[13px] font-extrabold" style={{ background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', color: 'var(--race)' }}>
                Eliminar
              </button>
              <button type="button" onClick={() => setRaceToDelete(null)} className="flex-1 min-h-[44px] rounded-[11px] text-[13px] font-bold" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' }}>
                Cancelar
              </button>
            </>
          )}
        >
          <p className="text-[12.5px] leading-[1.55]" style={{ color: 'var(--text-3)' }}>
            {raceToDelete.name ? `"${raceToDelete.name}" sai do calendário` : 'A prova sai do calendário'} e o plano deixa de a ter como alvo. Os treinos já registados ficam.
          </p>
        </Dialog>
      )}

      <CreatedRecordModal />
      {/* Os avisos da Carol acompanham o atleta em todo o lado menos no
          Chat (pedido do utilizador). */}
      <CoachInsightsDock />
    </div>
  );
}
