// As regras dos exercícios de ginásio do plano que o servidor faz cumprir
// (coach-chat, propose_training_plan): a restrição de membros superiores da
// memória e a variedade entre sessões seguidas.
//
// @contexto Bug do Rui (2026-10-27): o plano sugeria sempre os mesmos 4
// exercícios de máquina. A doutrina do prompt só mandava usar os nomes do
// histórico, sem catálogo nem variedade, e a restrição «sem braços» lia-se à
// vontade do modelo. O prompt diz agora o que escolher; isto recusa o plano
// que mesmo assim viole a restrição ou repita a sessão anterior, e a Carol
// refaz no mesmo turno.

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* Uma limitação física que proíbe carregar os membros superiores, dita na
   memória: «mantendo a restrição de não realizar exercícios de braços»,
   «sem exercícios de membros superiores», «evitar carga na mão esquerda».
   Só a categoria limitacao_fisica, e só com a negação explícita perto da
   parte do corpo. Uma negação que nega um problema — «sem dores nos ombros»,
   «não tem problemas nos braços» — não é restrição (revisão do lote). */
const UPPER_RESTRICTION_RE =
  /\b(sem|nao|nunca|evitar|nada de|restricao|proibid[oa]s?)\b([^.;\n]{0,80}?)\b(bracos?|membros? superiores?|ombros?|cotovelos?|pulsos?|maos?)\b/g;
const NEGATED_PROBLEM_RE = /^\s*(\w+\s+){0,2}(dor|dores|problemas?|queixas?|lesao|lesoes|limitac\w*|desconforto)\b/;

// deno-lint-ignore no-explicit-any
export function hasUpperBodyRestriction(notes: any[] | null | undefined): boolean {
  return (notes ?? []).some((n) => {
    if (n?.category !== "limitacao_fisica" || typeof n?.note !== "string") return false;
    for (const m of fold(n.note).matchAll(UPPER_RESTRICTION_RE)) {
      if (!NEGATED_PROBLEM_RE.test(m[2])) return true;
    }
    return false;
  });
}

/* Exercícios que carregam braços, ombros ou mãos — pelo movimento, pelo
   peso seguro nas mãos ou por um cardio feito com os braços. Os nomes chegam
   em português ou inglês, com ou sem acentos. «Peso morto» só passa «sem
   carga»; «curl» só o das pernas; «elevações» só as de gémeos/calcanhar/anca.
   Os nomes das partes do corpo sozinhos (BODY_PARTS) só contam no nome do
   exercício: numa nota, «ombros descontraídos» não é um exercício. */
const UPPER_MOVES: [RegExp, string][] = [
  [/\b(supino|bench press|chest press|press de peito|crucifixo|pec deck|peck deck|fly|flexoes|push[- ]?ups?|fundos|dips?|pullover|crossover|cruzamento)\b/, "peito/tríceps"],
  [/\b(remada|remo|rowing|row|puxada|pulldown|pull[- ]?ups?|chin[- ]?ups?|face pull|encolhimentos?|shrugs?)\b/, "costas/braços"],
  [/\b(pushdown|skull\w*|tricep|kickback de triceps)\b/, "braços"],
  [/\b(desenvolvimento|press militar|military press|overhead press|shoulder press|arnold|lateral raises?|front raises?|elevac(ao|oes) (lateral|laterais|frontal|frontais))\b/, "ombros"],
  [/\b(prancha|plank|bird ?dog|quatro apoios|quadrupedia|mountain climbers?|escalador|burpees?|bear crawl|marcha do urso|pallof|trx)\b/, "apoio ou força nas mãos"],
  [/\b(battle ropes?|cordas navais|kettlebell swing|landmine|turkish|get[- ]?up|wall ?balls?|thrusters?|clean|snatch|arranque|arremesso)\b/, "braços"],
  [/\b(polia|cabo|cable)\b/, "polia/cabo"],
  [/\b(eliptica|elliptical|air ?bike|assault|ski ?erg|natacao|nadar|swim\w*|piscina|treno|sled)\b/, "cardio ou empurrar com os braços"],
  [/\b(halter|halteres|haltere|dumbbells?|db|kettlebells?|kb|goblet|barra|barbell|smith|trap bar|hex bar|anilha|disco|farmer|sandbag|saco|bola medicinal|medicine ball|com carga)\b/, "peso nas mãos"],
];
const BODY_PARTS: [RegExp, string] = [/\b(ombros?|biceps|triceps|antebraco|peitoral|peito|bracos?)\b/, "membros superiores"];

