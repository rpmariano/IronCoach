// Plano de ritmo para o dia da prova — fórmula pura, partilhada pelo hub
// (via @formulas) e pelo coach-chat (specs/plano-de-prova.md).
//
// @doutrina src/coach-knowledge/02-corrida-prova.md (partida controlada,
// negative split), 08-nivel-por-prova-trail.md (caminhada tática nas
// subidas), 04-nutricao-treino-prova.md (hidratos e água em prova).
//
// Uma tabela, não um conselho: para cada km, o ritmo, o tempo de passagem e
// a instrução. O percurso entra quando o site da prova o descreve
// (web_info.route_segments); sem ele, o plano diz que não conhece o traçado
// em vez de inventar um.

import { categorizeDistance, type RaceDistanceCategory } from "./vocabulary.ts";

export type PacingLabel = "controlar" | "ritmo" | "aguentar" | "decidir" | "acelerar" | "subida" | "descida";

export interface RouteSegmentInput {
  km_marker: number | null;
  description: string;
  elevation: string | null; // "sobe" | "desce" | "plano" | null
}

export interface RacePacingInput {
  distanceKm: number | null | undefined;
  raceType?: string | null;
  elevationGainM?: number | null;
  targetSeconds?: number | null;
  predictedSeconds?: number | null;
  experienceLevel?: string | null;
  routeSegments?: RouteSegmentInput[] | null;
  routeSummary?: string | null;
  /** De onde vêm os troços: o site da prova (web_info.route_segments) ou o
   *  GPX que o atleta carregou (courseRouteSegments). Com GPX o percurso é
   *  conhecido mesmo sem troços (um percurso plano não tem nenhum ≥ 3%). */
  routeSource?: "site" | "gpx" | null;
}

export interface PacingRow {
  fromKm: number;
  toKm: number;
  paceSecPerKm: number;
  cumulativeSeconds: number; // tempo de passagem no fim do troço
  label: PacingLabel;
  instruction: string;
  route: string | null; // descrição do troço do percurso, quando o plano o conhece
}

export interface FuelMark {
  km: number;
  what: "agua" | "hidratos";
}

export interface RacePacingPlan {
  category: RaceDistanceCategory;
  basis: "objetivo" | "previsao";
  ambitious: boolean; // objetivo mais de 3% mais rápido do que a previsão
  /** O ritmo MÉDIO da base (objetivo ou previsão ÷ distância). */
  basePaceSecPerKm: number;
  /** O ritmo nos km planos — o «ritmo» da tabela: o de base escalado para a
   *  soma dos troços dar a base (bug #122). Com subidas, descidas, o arranque
   *  e o final, difere da média; sem eles, coincide com ela (±1 s). */
  flatPaceSecPerKm: number;
  baseSeconds: number;
  targetSeconds: number | null;
  predictedSeconds: number | null;
  plannedFinishSeconds: number;
  firstKmPaceSecPerKm: number;
  decisionKm: number;
  effortMode: boolean; // trail: por esforço, o ritmo é só referência
  knowsRoute: boolean;
  /** "gpx" quando o percurso vem do GPX do atleta; senão "site" (ou null sem percurso). */
  routeSource: "site" | "gpx" | null;
  rows: PacingRow[];
  fuel: FuelMark[];
  notes: string[];
}

/** Um objetivo mais de 3% mais rápido do que a previsão do treino é
 *  "ambicioso": o plano monta-se sobre a previsão e o objetivo fica para o
 *  ponto de decisão. Mesma fronteira de 3% do raceOutcome ("perto"). */
export const AMBITIOUS_RATIO = 0.03;

const START_DELTA: Record<RaceDistanceCategory, number> = { "5k": 6, "10k": 6, meia: 8, maratona: 10, ultra: 12 };
const FINAL_DELTA: Record<RaceDistanceCategory, number> = { "5k": -8, "10k": -8, meia: -5, maratona: -3, ultra: 0 };
const HOLD_DELTA: Record<RaceDistanceCategory, number> = { "5k": 0, "10k": 0, meia: 0, maratona: 2, ultra: 3 };
const PUSH_DELTA = -3;
const CONTROL_DELTA = 3;

