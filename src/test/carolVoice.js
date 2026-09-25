import { expect } from 'vitest';
import { NAMES_INFRA, SOFTENING_WORDS, THIRD_PERSON } from '../../supabase/functions/_shared/carolTone.ts';

/* A voz da Carol (ação P.12) — o mesmo que assertCarolVoice em
   supabase/functions/_shared/carolTone.ts, do lado do cliente: aqui falha
   pelo expect do vitest, com a mensagem a dizer o quê. As expressões vêm de
   lá (o Vite importa o .ts, como faz com @formulas) — eram cópias, e a da
   terceira pessoa chegou a existir nos dois sítios (terceira revisão
   pré-deploy, 2026-09-25). Só as regras mecanicamente verificáveis (nunca
   "opinião primeiro" ou "sem elogios automáticos", que só um humano lê no
   prompt). */

/** Falha o teste (via expect, com a mensagem a dizer o quê) se `text` violar
 *  a voz da Carol: emoji, exclamação, "talvez"/"considera" a suavizar, o
 *  nome do modelo por trás, ou ela a falar de si na terceira pessoa. */
export function expectCarolVoice(text) {
  expect(text, `voz da Carol: tem emoji — "${text}"`).not.toMatch(/\p{Extended_Pictographic}/u);
  expect(text, `voz da Carol: tem exclamação — "${text}"`).not.toContain('!');
  expect(text, `voz da Carol: suaviza com "talvez"/"considera" — "${text}"`).not.toMatch(SOFTENING_WORDS);
  expect(text, `voz da Carol: nomeia a infraestrutura — "${text}"`).not.toMatch(NAMES_INFRA);
  expect(text, `voz da Carol: fala de si na terceira pessoa — "${text}"`).not.toMatch(THIRD_PERSON);
}
