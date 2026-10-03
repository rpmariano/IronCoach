// T1 — A chave de um alimento: o mesmo alimento escrito de maneiras
// diferentes ("Iogurte grego 0%", "iogurte  grego 0 %") tem a mesma chave.
//
// @contexto Bugs #48/#52, fase A (2026-10-04): a despensa do atleta
// (athlete_foods.name_key) e as regras de como cozinha
// (athlete_food_rules.topic_key/value_key) comparam-se por esta chave — no
// servidor (analyze-meal/pantry.ts) e na app (o Armário e as sugestões ao
// escrever, fase C). Sem acentos, minúsculas, só letras, dígitos e %, um
// espaço entre palavras. Não junta sinónimos ("estrelado" ≠ "frito"): isso é
// trabalho do Gemini, que recebe a lista da despensa e usa os nomes dela.

export function foodKey(name: unknown): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\d)\s+%/g, "$1%")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}
