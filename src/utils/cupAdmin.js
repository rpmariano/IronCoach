import { invokeEdgeFunctionWithTimeout, supabase } from '../lib/supabase';
import { isCupM2Missing, isCupSchemaMissing } from '../store/cupSlice';
import { cupResultsUrlError } from '@formulas/cupResults.ts';

/* Competições por jornadas — ações do backoffice "Competições" (specs/trofeu.md
   §6, Fase 1b). 2026-09-26.

   PORQUÊ EM FICHEIRO PRÓPRIO. Uma sessão em paralelo mexe nos ecrãs do
   atleta e na fatia `cup` do store (cupSlice.js) — este ficheiro não lhe
   toca. O admin não precisa da fatia `cup` do atleta (RLS "own rows" nem lhe
   deixaria ler as inscrições de outros); as tabelas do catálogo
   (cup_competitions, cup_race_series, cup_editions, cup_rounds,
   cup_round_courses, cup_teams) são "leitura quem tem sessão, escrita
   is_admin()" (§3.1, §5a da migração) — dá para ler e escrever diretamente
   pelo cliente, sem RPC, EXCETO onde a spec pede uma RPC de propósito:
   "Confirmar jornada" tem sempre de passar por preview_round_change antes de
   gravar (§6.2), e "Fechar edição" é close_edition (§6.1) — as duas já
   existem na migração M1 e não se reescrevem aqui.

   FORMA DO RESULTADO. Como no cupSlice: { ok: true, data } ou
   { ok: false, error: { code, message }, unavailable }, com a mensagem do
   servidor (já em português — as RPCs e os triggers da M1 escrevem
   RAISE EXCEPTION em português). `unavailable` marca a M1 por aplicar
   (42P01/PGRST205/...): o ecrã mostra "Competições por jornadas ainda não
   disponível" em vez de um erro vermelho — não há nada de admin sem M1.

   FASE 4 (2026-09-27) — a classificação oficial (§6.1, §6.4, §7): os links
   da geral e das jornadas validados pelo formato do adaptador
   (CUP_ADAPTER_URLS, @formulas/cupResults.ts — o job re-valida), o modo da
   leitura automática, o estado do job (cup_sync_state, só agregados), os
   clubes vistos na geral por ligar (cup_team_aliases), "Classificação
   publicada" à mão, os alertas do job (app_logs), "Ler agora" e o ensaio
   sem gravar (a Edge Function cup-standings-sync), e a guarda do "Fechar
   edição" — a mesma regra do servidor (close_edition, M2). Sem a M2, o que
   é dela devolve `m2Missing` (o ecrã diz "precisa da migração M2") em vez
   de um erro. */

const errorOf = (error) => ({ code: error?.code ?? null, message: error?.message ?? String(error ?? 'Erro') });
const ok = (data) => ({ ok: true, data });
const bad = (error) => ({ ok: false, error: errorOf(error), unavailable: isCupSchemaMissing(error) });

// ── Competições e edições ──────────────────────────────────────────────────

/** Todas as competições, cada uma com as suas edições (mais recente primeiro). */
export async function listCompetitions() {
  const { data, error } = await supabase
    .from('cup_competitions')
    .select('*, editions:cup_editions(*)')
    .order('name', { ascending: true });
  if (error) return bad(error);
  const competitions = (data || []).map((c) => ({
    ...c,
    editions: [...(c.editions || [])].sort((a, b) => (b.edition_no ?? 0) - (a.edition_no ?? 0)),
  }));
  return ok(competitions);
}

/** por_anunciar → aberta ou aberta → por_anunciar: escrita direta (§6.1).
 *  'encerrada' passa sempre por closeEdition — não entra aqui. */
export async function setEditionStatus(editionId, status) {
  if (status !== 'por_anunciar' && status !== 'aberta') {
    return bad({ message: 'Estado inválido — usa closeEdition() para encerrar.' });
  }
  const { data, error } = await supabase.from('cup_editions').update({ status }).eq('id', editionId).select().single();
  if (error) return bad(error);
  return ok(data);
}

