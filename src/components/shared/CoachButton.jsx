import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import Button from './Button';

// Gradiente do módulo Coach — qualquer botão de "Analisar" (Corrida, Nutrição,
// ...) usa-o no fundo todo, para deixar claro que quem vai comentar o registo
// é o Coach, não uma ação de gravar qualquer.
//
// Era 'linear-gradient(135deg, var(--mod-coach-from), var(--mod-coach-to))',
// que desce até --coach-deep: aí nem branco (2,43:1) nem a tinta escura
// (3,00:1) chegam a AA, e o remendo era uma sombra de texto. O
// --grad-coach-legible pára a 55% do caminho para o escuro — mesma matiz,
// mesmo sentido, e a tinta do Coach lê-se em toda a extensão (5,6:1 na ponta
// escura, 8,9:1 na clara). Sem sombra de texto.
export const COACH_GRADIENT = 'var(--grad-coach-legible)';

/* A insígnia do ícone era um scrim preto a 18% com o ícone branco — sobre
   ciano claro isso é o mesmo problema outra vez. Agora é um scrim claro e o
   ícone herda a tinta do botão (currentColor). */
export function CoachIcon({ busy }) {
  return (
    <span
      className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
      style={{ background: 'rgba(255,255,255,0.28)' }}
    >
      {busy
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Sparkles className="w-3.5 h-3.5" />}
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
      // disabled:opacity-30 era um caso à parte: a 30% o botão principal do
      // ecrã desaparecia na barra de ação (o gradiente ficava quase igual ao
      // fundo e o rótulo ilegível). O piso do próprio Button (opacity-50) é o
      // que os outros botões desativados da app já usam.
      className="w-full text-[14px]"
      icon={<CoachIcon busy={busy} />}
    >
      <span>{busy ? busyLabel : label}</span>
    </Button>
  );
}
