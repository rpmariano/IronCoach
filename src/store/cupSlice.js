import { supabase } from '../lib/supabase';
import { lisbonTodayISO } from '../lib/utils';

/* Competições por jornadas — os dados do atleta no store (specs/trofeu.md
   §4.1–4.3 e §10, Fase 1). 2026-09-26.

   INVARIÂNCIA. Quem não corre o circuito não pode notar diferença nenhuma
   (§1). Por isso tudo o que é da competição vive numa só fatia, `cup`, e:
   - NADA aqui corre no carregamento inicial: a primeira leitura sai do
     useCup() (utils/useCup.js), quando o ecrã de Provas o monta, ou do
     useCupForHome() no Início — e esse só lê com indício de inscrição
     (a pista local, abaixo, ou uma prova de jornada por correr; Fase 2);
   - as leituras nunca escrevem noutra fatia. Só as ações de um INSCRITO que
     fazem o servidor mexer em provas (set_participation, leave_cup, e o
     refreshCupAfterChat depois de a Carol gravar numa jornada) releem
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
   o "Não me interessa" (cup_edition_dismissals) e, na prova do próprio, a
   prioridade (promover uma jornada a principal, Fase 3: o trigger
   guard_cup_race_columns só guarda a data, a distância, o local e a
   ligação). Cada ação devolve { ok: true, data } ou { ok: false, error:
   { code, message }, unavailable }, com a mensagem do servidor (já em
   português) para o ecrã.

   FASE 3 (2026-09-27). Com inscrição ativa lê-se também a classificação: a
   linha oficial confirmada do próprio (cup_results, RLS "own rows") e a
   coletiva do SEU clube (cup_team_results, só o total do clube). Coluna a
   coluna — nunca match_hash, team_name nem athletes_count. É uma leitura
   acessória: falhar não mexe em mais nada. E as ações do calendário do
   Troféu: o papel, "Não fui", "Já me inscrevi", "Registar" uma jornada que
   já passou, promover a principal, e o pedido para abrir o ecrã do Troféu a
   partir de outro ecrã (cupScreenRequest).

   FASE 4 (2026-09-27). A classificação passa a trazer também a linha
   'proposta' (e a 'perdida') do próprio — o "És tu?" da 1.ª correspondência
   de cada edição — com a fonte dos pontos, a linha dele na geral oficial
   (cup_standings) e, com a edição a publicar, quando saiu a classificação de
   cada jornada (cup_round_publication). "Sim, sou eu" e "Não sou eu" são as
   RPCs confirm_cup_result e reject_cup_result. A M2 aplica-se à mão e este
   código pode chegar antes dela: uma coluna, tabela ou RPC da M2 em falta
   (isCupM2Missing) NUNCA marca a competição indisponível — a leitura volta
   uma vez à da Fase 3 (só as confirmadas, sem a fonte dos pontos) e fica
   assim até recarregar a app. */

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
  // A classificação da inscrição ativa (Fase 3): 'idle' | 'ready' | 'erro';
  // `rows` = cup_results confirmados do próprio, `teamRows` = a coletiva do
  // clube dele (vazia sem clube da lista), lida para o clube `teamId` — quem
  // muda de clube a meio da época não fica com a coletiva do antigo.
  // Fase 4: `rows` traz também as 'proposta'/'perdida' (com a M2);
  // `standing` = a linha dele na geral oficial (ou null), `publication` =
  // { round_id: results_ready_at } das jornadas que já passaram (só com a
  // edição a publicar), `m2` = leu-se com as colunas da M2.
  results: Object.freeze({ status: 'idle', enrollmentId: null, teamId: null, rows: [], teamRows: [], standing: null, publication: Object.freeze({}), m2: false }),
});

