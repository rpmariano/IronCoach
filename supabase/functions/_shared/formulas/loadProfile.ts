// O perfil de carga por prova (pedido do Rui, 2026-11-09).
//
// A Patty recebeu no mesmo dia dois alertas da Carol que se contradiziam:
// «estás a esforçar-te demasiado» (a carga) e «fazes poucos km para a meia»
// (o volume). Cada um certo sozinho, incoerentes juntos. A decisão passa a ser
// do atleta, por prova (race_events.load_profile):
//   prudente     — como até aqui: base baixa +10 km sobre a média das 3
//                  semanas antes, senão ACWR 1,50.
//   mais_volume  — base baixa +15 km; com base normal, o ACWR 1,50 nunca se
//                  passa (runLoadAlert.ts, acuteLimitKm).
// Manda o perfil da próxima prova principal (governingRace).
//
// Aqui fica, puro, para o servidor e para a app (@formulas):
//   - loadVolumeState: um só estado em vez de dois alertas — «conflito»
//     quando o alerta de carga e o volume «abaixo» coexistiriam e o perfil
//     ainda não foi escolhido; com perfil escolhido não há conflito, só o
//     limite desse perfil;
//   - loadProfileRedFlag: com Mais volume, uma dor, RPE ≥ 9 em 2 corridas
//     fáceis seguidas ou a recuperação em crítico voltam-no a Prudente.

import { runLoadReading, type LoadPlanItem, type LoadProfile, type LoadRun } from "./runLoadAlert.ts";
import { ACWR_SAFE_MAX } from "./acwr.ts";
import { raceVolumeOutlook, type OutlookPlanItem, type OutlookRun, type RaceVolumeOutlook } from "./raceVolumeOutlook.ts";
import { PAIN_ALARM_THRESHOLD } from "./checkinAlarms.ts";
import { checkinPillar, type CheckinForReadiness } from "./readinessIndex.ts";

export type { LoadProfile };

export interface ProfileRace {
  id?: string | null;
  name?: string | null;
  date: string;
  distance_km: number | string | null;
  experience_level?: string | null;
  race_priority?: string | null;
  status?: string | null;
  load_profile?: string | null;
  load_profile_at?: string | null;
  load_profile_reverted_at?: string | null;
  load_profile_revert_reason?: string | null;
}

/** A prova cujo perfil manda: a próxima principal (prioridade A — sem
 *  prioridade conta como A, como em todo o lado), ou a próxima, se nenhuma
 *  das que faltam for principal. Só as agendadas, de hoje em diante. */
export function governingRace<R extends ProfileRace>(races: R[] | null | undefined, todayISO: string): R | null {
  const upcoming = (races || [])
    .filter((r) => r && typeof r.date === "string" && r.date.slice(0, 10) >= todayISO && (r.status ?? "agendada") === "agendada")
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming.find((r) => (r.race_priority || "a") === "a") ?? upcoming[0] ?? null;
}

/** O perfil de uma prova: Mais volume só se escolhido; tudo o resto é Prudente. */
export function raceLoadProfile(race: ProfileRace | null | undefined): LoadProfile {
  return race?.load_profile === "mais_volume" ? "mais_volume" : "prudente";
}

/** O atleta já escolheu (ou um sinal vermelho já o voltou a Prudente). */
export function loadProfileChosen(race: ProfileRace | null | undefined): boolean {
  return !!race?.load_profile_at || !!race?.load_profile_reverted_at;
}

export const LOAD_PROFILE_LABELS: Record<LoadProfile, string> = { prudente: "Prudente", mais_volume: "Mais volume" };

export type LoadVolumeStateName = "ok" | "carga" | "volume" | "conflito" | "perfil";

/** Bug #123 (2026-11-17): nos últimos 14 dias antes da prova que manda é
 *  afinação, não é altura de subir volume — o «volume insuficiente» deixa de
 *  contar (sem ele não há conflito; fica só a carga, se a houver). */
