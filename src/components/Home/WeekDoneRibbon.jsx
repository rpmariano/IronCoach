import React from 'react';
import { Check } from 'lucide-react';
import { useAppStore } from '../../store';
import CoachAvatar from '../Coach/CoachAvatar';
import { weekDoneLine, weekDoneMomentKey, wasWeekCelebrated, markWeekCelebrated } from './weekDone';
import useMomentOnce from '../../utils/useMomentOnce';

/* A semana cumprida (weekDone.js), por cima de "O que faço hoje": a frase
   dela e os sete dias da semana do plano, com os treinos feitos marcados.

   Na primeira vez que o atleta a vê, é o momento: ela respira e os dias
   enchem-se um a um, da segunda ao domingo da semana do plano. Depois fica
   só lá, parada, até a semana acabar — é um estado, não uma notificação, e
   CAROL.md pede uma frase, não uma festa por cada visita à Home. */
export default function WeekDoneRibbon({ done }) {
  const userId = useAppStore((s) => s.session?.user?.id || s.profile?.id);
  const logImpression = useAppStore((s) => s.logImpression);
  const impressionShown = useAppStore((s) => s.impressionShown);
  // A chave deste momento em coach_impressions (kind 'moment', ação 5.1):
  // sem título, porque o servidor já tem os treinos; serve para o outro
  // telemóvel saber que esta semana já foi celebrada — e, na leitura, para
  // este saber se foi o outro que a celebrou primeiro.
  const momentKey = weekDoneMomentKey(done.weekStart);
  // Só quando se vê: nunca por baixo das boas-vindas (utils/useMomentOnce).
  const celebrate = useMomentOnce(
    true,
    () => wasWeekCelebrated(userId, done.weekStart, impressionShown),
    () => {
      markWeekCelebrated(userId, done.weekStart);
      logImpression({ kind: 'moment', key: momentKey, title: null });
    },
  );

  const line = weekDoneLine(done);
  return (
    <div
      data-testid="week-done"
      data-celebrate={celebrate ? 'true' : undefined}
      className="rounded-[18px]"
      style={{ background: 'var(--tint-ok-bg)', border: '1px solid var(--tint-ok-bd)', padding: '12px 14px 10px' }}
    >
      <div className="flex items-center gap-2.5">
        <CoachAvatar size={40} mood="happy" breathing={celebrate} />
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
