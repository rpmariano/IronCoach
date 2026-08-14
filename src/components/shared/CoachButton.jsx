import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import Button from './Button';

// Gradiente do módulo Coach — qualquer botão de "Analisar" (Corrida, Nutrição,
// ...) usa-o no fundo todo, para deixar claro que quem vai comentar o registo
// é o Coach, não uma ação de gravar qualquer.
export const COACH_GRADIENT = 'linear-gradient(135deg, var(--mod-coach-from), var(--mod-coach-to))';

/* var(--mod-coach-to) é claro (#06b6d4) e var(--mod-coach-from) é escuro
   (#155e75) — nem texto branco nem escuro tem contraste WCAG AA nas duas
   pontas do gradiente ao mesmo tempo (medido: branco 2,43:1 no lado claro,
   escuro 2,46:1 no lado escuro). Texto/ícone brancos com uma sombra a
   compensar, em vez de escurecer o gradiente da marca. */
export const COACH_TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.35)';

/* Cor via style, nunca pela classe text-white — um override global
   (globals.css:66, "portado do legado") força text-white para #0f172a com
   !important; um style inline só escapa a essa regra se a classe text-white
   não estiver presente no className. */
export function CoachIcon({ busy }) {
  return (
    <span
      className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
      style={{ background: 'rgba(0,0,0,0.18)' }}
    >
      {busy
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#fff' }} />
        : <Sparkles className="w-3.5 h-3.5" style={{ color: '#fff' }} />}
    </span>
  );
}

// Botão "Analisar" completo — mesmo texto, mesmo gradiente, mesma insígnia,
// esteja a analisar uma foto ou um registo manual (o Coach é o mesmo).
export function CoachAnalyzeButton({ onClick, disabled, busy, label = 'Analisar', busyLabel = 'A analisar...' }) {
  return (
    <Button
      variant="module"
      moduleColor={COACH_GRADIENT}
      onClick={onClick}
      disabled={disabled}
      className="w-full text-[14px] disabled:opacity-30"
      icon={<CoachIcon busy={busy} />}
    >
      <span style={{ textShadow: COACH_TEXT_SHADOW }}>{busy ? busyLabel : label}</span>
    </Button>
  );
}
