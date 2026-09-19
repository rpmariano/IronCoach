import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useAppStore } from '../../store';
import CoachAvatar from '../Coach/CoachAvatar';
import { weekDoneLine, wasWeekCelebrated, markWeekCelebrated } from './weekDone';

/* A semana cumprida (weekDone.js), por cima de "O que faço hoje": a frase
   dela e os sete dias da semana do plano, com os treinos feitos marcados.

   Na primeira vez que o atleta a vê, é o momento: ela respira e os dias
   enchem-se um a um, da segunda ao domingo da semana do plano. Depois fica
   só lá, parada, até a semana acabar — é um estado, não uma notificação, e
   CAROL.md pede uma frase, não uma festa por cada visita à Home. */
export default function WeekDoneRibbon({ done }) {
  const userId = useAppStore((s) => s.session?.user?.id || s.profile?.id);
  const [celebrate] = useState(() => !wasWeekCelebrated(userId, done.weekStart));
  useEffect(() => {
    if (celebrate) markWeekCelebrated(userId, done.weekStart);
  }, [celebrate, userId, done.weekStart]);

  const line = weekDoneLine(done);
  return (
    <div
      data-testid="week-done"
      data-celebrate={celebrate ? 'true' : undefined}
      className="rounded-[18px]"
      style={{ background: 'var(--tint-ok-bg)', border: '1px solid var(--tint-ok-bd)', padding: '12px 14px 10px' }}
    >
      <div className="flex items-center gap-2.5">
        <CoachAvatar size={28} mood="happy" breathing={celebrate} />
        <p className={`flex-1 min-w-0 text-[13px] font-extrabold leading-[1.35]${celebrate ? ' week-done-line' : ''}`} style={{ color: 'var(--text-1)', margin: 0 }}>
          {line}
        </p>
      </div>
      <ol aria-label={`Os sete dias da semana ${done.week}`} className="grid mt-2.5" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, padding: 0, margin: '10px 0 0', listStyle: 'none' }}>
        {done.days.map((d, i) => (
          <li key={d.dateISO} className="flex flex-col items-center" style={{ gap: 4 }} aria-label={`${d.initial}: ${d.state === 'done' ? 'treino feito' : 'descanso'}`}>
            <span
              aria-hidden="true"
              className={`flex items-center justify-center rounded-full${celebrate && d.state === 'done' ? ' week-done-dot' : ''}`}
              style={{
                width: 22,
                height: 22,
                background: d.state === 'done' ? 'var(--ok)' : 'transparent',
                border: d.state === 'done' ? 'none' : '1px dashed rgba(255,255,255,.2)',
                color: 'var(--bg-app)',
                boxShadow: d.isToday ? '0 0 0 2px var(--bg-app), 0 0 0 3.5px var(--ok)' : undefined,
                animationDelay: celebrate ? `${250 + i * 90}ms` : undefined,
              }}
            >
              {d.state === 'done' && <Check size={12} strokeWidth={3.2} />}
            </span>
            <span aria-hidden="true" className="text-[10px] font-bold" style={{ color: d.isToday ? 'var(--ok)' : 'var(--text-4)' }}>{d.initial}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