// As colunas da classificação, uma a uma (nunca match_hash, team_name,
// athletes_count — nem nada de outros atletas ou de outros clubes).
export const CUP_RESULT_COLUMNS = 'round_id, position, category_code, category_position, points, official_time_s, match_status';
export const CUP_TEAM_RESULT_COLUMNS = 'round_id, position, points';
// Fase 4 (M2): a fonte dos pontos ('oficial' da geral, ou 'calculado' pela
// app — provisórios), a linha dele na geral e quando saiu a classificação
// de cada jornada. Nunca bib_key, standings_key, match_hash, key_hash nem
// match_refused_key: as chaves da correspondência não saem do servidor.
export const CUP_RESULT_COLUMNS_M2 = `${CUP_RESULT_COLUMNS}, points_source`;
export const CUP_TEAM_RESULT_COLUMNS_M2 = `${CUP_TEAM_RESULT_COLUMNS}, points_source`;
export const CUP_STANDING_COLUMNS = 'category_code, category_rank, total_points, rounds_scored, source_checked_at';
export const CUP_PUBLICATION_COLUMNS = 'round_id, results_ready_at';
// As linhas que o atleta vê: a confirmada, a por confirmar e a que mudou.
const CUP_VISIBLE_MATCH = ['proposta', 'confirmada', 'perdida'];

const SERIES_INTENTS = ['atacar', 'controlar', 'trote', 'saltar'];

const MISSING_CODES = new Set(['42P01', 'PGRST205', 'PGRST202', '42883', 'PGRST200']);

/** A tabela/função da M1 ainda não existe nesta BD. Exportada para os testes. */
export function isCupSchemaMissing(error) {
  if (!error) return false;
  if (MISSING_CODES.has(error.code)) return true;
  const msg = String(error.message || '');
  return /relation .*cup_.* does not exist|Could not find the (table|function) .*cup_|Could not find the function public\.(enroll_cup|update_enrollment|leave_cup|set_participation)/i.test(msg);
}

const M2_MISSING_CODES = new Set(['42P01', '42703', 'PGRST204', 'PGRST205', 'PGRST202', '42883']);
const COLUMN_MISSING_CODES = new Set(['42703', 'PGRST204']);

/** Uma tabela, coluna ou RPC da M2 ainda não existe nesta BD (Fase 4).
 *  Ao contrário de isCupSchemaMissing, NÃO marca a competição indisponível:
 *  o atleta fica com o que a Fase 3 já mostrava. Exportada para os testes. */
export function isCupM2Missing(error) {
  if (!error) return false;
  if (M2_MISSING_CODES.has(error.code)) return true;
  return /does not exist|Could not find/i.test(String(error.message || ''));
}

// A M2 faltou numa leitura: as seguintes vão direto à da Fase 3, até
// recarregar a app (não se repete a pergunta a cada leitura).
let m2Missing = false;

let warnedMissing = false;
function warnMissing(error) {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn('Competições por jornadas indisponíveis (M1 por aplicar?):', error?.code || '', error?.message || error);
}

const errorOf = (error) => ({ code: error?.code ?? null, message: error?.message ?? String(error ?? 'Erro') });

/* A pista local de inscrição (Fase 2, o mapa da época no Início). O Início
   não pode ler tabelas `cup_*` a quem não está inscrito (§5): lê a
   competição só com esta pista, ou com uma prova de jornada por correr (ver
   useCupForHome). Escreve-se em cada leitura base e em cada inscrição ou
   saída; por conta, neste dispositivo. É só um indício — a vista confirma
   sempre com a inscrição ativa — e tudo corre em try/catch: sem storage
   (modo privado, quota) o Início fica como era. */
export const cupEnrolledHintKey = (uid) => `ironcoach:competicao-inscrito:${uid || 'anon'}`;

/** A pista local diz que esta conta está inscrita. */
export function readCupEnrolledHint(userId) {
  if (!userId) return false;
  try {
    return window.localStorage.getItem(cupEnrolledHintKey(userId)) === '1';
  } catch {
    return false;
  }
}

function writeCupEnrolledHint(userId, enrolled) {
  if (!userId) return;
  try {
    if (enrolled) window.localStorage.setItem(cupEnrolledHintKey(userId), '1');
    else window.localStorage.removeItem(cupEnrolledHintKey(userId));
  } catch {
    // Sem storage: o Início só descobre a inscrição pelas provas das jornadas.
  }
}