export const TAPER_WINDOW_DAYS = 14;
/** Uma prova concluída explica a carga dos últimos 7 dias quando os km dela
 *  são pelo menos esta parte deles (bug #123: a meia de 21,76 em 26,6 km). */
export const ACUTE_FROM_RACE_SHARE = 0.5;

/** A prova que subiu a carga dos últimos 7 dias — só para o texto («A prova
 *  de domingo subiu a carga dos últimos 7 dias»); a carga conta na mesma. */
export interface AcuteFromRace {
  raceId: string | null;
  name: string | null;
  /** O dia da prova (AAAA-MM-DD). */
  date: string;
  /** Os km da corrida dessa prova (a ligada a ela; sem ela, a distância da prova). */
  km: number;
}

const DAY_MS = 86400000;
const isoDaysBetween = (fromISO: string, toISO: string) =>
  Math.round((Date.parse(`${toISO.slice(0, 10)}T00:00:00Z`) - Date.parse(`${fromISO.slice(0, 10)}T00:00:00Z`)) / DAY_MS);

/** A prova concluída nos últimos 7 dias (hoje incluído) que explica a carga
 *  deles: a de mais km, se forem ≥ ACUTE_FROM_RACE_SHARE do total. Os km são
 *  os da corrida ligada (race_id), senão os de uma corrida de competição
 *  nesse dia, senão a distância da prova. */
export function acuteFromRaceOf(
  races: ProfileRace[] | null | undefined,
  runs: { date: string; distance_km?: number | string | null; kind?: string | null; race_id?: string | null }[] | null | undefined,
  todayISO: string,
  acuteKm: number,
): AcuteFromRace | null {
  if (!(acuteKm > 0)) return null;
  const list = runs || [];
  let best: AcuteFromRace | null = null;
  for (const r of races || []) {
    if (!r || typeof r.date !== "string") continue;
    const ago = isoDaysBetween(r.date, todayISO);
    if (ago < 0 || ago > 6) continue;
    const linked = list.filter((x) => r.id && x.race_id === r.id);
    const sameDay = linked.length ? linked : list.filter((x) => x.kind === "competicao" && String(x.date).slice(0, 10) === r.date.slice(0, 10));
    if (!linked.length && (r.status ?? "agendada") !== "concluida" && !sameDay.length) continue;
    const runKm = sameDay.reduce((t, x) => t + (Number(x.distance_km) || 0), 0);
    const kmOf = runKm > 0 ? runKm : Number(r.distance_km) || 0;
    if (kmOf <= 0) continue;
    if (!best || kmOf > best.km) best = { raceId: r.id ?? null, name: r.name ?? null, date: r.date.slice(0, 10), km: Math.round(kmOf * 100) / 100 };
  }
  return best && best.km >= acuteKm * ACUTE_FROM_RACE_SHARE ? best : null;
}

