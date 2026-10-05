import React from 'react';
import { MessageCircle } from 'lucide-react';
import { noticeTone } from '../BI/noticeTones';

/* Os botões da Carol, numa convenção só (aprovada pelo dono do produto,
   2026-10-05). Saiu do NoticeCard da janela dos avisos
   (BI/CoachInsightModal.jsx), que já a seguia, para todas as superfícies
   dela usarem o mesmo desenho e os mesmos nomes:

   - talk ("Falar com a Carol", ou um CTA com contexto que mantém o verbo):
     gradiente dela, largura toda, em cima, com o balão MessageCircle. Abre o
     chat com a origem (coachIntent). NÃO dispensa nada: o aviso sai quando o
     assunto se resolve.
   - understood ("Percebi", era "Entendido"): esconde de vez um aviso
     informativo. Secundário na tinta do tom, à esquerda.
   - snooze ("Agora não"): SEMPRE só até amanhã. Secundário com contorno, à
     direita.
   - dismiss ("Dispensar"): para sempre. Secundário com contorno; quem grava
     no servidor (a intervenção) pede confirmação antes.

   Por baixo do primário, em linha: positivo à esquerda, negativo à direita.
   Fechar é só o X do cabeçalho de quem os mostra — nunca um botão "Fechar"
   no rodapé. */

export const CAROL_TALK_CLASS = 'w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-[11px] text-[12.5px] font-extrabold';
export const CAROL_TALK_STYLE = { background: 'var(--grad-coach-legible)', color: 'var(--coach-ink)' };
export const CAROL_SECONDARY_CLASS = 'flex-1 min-h-[44px] rounded-[11px] text-[12.5px] font-bold';
export const CAROL_SECONDARY_STYLE = { background: 'transparent', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' };

export const SNOOZE_ARIA = 'Agora não — volta amanhã, se ainda se aplicar';
export const DISMISS_ARIA = 'Dispensar este aviso';

/** O botão primário da Carol, sozinho (para os ecrãs que só têm este). */
export function CarolTalkButton({ children = 'Falar com a Carol', onClick, testId, className = '', style, disabled, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`${CAROL_TALK_CLASS} disabled:opacity-50 ${className}`.trim()}
      style={{ ...CAROL_TALK_STYLE, ...style }}
      {...rest}
    >
      <MessageCircle size={15} aria-hidden="true" />{children}
    </button>
  );
}

/* `talk`, `understood`, `snooze` e `dismiss` são objetos ({ onClick, testId,
   label?, ariaLabel? }) ou null quando a superfície não tem esse papel.
   `severity` pinta o "Percebi" na tinta do tom. `labelledBy` dá ao grupo o
   título do aviso: com vários cartões, o leitor de ecrã não ouve "Percebi"
   atrás de "Percebi" sem saber de qual. */
export default function CarolActions({ talk, understood, snooze, dismiss, severity = 'info', labelledBy, className = 'mt-3', testId }) {
  const t = noticeTone(severity);
  const hasRow = understood || snooze || dismiss;
  return (
    <div role="group" aria-labelledby={labelledBy} data-testid={testId} className={`flex flex-col gap-2 ${className}`.trim()}>
      {talk && (
        <CarolTalkButton testId={talk.testId} onClick={talk.onClick} aria-label={talk.ariaLabel}>
          {talk.label || 'Falar com a Carol'}
        </CarolTalkButton>
      )}
      {hasRow && (
        <div className="flex gap-2">
          {understood && (
            <button
              type="button"
              data-testid={understood.testId}
              onClick={understood.onClick}
              aria-label={understood.ariaLabel}
              className="flex-1 min-h-[44px] rounded-[11px] text-[12.5px] font-extrabold"
              style={{ background: t.btnBg, color: t.btnColor }}
            >
              {understood.label || 'Percebi'}
            </button>
          )}
          {snooze && (
            <button
              type="button"
              data-testid={snooze.testId}
              onClick={snooze.onClick}
              aria-label={snooze.ariaLabel || SNOOZE_ARIA}
              className={CAROL_SECONDARY_CLASS}
              style={CAROL_SECONDARY_STYLE}
            >
              {snooze.label || 'Agora não'}
            </button>
          )}
          {dismiss && (
            <button
              type="button"
              data-testid={dismiss.testId}
              onClick={dismiss.onClick}
              aria-label={dismiss.ariaLabel || DISMISS_ARIA}
              className={CAROL_SECONDARY_CLASS}
              style={CAROL_SECONDARY_STYLE}
            >
              {dismiss.label || 'Dispensar'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
