import { expect } from 'vitest';

/* A voz da Carol (ação P.12) — espelha assertCarolVoice em
   supabase/functions/_shared/carolTone.ts, do lado do cliente: o servidor é
   Deno, o cliente é bundlado pelo Vite, os dois lados não podem importar um
   do outro. Mesmo risco de divergência que qualquer outra duplicação
   _shared (MEAL_DOCTRINE, IMPRESSION_KIND_LABELS) — aceite porque é uma
   regra pequena e só mecanicamente verificável (nunca "opinião primeiro" ou
   "sem elogios automáticos", que só um humano lê no prompt).

   Fronteiras por \p{L} (qualquer letra Unicode), não \b: \b usa \w, que não
   inclui acentos — "consideração" tem "ç" logo a seguir a "considera", e \b
   via \w trata essa transição como fronteira de palavra. Sem isto,
   "consideração" acendia o aviso de "considera" a suavizar. */
const SOFTENING_WORDS = /(?<![\p{L}])(talvez|considera(s)?|pode ser que|se calhar)(?![\p{L}])/iu;
const NAMES_INFRA = /(?<![\p{L}])(gemini)(?![\p{L}])/iu;

/** Falha o teste (via expect, com a mensagem a dizer o quê) se `text` violar
 *  a voz da Carol: emoji, exclamação, "talvez"/"considera" a suavizar, ou o
 *  nome do modelo por trás. */
export function expectCarolVoice(text) {
  expect(text, `voz da Carol: tem emoji — "${text}"`).not.toMatch(/\p{Extended_Pictographic}/u);
  expect(text, `voz da Carol: tem exclamação — "${text}"`).not.toContain('!');
  expect(text, `voz da Carol: suaviza com "talvez"/"considera" — "${text}"`).not.toMatch(SOFTENING_WORDS);
  expect(text, `voz da Carol: nomeia a infraestrutura — "${text}"`).not.toMatch(NAMES_INFRA);
}
