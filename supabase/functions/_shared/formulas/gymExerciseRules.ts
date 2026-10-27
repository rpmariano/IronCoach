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
   «não tem problemas nos braços», «sem nenhum tipo de problema nos ombros»
   — não é restrição (revisões do lote). Mas com um verbo de causa pelo meio
   é: «evitar exercícios que causem dor nos ombros», «não fazer nada que
   provoque dor no ombro» (revisão de a93b2773..61665b38). */
const UPPER_RESTRICTION_RE =
  /\b(sem|nao|nunca|evitar|nada de|restricao|proibid[oa]s?)\b([^.;\n]{0,80}?)\b(bracos?|membros? superiores?|ombros?|cotovelos?|pulsos?|maos?)\b/g;
const NEGATED_PROBLEM_RE = /^\s*(\w+\s+){0,4}(dor|dores|problemas?|queixas?|lesao|lesoes|limitac\w*|desconforto)\b/;
const CAUSE_RE = /\b(que|caus\w*|provoc\w*|agrav\w*)\b/;

// deno-lint-ignore no-explicit-any
export function hasUpperBodyRestriction(notes: any[] | null | undefined): boolean {
  return (notes ?? []).some((n) => {
    if (n?.category !== "limitacao_fisica" || typeof n?.note !== "string") return false;
    for (const m of fold(n.note).matchAll(UPPER_RESTRICTION_RE)) {
      const negatesProblem = NEGATED_PROBLEM_RE.test(m[2]) && !CAUSE_RE.test(m[2]);
      if (!negatesProblem) return true;
    }
    return false;
  });
}

/* Exercícios que carregam braços, ombros ou mãos — pelo movimento, pelo
   peso seguro nas mãos ou por um cardio feito com os braços. Os nomes chegam
   em português ou inglês, com ou sem acentos. «Peso morto» só passa «sem
   carga»; «curl» só o das pernas; «elevações» só as de gémeos/calcanhar/anca.
   As partes do corpo sozinhas e o equipamento solto (NAME_ONLY) só contam no
   nome do exercício: numa nota, «ombros descontraídos» não é um exercício. */
const UPPER_MOVES: [RegExp, string][] = [
  [/\b(supino|bench press|chest press|press de peito|crucifixo|pec deck|peck deck|fly|flexoes|push[- ]?ups?|fundos|dips?|pullover|crossover|cruzamento)\b/, "peito/tríceps"],
  [/\b(remada|remo|rowing|row|puxada|pulldown|pull[- ]?ups?|chin[- ]?ups?|face pull|encolhimentos?|shrugs?|muscle[- ]?ups?)\b/, "costas/braços"],
  [/\b(pushdown|skull\w*|tricep|kickback de triceps|hand ?grip|arm ergometer|ergometro de bracos|manivela de bracos)\b/, "braços"],
  [/\b(desenvolvimento|press militar|military press|overhead press|shoulder press|push press|arnold|lateral raises?|front raises?|elevac(ao|oes) (lateral|laterais|frontal|frontais))\b/, "ombros"],
  [/\b(prancha|plank|bird ?dog|quatro apoios|quadrupedia|mountain climbers?|escalador|burpees?|bear crawl|marcha do urso|pallof|trx)\b/, "apoio ou força nas mãos"],
  [/\b(battle ropes?|cordas navais|kettlebell swing|landmine|turkish|get[- ]?up|wall ?balls?|thrusters?|clean|snatch|arranque|arremesso)\b/, "braços"],
  [/\b(polia|cabo|cable)\b/, "polia/cabo"],
  [/\b(eliptica|elliptical|air ?bike|assault|ski ?erg|natacao|nadar|swim\w*|piscina|treno|sled)\b/, "cardio ou empurrar com os braços"],
  [/\b(halter|halteres|haltere|dumbbells?|kettlebells?|goblet|farmer|bola medicinal|medicine ball|agachamento frontal|front squat)\b/, "peso nas mãos"],
];
/* Equipamento que num NOME quer dizer peso nas mãos («Agachamento com barra»,
   «Lunges com disco»), mas que numa nota pode não ser («hip thrust na máquina
   com disco», «barra de apoio», «saco de areia nos pés»): só conta no nome,
   como as partes do corpo sozinhas (revisão final do lote). */
const NAME_ONLY: [RegExp, string][] = [
  [/\b(ombros?|biceps|triceps|antebraco|peitoral|peito|bracos?)\b/, "membros superiores"],
  [/\b(db|kb|barra|barbell|smith|trap bar|hex bar|anilha|disco|sandbag|saco|com carga)\b/, "peso nas mãos"],
];

