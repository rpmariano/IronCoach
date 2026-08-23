// Bloco 1 — Objetivo e viabilidade
// Implementa a flag objetivo_inviavel a partir da doutrina registada em
// src/coach-knowledge/01-objetivo-viabilidade.md.
//
// Fontes: Daniels' Running Formula 4th Ed (2021); Faster Road Racing /
// Advanced Marathoning 3rd Ed (Pfitzinger 2014/2019); Hal Higdon Training
// Programs (2021); Training Essentials for Ultrarunning 2nd Ed (Koop, 2021).
// Confiança: ALTA (ver doutrina §1).
//
// ─── Duplicado parcialmente em supabase/functions/coach-chat/index.ts ───────
// As Edge Functions Deno não acedem a src/. Qualquer alteração aqui deve ser
// espelhada na função VIABILITY_TABLES em coach-chat/index.ts. Os testes
// aqui cobrem a lógica canónica — os testes Deno verificam a versão do servidor.

// ---------------------------------------------------------------------------
// Constantes — Bloco 1 #1: semanas mínimas de preparação por nível × distância
//
// Valor MÍNIMO da faixa de cada nível: "menos do que isto é definitivamente
// insuficiente". O limite superior da faixa serve de objetivo ideal mas não
// é usado para a flag (seria demasiado conservador).
//
// Iniciante × ultra: null = desaconselhado pela doutrina (#1: "não recomendado");
// os números de volume da #2 só medem a distância ao patamar, não o habilitam.
// ---------------------------------------------------------------------------
export const MIN_PREP_WEEKS = {
  iniciante: { '5k':  6, '10k': 10, 'meia': 16, 'maratona': 24, 'ultra': null },
  basico:    { '5k':  6, '10k':  8, 'meia': 12, 'maratona': 18, 'ultra':   24 },
  medio:     { '5k':  4, '10k':  6, 'meia': 10, 'maratona': 14, 'ultra':   18 },
  avancado:  { '5k':  4, '10k':  4, 'meia':  8, 'maratona': 12, 'ultra':   14 },
};

// ---------------------------------------------------------------------------
// Constantes — Bloco 1 #2: volume semanal pré-requisito por nível × distância
//
// Valor MÍNIMO da faixa em km/semana, pressupondo ≥80% em Z1/Z2.
// ---------------------------------------------------------------------------
export const MIN_VOLUME_KM = {
  iniciante: { '5k': 10, '10k': 15, 'meia': 25, 'maratona': 35, 'ultra': 45 },
  basico:    { '5k': 15, '10k': 25, 'meia': 35, 'maratona': 45, 'ultra': 55 },
  medio:     { '5k': 25, '10k': 35, 'meia': 45, 'maratona': 60, 'ultra': 70 },
  avancado:  { '5k': 35, '10k': 45, 'meia': 60, 'maratona': 75, 'ultra': 90 },
};

// ---------------------------------------------------------------------------
// categorizeDistance — mapeia distância em km para categoria normativa
// ---------------------------------------------------------------------------
export function categorizeDistance(km) {
  if (km == null || isNaN(km)) return null;
  if (km <=  5.5) return '5k';
  if (km <= 11.0) return '10k';
  if (km <= 22.5) return 'meia';
  if (km <= 50.0) return 'maratona';
  return 'ultra';
}

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
