import React from 'react';
import { Sparkles } from 'lucide-react';
import CoachAvatar from '../Coach/CoachAvatar';

/* O Início no primeiro dia (mock "Início · primeiro dia": sem prova, sem
   dados). A Carol abre a conversa e propõe escolher a prova; o resto do
   ecrã convida a registar. Texto do mock, final. */
export default function FirstDayCard({ firstName, onTalk, onCreateRace }) {
  return (
    <div className="rounded-[24px] shrink-0" style={{ background: 'rgba(34,211,238,.08)', border: '1px solid rgba(34,211,238,.32)', padding: 20, boxShadow: 'var(--shadow-card)' }} data-testid="first-day-card">
      <CoachAvatar size={38} />
      <div className="text-[19px] font-black leading-[1.2] mt-[13px]" style={{ color: 'var(--text-1)', letterSpacing: '-.02em' }}>
        {firstName ? `Olá, ${firstName}. Vamos escolher a tua prova.` : 'Olá. Vamos escolher a tua prova.'}
      </div>
      <p className="text-[13px] leading-[1.55] mt-[9px]" style={{ color: 'var(--text-3)' }}>
        Sem uma prova marcada não consigo montar um plano com fases. Diz-me a distância e a data, e trato do resto.
      </p>
      <button type="button" onClick={onTalk} className="w-full inline-flex items-center justify-center gap-2 min-h-[46px] mt-[15px] rounded-[11px] text-[13.5px] font-extrabold" style={{ background: 'var(--grad-coach-legible)', color: 'var(--coach-ink)' }}>
        <Sparkles size={16} /> Falar com a Carol
      </button>
      <button type="button" onClick={onCreateRace} className="w-full min-h-[44px] mt-[9px] rounded-[11px] text-[13px] font-bold" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.16)', color: 'var(--text-3)' }}>
        Marcar prova eu mesmo
      </button>
    </div>
  );
}
