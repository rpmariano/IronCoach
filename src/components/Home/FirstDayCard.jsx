import React from 'react';
import { Sparkles, Check, Flag, Footprints, Camera } from 'lucide-react';
import CoachAvatar from '../Coach/CoachAvatar';
import { firstDayAsk } from '../../utils/firstDay';

/* A Home no primeiro dia (mock "Início · primeiro dia": sem prova, sem
   dados). A Carol abre a conversa — e, desde 2026-09-19, lembra-se do
   arranque (utils/firstDay.js): o objetivo que o atleta escolheu decide o
   que ela pede primeiro, e o que ele lhe contou aparece guardado, um
   facto de cada vez. Sem arranque feito (ou sem objetivo), é o texto do
   mock: escolher a prova.

   Ela respira três vezes ao aparecer (CoachAvatar `breathing`): há alguém
   do outro lado à espera. Os factos entram em sequência, com o compasso das
   bolhas do chat; com movimento reduzido aparecem de uma vez. */

const ACAO = {
  race: { label: 'Marcar a prova', Icon: Flag, tone: 'race' },
  run: { label: 'Registar uma corrida', Icon: Footprints, tone: 'coach' },
  meal: { label: 'Registar uma refeição', Icon: Camera, tone: 'coach' },
  talk: { label: 'Falar com a Carol', Icon: Sparkles, tone: 'coach' },
};

export default function FirstDayCard({ firstName, goal = null, facts = [], onTalk, onCreateRace, onRegisterRun, onRegisterMeal }) {
  const ask = firstDayAsk(goal, firstName);
  const acao = ACAO[ask.primary] || ACAO.talk;
  const onPrimary = { race: onCreateRace, run: onRegisterRun, meal: onRegisterMeal, talk: onTalk }[ask.primary] || onTalk;
  // A segunda via: falar com ela — ou, quando falar já é a primeira, marcar a prova à mão.
  const secundaria = ask.primary === 'talk'
    ? { label: 'Marcar prova eu mesmo', onClick: onCreateRace }
    : { label: 'Falar com a Carol', onClick: onTalk };

  return (
    <div className="rounded-[24px] shrink-0" style={{ background: 'rgba(34,211,238,.08)', border: '1px solid rgba(34,211,238,.32)', padding: 20, boxShadow: 'var(--shadow-card)' }} data-testid="first-day-card" data-goal={goal || undefined}>
      <CoachAvatar size={38} breathing draw />
      <div className="text-[19px] font-black leading-[1.2] mt-[13px]" style={{ color: 'var(--text-1)', letterSpacing: '-.02em', textWrap: 'balance' }}>
        {ask.title}
      </div>
      <p className="text-[13px] leading-[1.55] mt-[9px]" style={{ color: 'var(--text-3)' }}>
        {ask.body}
      </p>

      {facts.length > 0 && (
        <ul aria-label="O que a Carol já sabe de ti" className="flex flex-wrap mt-[13px]" style={{ gap: 6, padding: 0, margin: '13px 0 0', listStyle: 'none' }} data-testid="first-day-facts">
          {facts.map((f, i) => (
            <li
              key={f}
              className="first-day-fact inline-flex items-center"
              style={{ gap: 5, padding: '5px 10px 5px 8px', borderRadius: 'var(--radius-pill)', background: 'rgba(34,211,238,.10)', border: '1px solid rgba(34,211,238,.24)', color: 'var(--coach-soft)', fontSize: 11.5, fontWeight: 700, animationDelay: `${300 + i * 140}ms` }}
            >
              <Check size={12} strokeWidth={3} aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onPrimary}
        className="w-full inline-flex items-center justify-center gap-2 min-h-[46px] mt-[15px] rounded-[11px] text-[13.5px] font-extrabold transition active:scale-[.98]"
        style={{ background: acao.tone === 'race' ? 'var(--grad-race)' : 'var(--grad-coach-legible)', color: acao.tone === 'race' ? 'var(--race-ink)' : 'var(--coach-ink)' }}
      >
        <acao.Icon size={16} aria-hidden="true" /> {acao.label}
      </button>
      <button type="button" onClick={secundaria.onClick} className="w-full min-h-[44px] mt-[9px] rounded-[11px] text-[13px] font-bold transition active:scale-[.98]" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.16)', color: 'var(--text-3)' }}>
        {secundaria.label}
      </button>
    </div>
  );
}
