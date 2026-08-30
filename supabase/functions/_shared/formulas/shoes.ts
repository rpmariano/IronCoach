// T1 — Armário de sapatilhas: quilometragem acumulada e desgaste.
//
// Migrado de src/utils/shoes.js (Fase C) — 3 implementações existiam:
// esta (canónica), uma reimplementação em coach-chat/index.ts (correta no
// fator de peso, mas sem o limiar "atenção" a 75% — só tinha a regra de
// "trocar" a 90%) e uma 3.ª cópia da constante REFERENCE_WEIGHT_KG em
// estimate-shoe-lifespan/index.ts. Ver specs/formulas-checklist.md Fase C.
//
// A vida útil de um par vem da Carol (Edge Function estimate-shoe-lifespan,
// que olha para a marca e modelo concretos) ou é escrita à mão pelo
// atleta. Seja qual for a origem, o valor guardado é SEMPRE a vida útil de
// referência — a que o modelo daria a um corredor de REFERENCE_WEIGHT_KG.
// O ajuste ao peso é feito aqui, em runtime, e nunca gravado.
//
// Regra de pureza: `shoe`/`run` aqui são objetos simples ({id, initial_km,
// lifespan_km, ...} / {shoe_id, distance_km}) — zero I/O, zero date-fns.

// Peso de referência a que as estimativas de vida útil se reportam. 70 kg é
// o valor com que a Carol é instruída a responder (ver o prompt de
// estimate-shoe-lifespan), para que o ajuste abaixo seja o único sítio
// onde o peso entra.
export const REFERENCE_WEIGHT_KG = 70;

// A espuma da entressola degrada-se com o trabalho de compressão acumulado,
// aproximadamente (força de impacto por passada) × (nº de passadas). A
// força de impacto escala com a massa do corredor — vida útil inversamente
// proporcional ao peso. Aproximação grosseira, por isso travada em
// [0,70, 1,15]: chega para separar "dura-me menos" de "dura-me mais" sem
// fingir precisão que não existe.
const MIN_WEIGHT_FACTOR = 0.70;
const MAX_WEIGHT_FACTOR = 1.15;

// Limiares de desgaste, em % da vida útil ajustada ao peso.
export const WEAR_ATTENTION_PCT = 75;
export const WEAR_REPLACE_PCT = 90;

export type ShoeWearLevel = 'sem_estimativa' | 'ok' | 'atencao' | 'substituir' | 'excedida';

export interface Shoe {
  id?: string;
  initial_km?: number | string | null;
  lifespan_km?: number | string | null;
  brand?: string | null;
  model?: string | null;
  status?: string | null;
}

export interface ShoeRun {
  shoe_id?: string | null;
  distance_km?: number | string | null;
}

// Sem peso conhecido devolve 1 — nunca inventa um ajuste.
export function weightFactor(weightKg: number | null | undefined): number {
  const w = Number(weightKg);
  if (!Number.isFinite(w) || w <= 0) return 1;
  return Math.min(MAX_WEIGHT_FACTOR, Math.max(MIN_WEIGHT_FACTOR, REFERENCE_WEIGHT_KG / w));
}

// Vida útil esperada deste par para ESTE atleta, em km. null quando ainda
// não há estimativa nenhuma (a Carol falhou e o atleta não escreveu nada).
export function effectiveLifespanKm(shoe: Shoe | null | undefined, weightKg: number | null | undefined): number | null {
  const baseline = Number(shoe?.lifespan_km);
  if (!Number.isFinite(baseline) || baseline <= 0) return null;
  return Math.round(baseline * weightFactor(weightKg));
}

// Quilómetros acumulados por um par: os que já tinha ao ser registado mais
// os das corridas que lhe foram atribuídas.
export function accumulatedKm(shoe: Shoe | null | undefined, runs: ShoeRun[] = []): number {
  const initial = Number(shoe?.initial_km);
  const base = Number.isFinite(initial) && initial > 0 ? initial : 0;
  const fromRuns = (runs || []).reduce((sum, run) => {
    if (run?.shoe_id !== shoe?.id) return sum;
    const d = Number(run?.distance_km);
    return Number.isFinite(d) && d > 0 ? sum + d : sum;
  }, 0);
  return Math.round((base + fromRuns) * 10) / 10;
}

export interface ShoeWearStatus {
  km: number;
  lifespanKm: number | null;
  pct: number | null;
  level: ShoeWearLevel;
  remainingKm: number | null;
}

export function wearStatus(shoe: Shoe | null | undefined, runs: ShoeRun[] = [], weightKg?: number | null): ShoeWearStatus {
  const km = accumulatedKm(shoe, runs);
  const lifespanKm = effectiveLifespanKm(shoe, weightKg);

  if (lifespanKm === null) {
    return { km, lifespanKm: null, pct: null, level: 'sem_estimativa', remainingKm: null };
  }

  const pct = Math.round((km / lifespanKm) * 100);
  const remainingKm = Math.round((lifespanKm - km) * 10) / 10;

  let level: ShoeWearLevel;
  if (pct >= 100) level = 'excedida';
  else if (pct >= WEAR_REPLACE_PCT) level = 'substituir';
  else if (pct >= WEAR_ATTENTION_PCT) level = 'atencao';
  else level = 'ok';

  return { km, lifespanKm, pct, level, remainingKm };
}

// Rótulo e tom de cada nível — partilhados entre o armário (Perfil) e os
// insights da Carol, para o atleta ver a mesma linguagem nos dois sítios.
export const WEAR_LEVEL_LABELS: Record<ShoeWearLevel, string> = {
  sem_estimativa: 'Sem estimativa',
  ok: 'Em bom estado',
  atencao: 'A meio da vida',
  substituir: 'Perto do fim',
  excedida: 'Vida útil excedida',
};

// Nome legível de um par, para listas e mensagens da Carol.
export function shoeLabel(shoe: Shoe | null | undefined): string {
  const parts = [shoe?.brand, shoe?.model].map(s => (s || '').trim()).filter(Boolean);
  return parts.length ? parts.join(' ') : 'Sapatilhas sem nome';
}

// Pares que merecem aviso, do mais gasto para o menos. Só entram pares
// ativos: um par aposentado já não se usa, avisar sobre ele seria ruído.
export function shoesNeedingAttention(shoes: Shoe[] = [], runs: ShoeRun[] = [], weightKg?: number | null) {
  return shoes
    .filter(s => s?.status !== 'aposentada')
    .map(s => ({ shoe: s, wear: wearStatus(s, runs, weightKg) }))
    .filter(({ wear }) => wear.level === 'atencao' || wear.level === 'substituir' || wear.level === 'excedida')
    .sort((a, b) => (b.wear.pct ?? 0) - (a.wear.pct ?? 0));
}
