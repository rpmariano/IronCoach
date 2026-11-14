/* Os buckets passaram a limitar o tamanho e o tipo dos ficheiros (dev-back, 2026-11-14: 5 MB,
   JPEG/PNG/WebP/HEIC nas fotos). Quando o Storage recusa, a supabase-js devolve uma mensagem em
   inglês («The object exceeded the maximum allowed size», «mime type … is not supported»), com
   statusCode 413 ou 415. Aqui passa a uma frase para o atleta — e é uma recusa final: repetir
   com o mesmo ficheiro dava o mesmo, por isso sem «Tentar de novo». */

export const STORAGE_TOO_LARGE_TEXT = 'A imagem é demasiado grande para guardar.';
export const STORAGE_BAD_TYPE_TEXT = 'Este tipo de ficheiro não é aceite. Usa JPEG, PNG, WebP ou HEIC.';

/** A frase para uma recusa do Storage por tamanho ou tipo; null para outro erro qualquer. */
export function storageRefusalText(error) {
  if (!error) return null;
  const status = String(error.statusCode ?? error.status ?? '');
  const msg = String(error.message || error.error || '');
  if (status === '413' || /exceeded the maximum allowed size|payload too large|entity too large/i.test(msg)) return STORAGE_TOO_LARGE_TEXT;
  if (status === '415' || /mime type|invalid_mime_type|not supported/i.test(msg)) return STORAGE_BAD_TYPE_TEXT;
  return null;
}

/** O erro a lançar para uma recusa do Storage: a frase, marcado sem «Tentar de novo». */
export function storageRefusalError(error) {
  const text = storageRefusalText(error);
  if (!text) return error;
  const err = new Error(text);
  err.name = 'StorageRefusal';
  err.noRetry = true;
  err.cause = error;
  return err;
}
