/**
 * IMPLEMENTADO — fonte de verdade: `src/components/shared/ActionBar.jsx`.
 *
 * Irmã da nav, nunca dentro do scroll. `fixed` na mesma coluna centrada
 * max-w-md do header e da nav, a var(--actionbar-bottom) (76px) do fundo —
 * assente SOBRE a nav. O z-index fica ABAIXO do da nav
 * (--z-actionbar 30 < --z-nav 40) e bem abaixo das persianas (z-60/70): a
 * barra nunca tapa a navegação nem uma persiana aberta por cima dela.
 */
export interface ActionBarProps {
  children: React.ReactNode;
  /** true = assenta sobre a nav (Perfil, registos); false = colada ao fundo
   *  com o respiro do safe-area (onboarding, ecrãs sem nav) */
  aboveNav?: boolean;
  className?: string;
  style?: React.CSSProperties;
  [key: string]: unknown;
}
export default function ActionBar(props: ActionBarProps): JSX.Element;

/**
 * O clearance extra que o scroll do ecrã precisa por baixo quando há barra:
 * `calc(var(--scroll-pad-bottom-actionbar) - var(--scroll-pad-bottom))`.
 * É só a DIFERENÇA — o <main> do Layout já dá 112px a todos os ecrãs;
 * somar os 168 inteiros dava 280px de vazio.
 */
export const ACTION_BAR_SCROLL_PAD: string;
