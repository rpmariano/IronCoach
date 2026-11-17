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
 *  e enquanto a migration 20261110150630_race_load_profile não estiver aplicada (a coluna não
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
      `(com base normal, até ~20% por semana, nunca acima de 1,5 vezes o habitual); volta sozinho a Prudente com uma dor, ` +
      `corridas fáceis muito duras duas vezes seguidas ou a recuperação muito baixa.`;
  }
  const rev = state.reverted;
  if (rev && rev.at.slice(0, 10) >= new Date(Date.parse(`${todayISO}T00:00:00Z`) - REVERT_NOTICE_DAYS * 86400000).toISOString().slice(0, 10)) {
    const why = rev.reason && rev.reason in RED_FLAG_LABELS ? RED_FLAG_LABELS[rev.reason as LoadProfileRedFlag] : "um sinal vermelho";
    s += ` Voltou de Mais volume a Prudente sozinho em ${dayMonth(rev.at.slice(0, 10))} (${why}). Se ainda não lho disseste, diz-lho ` +
      `uma vez, sem alarme: foi por segurança, e ele pode voltar a escolher Mais volume quando o sinal passar.`;
  }
  // Bug #123: nas duas semanas antes da prova é afinação — nada de pedir volume.
  if (state.taper && state.daysToRace != null) {
    s += ` Faltam ${state.daysToRace} dia(s) para a prova: é afinação — não lhe peças mais volume nem lhe digas que faz poucos km para ela.`;
  }
  // E quando a carga destes 7 dias vem sobretudo de uma prova, di-lo assim.
  const fromRace = state.acuteFromRace;
  if (fromRace && state.loadAlert) {
    s += ` A carga destes 7 dias subiu sobretudo pela prova «${fromRace.name ?? "a prova"}» (${km(fromRace.km)} km, ${dayMonth(fromRace.date)}) — ` +
      `di-lo assim («a prova de ${dayMonth(fromRace.date)} subiu a carga dos últimos 7 dias»); os cuidados com a carga continuam a valer.`;
  }
  if (state.state === "conflito") {
    const acwr = state.ratio != null ? `, ${String(state.ratio).replace(".", ",")} vezes o habitual` : "";
    s += ` CONFLITO: a carga destes 7 dias (${km(state.acuteKm)} km${acwr}) já pede cautela e o volume para a prova fica abaixo do que ` +
      `o nível pede (${km(state.currentWeeklyKm)} km/semana; pede ${km(state.recommendedWeeklyKm)}). ` +
      `Não lhe dês os dois avisos. Explica-lhe as duas opções numa frase cada — Prudente: a semana fica até ${km(state.limits.prudente)} km ` +
      `e a prova é para completar; Mais volume: até ${km(state.limits.mais_volume)} km, mais perto do volume que a prova pede, com mais ` +
      `risco (volta a Prudente sozinho se aparecer dor, corridas fáceis muito duras duas vezes seguidas ou a recuperação muito baixa) — e ` +
      `pergunta qual prefere. A escolha é dele: só a gravas (update_race_event com load_profile) quando ele a disser.`;
  }
  return s;
}

/** As duas opções, com as palavras do cartão (src/utils/loadProfileState.js
 *  conflictOptionTexts — a decisão do Rui, palavra a palavra). */
export function loadProfileOptionTexts(state: LoadVolumeState): Record<"prudente" | "mais_volume", string> {
  return {
    prudente: `A semana fica até ${km(state.limits.prudente)} km; a prova é para completar.`,
    mais_volume: `Até ${km(state.limits.mais_volume)} km, mais perto do que a prova pede, com mais risco. Volta sozinho a Prudente se aparecer dor, corridas fáceis muito duras duas vezes seguidas ou recuperação muito baixa.`,
  };
}

/** O guião do turno em que o atleta abriu o chat pelo alerta da carga
 *  (bug #123): a carga com os números, o volume se ainda contar, e a
 *  escolha. Os botões Prudente / Mais volume vêm da app por baixo da
 *  mensagem (load_profile_choice); por palavras, grava-se com
 *  update_race_event. */
export function buildLoadTopicTurn(state: LoadVolumeState): string {
  const race = `«${state.race?.name ?? "a prova"}» (${state.race ? dayMonth(state.race.date) : "—"})`;
  const habitual = state.ratio && state.ratio > 0 ? Math.round((state.acuteKm / state.ratio) * 10) / 10 : null;
  const carga = `${km(state.acuteKm)} km nos últimos 7 dias` +
    (habitual != null ? ` contra uns ${km(habitual)} km do habitual (${String(state.ratio!.toFixed(2)).replace(".", ",")}×)` : "") +
    `; o limite seguro destes 7 dias com ${LOAD_PROFILE_LABELS[state.profile]} é ${km(state.safeLimitKm)} km`;
  const fromRace = state.acuteFromRace
    ? ` A subida vem sobretudo da prova «${state.acuteFromRace.name ?? "a prova"}» (${km(state.acuteFromRace.km)} km, ${dayMonth(state.acuteFromRace.date)}): ` +
      `di-lo assim — foi a prova, não um excesso de treino —, mas os cuidados com a carga valem na mesma.`
    : "";
  const volume = state.volumeBelow && state.currentWeeklyKm != null && state.recommendedWeeklyKm != null
    ? ` O volume para a prova: corre ${km(state.currentWeeklyKm)} km por semana e a prova pede ${km(state.recommendedWeeklyKm)}.`
    : state.taper && state.daysToRace != null
    ? ` Faltam ${state.daysToRace} dia(s) para ${race}: é afinação — o volume já não se sobe, não lho peças.`
    : "";
  const opts = loadProfileOptionTexts(state);
  const now = state.chosen ? `Escolheu ${LOAD_PROFILE_LABELS[state.profile]}` : "Ainda não escolheu (vale Prudente)";
  const intro = `O atleta abriu o chat a partir do teu alerta no Início — veio falar disso contigo. Explica-lhe numa ` +
    `conversa curta, na tua voz, sem siglas (nada de «ACWR» nem «RPE»): `;
  // No «volume» o assunto é o volume (a carga está dentro do limite): começa por ele.
  const body = state.state === "volume"
    ? `o volume para ${race} —${volume.replace(/^ O volume para a prova:/, "")} A carga destes 7 dias está dentro do limite ` +
      `(${km(state.acuteKm)} de ${km(state.safeLimitKm)} km): diz-lho, para ele saber que há margem.`
    : `o que é a carga (os últimos 7 dias contra o habitual) — ${carga}.` + fromRace + volume;
  return intro + body +
    ` Depois oferece-lhe a escolha para ${race}, uma frase cada — Prudente: ${opts.prudente} Mais volume: ${opts.mais_volume} ` +
    `${now}. Os botões Prudente e Mais volume aparecem por baixo da tua mensagem: diz-lhe que é só tocar no que preferir. ` +
    `Se ele te disser a escolha por palavras, grava-a com update_race_event (load_profile) — só quando ele a disser. ` +
    `Uma mensagem, sem listas longas; termina com a pergunta de qual prefere.`;
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
