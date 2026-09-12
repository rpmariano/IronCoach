/* Ritmo humano na escrita da Carol — CAROL.md §5.
   - Cada mensagem dela aparece precedida de "a escrever…" durante 600 a
     900 ms, proporcional ao tamanho, com teto de 900.
   - Uma ideia por bolha: uma mensagem longa divide-se em 2 ou 3 bolhas
     com 400 ms entre elas, nunca num bloco único.
   - prefers-reduced-motion: sem "a escrever…", as bolhas aparecem de
     imediato.
   O prompt do coach-chat pede à Carol que separe ideias com uma linha em
   branco; é essa a costura que este ficheiro usa. O texto guardado em
   coach_messages continua a ser UM registo — a divisão é só de
   apresentação, por isso o histórico recarregado da base de dados lê-se
   exatamente como a mensagem leu ao chegar. */

export const TYPING_MIN_MS = 600;
export const TYPING_MAX_MS = 900;
export const BUBBLE_GAP_MS = 400;
export const MAX_BUBBLES = 3;

/** 600 ms + 1 ms por cada 2 caracteres, com teto nos 900 — "proporcional ao
 *  tamanho da mensagem, com teto de 900 ms". */
export function typingDelayFor(text) {
  const len = typeof text === 'string' ? text.length : 0;
  return Math.min(TYPING_MAX_MS, TYPING_MIN_MS + Math.round(len / 2));
}

// Uma lista fica presa ao parágrafo que a introduz — separar um plano de
// treino por bolhas partia a lista a meio. Um título abre bolha nova, e o
// parágrafo a seguir a um título ou a uma lista fica com eles (a frase de
// fecho de um plano pertence ao plano).
const LIST = /^\s*([-*•]|\d+[.)])\s/;
const HEADING = /^(#{1,6}\s|\*\*[^*]+\*\*\s*$)/;
const lastLine = (chunk) => chunk.split('\n').pop() || '';

/** Divide uma mensagem em bolhas (máx. 3) pelos parágrafos em branco.
 *  Listas nunca abrem bolha nova; o que sobrar do 3.º parágrafo em diante
 *  junta-se à última bolha. Mensagens curtas ficam inteiras. */
export function splitIntoBubbles(content) {
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) return [];
  const paragraphs = text.split(/\n[ \t]*\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  for (const p of paragraphs) {
    const prev = chunks.length > 0 ? chunks[chunks.length - 1] : null;
    if (prev !== null && LIST.test(p)) {
      chunks[chunks.length - 1] += `\n\n${p}`;
    } else if (prev !== null && !HEADING.test(p) && (HEADING.test(lastLine(prev)) || LIST.test(lastLine(prev)))) {
      chunks[chunks.length - 1] += `\n\n${p}`;
    } else {
      chunks.push(p);
    }
  }
  if (chunks.length > MAX_BUBBLES) {
    const head = chunks.slice(0, MAX_BUBBLES - 1);
    const tail = chunks.slice(MAX_BUBBLES - 1).join('\n\n');
    return [...head, tail];
  }
  return chunks;
}

/** True quando o sistema pede menos movimento. Sem matchMedia (jsdom, WebViews
 *  antigos) não há como saber — e nesse caso a escolha segura é não animar. */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}