const HILL_UP = { estrada: 0.08, trail: 0.15 };
const HILL_DOWN = { estrada: -0.04, trail: -0.03 };

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** null quando não há com que planear: sem distância, ou sem objetivo nem previsão. */
export function buildRacePacingPlan(input: RacePacingInput): RacePacingPlan | null {
  const distanceKm = num(input.distanceKm);
  if (!distanceKm) return null;
  const category = categorizeDistance(distanceKm);
  if (!category) return null;
  const target = num(input.targetSeconds);
  const predicted = num(input.predictedSeconds);
  if (!target && !predicted) return null;

  const isTrail = input.raceType === "trail";
  const ambitious = !!(target && predicted && target < predicted * (1 - AMBITIOUS_RATIO));
  const basis: "objetivo" | "previsao" = target && !ambitious ? "objetivo" : (target ? "previsao" : "previsao");
  const baseSeconds = basis === "objetivo" ? target! : predicted ?? target!;
  const basePace = baseSeconds / distanceKm;

  const kmCount = Math.ceil(distanceKm);
  const lastKmLength = distanceKm - (kmCount - 1); // o último km pode ser parcial (21.1 → 0.1)
  const decisionKm = Math.max(1, Math.round(distanceKm * 0.7));
  // O troço final são os últimos 10% (mínimo 1 km): o km cujo FIM ainda está
  // a 90% pertence ao bloco anterior — daí o +1 (revisão pré-deploy).
  const finalFrom = Math.max(1, Math.floor(distanceKm * 0.9) + 1);

  // Troços do percurso por km: o segmento com marco cai no km que o contém.
  const routeByKm = new Map<number, RouteSegmentInput>();
  let knowsRoute = input.routeSource === "gpx";
  for (const seg of input.routeSegments || []) {
    if (!seg || typeof seg.description !== "string") continue;
    knowsRoute = true;
    // O marco 0 é a partida — conta, ao contrário do que `num` (que exige > 0) diria.
    const rawMarker = typeof seg.km_marker === "string" ? parseFloat(seg.km_marker) : seg.km_marker;
    const marker = typeof rawMarker === "number" && Number.isFinite(rawMarker) && rawMarker >= 0 ? rawMarker : null;
    if (marker == null || marker >= distanceKm) continue;
    const km = Math.min(kmCount, Math.floor(marker) + 1);
    if (!routeByKm.has(km)) routeByKm.set(km, seg);
  }

  const hillUp = isTrail ? HILL_UP.trail : HILL_UP.estrada;
  const hillDown = isTrail ? HILL_DOWN.trail : HILL_DOWN.estrada;

  /* Bug #122 (2026-11-16): a chegada planeada é a soma dos troços, e os
     troços não se compensam — no trail, as subidas E as descidas abrandam
     (HILL_UP/HILL_DOWN), e mesmo sem percurso os deltas do arranque, do
     controlo e do final não somam zero (−5 s num 10 km, mais numa maratona).
     O plano do Rui (meia de trail, 618 D+, objetivo 2:45:57) dava 2:52:26
     de chegada, por baixo do objetivo no cartão. Agora o ritmo de base
     (o do terreno plano) ajusta-se até a soma dar a base do plano — o
     objetivo, ou a previsão quando é ela a base — com ±1 s de
     arredondamento. Os deltas e os fatores das subidas e descidas ficam
     como estão: só a escala muda. */
  const buildRows = (paceBase: number): PacingRow[] => {
    const rows: PacingRow[] = [];
    let cumulative = 0;
    for (let km = 1; km <= kmCount; km += 1) {
      const fraction = km / distanceKm;
      let label: PacingLabel;
      let delta: number;
      let instruction: string;
      if (km === 1) {
        label = "controlar"; delta = START_DELTA[category];
        instruction = "Arranque controlado: mais lento do que o ritmo alvo, mesmo com a adrenalina a puxar.";
      } else if (fraction <= 0.2) {
        label = "controlar"; delta = CONTROL_DELTA;
        instruction = "Ainda a controlar: encontra o ritmo sem forçar.";
      } else if (fraction <= 0.55) {
        label = "ritmo"; delta = 0;
        instruction = "Ritmo alvo. Regular, sem picos.";
      } else if (km < decisionKm) {
        label = "aguentar"; delta = HOLD_DELTA[category];
        instruction = "Aguentar: aqui custa, o ritmo é para manter.";
      } else if (km === decisionKm) {
        label = "decidir"; delta = 0;
        instruction = ambitious
          ? "Ponto de decisão: se te sentes bem, é aqui que vais ao objetivo; se não, mantém."
          : "Ponto de decisão: se te sentes bem, acelera a partir daqui; se não, mantém o ritmo.";
      } else if (km < finalFrom) {
        label = "acelerar"; delta = PUSH_DELTA;
        instruction = "Se decidiste acelerar, é este o ritmo; senão, o ritmo alvo.";
      } else {
        label = "acelerar"; delta = FINAL_DELTA[category];
        instruction = "Final: tudo o que ficou.";
      }

      let pace = paceBase + delta;
      let route: string | null = null;
      const seg = routeByKm.get(km);
      // O nome do troço vai em `route` (o cartão mostra-o em itálico, o prompt
      // da Carol na própria linha); a instrução não o repete.
      if (seg) {
        route = seg.description;
        if (seg.elevation === "sobe") {
          pace = pace * (1 + hillUp);
          label = "subida";
          instruction = isTrail
            ? "Subida: esforço constante, a andar se a inclinação o pedir — o ritmo não conta aqui."
            : "Subida: desacelera para manter o esforço, o tempo recupera-se depois.";
        } else if (seg.elevation === "desce") {
          pace = pace * (1 + hillDown);
          label = "descida";
          instruction = isTrail
            ? "Descida: controlada, passada curta — não é para forçar."
            : "Descida: deixa correr sem forçar, sem travar com os quadríceps.";
        }
      }

      pace = Math.round(pace);
      const length = km === kmCount ? lastKmLength : 1;
      cumulative += pace * length;
      rows.push({ fromKm: km - 1, toKm: km === kmCount ? distanceKm : km, paceSecPerKm: pace, cumulativeSeconds: Math.round(cumulative), label, instruction, route });
    }
    return rows;
  };

  // A derivada da soma em ordem ao ritmo de base: Σ comprimento × fator do
  // troço (1, 1 + subida, 1 + descida). Com ela, poucas voltas de Newton
  // chegam — o arredondamento por km é o que impede o zero exato.
  const slope = (() => {
    let s = 0;
    for (let km = 1; km <= kmCount; km += 1) {
      const seg = routeByKm.get(km);
      const factor = seg?.elevation === "sobe" ? 1 + hillUp : seg?.elevation === "desce" ? 1 + hillDown : 1;
      s += factor * (km === kmCount ? lastKmLength : 1);
    }
    return s;
  })();
  let paceBase = basePace;
  let rows = buildRows(paceBase);
  let best = { rows, gap: Math.abs(rows[rows.length - 1].cumulativeSeconds - baseSeconds), paceBase };
  for (let i = 0; i < 8 && best.gap > 1; i++) {
    const gap = baseSeconds - rows[rows.length - 1].cumulativeSeconds;
    paceBase += gap / slope;
    rows = buildRows(paceBase);
    const g = Math.abs(rows[rows.length - 1].cumulativeSeconds - baseSeconds);
    if (g < best.gap) best = { rows, gap: g, paceBase };
  }
  rows = best.rows;

  // O que o arredondamento por km deixou (num percurso plano todos os km
  // arredondam juntos e a soma salta de N em N s): ±1 s/km pelos km planos,
  // um a um — primeiro os de "ritmo", depois "aguentar", "controlar" e
  // "acelerar" —, até ficar a menos de 1 s. Espalhado, nunca concentrado
  // numa linha (revisão do #122: o km da decisão chegava a ficar 6 s mais
  // lento do que o ritmo).
  const totalOf = (rs: PacingRow[]) => rs.reduce((t, r) => t + r.paceSecPerKm * (r.toKm - r.fromKm), 0);
  let residual = Math.trunc(baseSeconds - totalOf(rows));
  if (residual !== 0) {
    rows = rows.map((r) => ({ ...r }));
    const sign = Math.sign(residual);
    const order: PacingLabel[] = ["ritmo", "aguentar", "controlar", "acelerar"];
    const neutral = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r, i }) => i > 0 && !r.route && r.toKm - r.fromKm === 1 && order.includes(r.label))
      .sort((a, b) => order.indexOf(a.r.label) - order.indexOf(b.r.label) || a.i - b.i);
    for (let pass = 0; residual !== 0 && neutral.length && pass < 10; pass++) {
      for (const { i } of neutral) {
        if (residual === 0) break;
        rows[i].paceSecPerKm += sign;
        residual -= sign;
      }
    }
    let cumulative = 0;
    for (const r of rows) {
      cumulative += r.paceSecPerKm * (r.toKm - r.fromKm);
      r.cumulativeSeconds = Math.round(cumulative);
    }
  }

  // Agrupar km consecutivos iguais (mesmo ritmo, mesmo rótulo, sem troço de
  // percurso) para a tabela ser legível: "km 4 a 11 · 5.20".
  const grouped: PacingRow[] = [];
  for (const row of rows) {
    const last = grouped[grouped.length - 1];
    if (last && !row.route && !last.route && last.label === row.label && last.paceSecPerKm === row.paceSecPerKm) {
      last.toKm = row.toKm;
      last.cumulativeSeconds = row.cumulativeSeconds;
    } else {
      grouped.push({ ...row });
    }
  }

  // Abastecimento: água de 5 em 5 km a partir da meia; hidratos aos ~40 min e
  // depois a cada ~35 min, nunca nos últimos 10 min.
  const fuel: FuelMark[] = [];
  const plannedFinish = rows[rows.length - 1].cumulativeSeconds;
  if (category === "meia" || category === "maratona" || category === "ultra") {
    for (let km = 5; km < distanceKm - 1; km += 5) fuel.push({ km, what: "agua" });
    let next = 40 * 60;
    for (const row of rows) {
      if (row.cumulativeSeconds >= next && row.cumulativeSeconds <= plannedFinish - 10 * 60) {
        fuel.push({ km: row.toKm, what: "hidratos" });
        next = row.cumulativeSeconds + 35 * 60;
      }
    }
    fuel.sort((a, b) => a.km - b.km);
  } else if (category === "10k" && plannedFinish > 50 * 60) {
    fuel.push({ km: 5, what: "agua" });
  }

  const notes: string[] = [];
  if (ambitious && target && predicted) {
    notes.push(`O objetivo (${fmt(target)}) está mais de 3% abaixo do que o treino perspetiva (${fmt(predicted)}): o plano monta-se sobre a previsão e o objetivo decide-se ao km ${decisionKm}.`);
  } else if (basis === "previsao" && !target) {
    notes.push(`Sem objetivo marcado: o plano usa a previsão do treino (${fmt(predicted!)}).`);
  }
  if (!knowsRoute) {
    notes.push(input.routeSummary
      ? "O plano conhece o perfil geral do percurso mas não os troços: os ritmos não têm ajuste de subidas e descidas."
      : "Não conheço o percurso desta prova: os ritmos são para terreno plano — nas subidas desacelera para manter o esforço.");
  }
  if (isTrail) notes.push("Trail é por esforço, não por ritmo: os números são referência para o plano, o que manda é a sensação e as subidas a andar quando a inclinação o pede.");

  return {
    category,
    basis,
    ambitious,
    basePaceSecPerKm: Math.round(basePace),
    flatPaceSecPerKm: Math.round(best.paceBase),
    baseSeconds: Math.round(baseSeconds),
    targetSeconds: target,
    predictedSeconds: predicted,
    plannedFinishSeconds: plannedFinish,
    firstKmPaceSecPerKm: rows[0].paceSecPerKm,
    decisionKm,
    effortMode: isTrail,
    knowsRoute,
    routeSource: knowsRoute ? (input.routeSource === "gpx" ? "gpx" : "site") : null,
    rows: grouped,
    fuel,
    notes,
  };
}

