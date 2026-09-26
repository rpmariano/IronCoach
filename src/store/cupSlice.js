import { supabase } from '../lib/supabase';

/* Competições por jornadas — os dados do atleta no store (specs/trofeu.md
   §4.1–4.3 e §10, Fase 1). 2026-09-26.

   INVARIÂNCIA. Quem não corre o circuito não pode notar diferença nenhuma
   (§1). Por isso tudo o que é da competição vive numa só fatia, `cup`, e:
   - NADA aqui corre no carregamento inicial: a primeira leitura sai do
     useCup() (utils/useCup.js), quando o ecrã de Provas o monta;
   - as leituras nunca escrevem noutra fatia. Só as ações de um INSCRITO que
     fazem o servidor mexer em provas (set_participation, leave_cup) releem
     `raceEvents` (e os planos, pelo race_lost_at) — sem inscrição, nunca
     chegam lá;
   - o catálogo (jornadas, percursos, escalões, clubes) só se lê para UMA
     edição, quando é preciso: a da inscrição ativa, ou a do convite que o
     cartão vai mostrar (loadCupCatalog, chamado pelo hook).

   TABELAS EM FALTA. A M1 aplica-se à mão (§9.1) e este código pode chegar ao
   browser antes dela. Uma tabela ou função que ainda não existe (42P01,
   PGRST205, PGRST202, 42883) não é um erro para o atleta: `cup.status` passa
   a 'indisponivel' e a app comporta-se como "sem inscrição". Avisa-se uma vez
   na consola.

   AS ESCRITAS vão pelas RPCs da M1 (enroll_cup, update_enrollment, leave_cup,
   set_participation) — as políticas só deixam o cliente escrever diretamente
   o "Não me interessa" (cup_edition_dismissals). Cada ação devolve
   { ok: true, data } ou { ok: false, error: { code, message }, unavailable },
   com a mensagem do servidor (já em português) para o ecrã. */

export const CUP_EMPTY = Object.freeze({
  // 'idle' (nada lido) | 'loading' | 'ready' | 'indisponivel' (M1 por
  // aplicar) | 'erro' (falha de rede; não se tenta sozinho outra vez)
  status: 'idle',
  userId: null,
  // Edições 'aberta'/'por_anunciar' e a da inscrição ativa, cada uma com
  // `competition` (a linha de cup_competitions).
  editions: [],
  // As inscrições do próprio, todas as épocas (RLS "own rows").
  enrollments: [],
  // Os edition_id com "Não me interessa".
  dismissals: [],
  // Por edição: { status: 'loading'|'ready'|'erro', rounds, courses,
  // overrides, categories, teams }.
  catalog: {},
  // As participações da inscrição ativa.
  participations: [],
});

const MISSING_CODES = new Set(['42P01', 'PGRST205', 'PGRST202', '42883', 'PGRST200']);

/** A tabela/função da M1 ainda não existe nesta BD. Exportada para os testes. */
export function isCupSchemaMissing(error) {
  if (!error) return false;
  if (MISSING_CODES.has(error.code)) return true;
  const msg = String(error.message || '');
  return /relation .*cup_.* does not exist|Could not find the (table|function) .*cup_|Could not find the function public\.(enroll_cup|update_enrollment|leave_cup|set_participation)/i.test(msg);
}

let warnedMissing = false;
function warnMissing(error) {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn('Competições por jornadas indisponíveis (M1 por aplicar?):', error?.code || '', error?.message || error);
}

const errorOf = (error) => ({ code: error?.code ?? null, message: error?.message ?? String(error ?? 'Erro') });

let cupLoad = null; // { userId, promise } — a leitura base em curso
const catalogLoads = new Map(); // editionId → promise

const userIdOf = (get) => get().session?.user?.id || get().profile?.id || null;

/** A edição da porta ou da inscrição (a primeira que interessa). Pura, para
 *  o hook e os testes: a da inscrição ativa, se houver; senão a primeira
 *  edição (pela ordem de criação) para a qual `accept(edition)` diz que sim. */
export function pickCupEdition(editions, enrollments, accept = () => true) {
  const active = (enrollments || []).find((e) => e?.status === 'ativa');
  if (active) return (editions || []).find((e) => e.id === active.edition_id) || null;
  const ordered = [...(editions || [])].sort((a, b) =>
    String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)));
  return ordered.find((e) => accept(e)) || null;
}

function normalizeEdition(row) {
  if (!row) return row;
  const { competition, cup_competitions: legacy, ...rest } = row;
  return { ...rest, competition: competition ?? legacy ?? null };
}

function upsertById(list, row) {
  if (!row?.id) return list;
  const i = list.findIndex((x) => x.id === row.id);
  if (i < 0) return [...list, row];
  const next = [...list];
  next[i] = row;
  return next;
}

