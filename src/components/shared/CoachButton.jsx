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

/* Cor via style, não pela classe: o texto destes botões tem de ser branco a
   valer sobre o gradiente do Coach, e não o --text-1 do resto da app. (Até ao
   impeccable colorize havia também um override global que reescrevia
   text-white; saiu com os outros — ver a tabela em globals.css.) */
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
// busyLabel: "A analisar…" com reticências tipográficas, como o mock
// "Refeição · a analisar" (ponto 7). O rótulo acessível continua a ser o
// texto visível — quem usa leitor de ecrã ouve o estado, não só o vê.
export function CoachAnalyzeButton({ onClick, disabled, busy, label = 'Analisar', busyLabel = 'A analisar…' }) {
  return (
    <Button
      variant="module"
      moduleColor={COACH_GRADIENT}
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      className="w-full text-[14px] disabled:opacity-30"
      icon={<CoachIcon busy={busy} />}
    >
      <span style={{ textShadow: COACH_TEXT_SHADOW }}>{busy ? busyLabel : label}</span>
    </Button>
  );
}
