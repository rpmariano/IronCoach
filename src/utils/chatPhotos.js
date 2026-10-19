/* Fotos no chat da Carol (decisões 16 e 17 de specs/plano-registo-plano-coach.md
   §6): embalagens e comida enviadas na conversa. Seguem só neste pedido — a
   Carol vê-as e não se guardam; no histórico fica uma linha a dizer que foram
   enviadas (a mesma que o coach-chat grava: chatImages.ts, imageMarker). */

export const MAX_CHAT_PHOTOS = 3;

/** A linha por baixo da mensagem — igual à do servidor, para a bolha não mudar quando a resposta chega. */
export function photoMarker(n) {
  return n > 0 ? `\n📷 ${n === 1 ? '1 foto enviada' : `${n} fotos enviadas`}` : '';
}

/** As fotos (já comprimidas por compressImage) como o coach-chat as recebe. */
export function toPayloadImages(photos) {
  return (photos || []).slice(0, MAX_CHAT_PHOTOS).map(p => ({ mime_type: 'image/jpeg', data: p.base64 }));
}

/** Comprime os ficheiros escolhidos e junta-os às que já lá estão, até ao máximo.
 *  Devolve { photos, skipped }: `skipped` conta o que ficou de fora (excesso ou ficheiro ilegível). */
export async function addChatPhotos(current, files, compress) {
  const room = Math.max(0, MAX_CHAT_PHOTOS - current.length);
  const wanted = Array.from(files || []).filter(f => !f.type || f.type.startsWith('image/'));
  const picked = wanted.slice(0, room);
  const added = [];
  let failed = 0;
  for (const file of picked) {
    try { added.push(await compress(file)); } catch { failed += 1; }
  }
  return { photos: [...current, ...added], skipped: (wanted.length - picked.length) + failed + (Array.from(files || []).length - wanted.length) };
}
