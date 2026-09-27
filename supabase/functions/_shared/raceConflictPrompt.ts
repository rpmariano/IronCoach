// O guião do conflito de principais no chat (specs/plano-vinculado-a-prova.md
// §4.4; a inversão é de specs/trofeu.md §4.3, Fase 3). 2026-09-27.
//
// Duas provas principais no mesmo bloco — o conflito que exige decisão.
// Chega pelo mesmo canal do check-in do plano (as ferramentas de propor já
// estão abertas), mas com um guião próprio: não é "o plano desviou-se", é
// "há uma escolha por fazer e sou eu que a tenho de pôr à frente dele". O
// tom está fixado aqui e não só na doutrina porque é o único sítio onde a
// Carol sabe QUAIS são as duas provas.
//
// O RAMO NORMAL é o texto que vivia em coach-chat/index.ts, movido tal e
// qual: sem inscrição na competição (cup null) sai byte a byte o mesmo
// (raceConflictPrompt.test.ts fixa o literal de antes da extração).
//
// O RAMO INVERTIDO: o plano prepara uma JORNADA que o atleta promoveu a
// principal e a outra prova é uma principal de fora. As principais de fora
// mandam sempre (§2.5), por isso a ordem das saídas troca — primeiro a
// jornada volta a secundária, depois (se ele quiser mesmo) a de fora passa a
// secundária. Nunca o dorsal, nunca terceiros.

export interface RaceConflictCup {
  /** SeriesBlock.jornadaRaceIds — as provas ligadas a jornadas desta edição. */
  jornadaRaceIds: string[];
  /** cup_competitions.short_name */
  competitionName: string;
  /** cup_competitions.round_label ("Jornada", "Etapa"…) */
  roundLabel: string;
}

interface RaceRef {
  id?: unknown;
  name?: unknown;
  date?: unknown;
}

// O id vai junto pela mesma razão do contexto das provas: as duas saídas que
// a Carol tem de propor (update_race_event, propose_training_plan) precisam
// dele, e sem o ter à frente ficava a adivinhar.
const rcName = (r: RaceRef | null | undefined) =>
  `"${String(r?.name || "prova").slice(0, 80)}" (${String(r?.date || "").slice(0, 10)}, id: ${String(r?.id || "?").slice(0, 40)})`;

/** O guião, ou null sem conflito (sem `race_conflict` no pedido, ou sem
 *  provas). `rc` é o `body.race_conflict` do pedido, tal como chegou. */
export function buildRaceConflictPrompt(rc: unknown, cup: RaceConflictCup | null): string | null {
  const conflict = rc && typeof rc === "object" ? rc as { target?: RaceRef | null; races?: unknown } : null;
  const rcRaces: RaceRef[] = Array.isArray(conflict?.races) ? (conflict!.races as RaceRef[]).slice(0, 4) : [];
  if (!conflict || rcRaces.length === 0) return null;

  const target = conflict.target ?? null;
  const jornadaIds = new Set((cup?.jornadaRaceIds || []).map(String));
  const targetIsJornada = !!cup && target?.id != null && jornadaIds.has(String(target.id));
  const outside = rcRaces.filter((r) => !(r?.id != null && jornadaIds.has(String(r.id))));

  if (targetIsJornada && outside.length > 0) {
    const l = String(cup!.roundLabel || "Jornada").toLowerCase();
    const one = outside.length === 1;
    return `A app detetou um conflito de calendário e chamou-te — o atleta abriu o chat a partir desse aviso. ` +
      `O plano dele prepara ${rcName(target)}, uma ${l} da competição ${cup!.competitionName} que ele promoveu a principal, e ` +
      `${one ? "a prova" : "as provas"} ${outside.map(rcName).join(", ")} ` +
      `${one ? "é principal e cai" : "são principais e caem"} a meio desse plano. ` +
      `Explica-lhe em duas frases porque é que isto não pode ficar assim: uma prova principal pede 10 a 21 dias de polimento, ` +
      `e dois polimentos dentro do mesmo bloco são incompatíveis — treinar a sério para uma é chegar mal à outra. ` +
      `As principais de fora mandam sempre: põe-lhe as duas saídas, por esta ordem e sem escolher por ele: ` +
      `(1) a ${l} volta a secundária — ofereces-te para a mudares já tu (update_race_event, race_priority="b", no id dela) e propões um plano novo até ${one ? "essa prova" : "à primeira delas"} (propose_training_plan com o race_id dela, period_end no dia dela, replace_active_plan=true); ` +
      `(2) passar ${one ? "essa prova" : "essas provas"} a secundária e o plano continua a preparar a ${l} (update_race_event, race_priority="b"). ` +
      `Tenta, mas não insistas mais do que uma vez: se ele disser que quer mesmo manter tudo como está, aceita sem julgar, ` +
      `garante que percebeu o custo e chama update_race_event com conflict_acknowledged=true para eu parar de perguntar. ` +
      `A decisão é dele; o teu trabalho é que seja informada.`;
  }

  return `A app detetou um conflito de calendário e chamou-te — o atleta abriu o chat a partir desse aviso. ` +
    `${rcRaces.length === 1 ? "A prova" : "As provas"} ${rcRaces.map(rcName).join(", ")} ` +
    `${rcRaces.length === 1 ? "está marcada" : "estão marcadas"} como PRINCIPAL e ` +
    `${rcRaces.length === 1 ? "cai" : "caem"} a meio do plano que prepara ${conflict.target ? rcName(conflict.target) : "a prova-objetivo"}. ` +
    `Explica-lhe em duas frases porque é que isto não pode ficar assim: uma prova principal pede 10 a 21 dias de polimento, ` +
    `e dois polimentos dentro do mesmo bloco são incompatíveis — treinar a sério para uma é chegar mal à outra. ` +
    `Põe-lhe as duas saídas, por esta ordem e sem escolher por ele: ` +
    `(1) passar ${rcRaces.length === 1 ? "essa prova" : "essas provas"} a secundária e ela entra no plano como treino de qualidade — ofereces-te para a mudares já tu (update_race_event, race_priority="b") e propões o plano ajustado; ` +
    `(2) mudar o objetivo para ${rcRaces.length === 1 ? "essa prova" : "a primeira delas"}, e então propões um plano novo até ao dia dela (propose_training_plan com o race_id dela, period_end no dia dela, replace_active_plan=true). ` +
    `Tenta, mas não insistas mais do que uma vez: se ele disser que quer mesmo manter tudo como está, aceita sem julgar, ` +
    `garante que percebeu o custo e chama update_race_event com conflict_acknowledged=true para eu parar de perguntar. ` +
    `A decisão é dele; o teu trabalho é que seja informada.`;
}
