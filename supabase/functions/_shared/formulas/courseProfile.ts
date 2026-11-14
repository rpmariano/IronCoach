// Perfil do percurso a partir de um GPX que o atleta carrega — fórmula pura,
// partilhada pela app (via @formulas, que lê o GPX no telemóvel) e pelo
// servidor (que só lê o perfil já gravado em race_events.course_profile).
//
// O ficheiro GPX nunca sai do telemóvel: a app extrai os pontos (lat, lon,
// ele) e grava SÓ o que esta fórmula devolve — números. Nomes, descrições e
// waypoints nem se leem. O traçado guarda-se (decisão do Rui, 2026-11-14),
// reamostrado (`track`, ≤ 1000 pontos, 5 casas decimais ≈ 1 m), com a
// partida e a chegada; à Carol só vão os números do perfil, nunca as
// coordenadas. O servidor nunca confia no que lá está: sanitizeCourseProfile
// antes de qualquer uso.
//
// MÉTODO DO DESNÍVEL (o D+ de um GPX cru vem quase sempre inflacionado pelo
// ruído da altitude do GPS: ±3–10 m de ponto para ponto somam centenas de
// metros fantasma numa prova longa):
//   1. distância por haversine entre pontos consecutivos (raio médio da Terra);
//   2. a altitude reamostrada por distância, de 10 em 10 m (interpolação
//      linear) — um GPX de relógio (um ponto por segundo) e um de organização
//      (um ponto a cada 20–50 m, altitude de modelo digital) ficam iguais;
//   3. média móvel centrada de 200 m (±100 m) — tira o ruído de ponto a ponto
//      sem mudar o ganho de uma subida real (arredonda-lhe só as esquinas);
//   4. histerese de 3 m na soma: só conta um ganho/perda quando a altitude se
//      afasta 3 m do último ponto de viragem.
// Nos testes (sem GPX real no repositório — o termo de comparação é um
// percurso sintético de desnível conhecido): 10 km com uma subida de 150 m e
// ruído gaussiano de 4 m em cada ponto (10 m entre pontos) dá D+ 148–159 m
// em 5 sementes, contra +600 m a somar o GPX cru; o mesmo percurso plano com
// o mesmo ruído dá D+ 0–9 m (cru: +500 m).
//
// SUBIDAS (climbs): um troço que sobe do seu mínimo até ao seu máximo sem
// voltar a descer 20 m pelo caminho (uma descida curta a meio não parte a
// subida); conta se ganhar ≥ 30 m com inclinação média ≥ 3%. No máximo as 20
// com mais ganho, por ordem de km.

export const COURSE_PROFILE_VERSION = 1 as const;
export const MAX_COURSE_KM_ENTRIES = 200;
export const MAX_COURSE_CLIMBS = 20;
/** Pontos do traçado reamostrado: um a cada ~21 m numa meia, ~170 m num ultra de 170 km. */
export const MAX_COURSE_TRACK_POINTS = 1000;
/** Um GPX acima disto não é de uma prova a pé (ou vem com saltos de GPS). */
export const MAX_COURSE_DISTANCE_KM = 300;
export const MIN_COURSE_DISTANCE_KM = 0.5;

const EARTH_RADIUS_KM = 6371.0088;
const STEP_KM = 0.01;
const SMOOTH_HALF_WINDOW_KM = 0.1;
const HYSTERESIS_M = 3;
const CLIMB_BREAK_DROP_M = 20;
const CLIMB_MIN_GAIN_M = 30;
const CLIMB_MIN_GRADE_PCT = 3;
/** Pelo menos esta fração dos pontos com altitude; o resto interpola-se. */
const MIN_ELEVATION_COVERAGE = 0.8;
const ALT_MIN_M = -500;
const ALT_MAX_M = 9000;

export interface GpxPoint {
  lat: number;
  lon: number;
  ele?: number | null;
}

