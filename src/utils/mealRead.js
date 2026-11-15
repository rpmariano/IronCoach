/* #106 nas refeições (2026-11-07, pedido do Rui; dev-back 8aaa3eb9): como no ginásio, na corrida e
   na avaliação corporal, uma refeição com fotos lê-se primeiro — «Ler e preencher» (analyze-meal,
   mode "preview") enche os alimentos e faz as perguntas — e só depois se grava, com `reviewed: true`
   e os alimentos revistos, sem a Carol voltar a ler as fotos. Mexer nas fotos ou nos alimentos
   escritos depois da leitura volta a pedi-la. A gravação sem fotos não muda. */

/** As perguntas da refeição podem ser mais do que as 3 dos prints: até 5 do modelo, mais a da
 *  variante e a da manteiga (#66, #109). */
export const MEAL_MAX_QUESTIONS = 7;

/** O limite do servidor para as gramas de um alimento revisto. */
export const MAX_ITEM_GRAMS = 5000;

const gramsValue = (g) => {
  if (g == null || g === '') return null;
  const n = Number(g);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Os alimentos escritos como vão no pedido ({ name, grams }). */
export function writtenItemsPayload(manualItems) {
  return (manualItems || []).map((i) => ({ name: String(i.name || '').trim(), grams: gramsValue(i.grams) })).filter((i) => i.name);
}

/** A assinatura do que a leitura leu além das fotos — os alimentos escritos e as observações (as
 *  notas mudam o que a Carol lê e pergunta: «sem açúcar», «frito em azeite»). Mudou depois da
 *  leitura → a leitura já não vale (revisão do 50f7dc88). */
export function writtenSignature(manualItems, notes = '') {
  return JSON.stringify([
    writtenItemsPayload(manualItems).map((i) => [i.name.toLowerCase(), i.grams]),
    String(notes || '').trim(),
  ]);
}

/** O campo de cada alimento revisto com as gramas que a leitura deu (revisão do 50f7dc88): a
 *  resposta de quantidade e a edição das gramas somavam-se no servidor; com as gramas originais ele
 *  sabe o que o atleta mudou. O nome confirma-o o Backend — muda-se aqui. */
export const PREVIEW_GRAMS_FIELD = 'preview_grams';

/** Os alimentos lidos (os do preview), com uma chave local para a lista. */
export function previewItems(data, now = Date.now()) {
  const list = Array.isArray(data?.items) ? data.items : [];
  return list.filter((it) => it && String(it.name || '').trim()).map((it, i) => ({ ...it, key: `lido-${now}-${i}`, previewGrams: gramsValue(it.quantity_grams) }));
}

/** Os alimentos revistos como vão no pedido de gravar: sem os campos locais, as gramas em número, e
 *  as gramas da leitura em PREVIEW_GRAMS_FIELD. */
export function reviewedItemsPayload(items) {
  return (items || []).map(({ key: _key, previewGrams, ...it }) => ({
    ...it,
    quantity_grams: gramsValue(it.quantity_grams),
    [PREVIEW_GRAMS_FIELD]: previewGrams ?? null,
  }));
}

/** O que impede gravar os alimentos revistos, ou null: lista vazia, ou gramas fora de 0 < g ≤ 5000. */
export function reviewedItemsProblem(items) {
  if (!items?.length) return 'A refeição tem de ter pelo menos um alimento — volta a ler as fotos ou escreve-os.';
  const bad = items.find((it) => {
    const g = gramsValue(it.quantity_grams);
    return g == null || g > MAX_ITEM_GRAMS;
  });
  return bad ? `Revê as gramas de «${bad.name}»: entre 1 e ${MAX_ITEM_GRAMS} g.` : null;
}

/** A frase depois de uma leitura que correu bem. */
export function mealReadNote(itemsCount, questionsCount) {
  const que = itemsCount === 1 ? 'Li 1 alimento' : `Li ${itemsCount} alimentos`;
  return questionsCount
    ? `${que}. Revê as quantidades e responde ao que souberes antes de gravar.`
    : `${que}. Revê as quantidades antes de gravar.`;
}
