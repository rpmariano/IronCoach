/* Marca no <html> que a página está escondida (separador em segundo plano,
 * ecrã bloqueado, app minimizada), para o CSS poder parar os loops enquanto
 * ninguém os vê — ver `html[data-page-hidden]` em globals.css.
 *
 * Porquê: os únicos ciclos infinitos que ficam na app são decoração ou
 * espera (a onda do botão de insights da Carol, as ondas do copo de água,
 * os três pontos do "a escrever…"). Os browsers costumam suspender a
 * composição de um separador escondido, mas isso é comportamento de cada
 * browser, não garantia — e um loop a rodar sem ninguém a ver é bateria
 * gasta. Uma linha de CSS resolve, sem tocar em nenhum componente.
 *
 * Não há nada a limpar: vive tanto tempo como o documento.
 */
export function trackPageVisibility() {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  const sync = () => {
    const raiz = document.documentElement;
    if (!raiz) return;
    if (document.hidden) raiz.setAttribute('data-page-hidden', '');
    else raiz.removeAttribute('data-page-hidden');
  };
  document.addEventListener('visibilitychange', sync);
  sync();
}

export default trackPageVisibility;