export interface CourseKm {
  /** O km que acaba aqui (1 = do 0 ao 1). O último pode ser parcial. */
  km: number;
  gain_m: number;
  loss_m: number;
  /** Inclinação líquida do km (fim − início), em %. */
  grade_pct: number;
}

export interface CourseClimb {
  start_km: number;
  end_km: number;
  gain_m: number;
  avg_grade_pct: number;
}

export interface CourseProfile {
  v: typeof COURSE_PROFILE_VERSION;
  source: "gpx";
  distance_km: number;
  gain_m: number;
  loss_m: number;
  min_alt_m: number;
  max_alt_m: number;
  /** Por km, até MAX_COURSE_KM_ENTRIES (acima disso, só os primeiros). */
  km: CourseKm[];
  climbs: CourseClimb[];
  /** O traçado reamostrado a distâncias iguais: [lat, lon, distância km,
   *  altitude m suavizada], ≤ MAX_COURSE_TRACK_POINTS — para o mapa e o
   *  gráfico do perfil. */
  track: [number, number, number, number][];
  /** [lat, lon] do primeiro e do último ponto do GPX. */
  start: [number, number];
  finish: [number, number];
}

export type CourseProfileError =
  | "poucos_pontos" // menos de 2 pontos válidos
  | "sem_altitude" // menos de 80% dos pontos com <ele>
  | "demasiado_curto" // < MIN_COURSE_DISTANCE_KM
  | "demasiado_longo"; // > MAX_COURSE_DISTANCE_KM

export type CourseProfileResult =
  | { ok: true; profile: CourseProfile }
  | { ok: false; error: CourseProfileError };

const round = (v: number, d = 0) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** D+ e D− com histerese (ver o método no cabeçalho). */
export function gainLossWithHysteresis(alts: number[], threshold = HYSTERESIS_M): { gain: number; loss: number } {
  let gain = 0, loss = 0;
  if (!alts.length) return { gain, loss };
  let anchor = alts[0];
  for (const a of alts) {
    const d = a - anchor;
    if (d >= threshold) { gain += d; anchor = a; }
    else if (d <= -threshold) { loss -= d; anchor = a; }
  }
  return { gain, loss };
}

/** A altitude suavizada de 10 em 10 m ao longo do percurso. */
function smoothedSeries(dist: number[], ele: number[]): { d: number[]; e: number[] } {
  const total = dist[dist.length - 1];
  const n = Math.floor(total / STEP_KM) + 1;
  const d: number[] = new Array(n);
  const raw: number[] = new Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const x = i === n - 1 ? total : i * STEP_KM;
    while (j < dist.length - 2 && dist[j + 1] < x) j++;
    const span = dist[j + 1] - dist[j];
    const t = span > 0 ? Math.min(1, Math.max(0, (x - dist[j]) / span)) : 0;
    d[i] = x;
    raw[i] = ele[j] + (ele[j + 1] - ele[j]) * t;
  }
  // Média móvel centrada, com somas acumuladas (O(n)).
  const half = Math.max(1, Math.round(SMOOTH_HALF_WINDOW_KM / STEP_KM));
  const cum = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + raw[i];
  const e = raw.map((_, i) => {
    const lo = Math.max(0, i - half), hi = Math.min(n - 1, i + half);
    return (cum[hi + 1] - cum[lo]) / (hi - lo + 1);
  });
  return { d, e };
}

