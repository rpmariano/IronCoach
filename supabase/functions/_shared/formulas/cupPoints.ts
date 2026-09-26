// A faixa de pontos de um inscrito (specs/trofeu.md §5 "Pontos", Fase 2).
// 2026-09-26.
//
// PORQUÊ A FAIXA E NÃO OS PONTOS. A Carol não faz contas de pontos: diz, no
// máximo, se atacar pode mudar alguma coisa. Numa tabela em escada (20, 18,
// 16…) cada lugar vale pontos; num patamar (10 pontos do 6.º ao 10.º) subir
// dois lugares não muda nada; no piso (todos os de baixo com o mesmo) atacar
// não muda os pontos. Esta função devolve em que zona da tabela o atleta
// costuma ficar; o texto sai do bloco da Carol (seriesBlock.ts).
//
// NULL = NÃO SABEMOS, A CAROL CALA (§3.1). Só há faixa com `points_mode`
// 'tabela', `points_basis` conhecida e uma tabela válida; a 34.ª de hoje tem
// points_basis null até ao regulamento → 'desconhecida' (base_desconhecida),
// mesmo que já haja resultados.
//
// NUNCA DADOS DE TERCEIROS. A posição de referência é a mediana dos últimos 3
// resultados confirmados DO PRÓPRIO — a função só recebe as linhas dele
// (cup_results com RLS "own rows" e o filtro pela inscrição dele).
//
// Ficheiro próprio para não mexer em cup.ts (Fase 1, em produção). O
// contador de presenças é o attendanceCount de cup.ts, sem alterações.

import type { CupEdition, EnrollmentKind } from "./cup.ts";

export type PointsBandKind = "escada" | "patamar" | "piso" | "desconhecida";

export type PointsUnknownReason =
  | "sem_pontos"            // points_mode 'sem_pontos'
  | "modo_desconhecido"     // points_mode null / outro
  | "base_desconhecida"     // points_basis null (a 34.ª hoje)
  | "tabela_invalida"       // points_table não é array não vazio de números ≥ 0
  | "fora_da_classificacao" // tipo ≠ clube_elegivel / individual_elegivel
  | "sem_posicoes";         // nenhum cup_results confirmado com a posição da base

export interface CupResultLike {
  round_id: string;
  round_date?: string | null;          // a data da jornada (o chamador junta-a)
  position?: number | null;
  category_position?: number | null;
  match_status?: string | null;
  [k: string]: unknown;
}

export interface ReferencePosition {
  position: number;
  count: number;
  provisional: boolean;
}

export interface PointsBand {
  band: PointsBandKind;
  why: PointsUnknownReason | null;
  pointsKnown: boolean;        // 'tabela' + base conhecida + tabela válida
  attendanceArgument: boolean; // pointsKnown && team_scoring 'soma_todos' && kind 'clube_elegivel'
  basis: "escalao" | "geral" | null;
  position: number | null;
  count: number;
  provisional: boolean;
  points: number | null;                              // pontos na posição de referência
  block: { from: number; to: number | null } | null;  // to null = piso (até ao fim)
  nextPoints: number | null;                          // pontos do bloco imediatamente acima (null no 1.º)
  placesToBoundary: number | null;                    // lugares a subir até ao bloco acima
}

/** Quantos resultados entram na posição de referência (os mais recentes). */
export const REFERENCE_RESULTS = 3;

function basisOf(v: unknown): "escalao" | "geral" | null {
  return v === "escalao" || v === "geral" ? v : null;
}

/** A tabela como números, ou null se não serve (vazia, ou com algum valor
 *  que não é um número ≥ 0 — um null no jsonb não pode passar a 0). */
function tableOf(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  return v.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0) ? (v as number[]) : null;
}

/** A posição de referência: a mediana dos últimos 3 resultados confirmados
 *  do próprio, na coluna da base (`category_position` no escalão, `position`
 *  na geral). Os mais recentes por data da jornada (desempate pelo id). Com
 *  2 valores, arredonda para o lugar pior (Math.ceil da média) — é o lado
 *  conservador. Provisória com menos de 3. null sem nenhum. */
