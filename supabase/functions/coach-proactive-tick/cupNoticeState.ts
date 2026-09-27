// O estado dos avisos do Troféu, lido EM LOTE uma vez por execução do tick
// (specs/trofeu.md §8, Fase 5). Nunca rejeita.
//
// Para toda a gente hoje (nenhuma edição com os avisos ligados), é UMA
// leitura por execução (cup_editions) e nada mais: o tick fica como era.
// Depois, só quem está inscrito numa edição ligada e ligou algum aviso.
//
// Falhas: as leituras de que o regime depende (edição, inscrição, jornadas,
// participações, provas) deixam o mapa vazio — o tick volta ao de hoje para
// toda a gente. Uma acessória que falha (notificações enviadas, balanços
// entregues, vistas na app, auditoria, publicação, corridas) só cala os
// avisos que dependem dela (CupNoticeState.parts) — nunca um `continue` que
// calasse os outros momentos do atleta. Sem as notificações enviadas, as
// race_* de jornada ficam como no teto (cupNotices.ts, capped).
//
// Páginas: o PostgREST corta cada resposta nas 1000 linhas (db-max-rows), sem
// erro. As leituras que crescem com a época (inscrições, participações,
// provas, notificações, balanços, vistas, corridas) vão por páginas, com
// ordem total, até esgotar (readAll) — uma contagem cortada deixava passar o
// teto. Acima de CUP_READ_MAX_PAGES páginas, é uma leitura falhada.
//
// O papel sugerido (só no regime). As regras de jornada e os avisos usam a
// intenção EFETIVA — a gravada ou, sem ela, a que cupRoundRoles sugere, como
// a app (cupNotices.ts, effectiveIntentOf). Para a calcular, e só para quem
// está no regime (cupRegimeWanted), lê-se mais: os escalões e os percursos
// das jornadas (cup_categories, cup_round_courses,
// cup_round_course_overrides), as provas dele que mexem nos papéis
// (race_events com jornada, ou desde hoje − CUP_ROLE_RACES_FROM_DAYS), o
// perfil (nascimento, género, nível) e as corridas das provas de jornada
// (runs — o "feita"; antes só com a classificação ligada). A edição e a
// inscrição levam mais uma coluna cada (age_rule, season_goal) e a
// participação o intent_source — sem leituras novas. Uma destas leituras que
// falhe (parts.roles; ou runs) deixa só a intenção gravada: as jornadas sem
// ela ficam sem manhã de regime nem avisos. Quem só tem o calendário ligado
// não lê nada disto.
//
// Privacidade: colunas uma a uma, nunca `*`, nunca o dorsal, a posição, os
// pontos nem o clube — o tick nem lê cup_results. Os logs levam só a
// mensagem do erro: nunca ids, nomes ou linhas.

// deno-lint-ignore-file no-explicit-any
import { isCupSchemaMissing } from "../_shared/seriesBlock.ts";
import {
  CUP_DATE_CHANGE_SEEN_DAYS,
  CUP_NOTICE_TRIGGERS,
  CUP_ROLE_RACES_FROM_DAYS,
  type CupNoticeState,
  cupRegimeWanted,
  raceAfterReachedAtOf,
  roundPushCountsOf,
} from "../_shared/formulas/cupNotices.ts";

export interface CupTickState {
  byUser: Map<string, CupNoticeState>;
  /** A BD recusou um cup_* nesta execução (a M3 por aplicar): sem avisos. */
  noticesOff: boolean;
}

/** Os balanços de prova entregues que se leem: chega para qualquer jornada
 *  cuja classificação ainda é notícia (D + 13) com a corrida dos 7 dias. */
export const CUP_RACE_AFTER_LOOKBACK_DAYS = 45;

/** O db-max-rows do PostgREST (o mesmo PAGE do cup-standings-sync). */
export const CUP_READ_PAGE = 1000;
/** Mais do que isto numa leitura é anormal: trata-se como falhada. */
export const CUP_READ_MAX_PAGES = 20;

const EDITION_COLUMNS =
  "id, status, season_label, entry_mode, time_zone, notifications_enabled, age_rule, competition:cup_competitions(short_name, round_label)";
const ENROLLMENT_COLUMNS =
  "id, user_id, edition_id, status, joined_at, entry_by, season_goal, notify_calendar, notify_date_changes, notify_entry_deadline, notify_results";
