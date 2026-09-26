/* O check-in diário no cliente (specs/carol-omnisciencia-omnipresenca.md,
   Fase 2). As regras dos alarmes vivem numa fórmula partilhada com o servidor
   (@formulas/checkinAlarms.ts): o que o Início decide aqui é exatamente o que
   a Carol lê no prompt. Este ficheiro só junta o perfil às regras e decide
   quando um check-in novo deve chamar a Carol. */

import { evaluateCheckinAlarms } from '@formulas/checkinAlarms.ts';
import { normalizeGender } from '@formulas/vocabulary.ts';

/** As opções da fórmula a partir do perfil: o ciclo só existe com perfil
 *  feminino E consentimento. */
export function checkinOptions(profile) {
  return {
    female: normalizeGender(profile?.gender ?? null) === 'F',
    cycleConsentAt: profile?.cycle_tracking_consent_at ?? null,
  };
}

/** A pergunta do ciclo só aparece a quem ela se aplica. */
export function canTrackCycle(profile) {
  return checkinOptions(profile).female;
}

export function todaysCheckin(checkins, today) {
  return (checkins || []).find((c) => c?.date === today) || null;
}

/** Os alarmes que o check-in acabado de gravar trouxe e que ainda não
 *  existiam antes dele — editar o check-in para mudar o stress não volta a
 *  chamar a Carol por uma dor que ela já sabe.
 *  - G4 (sono mau persistente) só chama se o dia de HOJE for um dos maus: um
 *    atleta que finalmente dormiu bem não recebe um "dormes mal" nesse dia
 *    (revisão pré-deploy 2026-09-18).
 *  - G3 (ciclo) nunca chama daqui: não depende do check-in de hoje, por isso
 *    nunca é "novo" num save. Fica no contexto da Carol, que o trata na
 *    próxima conversa — de propósito, não é um alarme de urgência. */
export function newCheckinAlarms(before, after, today, profile) {
  const opts = checkinOptions(profile);
  const known = new Set(evaluateCheckinAlarms(before, today, opts).map((a) => a.key));
  const todayRow = todaysCheckin(after, today);
  const sleptBadly = Number(todayRow?.sleep) > 0 && Number(todayRow.sleep) <= 2;
  return evaluateCheckinAlarms(after, today, opts)
    .filter((a) => !known.has(a.key))
    .filter((a) => a.code !== 'G4' || sleptBadly);
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** O motivo da intervenção, como a Carol o lê no chat.
 *
 *  Com a data do check-in (pedido 2026-09-26): "Check-in de hoje:" só era
 *  verdade no dia em que se gravava. O motivo fica no perfil até a conversa
 *  acontecer, e o atleta que só abria a app na quinta lia, no popup, "o teu
 *  check-in de hoje" sobre uma dor de terça — e a Carol, no chat, lia "no
 *  check-in de hoje" sobre essa mesma dor. Agora o motivo diz o dia
 *  ("Check-in de 2026-09-22: Dor 6/10 (gémeo)."), e o "no check-in de hoje"
 *  das frases dos alarmes sai, porque deixa de ser verdade no dia seguinte.
 *  Quem lê o motivo no servidor não depende do "hoje": o trigger de
 *  coach_interventions só olha para o início ('Check-in%') e o
 *  coach-proactive-tick só faz o hash (interventionKey). Sem data (quem ainda
 *  chama sem ela), fica como era. */
export function interventionReasonFor(alarms, date = null) {
  const comData = typeof date === 'string' && DATA_ISO.test(date);
  const razoes = alarms.map((a) => (comData ? String(a.reason).replace(/ no check-in de hoje/g, '') : a.reason));
  return `Check-in de ${comData ? date : 'hoje'}: ${razoes.join(' ')}`.slice(0, 500);
}

const MOTIVO_DO_CHECKIN = /^Check-in de (hoje|\d{4}-\d{2}-\d{2}):/;

/** O que um motivo de intervenção diz do check-in que a abriu, ou null se
 *  não veio de um check-in. Lê-se aqui, ao lado de quem o escreve, para as
 *  duas pontas não discordarem:
 *  - date: 'YYYY-MM-DD', ou null nos motivos antigos ("Check-in de hoje:");
 *  - dor / sono: que alarme o abriu (dor ≥ 4; sono mau persistente);
 *  - repetida: a dor vinha já do dia anterior ("pelo segundo dia seguido"). */
export function readCheckinReason(reason) {
  const m = typeof reason === 'string' ? reason.match(MOTIVO_DO_CHECKIN) : null;
  if (!m) return null;
  return {
    date: m[1] === 'hoje' ? null : m[1],
    dor: /(?<!\p{L})dor \d+\/10/iu.test(reason),
    sono: /(?<!\p{L})sono mau em \d+/iu.test(reason),
    repetida: /pelo segundo dia seguido/iu.test(reason),
  };
}

/** Substitui (ou acrescenta) o check-in desse dia na lista, por ordem de data. */
export function mergeCheckin(checkins, row) {
  const rest = (checkins || []).filter((c) => c?.date !== row.date);
  return [...rest, row].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

const SCALE_LABELS = {
  sleep: ['Péssimo', 'Mau', 'Razoável', 'Bom', 'Ótimo'],
  energy: ['Sem energia', 'Em baixo', 'Normal', 'Com energia', 'Cheio'],
  stress: ['Calmo', 'Tranquilo', 'Normal', 'Tenso', 'Muito tenso'],
};

export function scaleLabel(field, value) {
  const list = SCALE_LABELS[field];
  const n = Number(value);
  return list && n >= 1 && n <= 5 ? list[n - 1] : null;
}

/** A linha curta do cartão depois do check-in: "Sono bom · Energia normal · Stress calmo · Sem dor". */
export function summarizeCheckin(c) {
  if (!c) return '';
  const parts = [];
  const sleep = scaleLabel('sleep', c.sleep);
  const energy = scaleLabel('energy', c.energy);
  const stress = scaleLabel('stress', c.stress);
  if (sleep) parts.push(`Sono ${sleep.toLowerCase()}`);
  if (energy) parts.push(`Energia: ${energy.toLowerCase()}`);
  if (stress) parts.push(`Stress: ${stress.toLowerCase()}`);
  const pain = Number(c.pain);
  if (c.pain !== null && c.pain !== undefined && Number.isFinite(pain)) {
    parts.push(pain === 0 ? 'Sem dor' : `Dor ${pain}/10${c.pain_location ? ` (${c.pain_location})` : ''}`);
  }
  return parts.join(' · ');
}