let cupLoad = null; // { userId, promise } — a leitura base em curso
const catalogLoads = new Map(); // editionId → promise

const userIdOf = (get) => get().session?.user?.id || get().profile?.id || null;

/* O pedido de abrir o ecrã do Troféu a partir de outro ecrã
   (cupScreenRequest) vale só uns segundos e só para quem o fez (revisão da
   Fase 3). Sem prazo, um pedido feito no Início por quem saiu de Provas
   antes de a leitura acabar ficava pendurado e, horas depois, o Troféu
   abria sozinho; sem o dono, passava para a conta seguinte no mesmo
   telemóvel. */
export const CUP_SCREEN_REQUEST_TTL_MS = 30 * 1000;

/** O pedido ainda vale: da conta `userId` e com menos de
 *  CUP_SCREEN_REQUEST_TTL_MS. Pura (RacesScreen consome-o). */
export function cupScreenRequestValid(req, userId, now = Date.now()) {
  if (!req || !userId || req.userId !== userId) return false;
  const at = Number(req.at);
  return Number.isFinite(at) && now - at >= 0 && now - at <= CUP_SCREEN_REQUEST_TTL_MS;
}

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

  /* A classificação da inscrição ativa (Fase 3). Acessória: uma tabela em
     falta fica vazia sem marcar a competição indisponível; outro erro marca
     só `results.status = 'erro'` (a mensagem vai à consola, nada mais).

     Fase 4: com a M2, as linhas 'proposta'/'confirmada'/'perdida' com a
     fonte dos pontos, a linha dele na geral (cup_standings) e — só com a
     edição a publicar — quando saiu a classificação das jornadas que já
     passaram (cup_round_publication; `catalog` é o catálogo da edição, ou a
     promessa da leitura dele em curso). Sem a M2 (isCupM2Missing), volta
     uma vez à leitura da Fase 3 e `m2` fica false. */
  const readResults = async (userId, enrollment, catalog = null) => {
    if (!enrollment?.id) return null;
    const enrollmentId = enrollment.id;
    const teamId = enrollment.team_id ?? null;
    // Mudou de clube enquanto esta leitura corria: a leitura do clube novo
    // é que vale (não se escreve por cima dela).
    const stale = () => {
      const cur = (get().cup.enrollments || []).find((e) => e?.id === enrollmentId);
      return !!cur && (cur.team_id ?? null) !== teamId;
    };
    const none = Promise.resolve({ data: null, error: null });
    const mineQuery = (m2) => (m2
      ? supabase.from('cup_results').select(CUP_RESULT_COLUMNS_M2).eq('enrollment_id', enrollmentId).in('match_status', CUP_VISIBLE_MATCH)
      : supabase.from('cup_results').select(CUP_RESULT_COLUMNS).eq('enrollment_id', enrollmentId).eq('match_status', 'confirmada'));
    // Só um clube da lista tem coletiva (os de "não está na lista" não). Com
    // a M2 o RLS só dá a coletiva ao admin e a quem tem inscrição ATIVA nessa
    // edição com esse team_id — é esta leitura (o clube da inscrição ativa);
    // o ensaio da M2 (T5) corre-a tal e qual.
    const teamQuery = (m2) => (teamId
      ? supabase.from('cup_team_results').select(m2 ? CUP_TEAM_RESULT_COLUMNS_M2 : CUP_TEAM_RESULT_COLUMNS).eq('team_id', teamId)
      : Promise.resolve({ data: [], error: null }));
    const standingQuery = () => supabase.from('cup_standings').select(CUP_STANDING_COLUMNS).eq('enrollment_id', enrollmentId).maybeSingle();
    const publicationQuery = async () => {
      const edition = (get().cup.editions || []).find((e) => e?.id === enrollment.edition_id) || null;
      if (edition?.sync_mode !== 'publicar') return { data: [], error: null };
      const entry = await (catalog ?? get().cup.catalog?.[enrollment.edition_id] ?? null);
      const today = lisbonTodayISO();
      const ids = (entry?.rounds || [])
        .filter((r) => typeof r?.date === 'string' && r.date.slice(0, 10) <= today && r.date_status !== 'cancelada')
        .map((r) => r.id);
      if (!ids.length) return { data: [], error: null };
      return supabase.from('cup_round_publication').select(CUP_PUBLICATION_COLUMNS).in('round_id', ids);
    };

    let m2 = !m2Missing;
    let mine, team, standing, publication;
    try {
      [mine, team, standing, publication] = await Promise.all([
        mineQuery(m2), teamQuery(m2), m2 ? standingQuery() : none, publicationQuery(),
      ]);
      // A M2 por aplicar: a leitura da Fase 3, uma vez, e não se volta a
      // perguntar até recarregar.
      if (m2 && isCupM2Missing(mine?.error)) {
        m2Missing = true;
        m2 = false;
        [mine, team] = await Promise.all([mineQuery(false), teamQuery(false)]);
        standing = { data: null, error: null };
      } else if (m2 && COLUMN_MISSING_CODES.has(team?.error?.code)) {
        team = await teamQuery(false);
      }
    } catch (err) {
      console.warn('Competição: resultados:', err?.message || String(err));
      if (!stale()) patchCup(userId, { results: { ...CUP_EMPTY.results, status: 'erro', enrollmentId, teamId } });
      return null;
    }
    const failed = [mine, team].map((r) => r?.error).find((e) => e && !isCupSchemaMissing(e));
    if (failed) console.warn('Competição: resultados:', failed.message || String(failed));
    // As acessórias: sem elas o ecrã fica como na Fase 3.
    for (const r of [standing, publication]) {
      if (r?.error && !isCupM2Missing(r.error)) console.warn('Competição: classificação:', r.error.message || String(r.error));
    }
    const standingRow = standing?.error ? null : (Array.isArray(standing?.data) ? standing.data[0] ?? null : standing?.data ?? null);
    const readyAt = {};
    for (const row of (publication?.error ? [] : publication?.data || [])) {
      if (row?.round_id && row.results_ready_at) readyAt[row.round_id] = row.results_ready_at;
    }
    const results = {
      status: failed ? 'erro' : 'ready',
      enrollmentId,
      teamId,
      rows: mine?.error ? [] : mine?.data || [],
      teamRows: team?.error ? [] : team?.data || [],
      standing: m2 ? standingRow : null,
      publication: readyAt,
      m2: m2 && !mine?.error,
    };
    if (stale()) return null;
    patchCup(userId, { results });
    return results;
  };

  const noSession = () => ({ ok: false, error: { code: null, message: 'Sem sessão' }, unavailable: false });
  const refused = (code, message) => ({ ok: false, error: { code, message }, unavailable: false });
  const roundOf = (roundId) => {
    for (const entry of Object.values(get().cup.catalog || {})) {
      const r = (entry?.rounds || []).find((x) => x.id === roundId);
      if (r) return r;
    }
    return null;
  };
  const raceOfRound = (roundId) => (get().raceEvents || []).find((r) => r?.cup_round_id === roundId) || null;
  // Feita: concluída, ou com uma corrida ligada — a régua de attendanceCount
  // e do servidor (cup_race_is_done).
  const raceDone = (race) => !!race?.id
    && (race.status === 'concluida' || (get().runs || []).some((r) => r?.race_id === race.id));

  /* "Sim, sou eu" / "Não sou eu" (Fase 4). Não passam por callRpc: uma RPC
     da M2 em falta não é "competição indisponível" — é "ainda não está
     disponível", e o resto fica como estava. Com resposta do servidor (ok,
     ou uma recusa como "Não há nada para confirmar"), relê-se a
     classificação: o ecrã deixa de perguntar o que já não existe. */
  const callResultRpc = async (fn, roundId) => {
    const userId = userIdOf(get);
    if (!userId) return noSession();
    ensureOwner(userId);
    let res;
    try {
      res = await supabase.rpc(fn, { p_round_id: roundId });
    } catch (err) {
      return { ok: false, error: errorOf(err), unavailable: false };
    }
    if (res?.error && isCupM2Missing(res.error)) {
      return { ok: false, error: { code: res.error.code ?? null, message: 'Ainda não está disponível.' }, unavailable: true };
    }
    if (res?.error) console.warn(`Competição (${fn}):`, res.error.message || res.error);
    const active = (get().cup.enrollments || []).find((e) => e?.status === 'ativa') || null;
    if (active && userIdOf(get) === userId) await readResults(userId, active);
    if (res?.error) return { ok: false, error: errorOf(res.error), unavailable: false };
    return { ok: true, data: res?.data ?? null };
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
        writeCupEnrolledHint(userId, !!active);
        if (active) {
          const catalog = get().loadCupCatalog(active.edition_id, { force });
          await Promise.all([
            catalog,
            readParticipations(userId, active.id),
            readResults(userId, active, catalog),
          ]);
        } else if (get().cup.results?.enrollmentId) {
          patchCup(userId, { results: CUP_EMPTY.results });
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
      writeCupEnrolledHint(userId, true);
      const catalog = get().loadCupCatalog(editionId);
      await Promise.all([
        catalog,
        enrollment?.id ? readParticipations(userId, enrollment.id) : null,
        enrollment?.id ? readResults(userId, enrollment, catalog) : null,
      ]);
      return { ok: true, data: enrollment };
    },

    /* Clube, dorsal, objetivo da época, "quem te inscreve", avisos. Mudar
       de clube a meio da época (§4.2) relê a classificação: a coletiva lida
       é a do clube antigo e não passa para o novo (buildCupView também só a
       usa com o mesmo `teamId`). Mudar o dorsal com linhas por confirmar
       também (Fase 4). */
    updateEnrollment: async (enrollmentId, patch) => {
      const userId = userIdOf(get);
      if (!userId) return { ok: false, error: { code: null, message: 'Sem sessão' }, unavailable: false };
      const before = (get().cup.enrollments || []).find((e) => e?.id === enrollmentId) || null;
      const res = await callRpc(userId, 'update_enrollment', { p_enrollment_id: enrollmentId, p_patch: patch || {} });
      if (!res.ok) return res;
      patchCup(userId, (c) => ({ enrollments: upsertById(c.enrollments, res.data) }));
      const after = res.data;
      // Fase 4: mudar o dorsal apaga no servidor as linhas por confirmar do
      // dorsal antigo (trigger da M2) — com alguma no ecrã, relê-se, para o
      // "És tu?" desse dorsal não ficar a perguntar.
      const bibChanged = (before?.bib ?? null) !== (after?.bib ?? null);
      const unconfirmed = (get().cup.results?.rows || []).some((r) => r?.match_status && r.match_status !== 'confirmada');
      if (after?.id && after.status === 'ativa'
        && ((before?.team_id ?? null) !== (after.team_id ?? null) || (bibChanged && unconfirmed))) {
        await readResults(userId, after);
      }
      return res;
    },

    /* Sair (§3.6): o servidor apaga as provas das jornadas por correr e as
       participações sem corrida; as corridas ficam como provas normais. */
    leaveCup: async (enrollmentId) => {
      const userId = userIdOf(get);
      if (!userId) return { ok: false, error: { code: null, message: 'Sem sessão' }, unavailable: false };
      const res = await callRpc(userId, 'leave_cup', { p_enrollment_id: enrollmentId });
      if (!res.ok) return res;
      patchCup(userId, (c) => ({ enrollments: upsertById(c.enrollments, res.data), participations: [], results: CUP_EMPTY.results }));
      writeCupEnrolledHint(userId, false);
      await refreshRacesAfterSync(userId);
      return res;
    },

    /* Depois de um turno em que a Carol gravou na competição (resposta do
       coach-chat com `cup_updated`, só possível a um inscrito — Fase 2):
       relê a competição toda e as provas (a sincronização pode ter criado ou
       apagado a prova de uma jornada) e, se estas mudaram, os planos. */
    refreshCupAfterChat: async () => {
      const userId = userIdOf(get);
      if (!userId) return;
      await get().loadCup({ force: true });
      await refreshRacesAfterSync(userId);
    },

    /* A decisão, a intenção e o "Já me inscrevi" de UMA jornada. `patch`:
       decision ('vou'|'nao_vou'|'nao_sei'|'nao_fui'|null), decision_source
       ('atleta'|'omissao'), intent, intent_source, entry_done (boolean).
       A linha volta DEPOIS da sincronização: com uma principal nesse dia, um
       "Vou" volta null/'colisao' — `collided` diz-lo ao ecrã. */
    setCupParticipation: async (roundId, patch, { refreshRaces = true } = {}) => {
      const userId = userIdOf(get);
      if (!userId) return { ok: false, error: { code: null, message: 'Sem sessão' }, unavailable: false };
      // "Vou" depois de "Saltar": o papel 'saltar' gravado contradiz-se com
      // o "Vou" (o set_cup_participation da Carol recusa o mesmo par) e
      // chegaria ao calendário, ao hub, ao taper e à Carol. Limpa-se aqui,
      // para todos os caminhos que gravam "Vou" (a folha, o "Confirmar", o
      // "Registar"); `intent: null` limpa também o intent_source no servidor.
      if (patch?.decision === 'vou' && !('intent' in patch)) {
        const cur = (get().cup.participations || []).find((p) => p?.round_id === roundId);
        if (cur?.intent === 'saltar') patch = { ...patch, intent: null };
      }
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

    /* ── Fase 3: o calendário do Troféu (specs/trofeu.md §4.3–§4.5) ───── */

    /* O papel de uma jornada, escolhido por ele (intent_source 'atleta').
       "Saltar" é também "Não vou" (§5): a sincronização tira a prova do
       calendário, por isso as provas releem-se. Os outros papéis não mexem
       em provas. */
    setCupRoundIntent: async (roundId, intent) => {
      if (!userIdOf(get)) return noSession();
      if (!SERIES_INTENTS.includes(intent)) return refused('22023', 'Papel inválido');
      if (intent === 'saltar') {
        return get().setCupParticipation(roundId, { decision: 'nao_vou', decision_source: 'atleta', intent: 'saltar', intent_source: 'atleta' });
      }
      return get().setCupParticipation(roundId, { intent, intent_source: 'atleta' });
    },

    /* "Não fui" (§4.5) — só numa jornada que já passou (o servidor recusa
       as outras; aqui nem se pergunta). A sincronização apaga a prova que
       não chegou a ser corrida, por isso as provas releem-se. */
    markCupRoundNotAttended: async (roundId) => {
      if (!userIdOf(get)) return noSession();
      const round = roundOf(roundId);
      const day = typeof round?.date === 'string' ? round.date.slice(0, 10) : null;
      if (!day || day >= lisbonTodayISO()) return refused('22023', '"Não fui" só numa jornada que já passou');
      return get().setCupParticipation(roundId, { decision: 'nao_fui', decision_source: 'atleta' });
    },

    /* "Já me inscrevi" no site do organizador (§4.4) — e o "Desfazer". Não
       mexe em provas. */
    markCupEntryDone: async (roundId, done = true) => {
      if (!userIdOf(get)) return noSession();
      return get().setCupParticipation(roundId, { entry_done: !!done });
    },

    /* "Registar" uma jornada que já passou (§4.5). Com a prova da jornada no
       calendário, é só abrir o registo nela (ok com o raceId, sem RPC). Sem
       ela (disse "Não sei", ou não chegou a decidir), grava-se "Vou": a
       sincronização cria a prova nesse dia — ou liga a que ele já lá tinha
       — e devolve-se o raceId dela.

       `done` (revisão da Fase 3, aviso [b]): a prova já está feita
       (concluída, ou com a corrida ligada — é o caso da "Prova fora da
       agenda" que a sincronização acabou de ligar). Aí o ecrã abre o hub e
       diz "Ligada à jornada", em vez de reabrir o registo de uma prova que
       já tem corrida. As recusas dizem a causa certa: a colisão com uma
       principal; sem prova, o ecrã é que sabe se falta a distância. */
    registerCupRound: async (roundId) => {
      const userId = userIdOf(get);
      if (!userId) return noSession();
      const existing = raceOfRound(roundId);
      if (existing) return { ok: true, data: { raceId: existing.id, done: raceDone(existing) } };
      const round = roundOf(roundId);
      const day = typeof round?.date === 'string' ? round.date.slice(0, 10) : null;
      if (!day || day >= lisbonTodayISO() || round.date_status !== 'confirmada') {
        return refused('22023', 'Só se regista aqui uma jornada que já passou, com data confirmada.');
      }
      const res = await get().setCupParticipation(roundId, { decision: 'vou', decision_source: 'atleta' });
      if (!res.ok) return res;
      if (res.collided) {
        return refused('colisao', 'Nesse dia tens uma prova principal: a jornada ficou por decidir. Regista a corrida nessa prova.');
      }
      const created = raceOfRound(roundId);
      if (!created) return refused('sem_prova', 'Não consegui criar a prova desta jornada.');
      return { ok: true, data: { raceId: created.id, done: raceDone(created) } };
    },

    /* ── Fase 4: a 1.ª correspondência de cada edição (specs/trofeu.md §7) ─

       "Sim, sou eu": confirma a linha por confirmar desta jornada (e o
       servidor confirma com ela as outras propostas do mesmo dorsal). "Não
       sou eu": apaga as não confirmadas desse dorsal e guarda a recusa — a
       correspondência nunca mais o liga nesta edição (só mudar de dorsal
       desbloqueia). As duas releem a classificação. */
    confirmCupResult: (roundId) => callResultRpc('confirm_cup_result', roundId),
    rejectCupResult: (roundId) => callResultRpc('reject_cup_result', roundId),

    /* Promover a jornada a principal ('a') ou voltar a secundária ('b')
       (§4.3). É um update normal da prova do próprio (RLS), SÓ da
       prioridade: a data, a distância e o local são da competição (o trigger
       recusaria, 42501). O custo diz-se ANTES, no ecrã (promotionPreview). */
    setCupRoundPriority: async (roundId, priority) => {
      const userId = userIdOf(get);
      if (!userId) return noSession();
      if (priority !== 'a' && priority !== 'b') return refused('22023', 'Prioridade inválida');
      const race = raceOfRound(roundId);
      if (!race?.id) return refused('sem_prova', 'Esta jornada ainda não tem prova no teu calendário.');
      let res;
      try {
        res = await supabase.from('race_events').update({ race_priority: priority }).eq('id', race.id).eq('user_id', userId).select().maybeSingle();
      } catch (err) {
        return { ok: false, error: errorOf(err), unavailable: false };
      }
      if (res?.error) {
        console.warn('Competição: prioridade da prova:', res.error.message || res.error);
        return { ok: false, error: errorOf(res.error), unavailable: false };
      }
      const row = res?.data;
      if (!row?.id) return refused('PGRST116', 'Não consegui mudar a prova.');
      if (userIdOf(get) === userId) {
        const next = (get().raceEvents || []).map((r) => (r?.id === row.id ? row : r));
        if (typeof get().setRaceEvents === 'function') get().setRaceEvents(next);
        else set({ raceEvents: next });
      }
      return { ok: true, data: row };
    },

    /* Pedir o ecrã do Troféu a partir de outro ecrã (o "+N no calendário" da
       lista, a migalha do hub, a linha do Início). O ecrã vive em Provas
       (RacesScreen): consome o pedido e limpa-o — e deita fora, sem abrir
       nada, um pedido velho ou de outra conta (cupScreenRequestValid). O
       logout também o limpa (setSession, store/index.js). */
    cupScreenRequest: null,
    requestCupScreen: ({ roundId = null, mode = null } = {}) => {
      set({ cupScreenRequest: { roundId, mode, at: Date.now(), userId: userIdOf(get) } });
    },
    clearCupScreenRequest: () => set({ cupScreenRequest: null }),

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
  m2Missing = false;
}