const ROUND_COLUMNS = "id, edition_id, round_no, name, date, date_status, previous_date, date_changed_at, entry_deadline_at";
const PARTICIPATION_COLUMNS = "enrollment_id, round_id, decision, intent, intent_source, entry_done_at, decided_at";
// As colunas da ordem vão todas no select: a ordem total é a chave primária
// (ou a única) de cada tabela.
const RACE_COLUMNS = "id, user_id, cup_round_id, race_priority";
// O papel sugerido (só no regime): as colunas que cupRoundRoles lê — as
// mesmas do bloco da Carol (seriesBlock.ts), sem o nome das provas.
const ROLE_RACE_COLUMNS = "id, user_id, date, distance_km, race_type, race_priority, status, cup_round_id";
const CATEGORY_COLUMNS = "id, edition_id, code, gender, min_age, max_age, course_code";
const COURSE_COLUMNS = "id, round_id, code, distance_m";
const OVERRIDE_COLUMNS = "round_id, category_code, course_code";
const PROFILE_COLUMNS = "id, birth_date, gender, experience_level";
const NOTIFY_ANY = "notify_calendar.eq.true,notify_date_changes.eq.true,notify_entry_deadline.eq.true,notify_results.eq.true";

function addDaysISO(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

function warnRead(what: string, error: any): void {
  if (!isCupSchemaMissing(error)) console.warn(`coach-proactive-tick: avisos do Troféu, ${what} não lido(s):`, error?.message ?? String(error));
}

const EMPTY = { data: [], error: null };

/** Todas as linhas de uma leitura, em páginas de CUP_READ_PAGE, pela ordem
 *  `order` (uma ordem total — sem ela, as páginas podiam repetir ou saltar
 *  linhas). `make` monta a consulta de novo em cada página. Nunca rejeita
 *  por si: um erro numa página é o erro da leitura. */
export async function readAll(make: () => any, order: string[]): Promise<{ data: any[]; error: any }> {
  const rows: any[] = [];
  for (let page = 0; page < CUP_READ_MAX_PAGES; page++) {
    let q = make();
    for (const col of order) q = q.order(col, { ascending: true });
    const from = page * CUP_READ_PAGE;
    const r = await q.range(from, from + CUP_READ_PAGE - 1);
    if (r?.error) return { data: [], error: r.error };
    const got: any[] = Array.isArray(r?.data) ? r.data : [];
    rows.push(...got);
    if (got.length < CUP_READ_PAGE) return { data: rows, error: null };
  }
  return { data: [], error: { message: `mais de ${CUP_READ_MAX_PAGES} páginas` } };
}

export async function loadCupNoticeState(sb: any, userIds: string[], now: Date, todayISO: string): Promise<CupTickState> {
  const out: CupTickState = { byUser: new Map(), noticesOff: false };
  if (!userIds.length) return out;
  try {
    // Q0 — o porteiro: as edições com os avisos ligados. Para toda a gente
    // hoje, a única leitura.
    const edR = await sb.from("cup_editions").select(EDITION_COLUMNS)
      .eq("notifications_enabled", true).neq("status", "encerrada");
    if (edR.error) {
      warnRead("edições", edR.error);
      return out;
    }
    const editions: any[] = (edR.data || []).filter((e: any) => e?.id);
    if (!editions.length) return out;
    const editionIds = editions.map((e) => e.id);

    // Q1 — as inscrições ativas destes atletas com algum aviso ligado.
    const enrR = await readAll(() =>
      sb.from("cup_enrollments").select(ENROLLMENT_COLUMNS)
        .in("edition_id", editionIds).in("user_id", userIds).eq("status", "ativa").or(NOTIFY_ANY), ["id"]);
    if (enrR.error) {
      warnRead("inscrições", enrR.error);
      return out;
    }
    const enrollments: any[] = (enrR.data || []).filter((e: any) => e?.id && e.user_id && e.edition_id);
    if (!enrollments.length) return out;

    const users = [...new Set(enrollments.map((e) => e.user_id as string))];
    const editionById = new Map(editions.map((e) => [e.id as string, e]));
    // No regime (um aviso de jornada que se aplique a ele): só a esses se lê
    // o que o papel sugerido precisa.
    const inRegime = (e: any) =>
      cupRegimeWanted(editionById.get(e.edition_id)?.entry_mode ?? null, {
        entryBy: e.entry_by ?? null,
        notifyDateChanges: e.notify_date_changes === true,
        notifyEntryDeadline: e.notify_entry_deadline === true,
        notifyResults: e.notify_results === true,
      });
    const regime = enrollments.filter(inRegime);
    const regimeUsers = [...new Set(regime.map((e) => e.user_id as string))];
    const regimeEditions = new Set(regime.map((e) => e.edition_id as string));
    const someone = (f: string) => enrollments.some((e) => e[f] === true);
    const wantResults = someone("notify_results");
    const wantDates = someone("notify_date_changes");
    const calendarEditions = [...new Set(enrollments.filter((e) => e.notify_calendar === true).map((e) => e.edition_id as string))];
    const joinedDays = enrollments.map((e) => (typeof e.joined_at === "string" ? e.joined_at.slice(0, 10) : null)).filter(Boolean) as string[];
    // Um dia antes da 1.ª inscrição: joined_at é um instante, sent_date um dia de Lisboa.
    const pushesFrom = joinedDays.length ? addDaysISO(joinedDays.sort()[0], -1) : addDaysISO(todayISO, -365);

    // Q2 — em paralelo.
    const [roundsR, partsR, pushesR, logR, seenR, ...auditRs] = await Promise.all([
      readAll(() => sb.from("cup_rounds").select(ROUND_COLUMNS).in("edition_id", editionIds), ["id"]),
      readAll(() =>
        sb.from("cup_participations").select(PARTICIPATION_COLUMNS).in("enrollment_id", enrollments.map((e) => e.id)), ["enrollment_id", "round_id"]),
      readAll(() =>
        sb.from("coach_proactive_pushes").select("user_id, key, trigger, sent_at")
          .in("user_id", users).in("trigger", [...CUP_NOTICE_TRIGGERS, "race_morning", "race_eve", "race_after"]).gte("sent_date", pushesFrom), ["user_id", "key"]),
      wantResults
        ? readAll(() =>
          sb.from("coach_proactive_log").select("user_id, key, sent_at").in("user_id", users).eq("trigger", "race_after")
            .gte("sent_at", new Date(now.getTime() - CUP_RACE_AFTER_LOOKBACK_DAYS * 86400000).toISOString()), ["user_id", "key"])
        : EMPTY,
      wantDates
        ? readAll(() =>
          sb.from("coach_impressions").select("user_id, key, date, kind").in("user_id", users).like("key", "cup_date_change:%")
            .gte("date", addDaysISO(todayISO, -CUP_DATE_CHANGE_SEEN_DAYS)), ["user_id", "date", "kind", "key"])
        : EMPTY,
      // O calendário "saiu" na 1.ª vez que uma jornada da edição ficou
      // confirmada — a auditoria guarda a linha nova de cada escrita.
      ...calendarEditions.map((ed) =>
        sb.from("cup_audit_log").select("at").eq("table_name", "cup_rounds")
          .eq("new_row->>edition_id", ed).eq("new_row->>date_status", "confirmada")
          .order("at", { ascending: true }).limit(1)
      ),
    ]);
    for (const [r, what] of [[roundsR, "jornadas"], [partsR, "participações"]] as const) {
      if (r?.error) {
        warnRead(what, r.error);
        return out;
      }
    }
    const rounds: any[] = (roundsR.data || []).filter((r: any) => r?.id && r.edition_id);
    const roundIds = rounds.map((r) => r.id as string);
    const regimeRoundIds = rounds.filter((r) => regimeEditions.has(r.edition_id)).map((r) => r.id as string);
    // O papel só se calcula com jornadas: sem nenhuma, não se lê nada dele.
    const wantRoles = regimeUsers.length > 0 && regimeRoundIds.length > 0;

    // Q3 — as provas destes atletas ligadas a ESTAS jornadas (não as de todas
    // as épocas), e a publicação só com alguém com a classificação ligada.
    // No regime, também o que o papel sugerido precisa (ver o cabeçalho).
    const [racesR, pubR, catsR, coursesR, overridesR, roleRacesR, profilesR] = await Promise.all([
      roundIds.length
        ? readAll(() => sb.from("race_events").select(RACE_COLUMNS).in("user_id", users).in("cup_round_id", roundIds), ["id"])
        : EMPTY,
      wantResults && roundIds.length
        ? readAll(() => sb.from("cup_round_publication").select("round_id, results_ready_at").in("round_id", roundIds), ["round_id"])
        : EMPTY,
      wantRoles
        ? readAll(() => sb.from("cup_categories").select(CATEGORY_COLUMNS).in("edition_id", [...regimeEditions]), ["id"])
        : EMPTY,
      wantRoles ? readAll(() => sb.from("cup_round_courses").select(COURSE_COLUMNS).in("round_id", regimeRoundIds), ["id"]) : EMPTY,
      wantRoles
        ? readAll(() => sb.from("cup_round_course_overrides").select(OVERRIDE_COLUMNS).in("round_id", regimeRoundIds), ["round_id", "category_code"])
        : EMPTY,
      // As principais mandam nos papéis: com jornada (de qualquer edição, como
      // no cliente e na Carol) ou com data a partir do corte.
      wantRoles
        ? readAll(() =>
          sb.from("race_events").select(ROLE_RACE_COLUMNS).in("user_id", regimeUsers)
            .or(`cup_round_id.not.is.null,date.gte.${addDaysISO(todayISO, -CUP_ROLE_RACES_FROM_DAYS)}`), ["id"])
        : EMPTY,
      wantRoles ? readAll(() => sb.from("profiles").select(PROFILE_COLUMNS).in("id", regimeUsers), ["id"]) : EMPTY,
    ]);
    if (racesR?.error) {
      warnRead("provas", racesR.error);
      return out;
    }
    const failed = (r: any, what: string) => {
      if (!r?.error) return false;
      warnRead(what, r.error);
      return true;
    };
    const pushesFailed = failed(pushesR, "notificações enviadas");
    const logFailed = failed(logR, "balanços entregues");
    const seenFailed = failed(seenR, "vistas na app");
    // edição → a 1.ª confirmação (null: ainda nenhuma); sem entrada = não lida.
    const calendarAt = new Map<string, string | null>();
    calendarEditions.forEach((ed, i) => {
      const r = auditRs[i];
      if (!failed(r, "auditoria")) calendarAt.set(ed, (r?.data || [])[0]?.at ?? null);
    });

    const roundEdition = new Map(rounds.map((r) => [r.id as string, r.edition_id as string]));
    const races: any[] = (racesR.data || []).filter((r: any) => r?.id && r.user_id && roundEdition.has(r.cup_round_id));
    // As provas de jornada de quem está no regime (a classificação é uma
    // delas: notify_results põe-no no regime).
    const regimeUserSet = new Set(regimeUsers);
    const regimeRaceIds = races.filter((r) => regimeUserSet.has(r.user_id) && regimeEditions.has(roundEdition.get(r.cup_round_id)!))
      .map((r) => r.id as string);

    // Q4 — as corridas destas provas, só no regime: a classificação ("correu")
    // e o "feita" do papel sugerido.
    const runsR = regimeRaceIds.length
      ? await readAll(() => sb.from("runs").select("id, user_id, race_id").in("user_id", regimeUsers).in("race_id", regimeRaceIds), ["id"])
      : EMPTY;
    const pubFailed = failed(pubR, "publicação");
    const runsFailed = failed(runsR, "corridas");
    const readyAt = new Map<string, string | null>((pubFailed ? [] : pubR.data || []).map((p: any) => [p.round_id, p.results_ready_at ?? null]));
    // Cada leitura do papel que falhe avisa (só a mensagem); qualquer uma cala
    // o papel sugerido de toda a gente nesta execução (parts.roles).
    const roleFails = [
      failed(catsR, "escalões"),
      failed(coursesR, "percursos"),
      failed(overridesR, "exceções de percurso"),
      failed(roleRacesR, "provas do papel"),
      failed(profilesR, "perfis"),
    ];
    const rolesFailed = roleFails.some(Boolean);
    const profileOf = new Map<string, any>((profilesR.data || []).filter((p: any) => p?.id).map((p: any) => [p.id as string, p]));

    const byUserRows = (rows: any[] | null | undefined, userId: string): any[] => (rows || []).filter((r) => r?.user_id === userId);

    for (const enr of enrollments) {
      const ed = editionById.get(enr.edition_id);
      if (!ed) continue;
      const comp = Array.isArray(ed.competition) ? ed.competition[0] : ed.competition;
      const myRounds = rounds.filter((r) => r.edition_id === ed.id);
      const myRoundIds = new Set(myRounds.map((r) => r.id as string));
      const myRaces = races
        .filter((r) => r.user_id === enr.user_id && myRoundIds.has(r.cup_round_id))
        .map((r) => ({ id: r.id as string, roundId: r.cup_round_id as string, priority: (r.race_priority ?? null) as string | null }));
      const myRaceIds = new Set(myRaces.map((r) => r.id));
      const pushRows = pushesFailed ? [] : byUserRows(pushesR.data, enr.user_id);
      const wantsRoles = inRegime(enr);
      const prof = profileOf.get(enr.user_id) ?? null;
      out.byUser.set(enr.user_id, {
        edition: {
          id: ed.id,
          notificationsEnabled: ed.notifications_enabled === true,
          status: String(ed.status ?? ""),
          competitionName: comp?.short_name ?? null,
          seasonLabel: ed.season_label ?? null,
          roundLabel: comp?.round_label ?? null,
          entryMode: ed.entry_mode ?? null,
          timeZone: ed.time_zone ?? null,
          calendarOutAt: calendarAt.get(ed.id) ?? null,
        },
        enrollment: {
          id: enr.id,
          status: String(enr.status ?? ""),
          joinedAt: enr.joined_at ?? null,
          entryBy: enr.entry_by ?? null,
          notifyCalendar: enr.notify_calendar === true,
          notifyDateChanges: enr.notify_date_changes === true,
          notifyEntryDeadline: enr.notify_entry_deadline === true,
          notifyResults: enr.notify_results === true,
        },
        rounds: myRounds.map((r) => ({
          id: r.id,
          roundNo: Number(r.round_no) || 0,
          name: String(r.name ?? ""),
          date: r.date ?? null,
          dateStatus: String(r.date_status ?? ""),
          previousDate: r.previous_date ?? null,
          dateChangedAt: r.date_changed_at ?? null,
          entryDeadlineAt: r.entry_deadline_at ?? null,
          resultsReadyAt: readyAt.get(r.id) ?? null,
        })),
        participations: (partsR.data || [])
          .filter((p: any) => p?.enrollment_id === enr.id && myRoundIds.has(p.round_id))
          .map((p: any) => ({
            roundId: p.round_id,
            decision: p.decision ?? null,
            intent: p.intent ?? null,
            intentSource: p.intent_source ?? null,
            entryDoneAt: p.entry_done_at ?? null,
            decidedAt: p.decided_at ?? null,
          })),
        races: myRaces,
        ranRaceIds: runsFailed ? [] : [...new Set(byUserRows(runsR.data, enr.user_id).map((r: any) => r.race_id as string).filter((id) => myRaceIds.has(id)))],
        roundPushCounts: roundPushCountsOf(pushRows, myRaces),
        raceAfterReachedAt: raceAfterReachedAtOf(logFailed ? [] : byUserRows(logR.data, enr.user_id), pushRows),
        seenKeys: seenFailed ? [] : byUserRows(seenR.data, enr.user_id).map((r: any) => String(r.key ?? "")).filter(Boolean),
        // Fora do regime não se lê (nem é preciso): null.
        roleInputs: wantsRoles && !rolesFailed
          ? {
            ageRule: ed.age_rule ?? null,
            seasonGoal: enr.season_goal ?? null,
            categories: (catsR.data || []).filter((c: any) => c?.edition_id === ed.id),
            courses: (coursesR.data || []).filter((c: any) => myRoundIds.has(c?.round_id)),
            overrides: (overridesR.data || []).filter((o: any) => myRoundIds.has(o?.round_id)),
            races: byUserRows(roleRacesR.data, enr.user_id),
            profile: prof
              ? { birth_date: prof.birth_date ?? null, gender: prof.gender ?? null, experience_level: prof.experience_level ?? null }
              : null,
          }
          : null,
        parts: {
          pushes: !pushesFailed,
          log: !logFailed,
          seen: !seenFailed,
          calendar: !enr.notify_calendar || calendarAt.has(ed.id),
          publication: !pubFailed,
          runs: !runsFailed,
          roles: !wantsRoles || !rolesFailed,
        },
      });
    }
    return out;
  } catch (e) {
    console.warn("coach-proactive-tick: avisos do Troféu não lidos:", (e as Error)?.message ?? String(e));
    return { byUser: new Map(), noticesOff: false };
  }
}
