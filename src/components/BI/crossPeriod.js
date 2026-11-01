/* As datas da Análise Cruzada (pedido do Rui, 2026-11-01): os cantos do eixo x e o período que
   cada cartão usa. Num módulo à parte para o gráfico e a secção partilharem o formato. */
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** '2026-09-08' → '8 set'; com o ano ('8 set 2025') quando se pede. */
export function axisDate(iso, withYear = false) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d} ${MESES[m - 1]}${withYear ? ` ${y}` : ''}`;
}

/** «8 set – 1 nov», com o ano quando o período atravessa anos. */
export function periodRange(fromISO, toISO) {
  if (!fromISO || !toISO) return '';
  const withYear = String(fromISO).slice(0, 4) !== String(toISO).slice(0, 4);
  return `${axisDate(fromISO, withYear)} – ${axisDate(toISO, withYear)}`;
}