/** "Fechar edição" (§6.1): encerrada, inscrições a concluída, resumos
 *  gravados, dorsais e correspondência apagados. Pede sempre confirmação no
 *  ecrã antes de chamar isto. */
export async function closeEdition(editionId) {
  const { data, error } = await supabase.rpc('close_edition', { p_edition_id: editionId });
  if (error) return bad(error);
  return ok(data);
}

// ── Séries (o identificador estável de uma prova entre edições, §3.1) ──────

export async function listRaceSeries(competitionId) {
  const { data, error } = await supabase
    .from('cup_race_series')
    .select('*')
    .eq('competition_id', competitionId)
    .order('name', { ascending: true });
  if (error) return bad(error);
  return ok(data || []);
}

export async function createRaceSeries(competitionId, { slug, name }) {
  const { data, error } = await supabase
    .from('cup_race_series')
    .insert({ competition_id: competitionId, slug, name })
    .select()
    .single();
  if (error) return bad(error);
  return ok(data);
}

// ── Jornadas ────────────────────────────────────────────────────────────────

export async function listRounds(editionId) {
  const { data, error } = await supabase
    .from('cup_rounds')
    .select('*')
    .eq('edition_id', editionId)
    .order('round_no', { ascending: true });
  if (error) return bad(error);
  return ok(data || []);
}

export async function createRound(editionId, fields) {
  const { data, error } = await supabase.from('cup_rounds').insert({ edition_id: editionId, ...fields }).select().single();
  if (error) return bad(error);
  return ok(data);
}

/** Guarda campos que NÃO movem provas (nome, série, local, terreno, prazo,
 *  links, source_ref, round_no) — sem preview. Data e date_status vão por
 *  confirmRoundChange, nunca por aqui (§6.2: "Confirmar jornada" é um botão
 *  à parte e pede sempre a pré-visualização). */
export async function updateRound(roundId, patch) {
  if (patch && ('date' in patch || 'date_status' in patch)) {
    return bad({ message: 'Data e estado da data gravam-se só via confirmRoundChange, depois da pré-visualização.' });
  }
  const { data, error } = await supabase.from('cup_rounds').update(patch).eq('id', roundId).select().single();
  if (error) return bad(error);
  return ok(data);
}

/** O impacto de mudar data/date_status, ANTES de gravar (§6.2): bandas
 *  ('0'/'1–19'/'20+'), nunca contagens exatas pequenas. */
export async function previewRoundChange(roundId, patch) {
  const { data, error } = await supabase.rpc('preview_round_change', { p_round_id: roundId, p_patch: patch || {} });
  if (error) return bad(error);
  return ok(data);
}

/** Grava data/date_status DEPOIS de o admin ver a pré-visualização e
 *  confirmar — é uma escrita direta na jornada (a sincronização corre no
 *  trigger cup_rounds_after_update da migração, não aqui). */
export async function confirmRoundChange(roundId, patch) {
  const { data, error } = await supabase.from('cup_rounds').update(patch).eq('id', roundId).select().single();
  if (error) return bad(error);
  return ok(data);
}

/** Apagar (§6.2). O trigger cup_rounds_before_delete recusa se alguma prova
 *  ligada já foi corrida por um atleta (pede para marcar 'cancelada' em vez
 *  disso) — o erro vem em português, direto para o ecrã. O ecrã (RoundForm)
 *  mostra ANTES o impacto com previewRoundChange(id, { date_status:
 *  'cancelada' }) e sugere cancelar (revisão da Fase 1, 2026-09-26). */
export async function deleteRound(roundId) {
  const { error } = await supabase.from('cup_rounds').delete().eq('id', roundId);
  if (error) return bad(error);
  return ok(null);
}

