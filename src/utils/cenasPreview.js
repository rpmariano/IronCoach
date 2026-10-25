/* A pré-visualização das cenas da análise (components/shared/CarolCenasPreview.jsx)
   só se abre com ?cenas=preview E (?demo=true ou desenvolvimento): nunca a quem
   não sabe do URL num ambiente a sério. Vive à parte para o App a decidir sem
   carregar o ecrã. */
export function cenasPreviewAtiva(search = typeof window === 'undefined' ? '' : window.location.search, dev = import.meta.env?.DEV) {
  try {
    const p = new URLSearchParams(search);
    return p.get('cenas') === 'preview' && (!!dev || p.get('demo') === 'true');
  } catch {
    return false;
  }
}