function loadIn(n: string, isName: boolean): string | null {
  for (const [re, why] of UPPER_MOVES) if (re.test(n)) return why;
  if (isName) for (const [re, why] of NAME_ONLY) if (re.test(n)) return why;
  if (/\bcurl\b/.test(n) && !/(perna|leg|femoral|isquio|hamstring|nordic|nordico)/.test(n)) return "braços";
  if (/\bpeso morto\b|\bdeadlift\b/.test(n) && !/(sem carga|sem peso|peso corporal|bodyweight)/.test(n)) return "peso nas mãos";
  // Pendurado pelos braços: «Hanging leg raise», «elevação de pernas suspenso».
  if (/(suspens|pendurad|hanging|paralelas|captain)/.test(n)) return "braços";
  if (/\belevac(ao|oes)\b/.test(n)) {
    // «Elevação de gémeos» e «de pernas deitado» passam; «elevações»
    // sozinhas (as da barra) não, nem as «de pernas na barra» — também numa
    // nota, onde «barra» sozinha não conta (revisão de a93b2773..61665b38).
    if (/\b(na barra|barra fixa)\b/.test(n)) return "braços";
    const of = /\belevac(ao|oes) d[aeo]s? (gemeos?|calcanhar(es)?|anca|pelvis|quadril|pernas?|joelhos?)\b/.test(n);
    if (!of && /\belevacoes\b/.test(n)) return "braços";
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

/* O atleta quer ganhar massa ou força (decisão do Rui, 2026-10-27): a
   memória (objetivo_pessoal / preferencia_treino com «massa», «hipertrofia»,
   «ganhar/aumentar força», «ficar mais forte», «força máxima», «músculo»,
   «volume», «ganhar peso», sem negação) ou o perfil (uma
   massa magra alvo acima da última medida — a muscle_mass_kg não é fiável,
   Bloco 5 #1). Devolve de onde veio, para o contexto; null se não há sinal.
   Um pedido no chat lê-o a Carol pela doutrina. */
// «Força» sozinha não: um corredor tem sempre «treino de força» na memória.
// «Massa» só a muscular: nunca a gorda, a corporal nem o índice de massa.
const GAIN_RE =
  /\b((?<!indice de )massa(?! (gorda|corporal|ossea|de gordura))|hipertrofia|(ganhar|aumentar|ganho de)( a)? forca|ficar mais fortes?|forca maxima|musculo|musculad[oa]|ganhar volume|ganhar peso|ganho muscular|bulk\w*)\b/g;
// A negação vale só na oração da ocorrência: «maratona sem lesões e ganhar
// massa muscular» é um objetivo de massa. Perder, baixar ou manter não é ganhar.
const GAIN_NEGATED_RE = /\b(nao|sem|nunca|evitar|nada de|perder|baixar|reduzir|manter|preservar)\b(\s+\w+){0,3}\s*$/;
const CLAUSE_BREAK_RE = /[.;,:!?\n]|\b(e|mas|porem)\b/g;
export function wantsMuscleGain(
  // deno-lint-ignore no-explicit-any
  notes: any[] | null | undefined,
  profile: { goal_lean_body_mass_kg?: unknown } | null | undefined,
  latestLeanKg: number | null | undefined,
): string | null {
  for (const n of notes ?? []) {
    if ((n?.category !== "objetivo_pessoal" && n?.category !== "preferencia_treino") || typeof n?.note !== "string") continue;
    const t = fold(n.note);
    for (const m of t.matchAll(GAIN_RE)) {
      const before = t.slice(0, m.index);
      const clauseStart = Math.max(0, ...[...before.matchAll(CLAUSE_BREAK_RE)].map((b) => (b.index ?? 0) + b[0].length));
      if (!GAIN_NEGATED_RE.test(before.slice(clauseStart))) return `memória: «${n.note.trim().slice(0, 120)}»`;
    }
  }
  const goal = Number(profile?.goal_lean_body_mass_kg);
  if (Number.isFinite(goal) && goal > 0 && typeof latestLeanKg === "number" && latestLeanKg > 0 && goal >= latestLeanKg + 0.5) {
    return `perfil: massa magra alvo ${goal} kg (última medida ${latestLeanKg} kg)`;
  }
  return null;
}

/* Força pesada nas pernas: um exercício de pernas a ≤ 6 reps («pernas a 3-6
   reps pesadas», a doutrina). É o que não pode cair nas 48 h antes de uma
   corrida dura nem na semana de uma prova principal. A pliometria (poucos
   saltos não são carga pesada) e a isometria (agachamento na parede, 1 «rep»
   de 45 s) não contam (revisão de a93b2773..61665b38). */
const LEG_RE = /\b(agachamento|squat|leg press|prensa|lunges?|afundos?|bulgaro|step[- ]?ups?|peso morto|deadlift|hip thrust|ponte|extensora|flexora|leg (curl|extension)|gemeos|calf|nordico|nordic|abdutora|adutora|hack)\b/;
const NOT_HEAVY_RE = /\b(salt\w*|jumps?|pliometri\w*|isom\w*|parede|wall sit)\b/;
export const HEAVY_LEG_MAX_REPS = 6;
// deno-lint-ignore no-explicit-any
export function heavyLegExercises(prescription: any): string[] {
  const blocks = Array.isArray(prescription?.blocks) ? prescription.blocks : [];
  return blocks
    // deno-lint-ignore no-explicit-any
    .filter((b: any) => b?.type === "forca" && typeof b.name === "string" && LEG_RE.test(fold(b.name)) &&
      !NOT_HEAVY_RE.test(fold(b.name)) && typeof b.reps === "number" && b.reps > 1 && b.reps <= HEAVY_LEG_MAX_REPS)
    // deno-lint-ignore no-explicit-any
    .map((b: any) => b.name);
}

/** Os exercícios em comum se duas sessões seguidas são a mesma sessão —
 *  mais de metade dos de força da mais curta; null se variam o bastante. */
export function repeatedExercises(prev: string[], cur: string[]): string[] | null {
  if (prev.length < 2 || cur.length < 2) return null;
  const shared = cur.filter((n) => prev.includes(n));
  return shared.length > Math.floor(Math.min(prev.length, cur.length) / 2) ? shared : null;
}
