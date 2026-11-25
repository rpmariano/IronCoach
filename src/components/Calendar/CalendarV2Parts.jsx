import React from 'react';
import { format, isSameDay } from 'date-fns';
import { pt } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isWalk } from '@formulas/runKinds.ts';
import '../../styles/v2-calendar.css';
import { CALENDAR_ALL, CALENDAR_RECORD_TYPES, RACE_STATUS_FILTERS } from '../../utils/calendarFilter';
import { runsWithoutRaceRuns } from '../../utils/raceDay';

/* O Calendário no Design v2 (direção C · Painel, pedido do Rui, 25/11; utils/designV2.js). Só a
   forma: o Calendar.jsx continua a decidir tudo (o mês, o dia escolhido, os registos de cada dia, o
   filtro) e passa-o a estas peças. A grelha do mês plana no painel; hoje a ciano, o dia de uma prova
   a âmbar; os registos de cada dia como pontos na cor do módulo; o mês em Barlow Condensed. */

const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const TYPE_COLOR = { corrida: 'var(--run)', ginasio: 'var(--gym)', nutricao: 'var(--nutrition)', corpo: 'var(--body)', prova: 'var(--race)' };

export function CalendarMonthV2({
  currentDate, onPrev, onNext, daysInMonth, firstWeekday, selectedDate, onSelect,
  racesByDay, runsByDay, gymByDay, mealsByDay, bodyByDay,
  filter, onChooseType, onChooseRaceStatus,
}) {
  const today = new Date();
  return (
    <section className="v2-cal" data-testid="calendar-v2">
      <div className="v2-cal-head">
        <button type="button" aria-label="Mês anterior" onClick={onPrev} className="v2-cal-nav"><ChevronLeft size={18} /></button>
        <h2 className="v2-cal-month" data-testid="calendar-v2-month">{format(currentDate, 'MMMM yyyy', { locale: pt })}</h2>
        <button type="button" aria-label="Mês seguinte" onClick={onNext} className="v2-cal-nav"><ChevronRight size={18} /></button>
      </div>

      <div className="v2-cal-grid" role="grid" aria-label={format(currentDate, 'MMMM yyyy', { locale: pt })}>
        {DIAS.map((d) => <span key={d} className="v2-cal-wd" aria-hidden="true">{d}</span>)}
        {Array.from({ length: firstWeekday }).map((_, i) => <span key={`e-${i}`} aria-hidden="true" />)}
        {daysInMonth.map((date) => {
          const dayStr = format(date, 'yyyy-MM-dd');
          const races = racesByDay.get(dayStr) || [];
          // Bug #117: a prova é uma marca só — a corrida que a registou não acende outra.
          const runs = runsWithoutRaceRuns(runsByDay.get(dayStr) || [], races);
          const marks = [
            runs.length > 0 && { key: 'corrida', color: 'var(--run)', walk: runs.every(isWalk), label: runs.every(isWalk) ? 'caminhada' : 'corrida' },
            (gymByDay.get(dayStr) || []).length > 0 && { key: 'ginasio', color: 'var(--gym)', label: 'ginásio' },
            (mealsByDay.get(dayStr) || []).length > 0 && { key: 'nutricao', color: 'var(--nutrition)', label: 'refeições' },
            (bodyByDay.get(dayStr) || []).length > 0 && { key: 'corpo', color: 'var(--body)', label: 'avaliação' },
          ].filter(Boolean);
          const selected = isSameDay(date, selectedDate);
          const isToday = isSameDay(date, today);
          const isRace = races.length > 0;
          const label = [
            format(date, "d 'de' MMMM", { locale: pt }),
            isToday ? 'hoje' : null,
            isRace ? `prova: ${races.map((r) => r.name).filter(Boolean).join(', ') || 'prova'}` : null,
            ...marks.map((m) => m.label),
          ].filter(Boolean).join(', ');
          return (
            <button
              key={dayStr}
              type="button"
              data-testid={`calendar-day-${dayStr}`}
              aria-label={label}
              aria-pressed={selected}
              onClick={() => onSelect(date)}
              className={`v2-cal-day${selected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}${isRace ? ' is-race' : ''}`}
            >
              <span className="v2-cal-n v2-num">{date.getDate()}</span>
              <span className="v2-cal-dots" aria-hidden="true">
                {isRace && <i style={{ background: 'var(--race)' }} />}
                {marks.map((m) => (
                  <i key={m.key} data-testid={m.walk ? `calendar-walk-${dayStr}` : undefined} style={{ background: m.color, opacity: m.walk ? 0.5 : 1 }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {/* O filtro é também a legenda: o ponto de cada tipo e o nome, planos. */}
      <div role="group" aria-label="Filtrar a agenda" data-testid="calendar-filter" className="v2-cal-filter">
        <button type="button" aria-pressed={filter.type === CALENDAR_ALL} onClick={() => onChooseType(CALENDAR_ALL)} data-testid="calendar-filter-todos" className="v2-cal-chip">Tudo</button>
        {CALENDAR_RECORD_TYPES.map((t) => (
          <button key={t.key} type="button" aria-pressed={filter.type === t.key} onClick={() => onChooseType(t.key)} data-testid={`calendar-filter-${t.key}`} className="v2-cal-chip">
            <i className="v2-dot" style={{ background: TYPE_COLOR[t.key] || t.color }} aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>
      {filter.type === 'prova' && (
        <div role="group" aria-label="Estado das provas" className="v2-cal-filter v2-cal-filter-2">
          {RACE_STATUS_FILTERS.map((s) => (
            <button key={s.key} type="button" aria-pressed={filter.raceStatus === s.key} onClick={() => onChooseRaceStatus(s.key)} data-testid={`calendar-filter-prova-${s.key}`} className="v2-cal-chip">
              {s.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
