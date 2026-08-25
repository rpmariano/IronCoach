// Bloco 1 — Objetivo e viabilidade
// Implementa a flag objetivo_inviavel a partir da doutrina registada em
// src/coach-knowledge/01-objetivo-viabilidade.md.
//
// Fontes: Daniels' Running Formula 4th Ed (2021); Faster Road Racing /
// Advanced Marathoning 3rd Ed (Pfitzinger 2014/2019); Hal Higdon Training
// Programs (2021); Training Essentials for Ultrarunning 2nd Ed (Koop, 2021).
// Confiança: ALTA (ver doutrina §1).
//
// MIN_PREP_WEEKS, MIN_VOLUME_KM e categorizeDistance vivem em
// supabase/functions/_shared/formulas/vocabulary.ts (T0) — reexportados
// aqui para não quebrar os importadores existentes. Deixaram de ser cópia:
// as Edge Functions importam o mesmo ficheiro por caminho relativo (ver
// specs/formulas-centralizacao.md §3.1, specs/formulas-checklist.md Fase B).
import { MIN_PREP_WEEKS, MIN_VOLUME_KM, categorizeDistance } from '@formulas/vocabulary.ts';
export { MIN_PREP_WEEKS, MIN_VOLUME_KM, categorizeDistance };

// ---------------------------------------------------------------------------
// recentWeeklyVolume — volume médio semanal das últimas `weeks` semanas
//
// @param {Array}  runs     — [{date: 'YYYY-MM-DD', distance_km: number}]
// @param {string} todayISO — data de hoje em formato ISO
// @param {number} weeks    — janela temporal (padrão: 4 semanas)
// @returns {number} média em km/semana (0 se sem dados)
// ---------------------------------------------------------------------------
export function recentWeeklyVolume(runs, todayISO, weeks = 4) {
  if (!Array.isArray(runs) || runs.length === 0) return 0;
  const cutoffMs = new Date(todayISO + 'T00:00:00').getTime() - weeks * 7 * 86400000;
  const total = runs
    .filter(r => r.date && new Date(r.date + 'T00:00:00').getTime() >= cutoffMs)
    .reduce((s, r) => s + (Number(r.distance_km) || 0), 0);
  return Math.round((total / weeks) * 10) / 10;
}

// ---------------------------------------------------------------------------
// assessRaceViability — avalia a viabilidade de uma prova
//
// @param {object} opts
//   distanceKm     {number|null}  — distância da prova em km
//   experienceLevel {string|null} — nível ('iniciante'|'basico'|'medio'|'avancado')
//   weeksToRace    {number}       — semanas inteiras até à data da prova
//   weeklyVolumeKm {number|null}  — média km/semana nas últimas 4 semanas
//   racePriority   {string}       — 'a', 'b', 'c' (por defeito 'a')
//
// @returns {{ flags: string[], isViable: boolean }}
//
// flags pode conter:
//   'ultra_para_iniciante'  — ultra bloqueado por nível (sempre desaconselhado)
//   'tempo_insuficiente'    — semanas < mínimo para dist/nível (ignorado se tiver base ou B/C race)
//   'volume_insuficiente'   — volume médio < pré-requisito para dist/nível
//
// Regras de não aplicação (retorna isViable=true sem flags):
//   - Prova já passou ou é hoje (weeksToRace <= 0)
//   - Nível ou distância desconhecidos
// ---------------------------------------------------------------------------
export function assessRaceViability({ distanceKm, experienceLevel, weeksToRace, weeklyVolumeKm, racePriority = 'a' }) {
  const flags = [];

  // Não avaliar provas já passadas ou de hoje — sem tempo de preparar de qualquer forma.
  if (weeksToRace <= 0) return { flags, isViable: true };

  const cat = categorizeDistance(distanceKm);
  const level = experienceLevel;

  // Sem dados suficientes para avaliar.
  if (!cat || !level || !MIN_PREP_WEEKS[level]) return { flags, isViable: true };

  // Regra especial: ultra + iniciante → sempre desaconselhado.
  if (cat === 'ultra' && level === 'iniciante') {
    flags.push('ultra_para_iniciante');
  }

  const minWeeks = MIN_PREP_WEEKS[level][cat];
  const minVol = MIN_VOLUME_KM[level][cat];

  // Volume semanal abaixo do pré-requisito (Bloco 1 #2).
  // Avalia primeiro para sabermos se o atleta tem base.
  let hasBaseFitness = false;
  if (minVol != null && weeklyVolumeKm != null) {
    if (weeklyVolumeKm < minVol) {
      flags.push('volume_insuficiente');
    } else {
      hasBaseFitness = true;
    }
  }

  // Tempo de preparação insuficiente (Bloco 1 #1).
  if (minWeeks != null && weeksToRace < minWeeks) {
    flags.push('tempo_insuficiente');
  }

  return { flags, isViable: flags.length === 0 };
}
