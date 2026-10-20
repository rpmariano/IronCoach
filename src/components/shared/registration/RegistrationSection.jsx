import React from 'react';
import { Check } from 'lucide-react';

/* Um passo do registo (solução B do canvas "Registo — contraste e
   hierarquia", 2026-10-20): cada grupo de campos é o seu próprio cartão, com
   o número do passo, o título e, se for o caso, "opcional". O que separa os
   blocos é o cartão e o espaço, não uma linha.

   · `step`: o número que aparece no círculo (omitir = sem círculo);
   · `done`: o círculo vira visto verde — o passo tem o que precisa;
   · `optional`: a etiqueta "opcional" e o cartão um degrau mais apagado;
   · `aside`: o que mais vai à direita do título (um botão, uma contagem).
   O bloco onde se está a escrever acende-se sozinho (CSS :focus-within). */
export default function RegistrationSection({ step, title, done = false, optional = false, aside = null, className = '', children, ...rest }) {
  return (
    <section className={`reg-section ${optional ? 'reg-section--quiet' : ''} flex flex-col gap-3.5 ${className}`.trim()} {...rest}>
      <div className="flex items-center gap-2.5">
        {step != null && (done ? (
          <span className="w-[26px] h-[26px] shrink-0 rounded-full bg-[var(--ok)] text-[var(--ok-ink)] flex items-center justify-center" role="img" aria-label={`Passo ${step}, preenchido`}>
            <Check size={14} strokeWidth={3} aria-hidden="true" />
          </span>
        ) : (
          <span
            className="w-[26px] h-[26px] shrink-0 rounded-full border-[1.5px] border-[var(--border-well)] text-[var(--text-3)] flex items-center justify-center text-[13px] font-bold"
            aria-hidden="true"
          >
            {step}
          </span>
        ))}
        <h3 className="flex-1 min-w-0 m-0 text-base font-bold text-[var(--text-1)]">{title}</h3>
        {aside}
        {optional && (
          <span className="shrink-0 text-[11px] text-[var(--text-4)] border border-[var(--border-chip)] rounded-full px-2 py-0.5">opcional</span>
        )}
      </div>
      {children}
    </section>
  );
}
