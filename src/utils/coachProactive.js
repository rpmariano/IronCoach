/* As mensagens que a Carol manda por iniciativa própria — CAROL.md §3 e §7.
   - 3 dias sem qualquer registo → "Estás bem?" no chat, em nome dela.
   - Véspera da prova → o que fazer hoje e amanhã de manhã.
   - Manhã da prova → curta, duas frases, sem dados.
   - Depois da prova → o balanço, com opinião.
   Este ficheiro só DECIDE qual (se alguma) se aplica agora e devolve a
   chave que a torna única — o texto é escrito pelo modelo no coach-chat
   (proactive_trigger), a partir do contexto real do atleta. A chave evita
   que a mesma mensagem dispare duas vezes: guarda-se em localStorage por
   utilizador (ver markProactiveSent) e o servidor ainda recusa se ela tiver
   falado há menos de 6 horas. */

export const SILENCE_DAYS = 3;
const STORAGE_PREFIX = 'ironcoach:carol-proativa:';
const DAY_MS = 86400000;

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

/** Data (yyyy-mm-dd) do registo mais recente entre corridas, refeições,
 *  ginásio e avaliações — ou null se nunca houve registo nenhum. */
export function lastRecordDate({ runs, meals, gymSessions, bodyAssessments }) {
  const dates = [];
  for (const list of [runs, meals, gymSessions, bodyAssessments]) {
    for (const r of list || []) {
      const d = r?.date || r?.assessed_at;
      if (typeof d === 'string' && d.length >= 10) dates.push(d.slice(0, 10));
    }
  }
  if (dates.length === 0) return null;
  return dates.sort().pop();
}

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

/** Escolhe a mensagem proativa para este momento, ou null. Prioridade: manhã
 *  da prova > véspera > depois da prova > silêncio — o dia da prova manda
 *  em tudo o resto. `now` é injetável para os testes. */
export function pickProactiveTrigger({ runs, meals, gymSessions, bodyAssessments, raceEvents }, now = new Date()) {
  const today = isoDay(now);
  const races = (raceEvents || []).filter((r) => r && typeof r.date === 'string');
  const scheduled = races.filter((r) => r.status !== 'concluida');

  const morning = scheduled.find((r) => r.date.slice(0, 10) === today);
  if (morning) {
    return {
      trigger: 'race_morning',
      key: `race_morning:${morning.id}`,
      details: `Prova de hoje: "${morning.name}"${morning.distance_km ? `, ${morning.distance_km} km` : ''}.`,
    };
  }

  const eve = scheduled.find((r) => daysBetween(today, r.date.slice(0, 10)) === 1);
  if (eve) {
    return {
      trigger: 'race_eve',
      key: `race_eve:${eve.id}`,
      details: `Prova amanhã: "${eve.name}"${eve.distance_km ? `, ${eve.distance_km} km` : ''}${eve.location ? `, em ${eve.location}` : ''}.`,
    };
  }

  const after = races.find((r) => {
    const gap = daysBetween(r.date.slice(0, 10), today);
    return gap >= 1 && gap <= 3;
  });
  if (after) {
    const gap = daysBetween(after.date.slice(0, 10), today);
    return {
      trigger: 'race_after',
      key: `race_after:${after.id}`,
      details: `Prova "${after.name}" foi há ${gap} dia${gap === 1 ? '' : 's'} (${after.date.slice(0, 10)}).${after.status === 'concluida' ? ' Está marcada como concluída.' : ' Ainda não está marcada como concluída.'}`,
    };
  }

  const last = lastRecordDate({ runs, meals, gymSessions, bodyAssessments });
  if (last) {
    const gap = daysBetween(last, today);
    if (gap >= SILENCE_DAYS) {
      return {
        trigger: 'silence',
        key: `silence:${last}`,
        details: `Último registo: ${last} (há ${gap} dias).`,
      };
    }
  }
  return null;
}

function storageKey(userId) {
  return `${STORAGE_PREFIX}${userId || 'anon'}`;
}

function readSent(userId) {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** True se esta chave (trigger + evento) já disparou neste dispositivo. */
export function wasProactiveSent(userId, candidate) {
  if (!candidate) return false;
  return readSent(userId)[candidate.trigger] === candidate.key;
}

export function markProactiveSent(userId, candidate) {
  if (!candidate) return;
  try {
    const sent = readSent(userId);
    sent[candidate.trigger] = candidate.key;
    window.localStorage.setItem(storageKey(userId), JSON.stringify(sent));
  } catch {
    // sem storage (modo privado, quota) — o servidor ainda trava repetições
    // a menos de 6 horas; o pior caso é ela perguntar duas vezes noutro dia.
  }
}
