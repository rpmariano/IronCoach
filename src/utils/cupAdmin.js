import { supabase } from '../lib/supabase';
import { isCupSchemaMissing } from '../store/cupSlice';

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
   disponível" em vez de um erro vermelho — não há nada de admin sem M1. */

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
