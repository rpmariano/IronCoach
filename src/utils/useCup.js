import { useEffect, useMemo } from 'react';
import { useAppStore } from '../store';
import { lisbonTodayISO } from '../lib/utils';
import { pickCupEdition, readCupEnrolledHint } from '../store/cupSlice';
import {
  attendanceCount,
  classifyEnrollment,
  courseFor,
  cupCategoryFor,
  defaultDecision,
  nextCupRound,
  shouldShowCupDoor,
} from '@formulas/cup.ts';
import { cupRoundRoles } from '@formulas/cupRoles.ts';
import { editionTitle } from '../components/Run/CupDoorCard';
import { findRaceRun } from './run';
import { cupListingOf, cupRoundStatus, dateChangeLabel, roundChip } from './cupCalendar';

/* A competição por jornadas do atleta, pronta a mostrar (specs/trofeu.md
   §4.1–4.3, Fase 1). 2026-09-26.

   Devolve null quando não há nada a mostrar — sem edição aberta na área, com
   "Não me interessa", sem inscrição, M1 por aplicar, ou ainda a ler. É o caso
   de quase toda a gente, e aí o ecrã fica exatamente como era: quem monta o
   hook não desenha nada com null.

   O hook dispara a leitura base (loadCup) na primeira montagem e o catálogo
   da edição que a porta vai mostrar (loadCupCatalog). Não mexe em nenhuma
   outra fatia do store. As regras saem de @formulas/cup.ts — as mesmas que a
   Carol vai usar na Fase 2. */

/** A vista a partir do estado do store. Pura (exportada para os testes e
 *  para quem já tem os dados na mão).
 *
 *  Fase 3 (2026-09-27) — o ecrã do Troféu, a lista de Provas, o hub e o
 *  cartão diário leem daqui, sem nada mudar de nome nem de valor:
 *  `shortName`, `title`, `roundLabel`/`roundInitial`, `today`, `progress`
 *  (feitas / jornadas que contam), `aheadCount`, `undecidedCount`, `results`
 *  (a linha oficial do próprio e a coletiva do clube, por jornada), e em cada
 *  jornada `role`/`intent`/`intentSource` (o papel — cupRoundRoles, o mesmo
 *  cálculo da Carol, só com inscrição), `done`/`run`, `result`/`teamResult`,
 *  `chip` ("J3"), `dateChange` ("mudou de 17 para 24 jan") e `status` (a
 *  régua de cupCalendar.js). `nextRound` é a jornada enriquecida. */
