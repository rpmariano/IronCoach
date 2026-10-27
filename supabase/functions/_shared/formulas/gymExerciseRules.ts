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
   «sem exercícios de membros superiores», «evitar ombros». Só a categoria
   limitacao_fisica, e só com a negação explícita perto da parte do corpo. */
const UPPER_RESTRICTION_RE =
  /\b(sem|nao|nunca|evitar|nada de|restricao|proibid[oa]s?)\b[^.;\n]{0,80}\b(bracos?|membros? superiores?|ombros?|cotovelos?|pulsos?|maos)\b/;

// deno-lint-ignore no-explicit-any
export function hasUpperBodyRestriction(notes: any[] | null | undefined): boolean {
  return (notes ?? []).some((n) =>
    n?.category === "limitacao_fisica" && typeof n?.note === "string" && UPPER_RESTRICTION_RE.test(fold(n.note))
  );
}

/* Exercícios que carregam braços, ombros ou mãos — pelo movimento ou pelo
   peso seguro nas mãos. Os nomes chegam em português ou inglês, com ou sem
   acentos. «Peso morto» só passa «sem carga»; «curl» só o das pernas. */
const UPPER_MOVES: [RegExp, string][] = [
  [/\b(supino|bench press|crucifixo|peck deck|\bfly\b|flexoes|push[- ]?ups?|fundos|dips?)\b/, "peito/tríceps"],
  [/\b(remada|remo|rowing|\brow\b|puxada|pulldown|pull[- ]?ups?|chin[- ]?ups?|elevacoes na barra|face pull|encolhimentos?|shrugs?)\b/, "costas/braços"],
  [/\b(biceps|triceps|antebraco)\b/, "braços"],
  [/\b(desenvolvimento|press militar|shoulder press|elevac(ao|oes) (lateral|laterais|frontal|frontais)|ombros?)\b/, "ombros"],
  [/\b(prancha|plank|bird ?dog|quatro apoios|quadrupedia|mountain climbers?|escalador|burpees?|bear crawl|marcha do urso|pallof)\b/, "apoio ou força nas mãos"],
  [/\b(battle ropes?|cordas navais|kettlebell swing|landmine|turkish|get[- ]?up|wall ?balls?|thrusters?|clean|snatch|arranque|arremesso)\b/, "braços"],
  [/\b(halter|halteres|haltere|dumbbells?|db|kettlebells?|kb|goblet|barra|barbell|smith|trap bar|hex bar|anilha|disco|farmer|sandbag|saco|bola medicinal|medicine ball|com carga)\b/, "peso nas mãos"],
];

/** O motivo («peso nas mãos», «ombros»…) se o exercício carrega os membros
 *  superiores; null se não. */
export function upperBodyLoad(name: string): string | null {
  const n = fold(name);
  for (const [re, why] of UPPER_MOVES) if (re.test(n)) return why;
  if (/\bcurl\b/.test(n) && !/(perna|leg|femoral|isquio|hamstring|nordic|nordico)/.test(n)) return "braços";
  if (/\bpeso morto\b|\bdeadlift\b/.test(n) && !/(sem carga|sem peso|peso corporal|bodyweight)/.test(n)) return "peso nas mãos";
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
