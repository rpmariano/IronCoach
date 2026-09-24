/* O catálogo dos badges do lado do servidor — chave → nome e FAMÍLIA.
 *
 * Porque existe: as regras dos badges vivem em `src/utils/badges.js`, que o
 * Deno não consegue importar (arrasta o `racePlanEngine`, o alias `@formulas`
 * e o resto do cliente). Mas a Carol precisa de UMA coisa de lá — a família
 * de cada badge — porque é a família, e só ela, que decide o que ela pode ou
 * não trazer à conversa (doutrina 6 #6). A cor não serve: A Escalada e o
 * Mestre da Z2 são os dois `run` e são coisas opostas.
 *
 * A duplicação é assumida, mas NÃO pode derivar em silêncio: o teste de
 * paridade `src/utils/badgeCatalog.test.js` corre `computeBadges` e exige que
 * as duas listas coincidam na chave, no nome e na família. Um badge novo em
 * `badges.js` sem entrada aqui parte o teste — que é exatamente o momento em
 * que alguém tem de decidir em que família ele cai e, portanto, se a Carol
 * pode falar dele. É o mesmo molde dos vetores dourados das fórmulas.
 */

export type BadgeFamilia = "desempenho" | "disciplina" | "acumulacao" | "amuletos";

export interface BadgeCatalogEntry {
  nome: string;
  familia: BadgeFamilia;
}

/** As quatro famílias, pela ordem da Vitrina (src/utils/badges.js, FAMILIAS). */
export const FAMILIA_LABELS: Record<BadgeFamilia, string> = {
  desempenho: "Desempenho",
  disciplina: "Disciplina",
  acumulacao: "Acumulação",
  amuletos: "Amuletos",
};

export const FAMILIA_ORDER: BadgeFamilia[] = ["desempenho", "disciplina", "acumulacao", "amuletos"];

/** As famílias sobre as quais a Carol NÃO pode tomar iniciativa (6 #6, R1 e
 *  R3). Reconhecer depois de ganho, sim; propor antes, nunca. */
export const FAMILIAS_QUE_NAO_SE_SUGEREM: BadgeFamilia[] = ["acumulacao", "amuletos"];

export const BADGE_CATALOG: Record<string, BadgeCatalogEntry> = {
  // Desempenho — o que mede como se corre.
  z2_mestre: { nome: "Mestre da Z2", familia: "desempenho" },
  negative_split: { nome: "Negative split", familia: "desempenho" },
  cadencia_corrigida: { nome: "Cadência corrigida", familia: "desempenho" },
  // O Passo (2026-09-22): o encaixe do passo mais rápido do medalhão "Os
  // Níveis", que a fase A não trouxe por não caber em três degraus, volta
  // como badge próprio. Desempenho — mede velocidade pura, de prova ou de
  // treino, e é por contar treino que é ciano e não âmbar.
  melhor_passo: { nome: "O Passo", familia: "desempenho" },
  cabra_montesa: { nome: "Cabra-montesa", familia: "desempenho" },
  medida_da_prova: { nome: "À medida da prova", familia: "desempenho" },
  // Os que vieram d'O Palmarés (fase A, 2026-09-22): os medalhões passaram a
  // badges, e estes cinco medem o que os seis medalhões mediam. São todos de
  // prova — quatro em desempenho, A Sequência em disciplina, e Os Quilómetros
  // em acumulação, lá em baixo.
  distancias: { nome: "As Distâncias", familia: "desempenho" },
  terreno: { nome: "O Terreno", familia: "desempenho" },
  niveis: { nome: "Os Níveis", familia: "desempenho" },
  superacao: { nome: "A Superação", familia: "desempenho" },
  recorde_pessoal: { nome: "Recorde pessoal", familia: "desempenho" },
  // Disciplina — o que mede se se fez o combinado.
  semana_100: { nome: "Semana 100%", familia: "disciplina" },
  descanso_cumprido: { nome: "Descanso cumprido", familia: "disciplina" },
  sequencia: { nome: "A Sequência", familia: "disciplina" },
  // Acumulação — o que só soma quantidade. R1.
  quilometros: { nome: "Os Quilómetros", familia: "acumulacao" },
  escalada: { nome: "A Escalada", familia: "acumulacao" },
  // Amuletos — o que não mede desenvolvimento nenhum. R3.
  coruja: { nome: "Coruja", familia: "amuletos" },
  volta_ao_relogio: { nome: "Volta ao relógio", familia: "amuletos" },
  relogio_suico: { nome: "Relógio suíço", familia: "amuletos" },
  quatro_estacoes: { nome: "Quatro estações", familia: "amuletos" },
  solsticio: { nome: "Solstício", familia: "amuletos" },
  anos: { nome: "Anos", familia: "amuletos" },
  numero_certo: { nome: "Número certo", familia: "amuletos" },
};

/** A família de um badge, ou null se a chave não for conhecida.
 *
 *  Um badge desconhecido (uma linha gravada por uma versão do cliente mais
 *  nova do que esta Edge Function) fica DE FORA do contexto: ela não fala do
 *  que não sabe classificar, que é o lado seguro do erro — R1 e R3 protegem
 *  por família, e sem família não há proteção. */
export function familiaDoBadge(badgeKey: unknown): BadgeFamilia | null {
  if (typeof badgeKey !== "string") return null;
  return BADGE_CATALOG[badgeKey]?.familia ?? null;
}

export function nomeDoBadge(badgeKey: unknown): string | null {
  if (typeof badgeKey !== "string") return null;
  return BADGE_CATALOG[badgeKey]?.nome ?? null;
}
