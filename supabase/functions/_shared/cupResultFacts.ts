// A linha DELE na classificação oficial de uma jornada, para o chat
// (specs/trofeu.md §8, Fase 5). Dois usos:
//   - o turno cup_results (o toque na notificação "Saiu a classificação");
//   - o balanço (race_after) de uma jornada com a classificação já saída —
//     a junção do §8: o aviso não sai à parte, vai no balanço.
// A notificação nunca leva lugar, pontos nem clube; o chat, a ele, diz o
// lugar dele e o tempo. Só a linha do próprio (JWT do pedido, RLS "own rows"
// e .eq(user_id)): nunca o dorsal, nunca terceiros. Qualquer erro → null (a
// Carol diz só que saiu e onde a ver).

// deno-lint-ignore-file no-explicit-any
import { dayMonth, isCupSchemaMissing } from "./seriesBlock.ts";
import { pointsBand } from "./formulas/cupPoints.ts";
import { cupRoundText } from "./formulas/cupNotices.ts";

export interface CupResultFactsRow {
  match_status: string | null;
  position: number | null;
  category_code: string | null;
  category_position: number | null;
  official_time_s: number | null;
  points: number | string | null;
  points_source?: string | null;
}

/** 2172 → "36:12"; 3723 → "1:02:03". */
export function officialTimeText(seconds: number | null | undefined): string | null {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return null;
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const mmss = `${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
  return h ? `${h}:${mmss}` : mmss;
}

function posInt(v: unknown): number | null {
  const n = Number(v);
  return v != null && Number.isInteger(n) && n > 0 ? n : null;
}

const ONLY_HIS = "Só a linha dele: nada de outros atletas, do clube nem do dorsal.";

/** A frase do Contexto. `pointsKnown`: a edição tem pontos por tabela com a
 *  base conhecida (pointsBand) — sem isso, a Carol cala os pontos (Fase 2). */
export function cupResultFactsLine(i: {
  roundText: string;
  roundDate: string | null;
  row: CupResultFactsRow | null;
  pointsKnown: boolean;
}): string {
  const date = dayMonth(i.roundDate);
  const where = `${i.roundText}${date ? `, ${date}` : ""}`;
  const row = i.row;
  if (row?.match_status === "confirmada") {
    const parts: string[] = [];
    const cat = posInt(row.category_position);
    const code = String(row.category_code ?? "").trim();
    if (cat) parts.push(`${cat}.º no escalão${code ? ` ${code}` : ""}`);
    const pos = posInt(row.position);
    if (pos) parts.push(`${pos}.º da geral`);
    const time = officialTimeText(row.official_time_s);
    if (time) parts.push(`tempo oficial ${time}`);
    const pts = row.points == null || row.points === "" ? null : Number(row.points);
    if (i.pointsKnown && pts != null && Number.isFinite(pts) && pts >= 0) {
      const n = String(pts).replace(".", ",");
      parts.push(`${n} ${pts === 1 ? "ponto" : "pontos"}${row.points_source === "calculado" ? " (provisórios)" : ""}`);
    }
    return `Classificação oficial da ${where} — a linha dele: ${parts.length ? parts.join(", ") : "confirmada, sem lugar nem tempo publicados"}. ${ONLY_HIS}`;
  }
  if (row?.match_status === "proposta" || row?.match_status === "perdida") {
    return `A classificação oficial da ${where} já saiu; a linha dele está por confirmar no ecrã do Troféu ("És tu?") — não digas números dessa linha. ${ONLY_HIS}`;
  }
  return `A classificação oficial da ${where} já saiu; não há linha dele confirmada — não inventes lugar nem tempo; diz onde a ver (ecrã do Troféu, link oficial). ${ONLY_HIS}`;
}

function readFailed(error: any): null {
  if (!isCupSchemaMissing(error)) console.warn("cupResultFacts: leitura falhou:", error?.message ?? String(error));
  return null;
}

const NONE = Promise.resolve({ data: null, error: null });

/** A frase para o Contexto do turno, ou null: sem jornada, sem a
 *  classificação pronta, sem o aviso ligado (`requireNotify`, a junção ao
 *  balanço) ou num erro. */
export async function fetchCupResultFacts(
  sb: any,
  userId: string,
  target: { roundId: string } | { raceId: string },
  opts: { requireNotify?: boolean; now?: Date } = {},
): Promise<string | null> {
  try {
    let roundId: string | null = "roundId" in target ? target.roundId : null;
    if (!roundId) {
      const raceR = await sb.from("race_events").select("cup_round_id").eq("id", (target as { raceId: string }).raceId).eq("user_id", userId).maybeSingle();
      if (raceR.error) return readFailed(raceR.error);
      roundId = raceR.data?.cup_round_id ?? null;
      if (!roundId) return null;
    }
    const roundR = await sb.from("cup_rounds").select("round_no, name, date, edition_id").eq("id", roundId).maybeSingle();
    if (roundR.error) return readFailed(roundR.error);
    const round = roundR.data;
    if (!round?.edition_id) return null;
    const [pubR, edR, enrR] = await Promise.all([
      sb.from("cup_round_publication").select("results_ready_at").eq("round_id", roundId).maybeSingle(),
      sb.from("cup_editions").select("points_mode, points_table, points_basis, notifications_enabled, competition:cup_competitions(round_label)")
        .eq("id", round.edition_id).maybeSingle(),
      opts.requireNotify
        ? sb.from("cup_enrollments").select("status, notify_results").eq("user_id", userId).eq("edition_id", round.edition_id).maybeSingle()
        : NONE,
    ]);
    for (const r of [pubR, edR, enrR]) if (r?.error) return readFailed(r.error);
    const ready = Date.parse(pubR.data?.results_ready_at ?? "");
    if (!Number.isFinite(ready) || ready > (opts.now ?? new Date()).getTime()) return null;
    const edition = edR.data;
    if (!edition) return null;
    if (opts.requireNotify && !(edition.notifications_enabled === true && enrR.data?.status === "ativa" && enrR.data?.notify_results === true)) {
      return null;
    }
    // Só a linha dele (a RLS já o garante; o filtro fica explícito).
    const resR = await sb.from("cup_results")
      .select("match_status, position, category_code, category_position, official_time_s, points, points_source")
      .eq("user_id", userId).eq("round_id", roundId).maybeSingle();
    if (resR.error) return readFailed(resR.error);
    const comp = Array.isArray(edition.competition) ? edition.competition[0] : edition.competition;
    return cupResultFactsLine({
      roundText: cupRoundText(comp?.round_label ?? null, Number(round.round_no) || 0, round.name),
      roundDate: round.date ?? null,
      row: resR.data ?? null,
      pointsKnown: pointsBand(edition, null, []).pointsKnown,
    });
  } catch (e) {
    console.warn("cupResultFacts: falhou:", (e as Error)?.message ?? String(e));
    return null;
  }
}