function findClimbs(d: number[], e: number[]): CourseClimb[] {
  const out: CourseClimb[] = [];
  const push = (s0: number, p0: number) => {
    // O pé da subida é o ÚLTIMO ponto ainda à altura do início, e o topo o
    // PRIMEIRO já à altura do máximo (± histerese): um plano antes ou depois
    // dela (com o ruído a pôr o máximo lá no fim) não entra na distância nem
    // baixa a inclinação.
    let s = s0;
    for (let i = s0; i < p0; i++) if (e[i] <= e[s0] + HYSTERESIS_M) s = i;
    let p = p0;
    for (let i = p0; i > s; i--) if (e[i] >= e[p0] - HYSTERESIS_M) p = i;
    // O ganho é do mínimo ao máximo; a distância, do pé ao topo.
    const gain = e[p0] - e[s0];
    const lenKm = d[p] - d[s];
    if (lenKm <= 0) return;
    const grade = (gain / (lenKm * 1000)) * 100;
    if (gain >= CLIMB_MIN_GAIN_M && grade >= CLIMB_MIN_GRADE_PCT) {
      out.push({ start_km: round(d[s], 2), end_km: round(d[p], 2), gain_m: Math.round(gain), avg_grade_pct: round(grade, 1) });
    }
  };
  let start = 0, peak = 0;
  for (let i = 1; i < e.length; i++) {
    if (e[i] > e[peak]) peak = i;
    else if (e[peak] - e[i] >= CLIMB_BREAK_DROP_M) {
      if (peak > start) push(start, peak);
      start = i; peak = i;
    } else if (e[i] < e[start]) {
      // Abaixo do início sem ter descido CLIMB_BREAK_DROP_M desde o topo: o que
      // havia antes era um alto menor do que isso — não é subida, recomeça.
      start = i; peak = i;
    }
  }
  if (peak > start) push(start, peak);
  return out
    .sort((a, b) => b.gain_m - a.gain_m)
    .slice(0, MAX_COURSE_CLIMBS)
    .sort((a, b) => a.start_km - b.start_km);
}

/**
 * O perfil a gravar, a partir dos pontos do GPX pela ordem do percurso
 * (trkpt; sem track, rtept). Pontos sem lat/lon válidos são ignorados; os
 * sem altitude interpolam-se, desde que ≥ 80% a tenham.
 */