export function buildCupView({ cup, profile, raceEvents, runs, today }) {
  if (!cup || cup.status !== 'ready') return null;
  const enrollments = cup.enrollments || [];
  const active = enrollments.find((e) => e?.status === 'ativa') || null;
  const edition = pickCupEdition(cup.editions, enrollments,
    (ed) => !!shouldShowCupDoor(ed, profile, cup.dismissals, active));
  if (!edition) return null;

  const doorKind = shouldShowCupDoor(edition, profile, cup.dismissals, active);
  const enrollment = active && active.edition_id === edition.id ? active : null;
  // Sem porta e sem inscrição: nada. Com inscrição, a vista existe mesmo que a
  // edição tenha deixado de estar aberta (o admin pode tê-la voltado atrás).
  if (!doorKind && !enrollment) return null;

  const catalog = cup.catalog?.[edition.id] || null;
  const catalogReady = catalog?.status === 'ready';
  const categories = catalog?.categories || [];
  const overrides = catalog?.overrides || [];
  const allCourses = catalog?.courses || [];
  const teams = catalog?.teams || [];
  const participations = enrollment ? (cup.participations || []).filter((p) => p.enrollment_id === enrollment.id) : [];
  const races = raceEvents || [];
  const competition = edition.competition || null;
  const roundLabel = String(competition?.round_label || '').trim() || 'Jornada';
  const sortedRounds = [...(catalog?.rounds || [])].sort((a, b) => (a.round_no ?? 0) - (b.round_no ?? 0));

  // O papel de cada jornada — só com inscrição (a quem não está inscrito não
  // se calcula nada). As mesmas linhas e a mesma função que o bloco da Carol.
  const roleOf = new Map();
  if (enrollment && catalogReady) {
    const roles = cupRoundRoles({
      edition, rounds: sortedRounds, participations, categories, courses: allCourses, overrides,
      races, runs, profile, seasonGoal: enrollment.season_goal ?? null, todayISO: today,
    });
    for (const r of roles) roleOf.set(r.roundId, r);
  }

  // A linha oficial do próprio e a coletiva do clube (lidas só com inscrição
  // ativa — cupSlice.readResults). Da inscrição certa, e só as confirmadas.
  // A coletiva só a do clube com que foi lida: quem mudou de clube não fica
  // com o resultado do antigo com o nome do novo.
  const res = enrollment && cup.results?.enrollmentId === enrollment.id ? cup.results : null;
  const byRound = {};
  for (const row of res?.rows || []) if (row?.round_id && row.match_status === 'confirmada') byRound[row.round_id] = row;
  const teamByRound = {};
  if (enrollment?.team_id && res?.teamId === enrollment.team_id) {
    for (const row of res.teamRows || []) if (row?.round_id) teamByRound[row.round_id] = row;
  }
  const roundIds = new Set(sortedRounds.map((r) => r.id));
  const ownRows = Object.values(byRound).filter((r) => roundIds.has(r.round_id));
  const withPoints = ownRows.filter((r) => r.points != null && Number.isFinite(Number(r.points)));
  const results = {
    status: enrollment ? (res?.status ?? 'idle') : 'idle',
    byRound,
    teamByRound,
    summary: { count: ownRows.length, points: withPoints.length ? withPoints.reduce((t, r) => t + Number(r.points), 0) : null },
  };

  const withRun = new Set((runs || []).map((r) => r?.race_id).filter(Boolean));
  const enriched = sortedRounds.map((round) => {
    const courses = allCourses.filter((c) => c.round_id === round.id);
    // O escalão na data DESTA jornada: um aniversário a meio da época muda-o.
    const category = cupCategoryFor(edition, categories, profile?.birth_date, profile?.gender, round.date);
    const participation = participations.find((p) => p.round_id === round.id) || null;
    const race = races.find((r) => r?.cup_round_id === round.id) || null;
    const role = roleOf.get(round.id) || null;
    const change = dateChangeLabel(round.previous_date, round.date, today);
    return {
      ...round,
      courses,
      category,
      course: courseFor(round, courses, overrides, category),
      participation,
      race,
      // A proposta da lista pré-marcada (§4.3). Só "Confirmar" a grava.
      suggestion: enrollment ? defaultDecision(enrollment.season_goal, round, races, today) : null,
      role,
      // A escolha dele manda; sem ela, o papel proposto.
      intent: participation?.intent ?? role?.intent ?? null,
      intentSource: participation?.intent != null ? (participation.intent_source ?? null) : role?.intent ? 'sugerida' : null,
      // Feita: a régua de attendanceCount (concluída, ou com corrida ligada).
      done: !!race && (race.status === 'concluida' || (race.id != null && withRun.has(race.id))),
      run: race ? findRaceRun(runs, race) : null,
      result: byRound[round.id] || null,
      teamResult: teamByRound[round.id] || null,
      chip: roundChip(round.round_no, roundLabel),
      dateChange: change ? { from: round.previous_date, to: round.date, label: change } : null,
    };
  });
  const next = nextCupRound(enriched, today);
  const rounds = enriched.map((r) => ({ ...r, status: cupRoundStatus(r, { today, nextRoundId: next?.id ?? null, roundLabel }) }));

  const nextRound = next ? rounds.find((r) => r.id === next.id) || null : null;
  const dated = rounds.filter((r) => r.date && r.date_status !== 'cancelada').map((r) => r.date).sort();
  const attendance = enrollment ? attendanceCount(edition, rounds, races, today, runs) : null;
  const previous = !enrollment ? enrollments.find((e) => e.edition_id === edition.id && e.status === 'saiu') || null : null;
  const counted = rounds.filter((r) => r.date_status !== 'cancelada');

  return {
    edition,
    competition,
    enrollment,
    // Saiu desta edição e pode voltar (a mesma linha reativa-se, §4.2).
    rejoin: !!previous,
    kind: enrollment ? classifyEnrollment(enrollment, teams) : null,
    door: doorKind ? {
      kind: doorKind,
      nextRound,
      // "11 provas de dezembro a junho": as não canceladas, e as datas que há.
      span: { count: rounds.filter((r) => r.date_status !== 'cancelada').length, from: dated[0] || null, to: dated[dated.length - 1] || null },
    } : null,
    rounds,
    participations,
    teams,
    categories,
    // O escalão na próxima jornada (ou hoje, sem jornadas).
    category: cupCategoryFor(edition, categories, profile?.birth_date, profile?.gender, nextRound?.date || today),
    nextRound,
    attendance,
    // O contador só com objetivo prémio (§4.3).
    showCounter: !!attendance && enrollment?.season_goal === 'premio',
    catalogReady,
    // 'idle' | 'loading' | 'ready' | 'erro' — o bloco de Provas distingue "a
    // ler" de "não deu".
    catalogStatus: catalog?.status ?? 'idle',
    // O catálogo inteiro da edição (para promotionPreview refazer os papéis).
    courses: allCourses,
    overrides,
    shortName: competition?.short_name || competition?.name || 'Troféu',
    title: editionTitle(edition, competition),
    roundLabel,
    roundInitial: roundLabel.charAt(0).toUpperCase() || 'J',
    today,
    // "Troféu 2 de 11": feitas / jornadas que contam (não canceladas). É
    // progresso, não a counting_rule (essa continua só com prémio).
    progress: { done: counted.filter((r) => r.done).length, total: counted.length },
    // Jornadas por correr (hoje ou depois, ou ainda sem data).
    aheadCount: counted.filter((r) => !r.date || r.date >= today).length,
    // Futuras com data, sem decisão — "Tens N jornadas por decidir".
    undecidedCount: enrollment
      ? counted.filter((r) => r.date && r.date >= today && r.participation?.decision == null).length
      : 0,
    results,
    // Sem estes, o servidor recusa a inscrição (§4.2.6): o ecrã pede-os antes.
    profileMissing: {
      gender: !(profile?.gender === 'F' || profile?.gender === 'M'),
      birthDate: !profile?.birth_date,
    },
  };
}

