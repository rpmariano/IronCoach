// Competições por jornadas — as regras puras do lado do atleta (specs/trofeu.md
// §4.1–4.3 e §10, Fase 1). 2026-09-26.
//
// PORQUÊ AQUI. O comportamento sai de funções puras em @formulas para a UI e a
// Carol usarem as mesmas (§1): o cartão de Provas, o ecrã de inscrição, a
// lista de jornadas pré-marcadas e, na Fase 2, o bloco TROFÉU do prompt. O
// código não sabe o que é Cascais — tudo o que muda de uma competição para a
// outra vem das colunas da edição (cup_editions), e os testes correm as mesmas
// funções sobre uma 2.ª competição fictícia com valores diferentes em todas as
// colunas (cup.fixtures.ts).
//
// ESPELHO DA BD. cupCategoryFor + courseFor repetem, no cliente, a escolha que
// a sincronização faz no servidor (cup_resolve_course na migração
// 20260926152856_cup_competitions.sql): o que o ecrã mostra como "o teu
// percurso" tem de ser a distância da prova que o servidor cria. Se uma das
// duas mudar, muda a outra — os testes de cup.test.ts fixam os mesmos casos
// que o ensaio da migração.

import { racePriorityOf } from "./mainRace.ts";

// ── Formas de dados (as colunas da M1 que estas funções leem) ─────────────

export type EditionStatus = "por_anunciar" | "aberta" | "encerrada";
export type DateStatus = "provavel" | "confirmada" | "adiada" | "cancelada";
export type SeasonGoal = "participar" | "premio" | "pontos_clube" | "marcas";
export type Decision = "vou" | "nao_vou" | "nao_sei" | "nao_fui";
export type EnrollmentKind =
  | "clube_elegivel"
  | "individual_elegivel"
  | "individual_aberto"
  | "clube_aberto"
  | "clube_por_confirmar";

export interface CupEdition {
  id: string;
  status?: EditionStatus | string | null;
  counting_rule?: "pct_minima" | "melhores_n" | "todas" | string | null;
  counting_value?: number | string | null;
  age_rule?: "data_prova" | "fim_ano_civil" | string | null;
  area_lat?: number | null;
  area_lon?: number | null;
  area_radius_km?: number | string | null;
  [k: string]: unknown;
}

export interface CupTeam {
  id: string;
  edition_id?: string | null;
  kind?: "clube" | "individual" | string | null;
  eligible_final?: boolean | null;
  [k: string]: unknown;
}

export interface CupCategory {
  id?: string;
  edition_id?: string | null;
  code: string;
  gender?: "F" | "M" | string | null;
  min_age?: number | null;
  max_age?: number | null;
  course_code?: string | null;
  [k: string]: unknown;
}

export interface CupRound {
  id: string;
  edition_id?: string | null;
  round_no?: number | null;
  date?: string | null;
  date_status?: DateStatus | string | null;
  [k: string]: unknown;
}

export interface CupCourse {
  id?: string;
  round_id?: string | null;
  code: string;
  distance_m?: number | null;
  start_time?: string | null;
  [k: string]: unknown;
}

export interface CupCourseOverride {
  round_id: string;
  category_code: string;
  course_code: string;
}

export interface EnrollmentChoice {
  team_id?: string | null;
  team_other?: string | null;
  is_federated?: boolean | null;
}

export interface RaceLike {
  id?: string | null;
  name?: string | null;
  date?: string | null;
  status?: string | null;
  race_priority?: string | null;
  cup_round_id?: string | null;
}

// ── Utilitários de datas (strings ISO, sem fusos) ─────────────────────────

