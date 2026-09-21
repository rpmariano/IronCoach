// IronCoach · compute-percentile-snapshots Edge Function
//
// A tarefa de agregação do "Onde estás" (gamificação, Fase 5). Corre com a
// service role key e um segredo próprio (CRON_SECRET), como a
// send-water-reminders: não é invocada por um utilizador autenticado.
//
// O que faz, por esta ordem:
//   1. escolhe a última janela de 14 dias JÁ FECHADA (percentileSegments.ts);
//   2. lê os atletas com consentimento 'stats_pool' ativo — e só esses;
//   3. deriva o ESCALÃO da data de nascimento e deita a data fora ali mesmo;
//   4. calcula o índice de execução de cada um na janela (executionScore);
//   5. agrupa por escalão × género × modalidade;
//   6. grava o snapshot dos segmentos com n >= 20, e mais nenhum.
//
// ── O ATAQUE DE DIFERENCIAÇÃO, e porque é que esta função é preguiçosa ──
// Refrescar diariamente uma janela FIXA é a forma mais fácil de entregar o
// indivíduo: publicam-se duas distribuições do mesmo segmento que só diferem
// por uma pessoa ter entrado, saído, ou treinado mais um dia — e a diferença
// entre os dois snapshots É essa pessoa. Por isso:
//   · as janelas são uma grelha fixa de 14 dias, iguais para toda a gente, e
//     NÃO se sobrepõem (closedWindow);
//   · uma janela publicada NUNCA se volta a calcular — nem sequer quando
//     alguém retira o consentimento. Tirar uma pessoa de um agregado já
//     publicado seria a forma mais fiável de a apontar: as duas versões da
//     mesma janela diferem por ela. Quem sai deixa de contar a partir da
//     janela seguinte (no máximo 14 dias), e o que fica publicado é um
//     agregado de 20+ pessoas que já não é dado pessoal de ninguém.
// A função pode correr todos os dias — 13 dessas 14 vezes não escreve nada.
// Refresca-se ao ritmo da janela, nunca mais depressa.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { ageFromBirthDate } from "../_shared/formulas/age.ts";
import {
  evaluatePrescriptions,
  executionBase,
  executionScore,
  type PlanItemRow,
  type RunRow,
  type GymRow,
} from "../_shared/formulas/prescriptionAdherence.ts";
import {
  ageBandFor,
  closedWindow,
  MIN_SEGMENT_SIZE,
  nBand,
  segmentKey,
  TERRAIN_LOOKBACK_DAYS,
  terrainForAthlete,
  ventileBoundaries,
  WINDOW_DAYS,
} from "../_shared/formulas/percentileSegments.ts";