export function useCup() {
  const userId = useAppStore((s) => s.session?.user?.id || s.profile?.id || null);
  const cup = useAppStore((s) => s.cup);
  const profile = useAppStore((s) => s.profile);
  const raceEvents = useAppStore((s) => s.raceEvents);
  const runs = useAppStore((s) => s.runs);
  const loadCup = useAppStore((s) => s.loadCup);
  const loadCupCatalog = useAppStore((s) => s.loadCupCatalog);

  const needsLoad = !!userId && (cup.userId !== userId || cup.status === 'idle');
  useEffect(() => {
    if (needsLoad) loadCup().catch(() => {});
  }, [needsLoad, loadCup]);

  const today = lisbonTodayISO();
  const view = useMemo(
    () => (cup.userId === userId ? buildCupView({ cup, profile, raceEvents, runs, today }) : null),
    [cup, userId, profile, raceEvents, runs, today],
  );

  // O catálogo da edição que a porta mostra, uma vez (um erro não repete).
  const editionId = view?.edition?.id || null;
  const hasCatalog = !!(editionId && cup.catalog?.[editionId]);
  useEffect(() => {
    if (editionId && !hasCatalog) loadCupCatalog(editionId).catch(() => {});
  }, [editionId, hasCatalog, loadCupCatalog]);

  return view;
}

/* A competição para o Início (Fase 2, o mapa da época — specs/trofeu.md §5).
   Só interessa a quem está INSCRITO: devolve a vista de useCup apenas com
   inscrição ativa, e null em tudo o resto (convite, "Não me interessa",
   quem saiu, M1 por aplicar, ainda a ler).

   Ao contrário do useCup, não lê nada sem indício de inscrição: a pista
   local que a fatia escreve (cupSlice.js, readCupEnrolledHint) ou uma prova
   de jornada por correr nas provas que o store já tem. Sem indício, zero
   leituras — quem não está inscrito não ganha queries no Início (§5). Se a
   competição já estiver em memória (o ecrã de Provas leu-a), a vista monta-se
   dela sem ler nada. O catálogo só se pede para a edição da inscrição.

   Limite assumido: inscrito noutro dispositivo e sem nenhuma jornada "Vou"
   com prova criada, só vê o mapa depois de abrir Provas uma vez. */
export function useCupForHome() {
  const userId = useAppStore((s) => s.session?.user?.id || s.profile?.id || null);
  const cup = useAppStore((s) => s.cup);
  const profile = useAppStore((s) => s.profile);
  const raceEvents = useAppStore((s) => s.raceEvents);
  const runs = useAppStore((s) => s.runs);
  const loadCup = useAppStore((s) => s.loadCup);
  const loadCupCatalog = useAppStore((s) => s.loadCupCatalog);

  const today = lisbonTodayISO();
  // Lida em cada render (é só um getItem): a pista não é estado do React e a
  // leitura base reescreve-a.
  const hinted = cupHomeHint(userId, raceEvents, today);

  const needsLoad = hinted && !!userId && (cup.userId !== userId || cup.status === 'idle');
  useEffect(() => {
    if (needsLoad) loadCup().catch(() => {});
  }, [needsLoad, loadCup]);

  const view = useMemo(
    () => (userId && cup.userId === userId ? buildCupView({ cup, profile, raceEvents, runs, today }) : null),
    [cup, userId, profile, raceEvents, runs, today],
  );
  const enrolled = view?.enrollment ? view : null;

  // O catálogo da edição da inscrição, se ainda não estiver pedido (a leitura
  // base e a inscrição já o pedem; isto é a rede). Um erro não repete, como
  // no useCup.
  const editionId = enrolled?.edition?.id || null;
  const hasCatalog = !!(editionId && cup.catalog?.[editionId]);
  useEffect(() => {
    if (editionId && !hasCatalog) loadCupCatalog(editionId).catch(() => {});
  }, [editionId, hasCatalog, loadCupCatalog]);

  return enrolled;
}