export interface LoadVolumeState {
  /** «conflito»: os dois alertas coexistiriam e o perfil está por escolher —
   *  um só cartão, com as duas opções. «perfil»: já escolhido — só o limite
   *  dele (loadAlert diz se a carga o passou). «carga» / «volume»: só um dos
   *  dois. «ok»: nenhum. */
  state: LoadVolumeStateName;
  race: { id: string | null; name: string | null; date: string } | null;
  profile: LoadProfile;
  chosen: boolean;
  /** Km dos últimos 7 dias, o ACWR deles (null sem histórico) e o limite
   *  seguro com o perfil em vigor. */
  acuteKm: number;
  ratio: number | null;
  safeLimitKm: number;
  /** O limite com cada perfil — para o cartão mostrar o que cada escolha dá. */
  limits: Record<LoadProfile, number>;
  /** O volume para a prova (raceVolumeOutlook): o de hoje, o que o nível
   *  pede, e o projetado com o plano aceite. */
  currentWeeklyKm: number | null;
  recommendedWeeklyKm: number | null;
  projectedWeeklyKm: number | null;
  /** O status do raceVolumeOutlook: «por_planear» quando há semanas antes da
   *  prova sem plano — aí o volume não é «abaixo» e não há conflito. */
  volumeStatus: RaceVolumeOutlook["status"] | null;
  /** O aviso de carga que a app mostra no dia-a-dia. Com o perfil escolhido
   *  (qualquer um), só acima do limite desse perfil — o cartão diz «até X km»
   *  e a regra é não contradizer (revisão de 5fea1e4e). Por escolher: como
   *  hoje, o ACWR acima de 1,30 (cautela ou perigo, com histórico; foi o
   *  «estás a esforçar-te demasiado» da Patty, ACWR 1,31). */
  loadAlert: boolean;
  volumeBelow: boolean;
  /** Um sinal vermelho voltou o Mais volume a Prudente (loadProfileRedFlag). */
  reverted: { at: string; reason: string | null } | null;
  /** Dias até à prova que manda (0 = hoje), ou null sem prova. */
  daysToRace: number | null;
  /** Nos últimos TAPER_WINDOW_DAYS dias antes dela: é afinação — o volume
   *  «abaixo» não conta (volumeBelow fica false; bug #123). */
  taper: boolean;
  /** A prova concluída que subiu a carga dos últimos 7 dias, ou null (só para
   *  o texto; a carga conta na mesma — bug #123). */
  acuteFromRace: AcuteFromRace | null;
}

/**
 * O estado da carga e do volume para a próxima prova principal. `profileLevel`:
 * o nível do perfil, quando a prova não tem um (como raceVolumeText.js).
 * `plannedUntilISO`: o period_end mais tardio dos planos aceites (como
 * raceVolumeText.js) — as semanas depois dele estão por planear e não
 * contam como zero; sem ele, o último dia com itens do plano.
 */
export function loadVolumeState(
  { races, runs, planItems, todayISO, profileLevel = null, plannedUntilISO = null }: {
    races: ProfileRace[] | null | undefined;
    runs: (LoadRun & OutlookRun & { race_id?: string | null })[] | null | undefined;
    planItems?: (LoadPlanItem & OutlookPlanItem)[] | null;
    todayISO: string;
    profileLevel?: string | null;
    plannedUntilISO?: string | null;
  },
): LoadVolumeState {
  const race = governingRace(races, todayISO);
  const profile = raceLoadProfile(race);
  const chosen = loadProfileChosen(race);
  const list = runs || [];
  const items = planItems || [];
  const reading = runLoadReading({ runs: list, planItems: items, today: todayISO, profile });
  const other = runLoadReading({ runs: list, planItems: items, today: todayISO, profile: profile === "prudente" ? "mais_volume" : "prudente" });
  const outlook: RaceVolumeOutlook | null = race
    ? raceVolumeOutlook({
      race: { ...race, experience_level: race.experience_level || profileLevel },
      runs: list, planItems: items, todayISO, plannedUntilISO,
    })
    : null;
  const loadAlert = chosen || profile === "mais_volume"
    ? reading.enoughHistory && reading.acuteKm > reading.limitKm + 0.05
    : reading.enoughHistory && reading.ratio !== null && reading.ratio > ACWR_SAFE_MAX;
  // «por_planear» não é «abaixo»: as semanas sem plano ainda podem somar. E
  // nas duas semanas antes da prova é afinação: o volume já não se sobe.
  const daysToRace = race ? isoDaysBetween(todayISO, race.date) : null;
  const taper = daysToRace != null && daysToRace >= 0 && daysToRace <= TAPER_WINDOW_DAYS;
  const volumeBelow = outlook?.status === "abaixo" && !taper;
  const state: LoadVolumeStateName = chosen
    ? "perfil"
    : loadAlert && volumeBelow ? "conflito" : loadAlert ? "carga" : volumeBelow ? "volume" : "ok";
  return {
    state,
    race: race ? { id: race.id ?? null, name: race.name ?? null, date: race.date } : null,
    profile,
    chosen,
    acuteKm: reading.acuteKm,
    ratio: reading.enoughHistory ? reading.ratio : null,
    safeLimitKm: reading.limitKm,
    limits: profile === "prudente"
      ? { prudente: reading.limitKm, mais_volume: other.limitKm }
      : { prudente: other.limitKm, mais_volume: reading.limitKm },
    currentWeeklyKm: outlook?.currentWeeklyKm ?? null,
    recommendedWeeklyKm: outlook?.recommendedWeeklyKm ?? null,
    projectedWeeklyKm: outlook?.projectedWeeklyKm ?? null,
    volumeStatus: outlook?.status ?? null,
    loadAlert,
    volumeBelow,
    reverted: race?.load_profile_reverted_at ? { at: race.load_profile_reverted_at, reason: race.load_profile_revert_reason ?? null } : null,
    daysToRace,
    taper,
    acuteFromRace: acuteFromRaceOf(races, list, todayISO, reading.acuteKm),
  };
}