export function referencePosition(
  results: CupResultLike[] | null | undefined,
  basis: string | null | undefined,
): ReferencePosition | null {
  const key = basis === "escalao" ? "category_position" : basis === "geral" ? "position" : null;
  if (!key) return null;
  const values = (results || [])
    .filter((r) => r && r.match_status === "confirmada" && Number.isInteger(r[key]) && (r[key] as number) > 0)
    .sort((a, b) =>
      String(b.round_date ?? "").localeCompare(String(a.round_date ?? "")) ||
      String(a.round_id ?? "").localeCompare(String(b.round_id ?? ""))
    )
    .slice(0, REFERENCE_RESULTS)
    .map((r) => r[key] as number)
    .sort((a, b) => a - b);
  const n = values.length;
  if (!n) return null;
  const position = n % 2 ? values[(n - 1) / 2] : Math.ceil((values[n / 2 - 1] + values[n / 2]) / 2);
  return { position, count: n, provisional: n < REFERENCE_RESULTS };
}

/** A faixa de pontos (§5). Pela ordem; a primeira regra que falha dá
 *  'desconhecida' com o motivo:
 *  1. points_mode 'sem_pontos' → sem_pontos; ≠ 'tabela' → modo_desconhecido;
 *  2. points_basis fora de escalao/geral → base_desconhecida;
 *  3. tabela inválida → tabela_invalida;
 *  4. inscrição fora das classificações finais → fora_da_classificacao;
 *  5. sem posição de referência → sem_posicoes.
 *  Depois, o bloco da posição p (o elemento n−1 da tabela são os pontos da
 *  posição n; depois do último vale o último): a corrida máxima de valores
 *  iguais que contém p. Chega ao fim da tabela → piso; um só lugar → escada;
 *  senão patamar.
 *
 *  `attendanceArgument` ("comparecer vale mais do que atacar") não depende da
 *  posição: só pede pontos conhecidos, a coletiva a somar todos e uma
 *  inscrição de clube que conta. */
export function pointsBand(
  edition: CupEdition | null | undefined,
  kind: EnrollmentKind | string | null | undefined,
  results: CupResultLike[] | null | undefined,
): PointsBand {
  const mode = edition?.points_mode;
  const basis = basisOf(edition?.points_basis);
  const table = tableOf(edition?.points_table);
  const pointsKnown = mode === "tabela" && basis != null && table != null;
  const attendanceArgument = pointsKnown && edition?.team_scoring === "soma_todos" && kind === "clube_elegivel";

  const unknown = (why: PointsUnknownReason): PointsBand => ({
    band: "desconhecida",
    why,
    pointsKnown,
    attendanceArgument,
    basis,
    position: null,
    count: 0,
    provisional: false,
    points: null,
    block: null,
    nextPoints: null,
    placesToBoundary: null,
  });

  if (mode === "sem_pontos") return unknown("sem_pontos");
  if (mode !== "tabela") return unknown("modo_desconhecido");
  if (!basis) return unknown("base_desconhecida");
  if (!table) return unknown("tabela_invalida");
  if (kind !== "clube_elegivel" && kind !== "individual_elegivel") return unknown("fora_da_classificacao");
  const ref = referencePosition(results, basis);
  if (!ref) return unknown("sem_posicoes");

  const L = table.length;
  const valueAt = (pos: number) => table[Math.min(pos, L) - 1];
  const p = ref.position;
  const points = valueAt(p);
  // Onde começa o bloco (depois do fim da tabela, o bloco é o do último valor).
  let from = Math.min(p, L);
  while (from > 1 && valueAt(from - 1) === points) from -= 1;
  // Onde acaba: se nenhum valor diferente aparece até ao fim, é o piso.
  let to = Math.min(p, L);
  while (to < L && valueAt(to + 1) === points) to += 1;
  const floor = to >= L;
  const band: PointsBandKind = floor ? "piso" : from === to ? "escada" : "patamar";
  const hasAbove = from > 1;

  return {
    band,
    why: null,
    pointsKnown,
    attendanceArgument,
    basis,
    position: p,
    count: ref.count,
    provisional: ref.provisional,
    points,
    block: { from, to: floor ? null : to },
    nextPoints: hasAbove ? valueAt(from - 1) : null,
    placesToBoundary: hasAbove ? p - (from - 1) : null,
  };
}
