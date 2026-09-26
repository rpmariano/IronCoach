// Fixtures das competições por jornadas (specs/trofeu.md §3.1 e §10, Fase 1).
// 2026-09-26.
//
// Duas competições com valores DIFERENTES em todas as colunas de regras: se
// uma função de cup.ts assumir, sem querer, um valor de Cascais (70%, 25 km,
// 'por_jornada', idade no dia da prova…), os testes da fictícia apanham-no.
// "Uma 2.ª competição entra por dados" (§1) só é verdade se isto passar.
//
// Cascais segue o seed da M1 (20260926152856_cup_competitions.sql) — regras
// PROVÁVEIS até ao regulamento da 34.ª. As jornadas, percursos e escalões de
// Cascais aqui são ILUSTRATIVOS (a M1 não tem jornadas: o calendário nunca vai
// por migração), com as datas da janela prevista (1.ª jornada 6–13/12/2026).
// Nada aqui é de pessoas reais.

import type { CupCategory, CupCourse, CupCourseOverride, CupEdition, CupRound, CupTeam } from "./cup.ts";

// ── Troféu de Cascais, 34.ª (2026/27) ─────────────────────────────────────

export const CASCAIS_COMPETITION = {
  id: "comp-cascais",
  slug: "trofeu-cascais",
  name: "Troféu de Atletismo de Cascais",
  short_name: "Troféu de Cascais",
  round_label: "Jornada",
};

