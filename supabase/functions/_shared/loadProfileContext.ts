// O perfil de carga no servidor (2026-11-09): ler as provas com o perfil e o
// texto que a Carol recebe — o mesmo no chat e no resumo do dia, para os dois
// nunca dizerem coisas diferentes. A decisão (pura) vive em
// formulas/loadProfile.ts.

import {
  LOAD_PROFILE_LABELS, LOAD_PROFILE_REVERT_TAG, RED_FLAG_LABELS, type LoadProfileRedFlag, type LoadVolumeState, type ProfileRace,
} from "./formulas/loadProfile.ts";
import { LOW_BASE_RAMP_KM, LOW_BASE_RAMP_KM_MORE_VOLUME } from "./formulas/runLoadAlert.ts";

export const LOAD_PROFILE_RACE_COLUMNS =
  "id, name, date, distance_km, experience_level, race_priority, status, load_profile, load_profile_at, load_profile_reverted_at, load_profile_revert_reason";

/** As provas de `fromISO` em diante com o perfil de carga. [] numa falha —
 *  e enquanto a migration 20261109120000 não estiver aplicada (a coluna não
 *  existe): aí tudo fica Prudente, como antes. */
// deno-lint-ignore no-explicit-any
export async function fetchLoadProfileRaces(sb: any, userId: string, fromISO: string): Promise<ProfileRace[]> {
  try {
    const { data, error } = await sb.from("race_events").select(LOAD_PROFILE_RACE_COLUMNS)
      .eq("user_id", userId).gte("date", fromISO).order("date", { ascending: true }).limit(12);
    if (error) {
      if (!/load_profile/.test(String(error.message ?? ""))) console.warn("perfil de carga: provas não lidas:", error.message);
      return [];
    }
    return (data || []) as ProfileRace[];
  } catch (e) {
    console.warn("perfil de carga: provas não lidas:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** O period_end mais tardio dos planos aceites (o horizonte do que está
 *  planeado, como raceVolumeText.js); null sem planos ou numa falha. */
// deno-lint-ignore no-explicit-any
export async function fetchAcceptedPlanUntil(sb: any, userId: string): Promise<string | null> {
  try {
    const { data, error } = await sb.from("coach_plans").select("period_end")
      .eq("user_id", userId).eq("status", "aceite").order("period_end", { ascending: false }).limit(1);
    if (error) return null;
    const end = String(data?.[0]?.period_end ?? "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : null;
  } catch {
    return null;
  }
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const km = (n: number | null) => (n == null ? "—" : String(Math.round(n * 10) / 10).replace(".", ","));
/** Dias depois da volta a Prudente em que a Carol ainda a pode dizer. */
export const REVERT_NOTICE_DAYS = 7;

/** O bloco do contexto da Carol (chat e resumo). "" sem prova à frente. */
export function loadProfileContextLine(state: LoadVolumeState, todayISO: string): string {
  if (!state.race) return "";
  const label = LOAD_PROFILE_LABELS[state.profile];
  let s = `PERFIL DE CARGA para «${state.race.name ?? "a prova"}» (${dayMonth(state.race.date)}): ${label}` +
    (state.chosen ? ", escolhido pelo atleta" : " (por escolher — vale Prudente)") +
    ` — limite seguro destes 7 dias: ${km(state.safeLimitKm)} km (corridos: ${km(state.acuteKm)} km).`;
  if (state.chosen) {
    s += " A escolha é dele: nunca a contradigas — não lhe digas que está a fazer demasiado abaixo deste limite";
    s += state.profile === "prudente"
      ? ", nem que faz poucos km para a prova: com Prudente, a prova é para completar."
      : ".";
  }
  if (state.profile === "mais_volume") {
    s += ` Com Mais volume, com base baixa a semana pode subir até +${LOW_BASE_RAMP_KM_MORE_VOLUME} km sobre a média das 3 anteriores ` +
      `(com base normal, até ~20% por semana, nunca acima do ACWR 1,5); volta sozinho a Prudente com uma dor, RPE 9+ em duas ` +
      `corridas fáceis seguidas ou a recuperação em crítico.`;
  }
  const rev = state.reverted;
  if (rev && rev.at.slice(0, 10) >= new Date(Date.parse(`${todayISO}T00:00:00Z`) - REVERT_NOTICE_DAYS * 86400000).toISOString().slice(0, 10)) {
    const why = rev.reason && rev.reason in RED_FLAG_LABELS ? RED_FLAG_LABELS[rev.reason as LoadProfileRedFlag] : "um sinal vermelho";
    s += ` Voltou de Mais volume a Prudente sozinho em ${dayMonth(rev.at.slice(0, 10))} (${why}). Se ainda não lho disseste, diz-lho ` +
      `uma vez, sem alarme: foi por segurança, e ele pode voltar a escolher Mais volume quando o sinal passar.`;
  }
  if (state.state === "conflito") {
    const acwr = state.ratio != null ? `, ACWR ${String(state.ratio).replace(".", ",")}` : "";
    s += ` CONFLITO: a carga destes 7 dias (${km(state.acuteKm)} km${acwr}) já pede cautela e o volume para a prova fica abaixo do que ` +
      `o nível pede (${km(state.currentWeeklyKm)} km/semana; pede ${km(state.recommendedWeeklyKm)}). ` +
      `Não lhe dês os dois avisos. Explica-lhe as duas opções numa frase cada — Prudente: a semana fica até ${km(state.limits.prudente)} km ` +
      `e a prova é para completar; Mais volume: até ${km(state.limits.mais_volume)} km, mais perto do volume que a prova pede, com mais ` +
      `risco (volta a Prudente sozinho se aparecer dor, RPE 9+ em duas corridas fáceis seguidas ou a recuperação em crítico) — e ` +
      `pergunta qual prefere. A escolha é dele: só a gravas (update_race_event com load_profile) quando ele a disser.`;
  }
  return s;
}

/** A subida da base baixa com cada perfil, para as mensagens da guarda. */
export function lowBaseRampKm(profile: string): number {
  return profile === "mais_volume" ? LOW_BASE_RAMP_KM_MORE_VOLUME : LOW_BASE_RAMP_KM;
}

/** O motivo do assunto aberto quando um sinal vermelho volta o Mais volume a
 *  Prudente (coach-daily-summary): a Carol diz-lho uma vez, no chat. */
export { LOAD_PROFILE_REVERT_TAG };
export function loadProfileRevertReason(raceName: string | null | undefined, reason: LoadProfileRedFlag): string {
  return `${LOAD_PROFILE_REVERT_TAG} O perfil de carga de «${raceName ?? "a prova"}» voltou de Mais volume a Prudente sozinho: ` +
    `${RED_FLAG_LABELS[reason]}. Diz-lhe uma vez, sem alarme, que foi por segurança, que o limite volta a ser o do Prudente ` +
    `e que pode voltar a escolher Mais volume quando o sinal passar. Pergunta-lhe como está.`;
}