function dayOf(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

/** Idade em anos completos numa data — a mesma conta do `age()` do Postgres
 *  que a sincronização usa (29/2 faz anos a 1/3 nos anos comuns). */
export function ageOn(birthDate: string | null | undefined, onDate: string | null | undefined): number | null {
  const b = dayOf(birthDate);
  const d = dayOf(onDate);
  if (!b || !d) return null;
  const [by, bm, bd] = b.split("-").map(Number);
  const [dy, dm, dd] = d.split("-").map(Number);
  let age = dy - by;
  if (dm < bm || (dm === bm && dd < bd)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

// ── §4.2: o tipo de inscrição ─────────────────────────────────────────────

/** Porque é que uma escolha de clube não serve (o ecrã diz a frase; a BD
 *  recusa na mesma — cup_enrollments_validate e a FK composta). */
export type EnrollmentChoiceError = "falta_clube" | "dois_clubes" | "federado_individual" | "clube_de_outra_edicao";

export function enrollmentChoiceError(
  choice: EnrollmentChoice | null | undefined,
  teams: CupTeam[] | null | undefined,
  editionId?: string | null,
): EnrollmentChoiceError | null {
  const teamId = choice?.team_id || null;
  const other = (choice?.team_other || "").trim() || null;
  if (teamId && other) return "dois_clubes";
  if (!teamId && !other) return "falta_clube";
  if (teamId) {
    const team = (teams || []).find((t) => t?.id === teamId);
    if (!team || (editionId && team.edition_id && team.edition_id !== editionId)) return "clube_de_outra_edicao";
    if (choice?.is_federated && team.kind === "individual") return "federado_individual";
  }
  return null;
}

/** O que a inscrição dá, conforme o clube (§4.2.1). `eligible_final` null é
 *  "por confirmar": até ao regulamento nenhum clube se dá como elegível
 *  (§11.3), e a app nunca promete um prémio que não sabe se existe.
 *
 *  - clube da lista, elegível → 'clube_elegivel'; não elegível → 'clube_aberto';
 *    por confirmar → 'clube_por_confirmar';
 *  - "não está na lista" (team_other) → 'clube_por_confirmar': o admin ainda
 *    não o ligou a um clube (§6.3);
 *  - Individual elegível → 'individual_elegivel'; não elegível OU por
 *    confirmar → 'individual_aberto' (decisão 2026-09-26: a spec não tem
 *    "individual_por_confirmar", e na dúvida não se promete o prémio).
 *
 *  null quando a escolha não serve (ver enrollmentChoiceError): o ecrã pede o
 *  clube antes de dizer o que a inscrição dá. */
export function classifyEnrollment(
  choice: EnrollmentChoice | null | undefined,
  teams: CupTeam[] | null | undefined,
): EnrollmentKind | null {
  if (enrollmentChoiceError(choice, teams)) return null;
  if (!choice?.team_id) return "clube_por_confirmar";
  const team = (teams || []).find((t) => t?.id === choice.team_id)!;
  if (team.kind === "individual") return team.eligible_final === true ? "individual_elegivel" : "individual_aberto";
  if (team.eligible_final === true) return "clube_elegivel";
  if (team.eligible_final === false) return "clube_aberto";
  return "clube_por_confirmar";
}

// ── §3.5: escalão e percurso ──────────────────────────────────────────────

/** A data de referência da idade: o dia da prova, ou 31/12 desse ano com
 *  `age_rule = 'fim_ano_civil'`. `null` = no dia da prova (decisão da M1;
 *  só decide o percurso, a classificação por escalão vem da fonte oficial). */
export function ageReferenceDate(edition: CupEdition | null | undefined, onDate: string | null | undefined): string | null {
  const d = dayOf(onDate);
  if (!d) return null;
  return edition?.age_rule === "fim_ano_civil" ? `${d.slice(0, 4)}-12-31` : d;
}

/** O escalão do atleta numa data (§3.5, espelho de cup_resolve_course): o
 *  mais específico que bate — com género antes de misto, a faixa de idades
 *  mais estreita primeiro, e o código a desempatar. Sem idade ou sem género,
 *  só batem escalões sem esse critério (nunca se assume o género, §2.4).
 *  `onDate` null (jornada sem data) conta como hoje, como no servidor. */
export function cupCategoryFor(
  edition: CupEdition | null | undefined,
  categories: CupCategory[] | null | undefined,
  birthDate: string | null | undefined,
  gender: string | null | undefined,
  onDate: string | null | undefined,
): CupCategory | null {
  const ref = ageReferenceDate(edition, dayOf(onDate) ?? new Date().toISOString().slice(0, 10));
  const age = ageOn(birthDate, ref);
  const g = gender === "F" || gender === "M" ? gender : null;
  const fits = (categories || []).filter((c) => {
    if (!c || !c.code) return false;
    if (edition?.id && c.edition_id && c.edition_id !== edition.id) return false;
    if (c.gender != null && c.gender !== g) return false;
    if (c.min_age != null && (age == null || c.min_age > age)) return false;
    if (c.max_age != null && (age == null || c.max_age < age)) return false;
    return true;
  });
  if (!fits.length) return null;
  const width = (c: CupCategory) => (c.max_age ?? 200) - (c.min_age ?? 0);
  return [...fits].sort((a, b) =>
    Number(a.gender == null) - Number(b.gender == null) || width(a) - width(b) || a.code.localeCompare(b.code)
  )[0];
}

/** O percurso do atleta numa jornada (§3.5, espelho de cup_resolve_course):
 *  a exceção da jornada para o escalão → o percurso do escalão → se nenhum
 *  destes existe NESTA jornada, o percurso único dela. null = não se sabe
 *  (o servidor deixa o "Vou" à espera e o ecrã não inventa uma distância). */
export function courseFor(
  round: CupRound | null | undefined,
  courses: CupCourse[] | null | undefined,
  overrides: CupCourseOverride[] | null | undefined,
  category: CupCategory | null | undefined,
): CupCourse | null {
  if (!round?.id) return null;
  const mine = (courses || []).filter((c) => c && (c.round_id == null || c.round_id === round.id));
  let code: string | null = null;
  if (category?.code) {
    const ov = (overrides || []).find((o) => o && o.round_id === round.id && o.category_code === category.code);
    code = ov?.course_code ?? category.course_code ?? null;
  }
  const byCode = code ? mine.find((c) => c.code === code) : undefined;
  if (byCode) return byCode;
  return mine.length === 1 ? mine[0] : null;
}

// ── §4.1: a porta em Provas ───────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371.0088;

/** Distância em km pelo grande círculo. Chega para "estás a ≤ 25 km da área"
 *  — não é navegação. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export type CupDoorKind = "convite" | "inscrito";

/** Se o cartão da competição aparece no fim de Provas, e qual (§4.1).
 *  Devolve null (nada muda no ecrã), 'convite' (não inscrito: "Inscrever-me"
 *  / "Não me interessa") ou 'inscrito' (a próxima jornada).
 *
 *  - Inscrição ATIVA nesta edição → 'inscrito', sempre (menos `encerrada`):
 *    quem se inscreveu não perde o caminho para o Troféu — para gerir ou
 *    sair — por ter treinado noutra cidade, por ter dito "Não me interessa"
 *    antes, ou porque o admin voltou a edição a `por_anunciar` (revisão
 *    pré-deploy da Fase 1, 2026-09-26: antes, o estado era visto primeiro).
 *  - Sem inscrição, só com a edição `aberta`: `por_anunciar` e `encerrada`
 *    não abrem porta.
 *  - Dispensa desta edição → null.
 *  - Local de treino a ≤ area_radius_km da área (haversine), OU sem local de
 *    treino no perfil → 'convite'.
 *  - Edição sem área definida → null (decisão 2026-09-26): sem área não há
 *    como saber a quem interessa, e quem não corre o circuito não pode notar
 *    diferença nenhuma (§1). O admin define a área antes de abrir.
 *  - Perfil ainda por carregar → null (não pisca um convite que depois some).
 *  - Quem SAIU (status 'saiu') volta a ver o convite pela mesma regra — é por
 *    aí que "voltar na mesma época reativa a mesma linha" (§4.2).
 *
 *  `dismissals` aceita as linhas de cup_edition_dismissals ou só os ids. */
export function shouldShowCupDoor(
  edition: CupEdition | null | undefined,
  profile: { training_lat?: number | null; training_lon?: number | null } | null | undefined,
  dismissals: Array<{ edition_id?: string | null } | string> | null | undefined,
  enrollment: { edition_id?: string | null; status?: string | null } | null | undefined,
): CupDoorKind | null {
  if (!edition?.id) return null;
  if (
    edition.status !== "encerrada" &&
    enrollment && enrollment.status === "ativa" && enrollment.edition_id === edition.id
  ) return "inscrito";
  if (edition.status !== "aberta") return null;
  if (!profile) return null;
  const dismissed = (dismissals || []).some((d) => (typeof d === "string" ? d : d?.edition_id) === edition.id);
  if (dismissed) return null;
  const aLat = num(edition.area_lat), aLon = num(edition.area_lon), radius = num(edition.area_radius_km);
  if (aLat == null || aLon == null || radius == null) return null;
  const pLat = num(profile.training_lat), pLon = num(profile.training_lon);
  if (pLat == null || pLon == null) return "convite";
  return haversineKm(pLat, pLon, aLat, aLon) <= radius ? "convite" : null;
}

// ── §4.3: a pré-marcação ──────────────────────────────────────────────────

export type DefaultDecisionReason = "principal" | "cancelada" | "passada" | null;

export interface DefaultDecision<R extends RaceLike = RaceLike> {
  /** A decisão pré-marcada. Nada é gravado — só "Confirmar" grava (§4.3). */
  decision: "vou" | "nao_vou" | null;
  /** Porquê, quando não é o óbvio: 'principal' = há uma principal tua nesse
   *  dia ("⚠ dia da tua Meia (principal)"). */
  reason: DefaultDecisionReason;
  /** A principal que colide, para o ecrã dizer o nome dela. */
  principal: R | null;
}

/** A decisão por omissão de uma jornada na lista pré-marcada (§4.3).
 *
 *  - Pré-marca 'vou' SÓ com objetivo `premio` ou `pontos_clube`: aí faltar
 *    tem custo (contador, pontos do clube). Com `participar`/`marcas` a
 *    jornada fica por decidir — a app não decide o calendário de quem só
 *    quer correr algumas.
 *  - As principais de fora mandam sempre (§2.5): uma prova `a` sem jornada
 *    no mesmo dia → 'nao_vou' com o motivo, seja qual for o objetivo. Vale
 *    também com data provável (a pré-marcação é só uma proposta; o servidor
 *    volta a decidir quando a data for confirmada).
 *  - Cancelada, ou já passada (com `todayISO`) → por decidir, sem proposta.
 *
 *  `principalRaces` pode ser a lista inteira de race_events do atleta: só
 *  contam as `a` (a falta de prioridade conta como `a`, o default da coluna)
 *  sem jornada ligada e ainda não concluídas.
 *
 *  A mesma régua do servidor (cup_principal_collision e a colisão em
 *  cup_sync_participation, na M1): só jornadas de hoje em diante, só
 *  principais por concluir. Se uma mudar, muda a outra (revisão da Fase 1,
 *  2026-09-26). */
export function defaultDecision<R extends RaceLike>(
  seasonGoal: SeasonGoal | string | null | undefined,
  round: CupRound | null | undefined,
  principalRaces: R[] | null | undefined,
  todayISO?: string | null,
): DefaultDecision<R> {
  const none: DefaultDecision<R> = { decision: null, reason: null, principal: null };
  if (!round) return none;
  if (round.date_status === "cancelada") return { ...none, reason: "cancelada" };
  const day = dayOf(round.date);
  const today = dayOf(todayISO);
  if (day && today && day < today) return { ...none, reason: "passada" };
  if (day) {
    const principal = (principalRaces || []).find((r) =>
      r && dayOf(r.date) === day && racePriorityOf(r) === "a" && !r.cup_round_id && r.status !== "concluida"
    );
    if (principal) return { decision: "nao_vou", reason: "principal", principal };
  }
  if (seasonGoal === "premio" || seasonGoal === "pontos_clube") return { decision: "vou", reason: null, principal: null };
  return none;
}

// ── §4.3: o contador ("70%: 8 de 11", "feitas 2 · ainda podes faltar a 2") ─

/** Como se arredonda a percentagem mínima: para cima (11 × 70% = 7,7 → 8,
 *  o "8 de 11" da spec). A CONFIRMAR no regulamento da 34.ª (§11.3) — o
 *  resultado leva `rounding: 'a_confirmar'` para o ecrã e a Carol o dizerem
 *  com cautela. */
export const ATTENDANCE_ROUNDING = "ceil" as const;

export interface AttendanceCount {
  rule: "pct_minima" | "melhores_n" | "todas";
  /** Jornadas que contam (as não canceladas). */
  total: number;
  /** Presenças mínimas para entrar na classificação final. */
  required: number;
  /** Feitas: jornadas com a prova do atleta concluída (ou com corrida ligada). */
  done: number;
  /** Faltam: presenças ainda precisas (0 quando já chegou). */
  missing: number;
  /** Jornadas ainda por correr (não canceladas, hoje ou depois, ou sem data). */
  ahead: number;
  /** "Ainda podes faltar a N" — das que faltam correr. 0 quando já não chega. */
  canMiss: number;
  /** Ainda dá para chegar ao mínimo. */
  reachable: boolean;
  /** Só a regra `pct_minima` arredonda; aí vem 'a_confirmar'. */
  rounding: "a_confirmar" | null;
}

/** O contador face à `counting_rule` da edição (§4.3). null quando a regra
 *  não se conhece (a Carol e o ecrã calam o argumento, §3.1).
 *
 *  - `pct_minima` (valor em %): mínimo = ⌈total × valor / 100⌉;
 *  - `melhores_n`: contam as N melhores — o mínimo para uma pontuação
 *    completa é N (limitado ao total);
 *  - `todas`: todas.
 *
 *  Uma jornada está FEITA quando a race_events dela (cup_round_id) está
 *  `concluida` ou tem uma corrida ligada (`runs.race_id`) — a mesma régua do
 *  servidor (cup_race_is_done). "Por decidir" e "Não vou" futuros não contam
 *  como faltas: ainda são jornadas pela frente. */
export function attendanceCount(
  edition: CupEdition | null | undefined,
  rounds: CupRound[] | null | undefined,
  races: RaceLike[] | null | undefined,
  todayISO: string,
  runs?: Array<{ race_id?: string | null }> | null,
): AttendanceCount | null {
  const rule = edition?.counting_rule;
  if (rule !== "pct_minima" && rule !== "melhores_n" && rule !== "todas") return null;
  const value = num(edition?.counting_value);
  if (rule !== "todas" && (value == null || value <= 0)) return null;

  const counted = (rounds || []).filter((r) => r && r.date_status !== "cancelada");
  const total = counted.length;
  let required: number;
  if (rule === "pct_minima") required = Math.ceil((total * value!) / 100 - 1e-9);
  else if (rule === "melhores_n") required = Math.min(Math.floor(value!), total);
  else required = total;

  const withRun = new Set((runs || []).map((r) => r?.race_id).filter(Boolean));
  const doneRounds = new Set(
    (races || [])
      .filter((x) => x?.cup_round_id && (x.status === "concluida" || (x.id != null && withRun.has(x.id))))
      .map((x) => x.cup_round_id),
  );
  const today = dayOf(todayISO) ?? "";
  let done = 0;
  let ahead = 0;
  for (const r of counted) {
    if (doneRounds.has(r.id)) done += 1;
    else if (!dayOf(r.date) || dayOf(r.date)! >= today) ahead += 1;
  }
  const missing = Math.max(0, required - done);
  const canMiss = Math.max(0, ahead - missing);
  return {
    rule,
    total,
    required,
    done,
    missing,
    ahead,
    canMiss,
    reachable: ahead >= missing,
    rounding: rule === "pct_minima" ? "a_confirmar" : null,
  };
}

// ── A próxima jornada (o cartão de inscrito, §4.1) ────────────────────────

/** A próxima jornada: a de número mais baixo que não está cancelada e é
 *  hoje ou depois (ou ainda sem data). Por número, não por data: uma jornada
 *  sem data continua a ter o seu lugar no calendário. */
export function nextCupRound<T extends CupRound>(rounds: T[] | null | undefined, todayISO: string): T | null {
  const today = dayOf(todayISO) ?? "";
  const ahead = (rounds || []).filter((r) =>
    r && r.date_status !== "cancelada" && (!dayOf(r.date) || dayOf(r.date)! >= today)
  );
  if (!ahead.length) return null;
  return [...ahead].sort((a, b) =>
    (a.round_no ?? 0) - (b.round_no ?? 0) || (dayOf(a.date) ?? "9999").localeCompare(dayOf(b.date) ?? "9999")
  )[0];
}
