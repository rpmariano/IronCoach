// A Vitrina vista pela Carol — fórmula pura (2026-09-25).
//
// «Tens de garantir que a Carol reconhece toda a vitrine (…). Assim que houver
// números a Carol deve de alertar o atleta para consultar. Se num primeiro
// momento o seu nome não estiver lá, ela pode simplesmente alertar que já
// existem dados e depois avisar quando o atleta constar nas tabelas ou tb
// quando sai.»
//
// Três perguntas, respondidas aqui uma vez para o cliente (a entrada da
// Vitrina, os momentos do chat) e para o servidor (o tick, a memória da
// Carol) — a mesma chave dos dois lados, ou o mesmo aviso saía duas vezes:
//
//   1. O que é que o ecrã "Onde estás" tem para mostrar a ESTE atleta?
//      (percentileAvailability — o segmento dele, ou os vizinhos que o ecrã
//      lhe oferece, na última janela publicada)
//   2. Há um aviso "já há dados" por dar? (percentileReadyMoment — dois
//      momentos: primeiro "há dados em grupos ao lado do teu", depois "o teu
//      escalão já tem dados"; uma vez cada, por segmento)
//   3. Entrou ou saiu das tabelas? (leaderboardMoment — o top 10 do escalão
//      na última janela, face à janela anterior)
//
// Sem consentimento não há aviso nenhum: quem não entrou na média não tem
// percentil, e quem não aceitou as tabelas não consta delas. A Carol não
// empurra decisões de privacidade.

import { ageFromBirthDate } from "./age.ts";
import { ageBandFor, neighbourSegments, type Segment, terrainForAthlete, WINDOW_DAYS } from "./percentileSegments.ts";

export interface SnapshotRow {
  age_band: string;
  gender: string;
  terrain: string;
  window_start: string;
  window_end?: string;
  boundaries?: unknown;
  n_band?: string;
}

export interface LeaderboardEntryRow {
  window_start: string;
  rank: number;
  age_band?: string;
  gender?: string;
  terrain?: string;
}

const DAY_MS = 86400000;
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** "M40.M.estrada" — o segmento numa chave de aviso (sem "|" nem espaços). */
export const segmentId = (s: Segment) => `${s.ageBand}.${s.gender}.${s.terrain}`;

/** O segmento do atleta HOJE — escalão pela idade de hoje, modalidade pela
 *  prova que tem à frente (ou a última dos 90 dias). O mesmo que o ecrã "Onde
 *  estás" usa; null quando falta a data de nascimento, o género ou uma prova. */
export function ownSegmentFor(
  profile: { birth_date?: string | null; gender?: string | null } | null | undefined,
  races: Array<{ date?: string | null; race_type?: string | null }> | null | undefined,
  todayISO: string,
): Segment | null {
  const ageBand = ageBandFor(ageFromBirthDate(profile?.birth_date ?? null), profile?.gender ?? null);
  const terrain = terrainForAthlete(races, todayISO);
  return ageBand && terrain && profile?.gender ? { ageBand, gender: profile.gender, terrain } : null;
}

const sameSeg = (row: SnapshotRow, s: Segment) =>
  row.age_band === s.ageBand && row.gender === s.gender && row.terrain === s.terrain;

/** A janela mais recente que tem alguma coisa publicada. */
export function latestWindowStart(snapshots: SnapshotRow[] | null | undefined): string | null {
  let best: string | null = null;
  for (const s of snapshots || []) if (s?.window_start && (!best || s.window_start > best)) best = s.window_start;
  return best;
}

export function snapshotFor(snapshots: SnapshotRow[] | null | undefined, s: Segment, windowStart: string): SnapshotRow | null {
  return (snapshots || []).find((r) => r.window_start === windowStart && sameSeg(r, s)) || null;
}

export interface PercentileAvailability {
  windowStart: string;
  own: SnapshotRow | null;
  near: Array<{ step: "modalidade" | "escalao" | "genero"; segment: Segment; snapshot: SnapshotRow }>;
}

