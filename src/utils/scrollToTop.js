/* Apresenta o ecrã seguinte com scroll up. O scroll pode viver na janela
   (documentElement/body, conforme o browser) ou no <main> do Layout — repõe
   os três, sem animação, para o ecrã novo não aparecer a meio. */
export function scrollToTop(main = typeof document !== 'undefined' ? document.querySelector('main') : null) {
  if (typeof window === 'undefined') return;
  if (typeof window.scrollTo === 'function') {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }
  if (document.documentElement) document.documentElement.scrollTop = 0;
  if (document.body) document.body.scrollTop = 0;
  if (main) {
    if (typeof main.scrollTo === 'function') {
      main.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
    main.scrollTop = 0;
  }
}

// Os separadores do carrossel da Evolução (Dashboard.jsx). Passar de um para
// outro é um deslize horizontal — levar a página ao topo a meio do gesto
// dava um salto vertical.
export const DASHBOARD_TABS = ['hub', 'corrida', 'ginasio', 'nutricao', 'corpo', 'holistica'];

export function isDashboardSwipe(prevTab, nextTab) {
  return DASHBOARD_TABS.includes(prevTab) && DASHBOARD_TABS.includes(nextTab);
}