export const createCupSlice = (set, get) => {
  // Escreve na fatia `cup` só se a conta ainda for a mesma.
  const patchCup = (userId, patch) => {
    const cur = get().cup;
    if (cur.userId !== userId) return false;
    set({ cup: { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) } });
    return true;
  };

  // Uma ação antes da primeira leitura (ou depois de trocar de conta) adota
  // a fatia para esta conta, para o resultado ter onde ficar.
  const ensureOwner = (userId) => {
    if (get().cup.userId !== userId) set({ cup: { ...CUP_EMPTY, userId } });
  };

  const markUnavailable = (userId, error) => {
    warnMissing(error);
    if (get().cup.userId !== userId) return;
    set({ cup: { ...CUP_EMPTY, userId, status: 'indisponivel' } });
  };

  /* Relê as provas do atleta depois de o servidor as mexer (a sincronização
     cria, liga ou apaga a race_events da jornada). Os planos também, se as
     provas de jornadas mudaram: apagar a prova de um plano marca-lhe
     race_lost_at no servidor. Só chamado por ações de quem está inscrito. */
  const refreshRacesAfterSync = async (userId) => {
    const cupRaces = (list) => (list || []).filter((r) => r?.cup_round_id)
      .map((r) => `${r.id}|${r.date}|${r.cup_round_id}`).sort().join(',');
    const before = cupRaces(get().raceEvents);
    const { data, error } = await supabase.from('race_events').select('*').eq('user_id', userId).order('date', { ascending: true });
    if (error) { console.warn('Competição: reler as provas falhou:', error.message || error); return; }
    if (userIdOf(get) !== userId) return;
    set({ raceEvents: data || [] });
    if (cupRaces(data) !== before) await get().reloadCoachPlans?.();
  };

  const readParticipations = async (userId, enrollmentId) => {
    const { data, error } = await supabase.from('cup_participations').select('*').eq('enrollment_id', enrollmentId);
    if (error) {
      if (isCupSchemaMissing(error)) markUnavailable(userId, error);
      else console.warn('Competição: participações:', error.message || error);
      return null;
    }
    patchCup(userId, { participations: data || [] });
    return data || [];
  };

  const callRpc = async (userId, fn, args) => {
    ensureOwner(userId);
    let res;
    try {
      res = await supabase.rpc(fn, args);
    } catch (err) {
      return { ok: false, error: errorOf(err), unavailable: false };
    }
    if (res?.error) {
      const unavailable = isCupSchemaMissing(res.error);
      if (unavailable) markUnavailable(userId, res.error);
      else console.warn(`Competição (${fn}):`, res.error.message || res.error);
      return { ok: false, error: errorOf(res.error), unavailable };
    }
    return { ok: true, data: res?.data ?? null };
  };

  return {
    cup: CUP_EMPTY,

    /* A leitura base: as edições abertas/por anunciar, as inscrições e os
       "Não me interessa" do próprio. Com uma inscrição ativa, também o
       catálogo dessa edição e as participações. Uma chamada a meio de outra
       para a mesma conta junta-se a ela; `force` relê mesmo já lido. */
    loadCup: async ({ force = false } = {}) => {
      const userId = userIdOf(get);
      if (!userId) return null;
      const cur = get().cup;
      if (cur.userId !== userId) set({ cup: { ...CUP_EMPTY, userId } });
      if (!force && get().cup.status !== 'idle') {
        if (cupLoad?.userId === userId) return cupLoad.promise;
        return get().cup;
      }
      if (cupLoad?.userId === userId && !force) return cupLoad.promise;

      const run = (async () => {
        if (get().cup.status === 'idle') patchCup(userId, { status: 'loading' });
        let eds, enr, dis;
        try {
          [eds, enr, dis] = await Promise.all([
            supabase.from('cup_editions').select('*, competition:cup_competitions(*)').in('status', ['aberta', 'por_anunciar']),
            supabase.from('cup_enrollments').select('*').eq('user_id', userId),
            supabase.from('cup_edition_dismissals').select('edition_id').eq('user_id', userId),
          ]);
        } catch (err) {
          console.warn('Competição: leitura falhou:', err);
          patchCup(userId, { status: 'erro' });
          return get().cup;
        }
        const firstError = [eds, enr, dis].map((r) => r?.error).find(Boolean);
        if (firstError) {
          if ([eds, enr, dis].some((r) => isCupSchemaMissing(r?.error))) markUnavailable(userId, firstError);
          else { console.warn('Competição: leitura falhou:', firstError.message || firstError); patchCup(userId, { status: 'erro' }); }
          return get().cup;
        }

        let editions = (eds.data || []).map(normalizeEdition);
        const enrollments = enr.data || [];
        const active = enrollments.find((e) => e.status === 'ativa') || null;
        // A edição da inscrição ativa, se já não estiver entre as abertas.
        if (active && !editions.some((e) => e.id === active.edition_id)) {
          const { data, error } = await supabase.from('cup_editions').select('*, competition:cup_competitions(*)').eq('id', active.edition_id);
          if (!error && data) editions = [...editions, ...data.map(normalizeEdition)];
        }
        const ok = patchCup(userId, {
          status: 'ready',
          editions,
          enrollments,
          dismissals: (dis.data || []).map((d) => d.edition_id),
          participations: active ? get().cup.participations : [],
        });
        if (!ok) return get().cup;
        if (active) {
          await Promise.all([
            get().loadCupCatalog(active.edition_id, { force }),
            readParticipations(userId, active.id),
          ]);
        }
        return get().cup;
      })();
      cupLoad = { userId, promise: run };
      try {
        return await run;
      } finally {
        if (cupLoad?.promise === run) cupLoad = null;
      }
    },

    /* O catálogo de UMA edição: jornadas, percursos, exceções, escalões e
       clubes. Uma leitura em curso para a mesma edição é reaproveitada. */
    loadCupCatalog: async (editionId, { force = false } = {}) => {
      const userId = userIdOf(get);
      if (!userId || !editionId) return null;
      const have = get().cup.catalog[editionId];
      if (!force && have && have.status !== 'erro') return have;
      if (catalogLoads.has(editionId)) return catalogLoads.get(editionId);

      const run = (async () => {
        if (!have) patchCup(userId, (c) => ({ catalog: { ...c.catalog, [editionId]: { status: 'loading', rounds: [], courses: [], overrides: [], categories: [], teams: [] } } }));
        const fail = (error) => {
          if (isCupSchemaMissing(error)) { markUnavailable(userId, error); return null; }
          console.warn('Competição: catálogo:', error?.message || error);
          patchCup(userId, (c) => ({ catalog: { ...c.catalog, [editionId]: { ...(c.catalog[editionId] || {}), status: 'erro' } } }));
          return null;
        };
        try {
          const [rounds, categories, teams] = await Promise.all([
            supabase.from('cup_rounds').select('*').eq('edition_id', editionId).order('round_no', { ascending: true }),
            supabase.from('cup_categories').select('*').eq('edition_id', editionId),
            supabase.from('cup_teams').select('*').eq('edition_id', editionId).order('name', { ascending: true }),
          ]);
          const e1 = [rounds, categories, teams].map((r) => r?.error).find(Boolean);
          if (e1) return fail(e1);
          const roundIds = (rounds.data || []).map((r) => r.id);
          let courses = { data: [] }, overrides = { data: [] };
          if (roundIds.length) {
            [courses, overrides] = await Promise.all([
              supabase.from('cup_round_courses').select('*').in('round_id', roundIds),
              supabase.from('cup_round_course_overrides').select('*').in('round_id', roundIds),
            ]);
            const e2 = [courses, overrides].map((r) => r?.error).find(Boolean);
            if (e2) return fail(e2);
          }
          const entry = {
            status: 'ready',
            rounds: rounds.data || [],
            courses: courses.data || [],
            overrides: overrides.data || [],
            categories: categories.data || [],
            teams: teams.data || [],
          };
          patchCup(userId, (c) => ({ catalog: { ...c.catalog, [editionId]: entry } }));
          return entry;
        } catch (err) {
          return fail(err);
        }
      })();
      catalogLoads.set(editionId, run);
      try {
        return await run;
      } finally {
        catalogLoads.delete(editionId);
      }
    },

    /* Inscrever-se (§4.2). `data` é o patch da inscrição: team_id |
       team_other, is_federated, season_goal, bib, entry_by, notify_*. O
       servidor exige género e data de nascimento no perfil (22023 sem eles)
       e reativa a mesma linha a quem volta na mesma época. */
    enrollCup: async (editionId, data = {}) => {
      const userId = userIdOf(get);
      if (!userId) return { ok: false, error: { code: null, message: 'Sem sessão' }, unavailable: false };
      const res = await callRpc(userId, 'enroll_cup', { p_edition_id: editionId, p_data: data || {} });
      if (!res.ok) return res;
      const enrollment = res.data;
      patchCup(userId, (c) => ({ enrollments: upsertById(c.enrollments, enrollment), participations: [] }));
      await Promise.all([
        get().loadCupCatalog(editionId),
        enrollment?.id ? readParticipations(userId, enrollment.id) : null,
      ]);
      return { ok: true, data: enrollment };
    },

    /* Clube, dorsal, objetivo da época, "quem te inscreve", avisos. */
    updateEnrollment: async (enrollmentId, patch) => {
      const userId = userIdOf(get);
      if (!userId) return { ok: false, error: { code: null, message: 'Sem sessão' }, unavailable: false };
      const res = await callRpc(userId, 'update_enrollment', { p_enrollment_id: enrollmentId, p_patch: patch || {} });
      if (!res.ok) return res;
      patchCup(userId, (c) => ({ enrollments: upsertById(c.enrollments, res.data) }));
      return res;
    },

    /* Sair (§3.6): o servidor apaga as provas das jornadas por correr e as
       participações sem corrida; as corridas ficam como provas normais. */
    leaveCup: async (enrollmentId) => {
      const userId = userIdOf(get);
      if (!userId) return { ok: false, error: { code: null, message: 'Sem sessão' }, unavailable: false };
      const res = await callRpc(userId, 'leave_cup', { p_enrollment_id: enrollmentId });
      if (!res.ok) return res;
      patchCup(userId, (c) => ({ enrollments: upsertById(c.enrollments, res.data), participations: [] }));
      await refreshRacesAfterSync(userId);
      return res;
    },

    /* A decisão, a intenção e o "Já me inscrevi" de UMA jornada. `patch`:
       decision ('vou'|'nao_vou'|'nao_sei'|'nao_fui'|null), decision_source
       ('atleta'|'omissao'), intent, intent_source, entry_done (boolean).
       A linha volta DEPOIS da sincronização: com uma principal nesse dia, um
       "Vou" volta null/'colisao' — `collided` diz-lo ao ecrã. */
    setCupParticipation: async (roundId, patch, { refreshRaces = true } = {}) => {
      const userId = userIdOf(get);
      if (!userId) return { ok: false, error: { code: null, message: 'Sem sessão' }, unavailable: false };
      const res = await callRpc(userId, 'set_participation', { p_round_id: roundId, p_patch: patch || {} });
      if (!res.ok) return res;
      const participation = res.data;
      patchCup(userId, (c) => ({ participations: upsertById(c.participations, participation) }));
      if (refreshRaces && patch && 'decision' in patch) await refreshRacesAfterSync(userId);
      const collided = patch?.decision === 'vou' && participation?.decision == null && participation?.decision_source === 'colisao';
      return { ok: true, data: participation, collided };
    },

    /* O "Confirmar" da lista pré-marcada (§4.3): várias jornadas de uma vez,
       uma RPC cada (cada uma na sua transação), e as provas relidas UMA vez
       no fim. Continua depois de um erro; pára se a M1 não existir. */
    setCupParticipations: async (items) => {
      const userId = userIdOf(get);
      const results = [];
      let touchedDecision = false;
      for (const { roundId, patch } of items || []) {
        const r = await get().setCupParticipation(roundId, patch, { refreshRaces: false });
        results.push({ roundId, ...r });
        if (r.ok && patch && 'decision' in patch) touchedDecision = true;
        if (r.unavailable) break;
      }
      if (touchedDecision && userId) await refreshRacesAfterSync(userId);
      return { ok: results.length === (items || []).length && results.every((r) => r.ok), results };
    },

    /* "Não me interessa" — o cartão de Provas não volta para esta edição. */
    dismissCupEdition: async (editionId) => {
      const userId = userIdOf(get);
      if (!userId || !editionId) return { ok: false, error: { code: null, message: 'Sem sessão' }, unavailable: false };
      ensureOwner(userId);
      const { error } = await supabase.from('cup_edition_dismissals').insert({ user_id: userId, edition_id: editionId });
      // 23505: já estava dispensada — para quem carregou, é o que queria.
      if (error && error.code !== '23505') {
        const unavailable = isCupSchemaMissing(error);
        if (unavailable) markUnavailable(userId, error);
        else console.warn('Competição: dispensar:', error.message || error);
        return { ok: false, error: errorOf(error), unavailable };
      }
      patchCup(userId, (c) => ({ dismissals: c.dismissals.includes(editionId) ? c.dismissals : [...c.dismissals, editionId] }));
      return { ok: true, data: null };
    },

    /* Desfaz o "Não me interessa" (para um "Afinal quero ver" futuro). */
    undismissCupEdition: async (editionId) => {
      const userId = userIdOf(get);
      if (!userId || !editionId) return { ok: false, error: { code: null, message: 'Sem sessão' }, unavailable: false };
      ensureOwner(userId);
      const { error } = await supabase.from('cup_edition_dismissals').delete().eq('user_id', userId).eq('edition_id', editionId);
      if (error) {
        const unavailable = isCupSchemaMissing(error);
        if (unavailable) markUnavailable(userId, error);
        return { ok: false, error: errorOf(error), unavailable };
      }
      patchCup(userId, (c) => ({ dismissals: c.dismissals.filter((id) => id !== editionId) }));
      return { ok: true, data: null };
    },
  };
};

/** Só para os testes: esquece leituras em curso e o aviso da consola. */
export function __resetCupModuleState() {
  cupLoad = null;
  catalogLoads.clear();
  warnedMissing = false;
}