// ── Percursos por jornada ───────────────────────────────────────────────────

export async function listCourses(roundIds) {
  const ids = (roundIds || []).filter(Boolean);
  if (!ids.length) return ok([]);
  const { data, error } = await supabase
    .from('cup_round_courses')
    .select('*')
    .in('round_id', ids)
    .order('code', { ascending: true });
  if (error) return bad(error);
  return ok(data || []);
}

export async function createCourse(roundId, fields) {
  const { data, error } = await supabase.from('cup_round_courses').insert({ round_id: roundId, ...fields }).select().single();
  if (error) return bad(error);
  return ok(data);
}

export async function updateCourse(courseId, patch) {
  const { data, error } = await supabase.from('cup_round_courses').update(patch).eq('id', courseId).select().single();
  if (error) return bad(error);
  return ok(data);
}

export async function deleteCourse(courseId) {
  const { error } = await supabase.from('cup_round_courses').delete().eq('id', courseId);
  if (error) return bad(error);
  return ok(null);
}

// ── Clubes ──────────────────────────────────────────────────────────────────

export async function listTeams(editionId) {
  const { data, error } = await supabase
    .from('cup_teams')
    .select('*')
    .eq('edition_id', editionId)
    .order('name', { ascending: true });
  if (error) return bad(error);
  return ok(data || []);
}

export async function createTeam(editionId, fields) {
  const { data, error } = await supabase.from('cup_teams').insert({ edition_id: editionId, ...fields }).select().single();
  if (error) return bad(error);
  return ok(data);
}

export async function updateTeam(teamId, patch) {
  const { data, error } = await supabase.from('cup_teams').update(patch).eq('id', teamId).select().single();
  if (error) return bad(error);
  return ok(data);
}

/** Um clube já ligado a inscrições recusa-se a apagar por FK — o erro do
 *  servidor (23503) chega ao ecrã tal e qual; não se tenta adivinhar cá. */
export async function deleteTeam(teamId) {
  const { error } = await supabase.from('cup_teams').delete().eq('id', teamId);
  if (error) return bad(error);
  return ok(null);
}

// ── Fase 4: a guarda do "Fechar edição" (decisão do dono, 2026-09-27) ──────

/** O dia de hoje no fuso da edição ("2027-06-14"). */
export function editionTodayISO(timeZone = 'Europe/Lisbon', now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'Europe/Lisbon' }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(now);
  }
}

/** Porque ainda não dá para fechar a edição — ou null (dá). A MESMA regra do
 *  servidor (close_edition, M2): não se fecha sem jornadas, nem com a
 *  última sem data, nem antes de ela passar; as canceladas não contam. A
 *  "última" é a de data mais tarde (uma sem data conta como a mais tarde),
 *  e no empate a de número mais alto. Pura. */
export function closeEditionBlocker(rounds, todayISO, roundLabel = 'Jornada') {
  const rotulo = String(roundLabel || 'Jornada').toLowerCase();
  const dayOf = (v) => (typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null);
  const live = (rounds || []).filter((r) => r && r.date_status !== 'cancelada');
  if (!live.length) return 'a edição não tem jornadas';
  const last = [...live].sort((a, b) => {
    const da = dayOf(a.date);
    const db = dayOf(b.date);
    if (!da !== !db) return da ? 1 : -1; // sem data primeiro (nulls first)
    if (da && db && da !== db) return db.localeCompare(da);
    return (b.round_no ?? 0) - (a.round_no ?? 0);
  })[0];
  const day = dayOf(last.date);
  if (!day) return `a ${rotulo} ${last.round_no ?? ''} ainda não tem data`.replace(/ {2}/g, ' ');
  if (!todayISO || day >= todayISO) {
    return `a última ${rotulo} (${last.round_no ?? '?'}, ${day.slice(8, 10)}/${day.slice(5, 7)}) ainda não passou`;
  }
  return null;
}

