/**
 * Armário de sapatilhas — quilometragem acumulada e desgaste.
 *
 * A vida útil de um par vem da Carol (Edge Function estimate-shoe-lifespan,
 * que olha para a marca e modelo concretos) ou é escrita à mão pelo atleta.
 * Seja qual for a origem, o valor guardado é SEMPRE a vida útil de
 * referência — a que o modelo daria a um corredor de REFERENCE_WEIGHT_KG.
 * O ajuste ao peso é feito aqui, em runtime, e nunca gravado: o peso do
 * atleta muda ao longo do tempo e um valor cristalizado na BD ficaria a
 * mentir a partir da primeira avaliação corporal seguinte.
 */

// Peso de referência a que as estimativas de vida útil se reportam. 70 kg é
// o valor com que a Carol é instruída a responder (ver o prompt da Edge
// Function), para que o ajuste abaixo seja o único sítio onde o peso entra.
export const REFERENCE_WEIGHT_KG = 70;

/* A espuma da entressola degrada-se com o trabalho de compressão acumulado,
   que é aproximadamente (força de impacto por passada) × (nº de passadas). A
   força de impacto escala grosso modo com a massa do corredor, o que dá uma
   vida útil inversamente proporcional ao peso. É uma aproximação grosseira —
   técnica de passada, terreno e temperatura pesam tanto como a massa — por
   isso o fator é travado em [0,70, 1,15]: chega para separar "este par dura-
   me menos" de "dura-me mais" sem fingir uma precisão que não existe. */
const MIN_WEIGHT_FACTOR = 0.70;
const MAX_WEIGHT_FACTOR = 1.15;

// Limiares de desgaste, em % da vida útil ajustada ao peso.
export const WEAR_ATTENTION_PCT = 75;
export const WEAR_REPLACE_PCT = 90;

/**
 * Fator de correção da vida útil para o peso do atleta.
 * Sem peso conhecido devolve 1 — nunca inventa um ajuste.
 */
export function weightFactor(weightKg) {
  const w = Number(weightKg);
  if (!Number.isFinite(w) || w <= 0) return 1;
  return Math.min(MAX_WEIGHT_FACTOR, Math.max(MIN_WEIGHT_FACTOR, REFERENCE_WEIGHT_KG / w));
}

/**
 * Vida útil esperada deste par para ESTE atleta, em km.
 * Devolve null quando ainda não há estimativa nenhuma (a Carol falhou e o
 * atleta não escreveu nada) — nesse caso não há desgaste a mostrar.
 */
export function effectiveLifespanKm(shoe, weightKg) {
  const baseline = Number(shoe?.lifespan_km);
  if (!Number.isFinite(baseline) || baseline <= 0) return null;
  return Math.round(baseline * weightFactor(weightKg));
}

/**
 * Quilómetros acumulados por um par: os que já tinha ao ser registado mais
 * os das corridas que lhe foram atribuídas.
 */
export function accumulatedKm(shoe, runs = []) {
  const initial = Number(shoe?.initial_km);
  const base = Number.isFinite(initial) && initial > 0 ? initial : 0;
  const fromRuns = runs.reduce((sum, run) => {
    if (run?.shoe_id !== shoe?.id) return sum;
    const d = Number(run?.distance_km);
    return Number.isFinite(d) && d > 0 ? sum + d : sum;
  }, 0);
  return Math.round((base + fromRuns) * 10) / 10;
}

/**
 * Estado de desgaste de um par.
 * @returns {{ km, lifespanKm, pct, level, remainingKm }}
 *   level: 'sem_estimativa' | 'ok' | 'atencao' | 'substituir' | 'excedida'
 */
export function wearStatus(shoe, runs = [], weightKg) {
  const km = accumulatedKm(shoe, runs);
  const lifespanKm = effectiveLifespanKm(shoe, weightKg);

  if (lifespanKm === null) {
    return { km, lifespanKm: null, pct: null, level: 'sem_estimativa', remainingKm: null };
  }

  const pct = Math.round((km / lifespanKm) * 100);
  const remainingKm = Math.round((lifespanKm - km) * 10) / 10;

  let level;
  if (pct >= 100) level = 'excedida';
  else if (pct >= WEAR_REPLACE_PCT) level = 'substituir';
  else if (pct >= WEAR_ATTENTION_PCT) level = 'atencao';
  else level = 'ok';

  return { km, lifespanKm, pct, level, remainingKm };
}

// Rótulo e tom de cada nível — partilhados entre o armário (Perfil) e os
// insights da Carol, para o atleta ver a mesma linguagem nos dois sítios.
export const WEAR_LEVEL_LABELS = {
  sem_estimativa: 'Sem estimativa',
  ok: 'Em bom estado',
  atencao: 'A meio da vida',
  substituir: 'Perto do fim',
  excedida: 'Vida útil excedida',
};

/** Nome legível de um par, para listas e mensagens da Carol. */
export function shoeLabel(shoe) {
  const parts = [shoe?.brand, shoe?.model].map(s => (s || '').trim()).filter(Boolean);
  return parts.length ? parts.join(' ') : 'Sapatilhas sem nome';
}

/**
 * Pares que merecem aviso, do mais gasto para o menos.
 * Só entram pares ativos: um par aposentado já não se usa, avisar sobre ele
 * seria ruído.
 */
export function shoesNeedingAttention(shoes = [], runs = [], weightKg) {
  return shoes
    .filter(s => s?.status !== 'aposentada')
    .map(s => ({ shoe: s, wear: wearStatus(s, runs, weightKg) }))
    .filter(({ wear }) => wear.level === 'atencao' || wear.level === 'substituir' || wear.level === 'excedida')
    .sort((a, b) => (b.wear.pct ?? 0) - (a.wear.pct ?? 0));
}