function fmt(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export interface SplitInput { distance_km: number | null; time_seconds: number | null }

export interface SplitComparison {
  km: number;
  actualPace: number;
  plannedPace: number;
  deltaSecPerKm: number; // positivo = mais lento do que o plano
}

/** Compara os parciais registados (runs.details.splits, cada um com a
 *  distância acumulada ou o comprimento do troço e o seu tempo) com o plano,
 *  km a km. Devolve os troços com desvio ≥ 5 s/km; vazio sem parciais. */
export function compareSplitsToPlan(plan: RacePacingPlan | null, splits: SplitInput[] | null | undefined): SplitComparison[] {
  if (!plan || !Array.isArray(splits) || splits.length === 0) return [];
  const out: SplitComparison[] = [];
  let cumulativeKm = 0;
  let increasing = true;
  const dists = splits.map((s) => num(s.distance_km) ?? 0);
  for (let i = 1; i < dists.length; i += 1) if (dists[i] <= dists[i - 1]) { increasing = false; break; }
  for (const s of splits) {
    const d = num(s.distance_km);
    const t = num(s.time_seconds);
    if (!d || !t) continue;
    // Distâncias crescentes são acumuladas (km 5, 10, 15); senão são o
    // comprimento de cada parcial (5, 5, 5).
    const fromKm = cumulativeKm;
    const toKm = increasing && splits.length > 1 ? d : cumulativeKm + d;
    const length = toKm - fromKm;
    if (length <= 0) continue;
    cumulativeKm = toKm;
    const actualPace = t / length;
    const planned = plan.rows.find((r) => toKm > r.fromKm && toKm <= r.toKm) || plan.rows[plan.rows.length - 1];
    const delta = Math.round(actualPace - planned.paceSecPerKm);
    if (Math.abs(delta) >= 5) out.push({ km: Math.round(toKm * 10) / 10, actualPace: Math.round(actualPace), plannedPace: planned.paceSecPerKm, deltaSecPerKm: delta });
  }
  return out;
}