export function buildCourseProfile(points: ReadonlyArray<GpxPoint>): CourseProfileResult {
  const pts = (points || []).filter((p) =>
    p && finite(p.lat) && finite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180
  );
  if (pts.length < 2) return { ok: false, error: "poucos_pontos" };

  const withEle = pts.filter((p) => finite(p.ele) && p.ele! >= ALT_MIN_M && p.ele! <= ALT_MAX_M).length;
  if (withEle / pts.length < MIN_ELEVATION_COVERAGE) return { ok: false, error: "sem_altitude" };

  // Distância acumulada (pontos repetidos não somam nada).
  const dist: number[] = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + haversineKm(pts[i - 1], pts[i]));
  const total = dist[dist.length - 1];
  if (total < MIN_COURSE_DISTANCE_KM) return { ok: false, error: "demasiado_curto" };
  if (total > MAX_COURSE_DISTANCE_KM) return { ok: false, error: "demasiado_longo" };

  // Altitudes em falta: interpolação linear pela distância (pontas: o vizinho).
  const ele: (number | null)[] = pts.map((p) => (finite(p.ele) && p.ele! >= ALT_MIN_M && p.ele! <= ALT_MAX_M ? p.ele! : null));
  for (let i = 0; i < ele.length; i++) {
    if (ele[i] != null) continue;
    let a = i - 1; while (a >= 0 && ele[a] == null) a--;
    let b = i + 1; while (b < ele.length && ele[b] == null) b++;
    if (a < 0) ele[i] = ele[b]!;
    else if (b >= ele.length) ele[i] = ele[a]!;
    else {
      const span = dist[b] - dist[a];
      ele[i] = span > 0 ? ele[a]! + (ele[b]! - ele[a]!) * ((dist[i] - dist[a]) / span) : ele[a]!;
    }
  }
  // Pontos colados (distância repetida) baralham a interpolação: fica o último.
  const dU: number[] = [], eU: number[] = [], latU: number[] = [], lonU: number[] = [];
  for (let i = 0; i < dist.length; i++) {
    if (dU.length && dist[i] <= dU[dU.length - 1]) {
      eU[eU.length - 1] = ele[i]!; latU[latU.length - 1] = pts[i].lat; lonU[lonU.length - 1] = pts[i].lon;
      continue;
    }
    dU.push(dist[i]); eU.push(ele[i]!); latU.push(pts[i].lat); lonU.push(pts[i].lon);
  }
  if (dU.length < 2) return { ok: false, error: "poucos_pontos" };

  const { d, e } = smoothedSeries(dU, eU);
  const { gain, loss } = gainLossWithHysteresis(e);

  // Por km.
  const kmCount = Math.min(MAX_COURSE_KM_ENTRIES, Math.ceil(total - 1e-9));
  const km: CourseKm[] = [];
  const perKm = Math.round(1 / STEP_KM);
  for (let k = 1; k <= kmCount; k++) {
    const from = (k - 1) * perKm;
    const to = Math.min(e.length - 1, k * perKm);
    if (to <= from) break;
    const slice = e.slice(from, to + 1);
    const gl = gainLossWithHysteresis(slice);
    const lenM = (d[to] - d[from]) * 1000;
    km.push({
      km: k,
      gain_m: Math.round(gl.gain),
      loss_m: Math.round(gl.loss),
      grade_pct: lenM > 0 ? round(((e[to] - e[from]) / lenM) * 100, 1) : 0,
    });
  }

  // O traçado: pontos a distâncias iguais ao longo do percurso (lat/lon
  // interpolados no segmento do GPX onde cai cada um; a altitude é a
  // suavizada). Igualmente espaçados, servem o mapa e o gráfico.
  const nTrack = Math.min(MAX_COURSE_TRACK_POINTS, e.length);
  const track: [number, number, number, number][] = [];
  let seg = 0;
  for (let i = 0; i < nTrack; i++) {
    const x = nTrack === 1 ? 0 : (i * total) / (nTrack - 1);
    while (seg < dU.length - 2 && dU[seg + 1] < x) seg++;
    const span = dU[seg + 1] - dU[seg];
    const t = span > 0 ? Math.min(1, Math.max(0, (x - dU[seg]) / span)) : 0;
    const idx = Math.min(e.length - 1, Math.round(x / STEP_KM));
    track.push([
      round(latU[seg] + (latU[seg + 1] - latU[seg]) * t, 5),
      round(lonU[seg] + (lonU[seg + 1] - lonU[seg]) * t, 5),
      round(x, 3),
      round(e[idx], 1),
    ]);
  }

  return {
    ok: true,
    profile: {
      v: COURSE_PROFILE_VERSION,
      source: "gpx",
      distance_km: round(total, 2),
      gain_m: Math.round(gain),
      loss_m: Math.round(loss),
      min_alt_m: Math.round(Math.min(...e)),
      max_alt_m: Math.round(Math.max(...e)),
      km,
      climbs: findClimbs(d, e),
      track,
      start: [round(pts[0].lat, 5), round(pts[0].lon, 5)],
      finish: [round(pts[pts.length - 1].lat, 5), round(pts[pts.length - 1].lon, 5)],
    },
  };
}

// ── O que o servidor aceita ────────────────────────────────────────────────

const inRange = (v: unknown, lo: number, hi: number): v is number => finite(v) && v >= lo && v <= hi;

/**
 * O perfil só com números dentro de limites plausíveis, ou null. O jsonb vem
 * do cliente: o servidor chama isto SEMPRE antes de o pôr no prompt ou numa
 * conta. Reconstrói o objeto (nenhuma chave nem texto do cliente passa); uma
 * entrada de km/subida/ponto inválida cai sozinha; o total inválido anula tudo.
 */