const METRIC = "plan_execution";
const DAY_MS = 86400000;
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const headers = { "Content-Type": "application/json" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

/** Um atleta do universo, JÁ sem data de nascimento: só o escalão derivado. */
interface Athlete {
  id: string;
  ageBand: string;
  gender: "F" | "M";
}

interface Segment {
  ageBand: string;
  gender: string;
  terrain: string;
  scores: number[];
}

async function handler(req: Request): Promise<Response> {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return jsonResponse({ error: "Não autorizado" }, 401);
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const hoje = new Date().toISOString().slice(0, 10);
  const janela = closedWindow(hoje);
  if (!janela) return jsonResponse({ skipped: "ainda não fechou nenhuma janela" });

  // Já publicada? Não se toca, aconteça o que acontecer entretanto — ver o
  // bloco sobre diferenciação no topo.
  const { data: jaFeitos, error: erroFeitos } = await sb
    .from("percentile_snapshots")
    .select("age_band")
    .eq("metric", METRIC)
    .eq("window_start", janela.start);
  if (erroFeitos) return jsonResponse({ error: "Não foi possível ler os snapshots" }, 500);
  if ((jaFeitos || []).length > 0) {
    return jsonResponse({ window: janela, skipped: "janela já publicada" });
  }

  // 1) Quem consente. E SÓ quem consente: sem este filtro não há tarefa
  //    nenhuma para correr.
  const { data: perfis, error: erroPerfis } = await sb
    .from("profiles")
    .select("id, birth_date, gender, stats_pool_consent_at")
    .not("stats_pool_consent_at", "is", null);
  if (erroPerfis) return jsonResponse({ error: "Não foi possível ler os perfis" }, 500);

  /* 2) O escalão sai daqui já derivado. A data de nascimento existe dentro
        deste `map` e acaba com ele: nada a jusante — nem o agrupamento, nem o
        snapshot, nem a resposta — a volta a ver. */
  const atletas: Athlete[] = (perfis || [])
    .map((p) => {
      const ageBand = ageBandFor(ageFromBirthDate(p.birth_date), p.gender);
      return ageBand && (p.gender === "F" || p.gender === "M")
        ? { id: p.id as string, ageBand, gender: p.gender as "F" | "M" }
        : null;
    })
    .filter((a): a is Athlete => a !== null);

  if (atletas.length < MIN_SEGMENT_SIZE) {
    // Nem no total há gente que chegue: não há segmento possível.
    return jsonResponse({ window: janela, segments: [], note: "sem segmentos acima do limiar" });
  }

  const ids = atletas.map((a) => a.id);

  /* 3) Os dados da janela, de uma vez. Um pedido por atleta multiplicava o
        tempo da função pelo número de atletas — e isto corre uma vez por
        quinzena, não vale a pena ser esperto de outra maneira. */
  const [itensRes, corridasRes, ginasioRes, provasRes] = await Promise.all([
    sb.from("coach_plan_items")
      .select("user_id, plan_id, planned_date, kind, training_type, target_distance_km, target_duration_min, status, completed_run_id, completed_session_id, actual_date")
      .in("user_id", ids).gte("planned_date", janela.start).lt("planned_date", janela.end),
    sb.from("runs")
      .select("user_id, id, date, distance_km, duration_seconds, effort_rpe")
      .in("user_id", ids).gte("date", janela.start).lt("date", janela.end),
    sb.from("workout_sessions")
      .select("user_id, id, date, duration_seconds")
      .in("user_id", ids).gte("date", janela.start).lt("date", janela.end),
    sb.from("race_events")
      .select("user_id, date, race_type")
      .in("user_id", ids).gte("date", addDays(janela.end, -TERRAIN_LOOKBACK_DAYS)),
  ]);
  if (itensRes.error || corridasRes.error || ginasioRes.error || provasRes.error) {
    return jsonResponse({ error: "Não foi possível ler os dados da janela" }, 500);
  }

  const porAtleta = <T extends { user_id?: string }>(rows: T[] | null): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const r of rows || []) {
      if (!r?.user_id) continue;
      const lista = m.get(r.user_id) || [];
      lista.push(r);
      m.set(r.user_id, lista);
    }
    return m;
  };
  const itensDe = porAtleta(itensRes.data as Array<PlanItemRow & { user_id: string }>);
  const corridasDe = porAtleta(corridasRes.data as Array<RunRow & { user_id: string }>);
  const ginasioDe = porAtleta(ginasioRes.data as Array<GymRow & { user_id: string }>);
  const provasDe = porAtleta(provasRes.data as Array<{ user_id: string; date: string; race_type: string | null }>);

  // 4) e 5) — o índice de cada um, e o segmento onde ele conta.
  const segmentos = new Map<string, Segment>();
  for (const atleta of atletas) {
    const terrain = terrainForAthlete(provasDe.get(atleta.id) || [], janela.end);
    if (!terrain) continue;

    const resumo = evaluatePrescriptions({
      items: itensDe.get(atleta.id) || [],
      runs: corridasDe.get(atleta.id) || [],
      gym: ginasioDe.get(atleta.id) || [],
      // A nutrição não entra no índice de execução: a métrica é o PLANO.
      mealsByDate: {},
    }, janela.end, WINDOW_DAYS);

    // Sem plano nenhum na janela não há índice: um 0 aqui dizia "cumpriu
    // nada" e puxava a distribuição toda para baixo com quem nem plano tinha.
    if (executionBase(resumo.counts) <= 0) continue;

    const chave = segmentKey({ ageBand: atleta.ageBand, gender: atleta.gender, terrain });
    const segmento: Segment = segmentos.get(chave)
      || { ageBand: atleta.ageBand, gender: atleta.gender, terrain, scores: [] as number[] };
    segmento.scores.push(executionScore(resumo.counts));
    segmentos.set(chave, segmento);
  }

  /* 6) Só os segmentos com pelo menos k pessoas lá dentro. O `check (n >= 20)`
        da tabela recusaria os outros de qualquer maneira — filtra-se aqui
        para não pedir à base que recuse, não para poder mudar de ideias. */
  const linhas = [...segmentos.values()]
    .filter((s) => s.scores.length >= MIN_SEGMENT_SIZE)
    .map((s) => ({
      metric: METRIC,
      age_band: s.ageBand,
      gender: s.gender,
      terrain: s.terrain,
      window_start: janela.start,
      window_end: janela.end,
      n_band: nBand(s.scores.length),
      n: s.scores.length,
      boundaries: ventileBoundaries(s.scores),
      computed_at: new Date().toISOString(),
    }));

  const abaixoDoLimiar = segmentos.size - linhas.length;

  if (linhas.length) {
    const { error } = await sb.from("percentile_snapshots").upsert(linhas, {
      onConflict: "metric,age_band,gender,terrain,window_start",
    });
    if (error) return jsonResponse({ error: "Não foi possível gravar os snapshots" }, 500);
  }

  /* A resposta leva n_band, nunca o `n`. Quem corre a tarefa não precisa do
     número exato para saber que ela correu, e um log com o `n` de cada
     segmento é a mesma fuga do ataque de diferenciação, só que por outro
     sítio. */
  return jsonResponse({
    window: janela,
    segments: linhas.map((l) => ({
      metric: l.metric, age_band: l.age_band, gender: l.gender, terrain: l.terrain, n_band: l.n_band,
    })),
    segments_below_k: abaixoDoLimiar,
  });
}

if (import.meta.main) {
  Deno.serve(handler);
}