/** O assunto da carga no chat (bug #123, pedido do Rui: o cartão do Início
 *  passa a ser um alerta da Carol que abre o chat). Uma vez por mudança de
 *  estado: `load:<prova>:<estado>`, mais `:<nome da prova que subiu a carga>`
 *  quando a houver. null quando não há nada a dizer (sem prova, ou «ok»).
 *  A app usa-a para não repetir o alerta; o servidor, como chave no
 *  coach_proactive_log (load_topic:<assinatura>). */
export function loadTopicSignature(s: LoadVolumeState | null | undefined): string | null {
  if (!s || !loadTopicApplies(s)) return null;
  // A prova que subiu a carga só conta com aviso de carga: no «volume» ela não
  // muda nada, e sair da janela de 7 dias não pode abrir conversa nova.
  const fromRace = s.loadAlert && s.acuteFromRace?.name ? `:${s.acuteFromRace.name}` : "";
  return `load:${s.race!.id}:${s.state}${fromRace}`.slice(0, 180);
}

/** Há assunto para a Carol? A mesma regra na app (o alerta do Início) e no
 *  servidor (o turno e a assinatura): carga, volume e conflito; com o perfil
 *  escolhido, só se a carga passou o limite dele. Sem prova que mande, não. */
export function loadTopicApplies(s: LoadVolumeState | null | undefined): boolean {
  if (!s?.race?.id) return false;
  if (s.state === "carga" || s.state === "volume" || s.state === "conflito") return true;
  return s.state === "perfil" && s.loadAlert;
}

// ── Os sinais vermelhos com Mais volume ──────────────────────────────────────

export type LoadProfileRedFlag = "dor" | "rpe_alto" | "recuperacao_critica";

/** As corridas fáceis, para o RPE: as rodagens e as recuperações. */
const EASY_RUN_TYPES = new Set(["continuo", "recuperacao"]);
/** RPE a partir do qual uma corrida fácil não foi fácil. */
export const RED_FLAG_RPE = 9;
/** O pilar «Como acordaste» abaixo disto é recuperação em crítico. */
export const RECOVERY_CRITICAL_SCORE = 25;

export interface RedFlagCheckin extends CheckinForReadiness {
  date: string;
  /** Quando foi gravado (e corrigido): só conta o registado depois da escolha. */
  created_at?: string | null;
  updated_at?: string | null;
}
/** O check-in que serve para a recuperação em crítico: das últimas 48 h. */
export const RECOVERY_CHECKIN_MAX_AGE_MS = 48 * 3600 * 1000;
export interface RedFlagRun {
  date: string;
  kind?: string | null;
  training_type?: string | null;
  effort_rpe?: number | null;
  created_at?: string | null;
}