export function sanitizeCourseProfile(raw: unknown): CourseProfile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  // deno-lint-ignore no-explicit-any
  const r = raw as any;
  if (r.v !== COURSE_PROFILE_VERSION || r.source !== "gpx") return null;
  const dist = r.distance_km;
  if (!inRange(dist, MIN_COURSE_DISTANCE_KM, MAX_COURSE_DISTANCE_KM)) return null;
  const maxGain = dist * 1000; // mais do que 100% de média não existe a pé
  if (!inRange(r.gain_m, 0, maxGain) || !inRange(r.loss_m, 0, maxGain)) return null;
  if (!inRange(r.min_alt_m, ALT_MIN_M, ALT_MAX_M) || !inRange(r.max_alt_m, ALT_MIN_M, ALT_MAX_M) || r.min_alt_m > r.max_alt_m) return null;

  const arr = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
  const lastKm = Math.ceil(dist);
  const km: CourseKm[] = [];
  for (const k of arr(r.km, MAX_COURSE_KM_ENTRIES)) {
    // deno-lint-ignore no-explicit-any
    const x = k as any;
    if (!x || !Number.isInteger(x.km) || x.km < 1 || x.km > lastKm) continue;
    if (!inRange(x.gain_m, 0, 1000) || !inRange(x.loss_m, 0, 1000) || !inRange(x.grade_pct, -100, 100)) continue;
    km.push({ km: x.km, gain_m: Math.round(x.gain_m), loss_m: Math.round(x.loss_m), grade_pct: round(x.grade_pct, 1) });
  }
  const climbs: CourseClimb[] = [];
  for (const c of arr(r.climbs, MAX_COURSE_CLIMBS)) {
    // deno-lint-ignore no-explicit-any
    const x = c as any;
    if (!x || !inRange(x.start_km, 0, dist) || !inRange(x.end_km, 0, dist) || x.end_km <= x.start_km) continue;
    if (!inRange(x.gain_m, 0, maxGain) || !inRange(x.avg_grade_pct, 0, 100)) continue;
    climbs.push({ start_km: round(x.start_km, 2), end_km: round(x.end_km, 2), gain_m: Math.round(x.gain_m), avg_grade_pct: round(x.avg_grade_pct, 1) });
  }
  const track: [number, number, number, number][] = [];
  for (const p of arr(r.track, MAX_COURSE_TRACK_POINTS)) {
    if (!Array.isArray(p) || p.length !== 4) continue;
    if (!inRange(p[0], -90, 90) || !inRange(p[1], -180, 180)) continue;
    if (!inRange(p[2], 0, dist + 0.01) || !inRange(p[3], ALT_MIN_M, ALT_MAX_M)) continue;
    track.push([round(p[0], 5), round(p[1], 5), round(p[2], 3), round(p[3], 1)]);
  }
  // Partida e chegada: obrigatórias (o perfil v1 tem-nas sempre).
  const latLon = (v: unknown): [number, number] | null =>
    Array.isArray(v) && v.length === 2 && inRange(v[0], -90, 90) && inRange(v[1], -180, 180)
      ? [round(v[0], 5), round(v[1], 5)]
      : null;
  const start = latLon(r.start), finish = latLon(r.finish);
  if (!start || !finish) return null;
  return {
    v: COURSE_PROFILE_VERSION,
    source: "gpx",
    distance_km: round(dist, 2),
    gain_m: Math.round(r.gain_m),
    loss_m: Math.round(r.loss_m),
    min_alt_m: Math.round(r.min_alt_m),
    max_alt_m: Math.round(r.max_alt_m),
    km,
    climbs,
    track,
    start,
    finish,
  };
}

/** A partida do GPX ([lat, lon]) de um perfil por sanitizar, ou null — para a
 *  meteorologia da prova, sem precisar do perfil inteiro (aceita também só o
 *  `start`, ex.: `course_start:course_profile->start`). */
export function courseStart(raw: unknown): [number, number] | null {
  // deno-lint-ignore no-explicit-any
  const v = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as any).start : raw;
  return Array.isArray(v) && v.length === 2 && inRange(v[0], -90, 90) && inRange(v[1], -180, 180)
    ? [round(v[0], 5), round(v[1], 5)]
    : null;
}

// ── Para a Carol e para o plano de ritmos ──────────────────────────────────

/** Uma linha do perfil não passa disto no prompt (o prompt já é grande). */
export const COURSE_PROMPT_MAX_CHARS = 700;
/** A partir daqui um km conta como subida/descida no plano de ritmos. */
export const COURSE_KM_HILL_GRADE_PCT = 3;