/** O que o "Onde estás" tem para mostrar a este atleta na última janela
 *  publicada: o segmento dele e/ou os vizinhos que o ecrã oferece. null quando
 *  não há nada — nem o dele nem nenhum ao lado (a entrada da Vitrina fica
 *  escondida, e a Carol não tem nada para anunciar). */
export function percentileAvailability(
  snapshots: SnapshotRow[] | null | undefined,
  own: Segment | null | undefined,
): PercentileAvailability | null {
  if (!own) return null;
  const windowStart = latestWindowStart(snapshots);
  if (!windowStart) return null;
  const ownRow = snapshotFor(snapshots, own, windowStart);
  const near = neighbourSegments(own)
    .map((n) => ({ ...n, snapshot: snapshotFor(snapshots, n.segment, windowStart) }))
    .filter((n): n is PercentileAvailability["near"][number] => n.snapshot !== null);
  return ownRow || near.length ? { windowStart, own: ownRow, near } : null;
}

export interface PercentileReadyMoment {
  key: string;
  stage: "perto" | "meu";
  windowStart: string;
}

/* O aviso "já há dados". Dois momentos, cada um uma vez por segmento do
   atleta (a chave leva o segmento: fazer anos e mudar de escalão é outro
   segmento, e aí volta a haver novidade):
     · "meu"   — o segmento dele tem distribuição na última janela;
     · "perto" — o dele não, mas um dos grupos ao lado tem. Só enquanto o dele
       NUNCA tiver sido publicado: depois de "o teu escalão já tem dados",
       "há dados ao lado do teu" seria andar para trás. */
export function percentileReadyMoment(
  snapshots: SnapshotRow[] | null | undefined,
  own: Segment | null | undefined,
  consented: boolean,
): PercentileReadyMoment | null {
  if (!consented || !own) return null;
  const a = percentileAvailability(snapshots, own);
  if (!a) return null;
  if (a.own) return { key: `percentile_ready:meu:${segmentId(own)}`, stage: "meu", windowStart: a.windowStart };
  const ownEverPublished = (snapshots || []).some((r) => sameSeg(r, own));
  if (ownEverPublished) return null;
  return { key: `percentile_ready:perto:${segmentId(own)}`, stage: "perto", windowStart: a.windowStart };
}

export interface LeaderboardMoment {
  key: string;
  stage: "entrou" | "saiu";
  windowStart: string;
  /** A posição com que entrou (1-10). Só em "entrou". */
  rank?: number;
}

/* Entrar e sair das tabelas — o top 10 do escalão, janela a janela.
   `entries` são as linhas do PRÓPRIO atleta em leaderboard_entries (as
   tabelas guardam só o top 10 de cada segmento publicado).
     · entrou — está na tabela da última janela e não estava na anterior;
     · saiu   — estava na anterior e não está nesta, com a tabela do escalão
       dele publicada nesta janela. Sem tabela publicada não "saiu": deixou de
       haver tabela, e dizer-lhe que saiu seria falso.
   Quem retira o consentimento sai por decisão própria e as linhas dele
   apagam-se na hora (migração das tabelas) — não há aviso a dar. */
export function leaderboardMoment(
  entries: LeaderboardEntryRow[] | null | undefined,
  snapshots: SnapshotRow[] | null | undefined,
  own: Segment | null | undefined,
  consented: boolean,
): LeaderboardMoment | null {
  if (!consented) return null;
  const latest = latestWindowStart(snapshots);
  if (!latest) return null;
  const previous = addDays(latest, -WINDOW_DAYS);
  const now = (entries || []).find((e) => e.window_start === latest);
  const before = (entries || []).find((e) => e.window_start === previous);
  if (now && !before) return { key: `leaderboard:entrou:${latest}`, stage: "entrou", windowStart: latest, rank: now.rank };
  if (!now && before && own && snapshotFor(snapshots, own, latest)) {
    return { key: `leaderboard:saiu:${latest}`, stage: "saiu", windowStart: latest };
  }
  return null;
}