function loadIn(n: string, withBodyParts: boolean): string | null {
  for (const [re, why] of UPPER_MOVES) if (re.test(n)) return why;
  if (withBodyParts && BODY_PARTS[0].test(n)) return BODY_PARTS[1];
  if (/\bcurl\b/.test(n) && !/(perna|leg|femoral|isquio|hamstring|nordic|nordico)/.test(n)) return "braços";
  if (/\bpeso morto\b|\bdeadlift\b/.test(n) && !/(sem carga|sem peso|peso corporal|bodyweight)/.test(n)) return "peso nas mãos";
  if (/\belevac(ao|oes)\b/.test(n) && !/\belevac(ao|oes) d[aeo]s? (gemeos?|calcanhar(es)?|anca|pelvis|quadril)\b/.test(n)) {
    // «Elevação de gémeos» passa; «elevações» sozinhas (na barra, de joelhos suspenso) não.
    if (/\belevacoes\b/.test(n) || /\belevac(ao|oes) (na barra|de joelhos|de pernas)\b/.test(n)) return "braços";
  }
  return null;
}

/** O motivo («peso nas mãos», «ombros»…) se o exercício carrega os membros
 *  superiores; null se não. */
export function upperBodyLoad(name: string): string | null {
  return loadIn(fold(name), true);
}

/** O mesmo, num texto livre (notes do treino, objetivo de um bloco): só as
 *  orações sem negação — «sem halteres», «nada de pranchas» é a Carol a
 *  cumprir a restrição, não a quebrá-la. Devolve o trecho e o motivo. */
export function upperBodyLoadInText(text: unknown): { clause: string; why: string } | null {
  if (typeof text !== "string" || !text.trim()) return null;
  for (const raw of text.split(/[.;,:\n!?()]+/)) {
    const clause = raw.trim();
    if (!clause) continue;
    const n = fold(clause);
    if (/\b(sem|nao|nunca|nada de|evita\w*|em vez de|nem|proibid\w*|restricao)\b/.test(n)) continue;
    const why = loadIn(n, false);
    if (why) return { clause, why };
  }
  return null;
}

/** Os nomes dos exercícios de FORÇA de uma prescrição, normalizados. O
 *  cardio (o aquecimento na bicicleta) pode repetir — não conta. */
// deno-lint-ignore no-explicit-any
export function strengthNames(prescription: any): string[] {
  const blocks = Array.isArray(prescription?.blocks) ? prescription.blocks : [];
  return [...new Set(
    blocks
      // deno-lint-ignore no-explicit-any
      .filter((b: any) => b?.type === "forca" && typeof b.name === "string" && b.name.trim())
      // deno-lint-ignore no-explicit-any
      .map((b: any) => fold(b.name).replace(/\s+/g, " ").trim()),
  )] as string[];
}

/** Os exercícios em comum se duas sessões seguidas são a mesma sessão —
 *  mais de metade dos de força da mais curta; null se variam o bastante. */
export function repeatedExercises(prev: string[], cur: string[]): string[] | null {
  if (prev.length < 2 || cur.length < 2) return null;
  const shared = cur.filter((n) => prev.includes(n));
  return shared.length > Math.floor(Math.min(prev.length, cur.length) / 2) ? shared : null;
}