const pt = (v: number, d = 1) => String(round(v, d)).replace(".", ",");

/**
 * O bloco que a Carol recebe, em números e compacto: distância, D+, D−,
 * altitudes, as subidas (km de início e fim, ganho, inclinação) e os km mais
 * duros. Sempre a partir de um perfil já sanitizado. Teto: COURSE_PROMPT_MAX_CHARS.
 */
export function courseProfilePromptText(p: CourseProfile): string {
  const head = `${pt(p.distance_km, 2)} km · D+ ${p.gain_m} m · D− ${p.loss_m} m · altitude ${p.min_alt_m}–${p.max_alt_m} m.`;
  const climbs = p.climbs.length
    ? ` Subidas: ${p.climbs.map((c) => `km ${pt(c.start_km)}–${pt(c.end_km)} +${c.gain_m} m (${pt(c.avg_grade_pct)}%)`).join("; ")}.`
    : " Sem subidas de mais de 30 m.";
  const hard = [...p.km]
    .filter((k) => k.grade_pct >= COURSE_KM_HILL_GRADE_PCT || k.gain_m >= 30)
    .sort((a, b) => b.gain_m - a.gain_m || b.grade_pct - a.grade_pct)
    .slice(0, 5)
    .sort((a, b) => a.km - b.km);
  const steepDown = [...p.km]
    .filter((k) => k.grade_pct <= -COURSE_KM_HILL_GRADE_PCT)
    .sort((a, b) => a.grade_pct - b.grade_pct)
    .slice(0, 3)
    .sort((a, b) => a.km - b.km);
  const hardTxt = hard.length ? ` Km mais duros: ${hard.map((k) => `km ${k.km - 1}–${k.km} (+${k.gain_m} m, ${pt(k.grade_pct)}%)`).join(", ")}.` : "";
  const downTxt = steepDown.length ? ` Descidas fortes: ${steepDown.map((k) => `km ${k.km - 1}–${k.km} (−${k.loss_m} m, ${pt(k.grade_pct)}%)`).join(", ")}.` : "";
  let text = head + climbs + hardTxt + downTxt;
  if (text.length > COURSE_PROMPT_MAX_CHARS) {
    // Corta pelas subidas (as menores primeiro) até caber; o resto mantém-se.
    const byGain = [...p.climbs].sort((a, b) => b.gain_m - a.gain_m);
    for (let n = byGain.length - 1; n >= 1 && text.length > COURSE_PROMPT_MAX_CHARS; n--) {
      const kept = byGain.slice(0, n).sort((a, b) => a.start_km - b.start_km);
      const c = ` Subidas (as ${n} maiores de ${p.climbs.length}): ${kept.map((x) => `km ${pt(x.start_km)}–${pt(x.end_km)} +${x.gain_m} m (${pt(x.avg_grade_pct)}%)`).join("; ")}.`;
      text = head + c + hardTxt + downTxt;
    }
    if (text.length > COURSE_PROMPT_MAX_CHARS) text = text.slice(0, COURSE_PROMPT_MAX_CHARS - 1) + "…";
  }
  return text;
}

/** Os km do GPX como troços do plano de ritmos: só os que sobem ou descem
 *  ≥ 3% (o resto é ritmo normal). Mesma forma que web_info.route_segments. */
export function courseRouteSegments(p: CourseProfile): { km_marker: number; description: string; elevation: "sobe" | "desce" }[] {
  return p.km
    .filter((k) => Math.abs(k.grade_pct) >= COURSE_KM_HILL_GRADE_PCT)
    .map((k) => k.grade_pct > 0
      ? { km_marker: k.km - 1, description: `GPX: sobe ${k.gain_m} m (${pt(k.grade_pct)}%)`, elevation: "sobe" as const }
      : { km_marker: k.km - 1, description: `GPX: desce ${k.loss_m} m (${pt(k.grade_pct)}%)`, elevation: "desce" as const });
}
