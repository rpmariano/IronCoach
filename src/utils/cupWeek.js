import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { entryDeadlineNotice } from '@formulas/cup.ts';
import { getRacePrediction } from './biEngine';
import { formatDuration } from './run';
import { daysUntil } from './raceList';
import { horaLabel, intentLabel, kmLabel } from './cupCalendar';

/* A semana da jornada (specs/trofeu.md §4.4, Fase 3). 2026-09-27.

   O que o cartão diário e o hub dizem de uma jornada que vem aí: "Domingo,
   Corrida CCD, 7,4 km às 9h30. Pelas contas: controlar, 36:40." e o prazo de
   inscrição ("A inscrição na jornada 3 (Corrida CCD) fecha quarta às 24h.").

   A PREVISÃO NÃO SE GRAVA (§2.6). É calculada aqui, a cada render, pela
   mesma função do hub (getRacePrediction, VDOT/Riegel para a distância do
   percurso) e nunca vai para `target_time*` nem para a participação: "A
   Superação" só conta objetivos gravados, e uma previsão gravada passava a
   parecer um objetivo que ele marcou. No ecrã aparece com o ícone de cálculo
   (CupPrevisao, em components/Run/CupBits.jsx). */

function dayOf(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? day : null;
}

// A linha da semana vai de D−7 a D−2: a véspera (D−1) e o dia (D0) já têm
// as linhas próprias do cartão (pickRaceOfDay devolve a jornada quando é a
// única prova desse dia).
export const CUP_WEEK_FROM_DAYS = 2;
export const CUP_WEEK_TO_DAYS = 7;

// Só estes papéis levam a previsão: é um tempo de prova, e dizê-lo ao lado
// de "em trote" ou "saltar" lia-se como um objetivo.
const PREDICTION_INTENTS = new Set(['atacar', 'controlar']);

/** A distância do percurso dele numa jornada (a da prova, senão a do
 *  percurso), em km. */
function roundKm(round) {
  const raceKm = Number(round?.race?.distance_km);
  if (Number.isFinite(raceKm) && raceKm > 0) return raceKm;
  const m = Number(round?.course?.distance_m);
  return Number.isFinite(m) && m > 0 ? m / 1000 : null;
}

/** A previsão de tempo numa jornada — { seconds, label } ou null (sem
 *  distância, ou sem corridas com distância e duração). Pura: não escreve em
 *  lado nenhum. */
export function cupRoundPrediction(round, profile, runs) {
  if (!round) return null;
  const km = roundKm(round);
  if (!km) return null;
  const race = round.race && Number(round.race.distance_km) > 0
    ? round.race
    : { distance_km: km, race_type: 'estrada' };
  // O mesmo filtro do hub (runsComTempo): só corridas com distância e duração.
  const withTime = (runs || []).filter((r) => Number(r?.distance_km) > 0 && Number(r?.duration_seconds) > 0);
  if (!withTime.length) return null;
  const seconds = Math.round(Number(getRacePrediction(race, profile, withTime)?.predictedSeconds) || 0);
  return seconds > 0 ? { seconds, label: formatDuration(seconds) } : null;
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** A linha da semana da jornada no cartão diário (A.6 do desenho):
 *  { roundId, raceId, text, lead, calc } ou null.
 *
 *  Só com inscrição, para a primeira jornada com "Vou", data confirmada e a
 *  prova no calendário que caia entre D−7 e D−2 (e cuja prova não esteja em
 *  `skipRaceIds`). `lead` é a frase até ao papel; `calc` o tempo previsto
 *  (null sem previsão); `text` a frase inteira em texto simples. O cartão
 *  desenha `lead`, e com `calc` junta ", <CupPrevisao label={calc} />." —
 *  sem ele, `text`. */
export function cupWeekLine({ view, today, profile = null, runs = [], skipRaceIds = [] } = {}) {
  const t = dayOf(today);
  if (!view?.enrollment || !t) return null;
  const skip = new Set(skipRaceIds || []);
  const round = (view.rounds || [])
    .filter((r) => {
      const d = dayOf(r.date);
      if (!d || r.date_status !== 'confirmada' || r.participation?.decision !== 'vou') return false;
      if (!r.race?.id || skip.has(r.race.id)) return false;
      const n = daysUntil(d, t);
      return n >= CUP_WEEK_FROM_DAYS && n <= CUP_WEEK_TO_DAYS;
    })
    .sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date)))[0];
  if (!round) return null;

  let weekday = '';
  try { weekday = capitalize(format(parseISO(dayOf(round.date)), 'EEEE', { locale: pt })); } catch { weekday = ''; }
  const km = kmLabel(roundKm(round));
  const hora = horaLabel(round.course?.start_time);
  const where = km && hora ? `${km} às ${hora}` : km || (hora ? `às ${hora}` : null);
  const first = [weekday, round.name || null, where].filter(Boolean).join(', ');

  const chosen = round.intentSource === 'atleta' && intentLabel(round.intent) ? round.intent : null;
  const proposed = !chosen && intentLabel(round.role?.intent) ? round.role.intent : null;
  const intent = chosen || proposed;
  const rolePhrase = chosen ? `O teu papel: ${intentLabel(chosen)}` : proposed ? `Pelas contas: ${intentLabel(proposed)}` : null;

  const prediction = rolePhrase && PREDICTION_INTENTS.has(intent) ? cupRoundPrediction(round, profile, runs) : null;
  const lead = rolePhrase ? `${first}. ${rolePhrase}` : first;
  const calc = prediction?.label ?? null;
  return {
    roundId: round.id,
    raceId: round.race.id,
    lead,
    calc,
    text: calc ? `${lead}, ${calc}.` : `${lead}.`,
  };
}

/** Os avisos de prazo de inscrição (§4.4) da vista, pelo prazo mais perto:
 *  [{ roundId, raceId, text, entryUrl, whenLabel, deadlineAt }]. A régua é a
 *  da fórmula partilhada (entryDeadlineNotice — a mesma do push da Fase 5):
 *  "por jornada", "Vou", sem "Já me inscrevi", sem "o meu clube", data
 *  confirmada, prazo nos próximos 7 dias. [] sem inscrição. */
export function cupEntryNotices({ view, now = new Date() } = {}) {
  if (!view?.enrollment) return [];
  const label = String(view.roundLabel || 'Jornada').toLowerCase();
  const out = [];
  for (const round of view.rounds || []) {
    const notice = entryDeadlineNotice({
      entryMode: view.edition?.entry_mode ?? null,
      entryBy: view.enrollment.entry_by ?? null,
      decision: round.participation?.decision ?? null,
      entryDoneAt: round.participation?.entry_done_at ?? null,
      dateStatus: round.date_status ?? null,
      deadlineAt: round.entry_deadline_at ?? null,
      now,
      timeZone: view.edition?.time_zone ?? null,
    });
    if (!notice) continue;
    // "na jornada 3 (Corrida CCD)": o nome da prova não diz o género
    // ("na Légua", "no Corta-mato"); o rótulo da competição diz.
    const which = `${label} ${round.round_no ?? ''}`.trim();
    out.push({
      roundId: round.id,
      raceId: round.race?.id ?? null,
      text: `A inscrição na ${which}${round.name ? ` (${round.name})` : ''} fecha ${notice.whenLabel}.`,
      entryUrl: view.edition?.entry_url || null,
      whenLabel: notice.whenLabel,
      deadlineAt: notice.deadlineAt,
    });
  }
  return out.sort((a, b) => Date.parse(a.deadlineAt) - Date.parse(b.deadlineAt));
}