/**
 * Com Mais volume, o primeiro sinal vermelho desde que foi escolhido, ou null:
 *   - dor: um check-in com dor ≥ PAIN_ALARM_THRESHOLD (o alarme G2/G5,
 *     daily_checkins.pain);
 *   - rpe_alto: duas corridas fáceis seguidas (continuo/recuperacao, por
 *     data) com RPE ≥ 9 (runs.effort_rpe);
 *   - recuperacao_critica: o pilar «Como acordaste» do check-in mais recente
 *     (readinessIndex.ts, checkinPillar — sono, energia, stress e dor) abaixo
 *     de 25.
 * Só conta o que foi registado DEPOIS da escolha (created_at, não a data do
 * dia: uma dor de manhã não desfaz a escolha feita à tarde — revisão de
 * 5fea1e4e); sem created_at, só o dos dias seguintes ao da escolha. A
 * recuperação em crítico só com um check-in das últimas 48 h.
 */
export function loadProfileRedFlag(
  { race, runs, checkins, nowISO = new Date().toISOString() }: {
    race: ProfileRace | null | undefined;
    runs: RedFlagRun[] | null | undefined;
    checkins: RedFlagCheckin[] | null | undefined;
    nowISO?: string;
  },
): { reason: LoadProfileRedFlag; date: string } | null {
  if (raceLoadProfile(race) !== "mais_volume") return null;
  const chosenAt = race?.load_profile_at ?? "";
  const chosenMs = Date.parse(chosenAt);
  if (!Number.isFinite(chosenMs)) return null;
  const chosenDay = chosenAt.slice(0, 10);
  // Registado depois da escolha: pelo created_at; sem ele, só um dia seguinte.
  const after = (r: { date: string; created_at?: string | null }) => {
    const at = Date.parse(r.created_at ?? "");
    return Number.isFinite(at) ? at > chosenMs : r.date.slice(0, 10) > chosenDay;
  };
  const recent = (checkins || []).filter((c) => typeof c?.date === "string" && after(c)).sort((a, b) => a.date.localeCompare(b.date));
  const pain = recent.find((c) => (Number(c.pain) || 0) >= PAIN_ALARM_THRESHOLD);
  if (pain) return { reason: "dor", date: pain.date };

  const easy = (runs || [])
    .filter((r) => typeof r?.date === "string" && after(r) && r.kind !== "competicao" && EASY_RUN_TYPES.has(r.training_type ?? ""))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  for (let i = 1; i < easy.length; i++) {
    if ((Number(easy[i - 1].effort_rpe) || 0) >= RED_FLAG_RPE && (Number(easy[i].effort_rpe) || 0) >= RED_FLAG_RPE) {
      return { reason: "rpe_alto", date: easy[i].date.slice(0, 10) };
    }
  }

  const last = recent.at(-1);
  const lastAt = Date.parse(last?.updated_at ?? last?.created_at ?? `${last?.date ?? ""}T12:00:00Z`);
  const fresh = Number.isFinite(lastAt) && Date.parse(nowISO) - lastAt <= RECOVERY_CHECKIN_MAX_AGE_MS;
  const pillar = last && fresh ? checkinPillar(last) : null;
  if (last && pillar && pillar.score < RECOVERY_CRITICAL_SCORE) return { reason: "recuperacao_critica", date: last.date };
  return null;
}

/** O assunto por resolver aberto quando um sinal vermelho volta o Mais
 *  volume a Prudente (coach-daily-summary): a etiqueta no início do motivo,
 *  como «[carga]» — para o Início (carolTopics.js) lhe dar a frase dele. */
export const LOAD_PROFILE_REVERT_TAG = "[perfil]";
export function isLoadProfileRevertIntervention(reason: string | null | undefined): boolean {
  return typeof reason === "string" && reason.startsWith(LOAD_PROFILE_REVERT_TAG);
}

export const RED_FLAG_LABELS: Record<LoadProfileRedFlag, string> = {
  dor: "uma dor registada",
  rpe_alto: "RPE 9 ou mais em duas corridas fáceis seguidas",
  recuperacao_critica: "a recuperação (sono, energia, stress) em crítico",
};