// ── Fase 4: os links da classificação e o modo da leitura ───────────────────

const refusedUrl = (message) => ({ ok: false, error: { code: 'url', message }, unavailable: false });

/** O link da classificação geral da edição (cup_editions.standings_url).
 *  Recusa no cliente um link fora do formato do adaptador (`adapter` =
 *  edition.results_adapter); vazio apaga o link. */
export async function updateEditionLinks(editionId, { standings_url } = {}, { adapter = null } = {}) {
  const url = typeof standings_url === 'string' ? standings_url.trim() : '';
  const err = cupResultsUrlError(adapter, 'geral', url);
  if (err) return refusedUrl(err);
  const { data, error } = await supabase.from('cup_editions').update({ standings_url: url || null }).eq('id', editionId).select().single();
  if (error) return bad(error);
  return ok(data);
}

/** O modo da leitura automática: 'desligado' | 'observar' | 'publicar'. */
export const CUP_SYNC_MODES = Object.freeze(['desligado', 'observar', 'publicar']);

export async function setEditionSyncMode(editionId, mode) {
  if (!CUP_SYNC_MODES.includes(mode)) return bad({ code: '22023', message: 'Modo inválido.' });
  const { data, error } = await supabase.from('cup_editions').update({ sync_mode: mode }).eq('id', editionId).select().single();
  if (error) return bad(error);
  return ok(data);
}

// ── Fase 4: o estado do job (só agregados) ──────────────────────────────────

const m2Missing = (error) => ({ ok: false, error: errorOf(error), unavailable: false, m2Missing: true });

// Sem rows_by_category (contagens por escalão — agregadas, mas o ecrã não as
// mostra) e sem o trinco.
const SYNC_STATE_COLUMNS = 'target, round_id, url, last_checked_at, last_status, last_codes, hash_seen_at, ready_at, stable_at, fail_since, rows_total, summary, updated_at';

/** O estado do job por página desta edição (cup_sync_state, só o admin lê).
 *  Sem a M2: { ok: false, m2Missing: true }. */
export async function listSyncState(editionId) {
  const { data, error } = await supabase.from('cup_sync_state').select(SYNC_STATE_COLUMNS).eq('edition_id', editionId);
  if (error) return isCupM2Missing(error) ? m2Missing(error) : bad(error);
  return ok(data || []);
}

/** Quando saiu a classificação de cada jornada (cup_round_publication, M1). */
export async function listRoundPublication(roundIds) {
  const ids = (roundIds || []).filter(Boolean);
  if (!ids.length) return ok([]);
  const { data, error } = await supabase.from('cup_round_publication').select('round_id, results_ready_at, source, stable_at').in('round_id', ids);
  if (error) return bad(error);
  return ok(data || []);
}

/** "Classificação publicada" à mão (§6.4, o recurso quando o job não a vê):
 *  results_ready_at = agora, source 'manual'. */
export async function markRoundPublished(roundId) {
  const { data, error } = await supabase
    .from('cup_round_publication')
    .upsert({ round_id: roundId, results_ready_at: new Date().toISOString(), source: 'manual' }, { onConflict: 'round_id' })
    .select()
    .single();
  if (error) return bad(error);
  return ok(data);
}

/** Os nomes de clubes vistos na classificação (a coluna Equipa da geral —
 *  organizações, não pessoas), ligados ou por ligar a um clube da edição. */
export async function listAliases(editionId) {
  const { data, error } = await supabase
    .from('cup_team_aliases')
    .select('id, alias_norm, team_id, first_seen_at, last_seen_at')
    .eq('edition_id', editionId)
    .order('alias_norm', { ascending: true });
  if (error) return bad(error);
  return ok(data || []);
}

/** "Ligar a…": o nome visto passa a contar como este clube. */
export async function linkAlias(aliasId, teamId) {
  const { data, error } = await supabase.from('cup_team_aliases').update({ team_id: teamId || null }).eq('id', aliasId).select().single();
  if (error) return bad(error);
  return ok(data);
}

