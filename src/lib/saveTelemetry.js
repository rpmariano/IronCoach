/* #116 (2026-11-07): o que se regista quando uma gravação falha no cliente — o tipo de registo, o
   nome e a mensagem do erro, o tamanho aproximado do corpo e se levava fotos. Nunca o conteúdo: nem
   as fotos, nem os alimentos, nem as notas, nem o texto que o servidor escreveu para o atleta (pode
   ter o nome dele). Funções puras, sem supabase, para o supabase.js as poder usar sem ciclo. */

/** As Edge Functions que gravam um registo, e o tipo de registo de cada uma. */
export const SAVE_FUNCTION_KIND = {
  'analyze-meal': 'meal',
  'analyze-run': 'run',
  'analyze-gym': 'gym',
  'analyze-body': 'body',
};

/** Os modos destas funções que não gravam um registo (ler prints, responder a perguntas, despensa). */
const NON_SAVE_MODES = new Set(['preview', 'answer', 'pantry_food']);

/** O id que diz que o pedido edita um registo que já existe. */
const EDIT_ID_FIELDS = ['meal_id', 'run_id', 'session_id', 'workout_session_id', 'assessment_id'];

/** O tipo de registo de um pedido de gravação, ou null quando o pedido não grava (ou não é destas funções). */
export function saveKindOf(fnName, body) {
  const kind = SAVE_FUNCTION_KIND[fnName];
  if (!kind) return null;
  if (body && typeof body === 'object' && NON_SAVE_MODES.has(body.mode)) return null;
  return kind;
}

/** O tamanho aproximado do corpo (bytes do JSON — as fotos em base64 são quase tudo) e quantas fotos levava. */
export function describeBody(body) {
  let bodyBytes = null;
  try {
    bodyBytes = body == null ? 0 : (typeof body === 'string' ? body.length : JSON.stringify(body).length);
  } catch { /* corpo que não se serializa: fica sem tamanho */ }
  const images = body && typeof body === 'object' && Array.isArray(body.images) ? body.images.length : 0;
  return { bodyBytes, photoCount: images, hasPhotos: images > 0 };
}

/** «create» ou «edit», pelo id que o corpo leva. */
export function saveModeOf(body) {
  if (!body || typeof body !== 'object') return 'create';
  return EDIT_ID_FIELDS.some((f) => body[f]) ? 'edit' : 'create';
}

/** Uma mensagem técnica, curta e sem quebras — nunca conteúdo do atleta. */
export function technicalMessage(msg) {
  if (msg == null) return null;
  return String(msg).replace(/\s+/g, ' ').trim().slice(0, 200) || null;
}
