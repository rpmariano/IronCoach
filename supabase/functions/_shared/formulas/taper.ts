// T1 — Duração do taper (polimento pré-prova), fórmula pura.
//
// @doutrina src/coach-knowledge/02-corrida-prova.md Bloco 2.3 #1
// @doutrina specs/coach-investigacao.md "Corrida 2.3 — Prova (registo)" #1
//
// Antes desta migração havia 4 implementações incompatíveis: a tabela
// completa da doutrina (nível×distância) nunca tinha sido usada por
// inteiro nenhures. `racePlanEngine.js` tinha `getTaperWeeks` a receber
// `experienceLevel` e a IGNORÁ-LO; `coach-chat`/`coach-daily-summary`
// usavam uma regra fixa (`daysUntil <= 14`) sem distinguir nível, distância
// nem prioridade; `biEngine.js` tinha limiares de km próprios (35/15) que
// nem batiam com `categorizeDistance`. Ver specs/formulas-centralizacao.md
// §5.2, specs/formulas-checklist.md Fase C — decisão tomada: a tabela da
// doutrina, por inteiro, é a única fonte a partir de agora.
//
// A doutrina dá uma GAMA de dias por nível×distância (ex.: "Médio: 10k
// 7-10 dias"). Esta biblioteca usa sempre o limite SUPERIOR de cada gama —
// mais conservador (taper mais longo, nunca mais curto que a doutrina
// permite), pela mesma razão de segurança que already orienta
// MIN_PREP_WEEKS/MIN_VOLUME_KM. Isto muda o comportamento face às
// implementações antigas nalguns casos (ex.: Médio/Avançado numa 10k
// passam de 1 semana de taper para 2 — a doutrina permite 7-10 dias e o
// código antigo só olhava para o "7").
//
// "Ultra/Trail" é uma categoria PRÓPRIA da doutrina, independente da
// distância nominal — o risco de dano muscular excêntrico (descidas) e
// terreno técnico justifica o taper longo mesmo numa distância curta com
// muito desnível. Um ultra de estrada (sem D+) também cai nesta categoria,
// pela mesma doutrina.

import { categorizeDistance } from './vocabulary.ts';

export type TaperExperienceLevel = 'iniciante' | 'basico' | 'medio' | 'avancado';
export type TaperCategory = '5k' | '10k' | 'meia' | 'maratona' | 'ultra_trail';

// Dias de taper para prova A-race (objetivo principal), limite superior da
// gama da doutrina. "5k" não tem entrada própria na doutrina — usa o mesmo
// valor de "10k" (a distância imediatamente acima na tabela), como o
// código anterior já fazia.
const TAPER_DAYS_A_RACE: Record<TaperExperienceLevel, Record<TaperCategory, number>> = {
  iniciante: { '5k': 7,  '10k': 7,  meia: 10, maratona: 14, ultra_trail: 14 },
  basico:    { '5k': 7,  '10k': 7,  meia: 12, maratona: 21, ultra_trail: 21 },
  medio:     { '5k': 10, '10k': 10, meia: 14, maratona: 21, ultra_trail: 21 },
  avancado:  { '5k': 10, '10k': 10, meia: 14, maratona: 21, ultra_trail: 21 },
};

// B/C-race (secundária ou de treino): 2-4 dias, independente de
// nível/distância — a doutrina dá esta regra como condição uniforme, não
// por célula da tabela.
const TAPER_DAYS_BC_RACE = 4;

function taperCategoryFor(distanceKm: number | null | undefined, raceType: string | null | undefined): TaperCategory {
  if (raceType === 'trail') return 'ultra_trail';
  const cat = categorizeDistance(distanceKm);
  if (cat === 'ultra') return 'ultra_trail';
  return cat ?? '10k';
}

export function getTaperDays(
  distanceKm: number | null | undefined,
  racePriority: string | null | undefined = 'a',
  experienceLevel: string | null | undefined = 'iniciante',
  raceType: string | null | undefined = 'estrada',
): number {
  if (racePriority === 'b' || racePriority === 'c') return TAPER_DAYS_BC_RACE;
  const cat = taperCategoryFor(distanceKm, raceType);
  const level = (TAPER_DAYS_A_RACE as Record<string, unknown>)[experienceLevel as string]
    ? (experienceLevel as TaperExperienceLevel)
    : 'iniciante';
  return TAPER_DAYS_A_RACE[level][cat];
}

// Semanas de taper — o que o motor do plano de treino consome para
// dimensionar a fase final do macrociclo (arredondado para cima: um taper
// de 10 dias ocupa 2 semanas de calendário, não 1,4).
export function getTaperWeeks(
  distanceKm: number | null | undefined,
  racePriority: string | null | undefined = 'a',
  experienceLevel: string | null | undefined = 'iniciante',
  raceType: string | null | undefined = 'estrada',
): number {
  return Math.max(1, Math.ceil(getTaperDays(distanceKm, racePriority, experienceLevel, raceType) / 7));
}
