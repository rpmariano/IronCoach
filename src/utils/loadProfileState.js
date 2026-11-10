import { loadVolumeState, LOAD_PROFILE_LABELS, RED_FLAG_LABELS } from '@formulas/loadProfile.ts';
import { addDaysISO } from '@formulas/calendarPeriod.ts';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';

/* Perfil de carga por prova (2026-11-09, aprovado pelo Rui). A Patty recebeu no mesmo dia
   «estás a esforçar-te demasiado» (ACWR 1,31) e «fazes poucos km para a meia» (19 km/semana contra
   35) — cada um certo sozinho, incoerentes juntos. A escolha passa a ser dela, por prova:
   Prudente ou Mais volume (race_events.load_profile). O estado vem de @formulas/loadProfile.ts
   (loadVolumeState, o mesmo que o servidor usa); aqui ficam só a ligação ao store e os textos.

   Sem a migration (as colunas não existem), as provas chegam sem load_profile e tudo fica
   Prudente, por escolher. */

export { LOAD_PROFILE_LABELS };

/** O estado da carga e do volume, com os dados do store (só os itens dos planos aceites). */
export function loadStateFor({ raceEvents, runs, coachPlans, coachPlanItems, profile, todayISO }) {
  const accepted = new Set((coachPlans || []).filter((p) => p?.status === 'aceite').map((p) => p.id));
  const planItems = (coachPlanItems || []).filter((i) => accepted.has(i?.plan_id));
  try {
    return loadVolumeState({
      races: raceEvents || [],
      runs: runs || [],
      planItems,
      todayISO,
      profileLevel: profile?.experience_level || null,
    });
  } catch (err) {
    console.warn('[perfil de carga]', err);
    return null;
  }
}

/* Os avisos que o estado substitui (biEngine): os de ACWR e o «volume insuficiente» da prova
   que manda. Nunca os dois juntos:
   - conflito: nenhum (o cartão das duas opções diz tudo);
   - carga: só o da carga; volume: só o do volume;
   - perfil: a carga só se passou o limite do perfil escolhido; o volume nunca — a escolha é dele
     (com Prudente, a prova é para completar);
   - ok: a carga não; o volume fica como estava (sem o nível da prova o outlook não sabe, e a
     viabilidade do biEngine continua a ser quem fala). */
const ACWR_IDS = new Set(['acwr_caution', 'acwr_danger']);

export function filterLoadInsights(insights, state) {
  if (!state?.race) return insights;
  const allowAcwr = state.loadAlert && state.state !== 'conflito';
  const allowVolume = state.state === 'volume' || state.state === 'ok';
  return insights.filter((i) => {
    if (ACWR_IDS.has(i.id)) return allowAcwr;
    // O «volume insuficiente» de outra prova (a próxima não é a principal) fica como estava.
    if (i.id === 'race_volume' && (!i.raceId || i.raceId === state.race.id)) return allowVolume;
    return true;
  });
}

const km = (v) => (v == null ? '—' : String(Math.round(Number(v) * 10) / 10).replace('.', ','));

/** Os textos das duas opções do cartão de conflito (a decisão do Rui, palavra a palavra). */
export function conflictOptionTexts(state) {
  return {
    prudente: `A semana fica até ${km(state?.limits?.prudente)} km; a prova é para completar.`,
    mais_volume: `Até ${km(state?.limits?.mais_volume)} km, mais perto do que a prova pede, com mais risco. Volta sozinho a Prudente se aparecer dor, RPE 9+ em duas corridas fáceis seguidas ou recuperação crítica.`,
  };
}

/** Os números do conflito: «Últimos 7 dias: 23,1 km (1,31× o habitual) · corres 19,1 km/semana; a prova pede 35.» */
export function conflictNumbersText(state) {
  if (!state) return null;
  const ratio = state.ratio != null ? ` (${String(state.ratio.toFixed(2)).replace('.', ',')}× o habitual)` : '';
  const parts = [`Últimos 7 dias: ${km(state.acuteKm)} km${ratio}`];
  if (state.currentWeeklyKm != null && state.recommendedWeeklyKm != null) {
    parts.push(`corres ${km(state.currentWeeklyKm)} km/semana; a prova pede ${km(state.recommendedWeeklyKm)}`);
  }
  return `${parts.join(' · ')}.`;
}

/** «Prudente · até 28,4 km nestes 7 dias (corridos: 23,1).» */
export function profileLimitText(state) {
  if (!state) return null;
  return `${LOAD_PROFILE_LABELS[state.profile]} · até ${km(state.safeLimitKm)} km nestes 7 dias (corridos: ${km(state.acuteKm)}).`;
}

/** Dias em que a nota da volta a Prudente se vê (os mesmos da Carol). */
export const REVERT_NOTE_DAYS = 7;

/** A nota da volta sozinha a Prudente, nos 7 dias a seguir, ou null. */
export function revertNoteText(state, todayISO) {
  const rev = state?.reverted;
  if (!rev?.at || state.profile !== 'prudente') return null;
  const day = String(rev.at).slice(0, 10);
  if (addDaysISO(day, REVERT_NOTE_DAYS) < todayISO) return null;
  const reason = RED_FLAG_LABELS[rev.reason] || null;
  return `Voltou sozinho a Prudente em ${format(parseISO(day), 'd MMM', { locale: pt })}${reason ? ` (${reason})` : ''}, por segurança. Podes voltar a escolher Mais volume quando o sinal passar.`;
}

/** O update da escolha (secção 3 do Backend): limpa a volta sozinha. */
export function loadProfileUpdate(profile, nowISO = new Date().toISOString()) {
  return {
    load_profile: profile === 'mais_volume' ? 'mais_volume' : 'prudente',
    load_profile_at: nowISO,
    load_profile_reverted_at: null,
    load_profile_revert_reason: null,
  };
}