/** Os alertas recentes do job (app_logs, event 'cup-standings-sync'; só
 *  códigos e contagens — o job nunca regista nomes, dorsais ou clubes). */
export async function listSyncAlerts(limit = 20) {
  const { data, error } = await supabase
    .from('app_logs')
    .select('id, level, message, meta, created_at')
    .eq('event', 'cup-standings-sync')
    // Só as do job (grava sempre sem utilizador): os erros do cliente no
    // "Ler agora"/ensaio (logAppEvent) têm o mesmo event e não são alertas.
    .is('user_id', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return bad(error);
  return ok(data || []);
}

// ── Fase 4: a Edge Function cup-standings-sync (C.1 do desenho) ─────────────

export const CUP_SYNC_FUNCTION = 'cup-standings-sync';
export const CUP_SYNC_TIMEOUT_MS = 90000;
export const CUP_ENSAIO_MAX_ROUNDS = 12;

async function invokeSync(body) {
  const res = await invokeEdgeFunctionWithTimeout(CUP_SYNC_FUNCTION, { body }, CUP_SYNC_TIMEOUT_MS);
  if (res?.error) {
    return { ok: false, error: { code: res.status ?? null, message: res.error }, unavailable: false, isTimeout: !!res.isTimeout };
  }
  return ok(res?.data ?? null);
}

/** "Ler agora": uma volta já, no modo da edição (o job recusa com 409 uma
 *  edição desligada). `roundIds` limita às jornadas dadas. */
export async function runCupSync(editionId, roundIds = null) {
  const ids = (roundIds || []).filter(Boolean);
  return invokeSync({ modo: 'correr', edition_id: editionId, ...(ids.length ? { round_ids: ids } : {}) });
}

/** Os links do ensaio, validados como o job os valida: 1 a 12 jornadas e,
 *  opcional, a geral. { jornadas, geral, erro } — `erro` é a 1.ª frase que
 *  falhar (null se tudo serve). Pura. */
export function ensaioLinks({ jornadas, geral } = {}, adapter = 'trofeu_cascais') {
  const lista = (Array.isArray(jornadas) ? jornadas : String(jornadas || '').split(/\s+/))
    .map((u) => String(u || '').trim())
    .filter(Boolean);
  const g = String(geral || '').trim() || null;
  if (!lista.length) return { jornadas: lista, geral: g, erro: 'Cola pelo menos o link de uma prova.' };
  if (lista.length > CUP_ENSAIO_MAX_ROUNDS) return { jornadas: lista, geral: g, erro: `No máximo ${CUP_ENSAIO_MAX_ROUNDS} provas por ensaio.` };
  for (const u of lista) {
    const e = cupResultsUrlError(adapter, 'jornada', u);
    if (e) return { jornadas: lista, geral: g, erro: e };
  }
  if (g) {
    const e = cupResultsUrlError(adapter, 'geral', g);
    if (e) return { jornadas: lista, geral: g, erro: e };
  }
  return { jornadas: lista, geral: g, erro: null };
}

/** O ensaio sem gravar (C.6): lê e valida as páginas dadas (ex.: as 11 da
 *  33.ª e a geral) e devolve só agregados. Links inválidos → recusado aqui,
 *  sem pedido. */
export async function runCupEnsaio({ jornadas, geral = null, pointsTable = null, adapter = 'trofeu_cascais' } = {}) {
  const v = ensaioLinks({ jornadas, geral }, adapter);
  if (v.erro) return refusedUrl(v.erro);
  const table = Array.isArray(pointsTable) && pointsTable.length ? pointsTable : null;
  return invokeSync({ modo: 'ensaio', jornadas: v.jornadas, ...(v.geral ? { geral: v.geral } : {}), ...(table ? { points_table: table } : {}) });
}
