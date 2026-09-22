import { useEffect, useMemo } from 'react';
import { useAppStore } from '../store';
import { computeBadges } from './badges';
import { syncBadgeAwards } from './badgeAwards';
import { todayISO } from '../lib/utils';

/* Os badges de treino para quem os mostra (Perfil/BadgesCard.jsx), e a
   gravação do que já está ganho.

   Calcula-se sempre tudo dos dados (utils/badges.js) — a tabela só guarda o
   que não se recalcula. A sincronização corre UMA vez por sessão e de novo
   quando o número de badges devidos muda (gravou-se uma corrida, fechou-se
   uma semana) ou quando o dia muda (a PWA fica aberta dias, e há badges que
   se ganham no fecho da semana). É a mesma chave do momento da medalha
   (utils/useMedalMoment.js), pela mesma razão: contar corridas falhava os
   dois casos.

   O `pending` (o que falta VER) fica calculado mas sem leitor: o momento da
   conquista é a fase 4. Até lá ninguém marca nada como visto — e é de
   propósito, senão a fase 4 nascia com o histórico todo já dado por visto. */

const session = { syncedKeys: new Set() };

/** Só para testes: esquece o que esta sessão já sincronizou. */
export function resetBadgeSyncSession() {
  session.syncedKeys = new Set();
}

export default function useBadges() {
  const profile = useAppStore((s) => s.profile);
  const runs = useAppStore((s) => s.runs);
  const raceEvents = useAppStore((s) => s.raceEvents);
  const planItems = useAppStore((s) => s.coachPlanItems);
  const gymSessions = useAppStore((s) => s.gymSessions);

  const today = todayISO();
  const result = useMemo(
    () => computeBadges({ runs, raceEvents, profile, planItems, gymSessions, today }),
    [runs, raceEvents, profile, planItems, gymSessions, today],
  );

  const userId = profile?.id || null;
  const dueCount = (result?.due || []).length;
  /* Dados parciais (a query das corridas falhou e veio []) com provas
     concluídas: gravar agora marcava meia dúzia de badges como histórico e a
     sincronização seguinte, já com tudo, tinha a fase 4 a animar meses de uma
     vez. Espera-se pelos dados completos. */
  const dadosParciais = (runs || []).length === 0 && (raceEvents || []).some((r) => r?.status === 'concluida');

  useEffect(() => {
    if (!userId || dadosParciais) return;
    const key = `${userId}|${dueCount}|${today}`;
    if (session.syncedKeys.has(key)) return;
    session.syncedKeys.add(key);
    Promise.resolve(syncBadgeAwards({ userId, due: result?.due || [] }))
      .catch(() => { /* best-effort: sem gravação, a grelha continua certa */ });
    // `result` muda com as mesmas listas; a chave decide quando sincronizar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, dueCount, today, dadosParciais]);

  return result;
}
