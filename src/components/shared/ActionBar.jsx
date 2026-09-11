import React from 'react';

/* Barra de ação fixa (design-system/components/navigation/ActionBar).
   Irmã da nav, nunca dentro do scroll: a ação que confirma o ecrã
   ("Guardar", "Continuar") deixa de ficar abaixo da dobra no fim de um
   formulário longo — ver ponto 2 do handoff, "Piso de texto e toque".

   Posicionamento: `fixed` na mesma coluna centrada max-w-md do header e da
   nav de Layout.jsx (left:50% + translateX(-50%) + max-width:28rem), a
   var(--actionbar-bottom) (76px) do fundo — ou seja, assente SOBRE a nav.
   Por isso o z-index fica ABAIXO do da nav (--z-actionbar 30 < --z-nav 40) e
   bem abaixo das persianas/popups (z-[60]/[70]): a barra nunca tapa a
   navegação nem uma persiana aberta por cima dela.

   Quem usa a barra tem de dar ao scroll `paddingBottom:
   var(--scroll-pad-bottom-actionbar)` (168px) para o fim do formulário não
   ficar escondido — é o que ACTION_BAR_SCROLL_PAD abaixo serve.

   `aboveNav={false}` para ecrãs sem nav inferior (onboarding): a barra cola
   ao fundo e ganha o respiro do safe-area. */

/* Clearance extra que o conteúdo do ecrã precisa por baixo quando há barra.
   O handoff pede 168px (--scroll-pad-bottom-actionbar) entre o fim do
   conteúdo e o fundo do scroll; o <main> do Layout já dá 112px
   (--scroll-pad-bottom) a todos os ecrãs, por isso o que falta acrescentar
   é só a diferença — somar os 168 inteiros dava 280px de vazio. */
export const ACTION_BAR_SCROLL_PAD =
  'calc(var(--scroll-pad-bottom-actionbar) - var(--scroll-pad-bottom))';

export default function ActionBar({ children, aboveNav = true, className = '', style, ...rest }) {
  return (
    <div
      data-testid="action-bar"
      className={`fixed left-1/2 -translate-x-1/2 w-full max-w-md flex items-center gap-3 ${className}`}
      style={{
        bottom: aboveNav ? 'var(--actionbar-bottom)' : 0,
        zIndex: 'var(--z-actionbar, 30)',
        padding: aboveNav ? '12px 16px' : '14px 20px 26px',
        background: 'rgba(4,8,15,.9)',
        backdropFilter: 'blur(var(--blur-sheet))',
        WebkitBackdropFilter: 'blur(var(--blur-sheet))',
        borderTop: '1px solid var(--border-glass)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