/** A edição tal como o seed a deixa (por anunciar). */
export const CASCAIS_34: CupEdition = {
  id: "ed-cascais-34",
  competition_id: CASCAIS_COMPETITION.id,
  edition_no: 34,
  season_label: "2026/27",
  status: "por_anunciar",
  closed_at: null,
  regulation_url: null,
  standings_url: null,
  entry_url: null,
  points_mode: "tabela",
  points_table: [15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  points_basis: null,
  team_scoring: "soma_todos",
  team_min_athletes: 4,
  team_counting_n: null,
  counting_rule: "pct_minima",
  counting_value: 70,
  entry_mode: "por_jornada",
  bib_scope: "epoca",
  age_rule: null,
  results_source: "adaptador",
  results_adapter: "trofeu_cascais",
  area_lat: 38.72,
  area_lon: -9.40,
  area_radius_km: 25,
  sync_mode: "desligado",
  notifications_enabled: false,
  entry_deadline_weekday: 3,
  entry_deadline_time: "24:00:00",
  time_zone: "Europe/Lisbon",
};

/** A mesma edição depois de "Publicar edição". */
export const CASCAIS_34_ABERTA: CupEdition = { ...CASCAIS_34, status: "aberta" };

export const CASCAIS_TEAMS: CupTeam[] = [
  { id: "t-naza", edition_id: CASCAIS_34.id, name: "Núcleo de Atletismo da Zona da Abóboda (NAZA)", short_name: "NAZA", kind: "clube", eligible_final: null },
  { id: "t-ccd", edition_id: CASCAIS_34.id, name: "CCD do Pessoal do Município de Cascais", short_name: "CCD Cascais", kind: "clube", eligible_final: null },
  { id: "t-ind", edition_id: CASCAIS_34.id, name: "Individual", short_name: "Individual", kind: "individual", eligible_final: null },
];

/** Escalões ILUSTRATIVOS (as idades por escalão estão por confirmar, §11.3). */
export const CASCAIS_CATEGORIES: CupCategory[] = [
  { id: "c-sen-m", edition_id: CASCAIS_34.id, code: "SENM", gender: "M", min_age: 20, max_age: 34, course_code: "LONGO" },
  { id: "c-m35", edition_id: CASCAIS_34.id, code: "M35", gender: "M", min_age: 35, max_age: 44, course_code: "LONGO" },
  { id: "c-m45", edition_id: CASCAIS_34.id, code: "M45", gender: "M", min_age: 45, max_age: 54, course_code: "LONGO" },
  { id: "c-m55", edition_id: CASCAIS_34.id, code: "M55", gender: "M", min_age: 55, max_age: null, course_code: "CURTO" },
  { id: "c-sen-f", edition_id: CASCAIS_34.id, code: "SENF", gender: "F", min_age: 20, max_age: 34, course_code: "LONGO" },
  { id: "c-f35", edition_id: CASCAIS_34.id, code: "F35", gender: "F", min_age: 35, max_age: null, course_code: "CURTO" },
];

export const CASCAIS_ROUNDS: CupRound[] = [
  { id: "r-c1", edition_id: CASCAIS_34.id, round_no: 1, name: "Padroeira", date: "2026-12-06", date_status: "provavel", terrain: "estrada" },
  { id: "r-c2", edition_id: CASCAIS_34.id, round_no: 2, name: "Corta-mato do NAZA", date: "2027-01-10", date_status: "confirmada", terrain: "corta_mato" },
  { id: "r-c3", edition_id: CASCAIS_34.id, round_no: 3, name: "Corrida CCD Cascais", date: "2027-01-24", date_status: "confirmada", terrain: "estrada" },
  { id: "r-c4", edition_id: CASCAIS_34.id, round_no: 4, name: "GP Monte Real", date: "2027-02-21", date_status: "confirmada", terrain: "estrada" },
  { id: "r-c5", edition_id: CASCAIS_34.id, round_no: 5, name: "GP Os Galgos Audazes", date: null, date_status: "provavel", terrain: "estrada" },
  { id: "r-c6", edition_id: CASCAIS_34.id, round_no: 6, name: "Légua de Janes", date: "2027-03-14", date_status: "cancelada", terrain: "estrada" },
];

export const CASCAIS_COURSES: CupCourse[] = [
  { id: "k-c1", round_id: "r-c1", code: "UNICO", name: "Percurso único", distance_m: 7000, distance_status: "provisoria", start_time: "10:00:00" },
  { id: "k-c2l", round_id: "r-c2", code: "LONGO", name: "Longo", distance_m: 8000, distance_status: "oficial", start_time: "10:30:00" },
  { id: "k-c2c", round_id: "r-c2", code: "CURTO", name: "Curto", distance_m: 4000, distance_status: "oficial", start_time: "09:45:00" },
  { id: "k-c3l", round_id: "r-c3", code: "LONGO", name: "Longo", distance_m: 7400, distance_status: "oficial", start_time: "09:30:00" },
  { id: "k-c3c", round_id: "r-c3", code: "CURTO", name: "Curto", distance_m: 3700, distance_status: "oficial", start_time: "09:00:00" },
];

/** No corta-mato, os M45 fazem o curto. */
export const CASCAIS_OVERRIDES: CupCourseOverride[] = [
  { round_id: "r-c2", category_code: "M45", course_code: "CURTO" },
];

// ── Circuito fictício — todas as regras diferentes ───────────────────────

export const FICTICIA_COMPETITION = {
  id: "comp-ilha",
  slug: "circuito-da-ilha",
  name: "Circuito de Corrida da Ilha",
  short_name: "Circuito da Ilha",
  round_label: "Etapa",
};

export const FICTICIA_1: CupEdition = {
  id: "ed-ilha-1",
  competition_id: FICTICIA_COMPETITION.id,
  edition_no: 1,
  season_label: "2027",
  status: "aberta",
  closed_at: null,
  regulation_url: "https://example.org/regulamento",
  standings_url: "https://example.org/classificacao",
  entry_url: "https://example.org/inscricao",
  points_mode: "sem_pontos",
  points_table: [20, 18, 16],
  points_basis: "geral",
  team_scoring: "melhores_n",
  team_min_athletes: 3,
  team_counting_n: 5,
  counting_rule: "melhores_n",
  counting_value: 4,
  entry_mode: "epoca",
  bib_scope: "jornada",
  age_rule: "fim_ano_civil",
  results_source: "manual",
  results_adapter: null,
  // Ponta Delgada, 12 km.
  area_lat: 37.7412,
  area_lon: -25.6756,
  area_radius_km: 12,
  sync_mode: "observar",
  notifications_enabled: true,
  entry_deadline_weekday: 5,
  entry_deadline_time: "18:00:00",
  time_zone: "Atlantic/Azores",
};

export const FICTICIA_TEAMS: CupTeam[] = [
  { id: "t-ilha-a", edition_id: FICTICIA_1.id, name: "Clube Atlântico", kind: "clube", eligible_final: true },
  { id: "t-ilha-b", edition_id: FICTICIA_1.id, name: "Grupo Desportivo do Porto", kind: "clube", eligible_final: false },
  { id: "t-ilha-ind", edition_id: FICTICIA_1.id, name: "Individual", kind: "individual", eligible_final: true },
];

/** Escalões mistos e um só por género, para o desempate "com género antes de
 *  misto" ter de funcionar. */
export const FICTICIA_CATEGORIES: CupCategory[] = [
  { id: "c-ilha-abs", edition_id: FICTICIA_1.id, code: "ABS", gender: null, min_age: null, max_age: null, course_code: "10K" },
  { id: "c-ilha-vet", edition_id: FICTICIA_1.id, code: "VET", gender: null, min_age: 50, max_age: null, course_code: "5K" },
  { id: "c-ilha-vf", edition_id: FICTICIA_1.id, code: "VETF", gender: "F", min_age: 40, max_age: null, course_code: "5K" },
];

export const FICTICIA_ROUNDS: CupRound[] = [
  { id: "r-i1", edition_id: FICTICIA_1.id, round_no: 1, name: "Etapa das Portas", date: "2027-03-06", date_status: "confirmada", terrain: "trail" },
  { id: "r-i2", edition_id: FICTICIA_1.id, round_no: 2, name: "Etapa da Lagoa", date: "2027-04-03", date_status: "confirmada", terrain: "pista" },
  { id: "r-i3", edition_id: FICTICIA_1.id, round_no: 3, name: "Etapa do Farol", date: "2027-05-01", date_status: "adiada", terrain: "estrada" },
  { id: "r-i4", edition_id: FICTICIA_1.id, round_no: 4, name: "Etapa do Porto", date: "2027-06-05", date_status: "confirmada", terrain: "estrada" },
  { id: "r-i5", edition_id: FICTICIA_1.id, round_no: 5, name: "Etapa Final", date: "2027-07-03", date_status: "confirmada", terrain: "estrada" },
];

export const FICTICIA_COURSES: CupCourse[] = [
  { id: "k-i1a", round_id: "r-i1", code: "10K", distance_m: 10200, distance_status: "oficial", start_time: "08:00:00" },
  { id: "k-i1b", round_id: "r-i1", code: "5K", distance_m: 5100, distance_status: "oficial", start_time: "08:15:00" },
  // Etapa de pista: só um percurso, e com um código que nenhum escalão usa.
  { id: "k-i2", round_id: "r-i2", code: "MILHA", distance_m: 1609, distance_status: "oficial", start_time: "19:00:00" },
];

export const FICTICIA_OVERRIDES: CupCourseOverride[] = [];

// ── Personas (§4.1: onde treinam) ────────────────────────────────────────

export const PERSONAS = {
  /** Treina em Cascais. */
  cascais: { id: "p-cascais", gender: "M", birth_date: "1983-01-24", training_lat: 38.6979, training_lon: -9.4215 },
  /** Treina em Lisboa (Marquês), ~22 km do centro da área de Cascais. */
  lisboa: { id: "p-lisboa", gender: "F", birth_date: "1990-06-15", training_lat: 38.7253, training_lon: -9.1500 },
  /** Treina no Porto — fora de qualquer área. */
  porto: { id: "p-porto", gender: "M", birth_date: "1975-11-02", training_lat: 41.1496, training_lon: -8.6109 },
  /** Sem local de treino no perfil. */
  semLocal: { id: "p-sem", gender: null, birth_date: null, training_lat: null, training_lon: null },
  /** Treina em Ponta Delgada. */
  ilha: { id: "p-ilha", gender: "F", birth_date: "1986-12-31", training_lat: 37.7394, training_lon: -25.6687 },
};
