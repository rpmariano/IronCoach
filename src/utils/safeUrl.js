/* Auditoria de segurança (2026-11-14): o site de uma prova é texto do atleta (ou lido de um
   print), e ia direto para um href — um «javascript:…» ou «data:…» virava um link que corre
   código. Só é link o que começa por http:// ou https://; o resto mostra-se como texto. */

/** O URL, aparado, se for http(s); senão null. */
export function safeHttpUrl(value) {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  return /^https?:\/\/[^\s]+$/i.test(url) ? url : null;
}
