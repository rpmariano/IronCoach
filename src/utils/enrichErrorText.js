/* A frase do aviso quando o «Obter do site» (enrich-race-event) falha — RaceInfoPanel e RunAgenda.
   - O servidor respondeu com uma frase («Endereço do site inválido…», «O site respondeu com um
     erro.»): é essa.
   - Timeout: a frase do invoke («A operação demorou demasiado tempo…»), como antes.
   - Falha de rede: a ligação, não o site (a mensagem da supabase-js vem em inglês).
   - Um erro do gateway sem frase: o aviso genérico. */

export const ENRICH_NETWORK_TEXT = 'A ligação falhou — não consegui chegar ao servidor. Tenta outra vez.';
export const ENRICH_GENERIC_TEXT = 'Não consegui obter informação deste site.';

export function enrichErrorText(res) {
  if (res?.serverText) return res.serverText;
  if (res?.isTimeout) return typeof res.error === 'string' && res.error ? res.error : ENRICH_NETWORK_TEXT;
  if (res?.isNetwork) return ENRICH_NETWORK_TEXT;
  return ENRICH_GENERIC_TEXT;
}
