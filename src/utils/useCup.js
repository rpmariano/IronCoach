import { useEffect, useMemo } from 'react';
import { useAppStore } from '../store';
import { lisbonTodayISO } from '../lib/utils';
import { pickCupEdition } from '../store/cupSlice';
import {
  attendanceCount,
  classifyEnrollment,
  courseFor,
  cupCategoryFor,
  defaultDecision,
  nextCupRound,
  shouldShowCupDoor,
} from '@formulas/cup.ts';

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
 *  para quem já tem os dados na mão). */
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

  const rounds = [...(catalog?.rounds || [])]
    .sort((a, b) => (a.round_no ?? 0) - (b.round_no ?? 0))
    .map((round) => {
      const courses = allCourses.filter((c) => c.round_id === round.id);
      // O escalão na data DESTA jornada: um aniversário a meio da época muda-o.
      const category = cupCategoryFor(edition, categories, profile?.birth_date, profile?.gender, round.date);
      return {
        ...round,
        courses,
        category,
        course: courseFor(round, courses, overrides, category),
        participation: participations.find((p) => p.round_id === round.id) || null,
        race: races.find((r) => r?.cup_round_id === round.id) || null,
        // A proposta da lista pré-marcada (§4.3). Só "Confirmar" a grava.
        suggestion: enrollment ? defaultDecision(enrollment.season_goal, round, races, today) : null,
      };
    });

  const nextRound = nextCupRound(rounds, today);
  const dated = rounds.filter((r) => r.date && r.date_status !== 'cancelada').map((r) => r.date).sort();
  const attendance = enrollment ? attendanceCount(edition, rounds, races, today, runs) : null;
  const previous = !enrollment ? enrollments.find((e) => e.edition_id === edition.id && e.status === 'saiu') || null : null;

  return {
    edition,
    competition: edition.competition || null,
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

/** O mesmo hook, pelo nome em português. */
export const useTaca = useCup;

export default useCup;
