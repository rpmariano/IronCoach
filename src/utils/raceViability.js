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
import { computeRecentWeeklyVolume, assessRaceViability as sharedAssessRaceViability } from '@formulas/raceViability.ts';

// ---------------------------------------------------------------------------
// recentWeeklyVolume — volume médio semanal das últimas `weeks` semanas
//
// @param {Array}  runs     — [{date: 'YYYY-MM-DD', distance_km: number}]
// @param {string} todayISO — data de hoje em formato ISO
// @param {number} weeks    — janela temporal (padrão: 4 semanas)
// @returns {number} média em km/semana (0 se sem dados)
// ---------------------------------------------------------------------------
// Delega em @formulas/raceViability.ts (T1.5) — única implementação,
// partilhada com a Carol (specs/formulas-checklist.md Fase E).
export function recentWeeklyVolume(runs, todayISO, weeks = 4) {
  return computeRecentWeeklyVolume(runs, todayISO, weeks);
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
//   'tempo_insuficiente'    — semanas < mínimo para dist/nível. NÃO é
//                             suprimido por ter base nem por ser B/C-race:
//                             a doutrina diz que semanas e volume 'somam-se,
//                             não se substituem' (Bloco 1 #1), e a prioridade
//                             só afeta o taper (Bloco 2.3 #1). Ver a nota
//                             completa em @formulas/raceViability.ts.
//   'volume_insuficiente'   — volume médio < pré-requisito para dist/nível
//
// Regras de não aplicação (retorna isViable=true sem flags):
//   - Prova já passou ou é hoje (weeksToRace <= 0)
//   - Nível ou distância desconhecidos
// ---------------------------------------------------------------------------
// Delega em @formulas/raceViability.ts (T1.5) — única implementação,
// partilhada com a Carol (specs/formulas-checklist.md Fase E). Ver o
// comentário nesse módulo sobre `racePriority` não ter efeito — divergência
// doutrina↔código pré-existente, replicada fielmente, não introduzida aqui.
export function assessRaceViability(opts) {
  return sharedAssessRaceViability(opts);
}
