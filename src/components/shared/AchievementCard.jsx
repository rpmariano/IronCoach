import React from 'react';
import { Lock } from 'lucide-react';
import { formatDatePTShort } from '../../utils/racePlanEngine';

/* O cartão de uma conquista (specs/gamificacao-provas.md, canvas "Palmarés
   da IronCoach"). O mesmo cartão no hub da prova, no Palmarés do Perfil e no
   momento do desbloqueio — se fossem três desenhos, a mesma conquista lia-se
   de três maneiras.

   Desbloqueada: ícone redondo de 44px na cor do significado (âmbar a prova,
   verde o objetivo, ciano o recorde), nome, o que aconteceu e a data.
   Bloqueada: vidro neutro e cadeado, com a frase do que falta — nunca uma
   repreensão, só o caminho ("Precisa de duas provas na mesma distância").

   Sem emojis e sem pontos de exclamação: a conquista é o número, não o
   entusiasmo à volta dele. */

const TAP = 44;

export function AchievementIcon({ achievement, size = TAP }) {
  const { unlocked, tone, Icon } = achievement;
  const glyph = size >= 40 ? 20 : Math.max(12, Math.round(size * 0.45));
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: unlocked ? `var(--tint-${tone}-bg)` : 'var(--surface-glass)',
        border: `1px solid ${unlocked ? `var(--tint-${tone}-bd)` : 'var(--border-glass)'}`,
        color: unlocked ? `var(--${tone})` : 'var(--text-4)',
      }}
    >
      {unlocked ? <Icon size={glyph} /> : <Lock size={glyph} />}
    </span>
  );
}

export default function AchievementCard({ achievement, showDate = true, style }) {
  if (!achievement) return null;
  const { key, name, detail, date, unlocked } = achievement;
  return (
    <div
      data-testid={`achievement-card-${key}`}
      data-unlocked={unlocked ? 'true' : 'false'}
      className="flex items-center gap-3"
      style={{
        borderRadius: 18,
        background: 'var(--surface-glass)',
        border: '1px solid var(--border-glass)',
        padding: '10px 12px',
        minHeight: 64,
        ...style,
      }}
    >
      <AchievementIcon achievement={achievement} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-extrabold leading-[1.2] truncate" style={{ color: unlocked ? 'var(--text-1)' : 'var(--text-3)' }}>{name}</div>
        {detail && <div className="text-[11.5px] leading-[1.35] mt-[3px]" style={{ color: 'var(--text-3)' }}>{detail}</div>}
        {showDate && unlocked && date && (
          <div className="text-[11px] mt-[2px]" style={{ color: 'var(--text-4)' }}>{formatDatePTShort(date)}</div>
        )}
      </div>
    </div>
  );
}

/* A pílula do Início: a mesma conquista reduzida ao essencial, 28px de
   altura, para caber uma linha delas por baixo do tempo da prova. Serve
   também o chip "Previsão batida", que não é uma conquista do palmarés mas
   lê-se ao lado delas. */
export function AchievementChip({ label, tone = 'race', Icon, testId }) {
  return (
    <span
      data-testid={testId}
      className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase"
      style={{
        height: 28,
        padding: '0 10px',
        borderRadius: 99,
        letterSpacing: '.05em',
        background: `var(--tint-${tone}-bg)`,
        border: `1px solid var(--tint-${tone}-bd)`,
        color: `var(--${tone})`,
        whiteSpace: 'nowrap',
      }}
    >
      {Icon && <Icon size={12} />}
      {label}
    </span>
  );
}
