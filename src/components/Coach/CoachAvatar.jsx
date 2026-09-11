import React from 'react';
import { MessageCircle } from 'lucide-react';

/* O rosto da Carol — ponto único de substituição.
   CAROL.md §4: o avatar definitivo é um retrato ilustrado, sempre o mesmo,
   em três expressões — neutra (por defeito), contente (recorde, semana
   cumprida, prova concluída) e preocupada (aviso de viabilidade, energia
   baixa, 3 dias sem registo). A expressão acompanha o tom da mensagem em
   que aparece e nunca muda a meio de uma conversa sem motivo.
   O retrato ainda não existe (handoff 2026-09, "Fidelity"): até lá é o
   ícone message-circle sobre o gradiente da Carol. Quem o vier substituir
   só precisa de trocar o interior deste componente — `mood` já chega a
   todos os sítios onde ela aparece, e fica exposto em data-mood para
   estilos. Tem de funcionar a 30px e a 76px. */
export default function CoachAvatar({ mood = 'neutral', size = 30, radius, className = '', style }) {
  const iconSize = Math.round(size * 0.53);
  return (
    <span
      aria-hidden="true"
      data-mood={mood}
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? '50%',
        background: 'var(--grad-coach)',
        color: 'var(--coach-ink)',
        ...style,
      }}
    >
      <MessageCircle size={iconSize} strokeWidth={2} />
    </span>
  );
}