/** O indício de inscrição do Início: a pista local, ou uma prova de jornada
 *  por correr nas provas que o store já tem. */
function cupHomeHint(userId, raceEvents, today) {
  return readCupEnrolledHint(userId)
    || (raceEvents || []).some((r) => r?.cup_round_id && r.status !== 'concluida' && typeof r.date === 'string' && r.date.slice(0, 10) >= today);
}

/* A competição para o hub de UMA prova (Fase 3, o bloco Troféu — specs/
   trofeu.md §4.5). Igual ao useCupForHome, mas o indício é a própria prova:
   só uma prova com `cup_round_id` lê alguma coisa. Para todas as outras
   provas — as de quem nunca se inscreveu, e as normais de quem está —,
   zero leituras e null: o hub fica como era.

   Devolve { view, round } (a vista do inscrito e a jornada desta prova) ou
   null (sem jornada, sem inscrição ativa, catálogo por ler, ou a jornada não
   é desta edição — uma prova de uma época anterior). */
export function useCupForRace(race) {
  const roundId = race?.cup_round_id || null;
  const userId = useAppStore((s) => s.session?.user?.id || s.profile?.id || null);
  const cup = useAppStore((s) => s.cup);
  const profile = useAppStore((s) => s.profile);
  const raceEvents = useAppStore((s) => s.raceEvents);
  const runs = useAppStore((s) => s.runs);
  const loadCup = useAppStore((s) => s.loadCup);
  const loadCupCatalog = useAppStore((s) => s.loadCupCatalog);

  const needsLoad = !!roundId && !!userId && (cup.userId !== userId || cup.status === 'idle');
  useEffect(() => {
    if (needsLoad) loadCup().catch(() => {});
  }, [needsLoad, loadCup]);

  const today = lisbonTodayISO();
  const view = useMemo(
    () => (roundId && userId && cup.userId === userId ? buildCupView({ cup, profile, raceEvents, runs, today }) : null),
    [roundId, cup, userId, profile, raceEvents, runs, today],
  );
  const enrolled = view?.enrollment ? view : null;

  const editionId = enrolled?.edition?.id || null;
  const hasCatalog = !!(editionId && cup.catalog?.[editionId]);
  useEffect(() => {
    if (editionId && !hasCatalog) loadCupCatalog(editionId).catch(() => {});
  }, [editionId, hasCatalog, loadCupCatalog]);

  const round = enrolled ? enrolled.rounds.find((r) => r.id === roundId) || null : null;
  return useMemo(() => (round ? { view: enrolled, round } : null), [enrolled, round]);
}

/* A lista de Provas e o "Para onde vou" com inscrição (Fase 3, §4.3): a vista
   do inscrito (useCupForHome — as mesmas leituras, só com indício) e o
   `listing` que groupRaces e o carrossel usam (cupListingOf).

   `listing` é null para quem não está inscrito e não tem indício: aí a lista
   e o cartão ficam exatamente como eram. Com indício e a leitura ainda em
   curso, as jornadas já saem das linhas normais (o cartão não pisca); se a
   leitura acabar sem inscrição (pista velha), o listing volta a null. */
export function useCupListing() {
  const view = useCupForHome();
  const userId = useAppStore((s) => s.session?.user?.id || s.profile?.id || null);
  const cupUserId = useAppStore((s) => s.cup.userId);
  const cupStatus = useAppStore((s) => s.cup.status);
  const raceEvents = useAppStore((s) => s.raceEvents);
  const today = lisbonTodayISO();
  const reading = cupUserId !== userId || cupStatus === 'idle' || cupStatus === 'loading';
  const pending = !view && !!userId && reading && cupHomeHint(userId, raceEvents, today);
  const listing = useMemo(() => cupListingOf(view, pending), [view, pending]);
  return { view, listing };
}

/** O mesmo hook, pelo nome em português. */
export const useTaca = useCup;

export default useCup;
