// T0 — Vocabulário e constantes de doutrina partilhados entre o frontend
// (via alias Vite @formulas) e as Edge Functions (via caminho relativo).
//
// Regra de pureza (ver specs/formulas-centralizacao.md §3.2): zero
// dependências de runtime — nada de date-fns, nada de jsr:@supabase/...,
// nada de React. Só primitivos in/out, para o mesmo ficheiro correr sem
// alterações no Vite e no Deno.
//
// @doutrina specs/formulas-checklist.md Fase B

// ─── Género ──────────────────────────────────────────────────────────────
// profiles.gender só grava 'M'/'F' (ver src/components/Perfil/Perfil.jsx
// linhas 452-453 — é a fonte da verdade). normalizeGender() aceita também
// os valores por extenso ('masculino'/'feminino') e minúsculas por
// defensividade, porque essa era exatamente a comparação que faltava em
// coach-daily-summary/index.ts e causava o bug do P0-1 (specs/
// formulas-checklist.md): comparar com a string errada em vez de normalizar
// primeiro. Qualquer chamador que use normalizeGender() em vez de comparar
// à mão fica imune a esta classe de erro.
export type Gender = 'M' | 'F';

export function normalizeGender(raw: string | null | undefined): Gender | null {
  if (raw === 'M' || raw === 'F') return raw;
  if (raw === 'masculino' || raw === 'm') return 'M';
  if (raw === 'feminino' || raw === 'f') return 'F';
  return null;
}

// ─── Nível de experiência ────────────────────────────────────────────────
// Mesmo vocabulário para profiles.experience_level (geral) e
// race_events.experience_level (por prova) — ver src/utils/experience.js,
// que é a fonte canónica dos rótulos/critérios no frontend. Aqui só ficam
// as chaves, porque é o que as fórmulas precisam para indexar as tabelas
// abaixo.
export type ExperienceLevel = 'iniciante' | 'basico' | 'medio' | 'avancado';

export const EXPERIENCE_LEVEL_KEYS: ExperienceLevel[] = ['iniciante', 'basico', 'medio', 'avancado'];

export function isExperienceLevel(raw: string | null | undefined): raw is ExperienceLevel {
  return EXPERIENCE_LEVEL_KEYS.includes(raw as ExperienceLevel);
}

// ─── Prioridade de prova ─────────────────────────────────────────────────
// Espelha RACE_PRIORITIES em src/utils/run.js. Determina o taper: 'a' leva
// polimento completo, 'b'/'c' levam taper curto.
export type RacePriority = 'a' | 'b' | 'c';

export function isRacePriority(raw: string | null | undefined): raw is RacePriority {
  return raw === 'a' || raw === 'b' || raw === 'c';
}

// ─── Categoria de distância de prova ─────────────────────────────────────
// Fronteiras exatas da doutrina (Bloco 1 #1/#2, src/coach-knowledge/
// 01-objetivo-viabilidade.md). Espelhada até agora em 3 sítios
// (raceViability.js, coach-chat, coach-daily-summary) com os mesmos
// limiares — movida para cá para deixar de ser cópia.
export type RaceDistanceCategory = '5k' | '10k' | 'meia' | 'maratona' | 'ultra';

export function categorizeDistance(km: number | null | undefined): RaceDistanceCategory | null {
  if (km == null || Number.isNaN(km)) return null;
  if (km <= 5.5) return '5k';
  if (km <= 11.0) return '10k';
  if (km <= 22.5) return 'meia';
  if (km <= 50.0) return 'maratona';
  return 'ultra';
}

// ─── Bloco 1 #1 — Semanas mínimas de preparação por nível × distância ────
// Valor MÍNIMO da faixa de cada nível: "menos do que isto é definitivamente
// insuficiente". Iniciante × ultra: null = desaconselhado pela doutrina.
// Fonte: Daniels' Running Formula 4th Ed (2021); Faster Road Racing /
// Advanced Marathoning 3rd Ed (Pfitzinger 2014/2019); Hal Higdon Training
// Programs (2021); Training Essentials for Ultrarunning 2nd Ed (Koop, 2021).
//
// Tipado como Record<string, ...>, não Record<ExperienceLevel, ...>: os
// chamadores existentes (raceViability.js, coach-chat, coach-daily-summary)
// indexam estas tabelas com variáveis já tipadas como `string | null` vindas
// de fora (profile.experience_level, race.experience_level) — exigir aqui o
// tipo literal só empurraria `as ExperienceLevel` para todos os chamadores
// sem ganho real de segurança, já que o valor vem sempre de fora do módulo.
export const MIN_PREP_WEEKS: Record<string, Record<RaceDistanceCategory, number | null>> = {
  iniciante: { '5k': 6, '10k': 10, meia: 16, maratona: 24, ultra: null },
  basico:    { '5k': 6, '10k':  8, meia: 12, maratona: 18, ultra:   24 },
  medio:     { '5k': 4, '10k':  6, meia: 10, maratona: 14, ultra:   18 },
  avancado:  { '5k': 4, '10k':  4, meia:  8, maratona: 12, ultra:   14 },
};

// ─── Bloco 1 #2 — Volume semanal pré-requisito por nível × distância ─────
// Valor MÍNIMO da faixa em km/semana, pressupondo ≥80% em Z1/Z2.
export const MIN_VOLUME_KM: Record<string, Record<RaceDistanceCategory, number>> = {
  iniciante: { '5k': 10, '10k': 15, meia: 25, maratona: 35, ultra: 45 },
  basico:    { '5k': 15, '10k': 25, meia: 35, maratona: 45, ultra: 55 },
  medio:     { '5k': 25, '10k': 35, meia: 45, maratona: 60, ultra: 70 },
  avancado:  { '5k': 35, '10k': 45, meia: 60, maratona: 75, ultra: 90 },
};
