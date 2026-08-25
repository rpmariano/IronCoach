// T1 — Dias de recuperação pós-prova (sem intensidade Z4/Z5), fórmula pura.
//
// @doutrina src/coach-knowledge/02-corrida-prova.md Bloco 2.3 #2
// @doutrina specs/coach-investigacao.md "Corrida 2.3 — Prova (registo)" #2
//
// A doutrina dá uma GAMA de dias por nível×distância. Como em taper.ts,
// usa-se sempre o limite SUPERIOR da gama (mais conservador). Antes desta
// migração, `getRecoveryDaysAfterRace` só distinguia "avançado" de "toda a
// gente" (2 grupos) — a doutrina tem 4 níveis com valores bem diferentes
// entre si (ex.: Iniciante numa maratona precisa de 28-35 dias, Médio só
// 14-21); a simplificação de 2 grupos dava um valor demasiado curto para
// iniciante/básico e demasiado longo para médio, em quase todas as
// distâncias. Ver specs/formulas-checklist.md Fase C/E.
//
// Avançado + Maratona tem um CONFLITO na doutrina, nunca antes resolvido:
// 10-14 dias (Pfitzinger/Canova) vs. 26 dias, regra "1 dia por milha em
// esforço máximo" (Daniels/Galloway). Decisão do utilizador: 26 dias — o
// mais conservador, seguindo a mesma regra de segurança já usada noutros
// pontos da doutrina quando duas fontes divergem.

import { categorizeDistance } from './vocabulary.ts';

export type RecoveryExperienceLevel = 'iniciante' | 'basico' | 'medio' | 'avancado';
export type RecoveryCategory = '5k' | '10k' | 'meia' | 'maratona' | 'ultra';

const RECOVERY_DAYS: Record<RecoveryExperienceLevel, Record<RecoveryCategory, number>> = {
  iniciante: { '5k': 7,  '10k': 7,  meia: 21, maratona: 35, ultra: 42 },
  basico:    { '5k': 6,  '10k': 6,  meia: 14, maratona: 28, ultra: 35 },
  medio:     { '5k': 5,  '10k': 5,  meia: 10, maratona: 21, ultra: 28 },
  avancado:  { '5k': 3,  '10k': 3,  meia: 7,  maratona: 26, ultra: 21 },
};

export function getRecoveryDaysAfterRace(
  distanceKm: number | null | undefined,
  experienceLevel: string | null | undefined = 'iniciante',
): number {
  const cat = (categorizeDistance(distanceKm) ?? '10k') as RecoveryCategory;
  const level = (RECOVERY_DAYS as Record<string, unknown>)[experienceLevel as string]
    ? (experienceLevel as RecoveryExperienceLevel)
    : 'iniciante';
  return RECOVERY_DAYS[level][cat];
}
