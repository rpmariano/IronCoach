import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { computeMedalhoes } from './medalhoes';
import { syncMedalAwards, markMedalAwardsSeen } from './medalAwards';
import { todayISO } from '../lib/utils';

/* Quando é que o momento da medalha aparece (specs/palmares-medalhoes.md
   §"O momento da medalha"). Usado no Início, que só monta com os dados já
   carregados (o App mostra o loader até lá).

   - Sincroniza os prémios devidos com medal_awards UMA vez por sessão, e de
     novo quando o número de corridas ou de provas muda (gravou-se uma
     corrida, fechou-se uma prova). Guardado ao nível do módulo: voltar ao
     Início depois de outro separador não volta a pedir.
   - Nunca com um formulário aberto — a mesma regra de shouldReloadOnVisible
     no App (utils/authEvents.js): openCreationMode, editingRaceId,
     editingRunId, navGuard e o onboarding. A RecordConfirmation vive DENTRO
     desses ecrãs de registo (RunRegistration, RunAgenda…), por isso
     "formulário aberto" já a cobre: o Início só volta a montar depois de
     ela sair e o registo fechar.
   - Várias por ver: a mais significativa primeiro; ao fechar marca-se
     `seen_at` em todas. */

const PRIORITY = ['recordes', 'distancias', 'superacao', 'ano_km', 'consistencia', 'epoca'];

const session = { syncedKeys: new Set(), pending: [] };

/** Só para testes: esquece o que esta sessão já sincronizou. */
export function resetMedalMomentSession() {
  session.syncedKeys = new Set();
  session.pending = [];
}

export function isFormOpen(state) {
  return !!(state?.openCreationMode || state?.editingRaceId || state?.editingRunId || state?.navGuard || state?.onboardingOpen);
}

function byPriority(a, b) {
  const pa = PRIORITY.indexOf(a?.medalhao);
  const pb = PRIORITY.indexOf(b?.medalhao);
  return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
}

export default function useMedalMoment() {
  const profile = useAppStore((s) => s.profile);
  const runs = useAppStore((s) => s.runs);
  const raceEvents = useAppStore((s) => s.raceEvents);
  const coachPlans = useAppStore((s) => s.coachPlans);
  const coachPlanItems = useAppStore((s) => s.coachPlanItems);
  const formOpen = useAppStore(isFormOpen);

  const [pending, setPendingState] = useState(session.pending);
  const setPending = useCallback((list) => {
    session.pending = list;
    setPendingState(list);
  }, []);

  const userId = profile?.id || null;
  const today = todayISO();
  const result = useMemo(
    () => computeMedalhoes({ runs, raceEvents, coachPlans, coachPlanItems, profile, today }),
    [runs, raceEvents, coachPlans, coachPlanItems, profile, today],
  );

  /* Quando voltar a sincronizar: quando há uma medalha devida nova (fechar
     uma prova com uma corrida que já existia, corrigir uma distância) ou
     quando o dia muda (O Ano em Km e A Consistência ganham-se no fecho de um
     período, e a PWA fica aberta dias). Contar corridas e provas falhava os
     dois casos. */
  const dueCount = (result?.due || []).length;
  // Dados parciais (a query das corridas falhou e veio []) com provas
  // concluídas: sincronizar agora gravava umas poucas medalhas como
  // histórico e a sincronização seguinte, já com tudo, animava meses de uma
  // vez. Espera-se pelos dados completos.
  const dadosParciais = (runs || []).length === 0 && (raceEvents || []).some((r) => r?.status === 'concluida');
  useEffect(() => {
    // ?demo=true&medalha=1 — mostra o momento com as medalhas que os dados
    // de demonstração dão, sem tocar em medal_awards (que pode ainda nem
    // existir): serve para ver a coreografia sem ganhar uma medalha a sério.
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    if (params?.get('demo') === 'true' && params.get('medalha') === '1') {
      if (session.syncedKeys.has('demo')) return;
      session.syncedKeys.add('demo');
      setPending((result?.due || []).map((d) => ({
        id: null, medalhao: d.medalhao, slot: d.slot, period_key: d.periodKey, value: d.value,
        race_id: d.raceId, awarded_at: d.awardedOn, title: d.title, line: d.line,
      })).sort(byPriority));
      return;
    }
    if (!userId || dadosParciais) return;
    const key = `${userId}|${dueCount}|${today}`;
    if (session.syncedKeys.has(key)) return;
    session.syncedKeys.add(key);
    Promise.resolve(syncMedalAwards({ userId, due: result?.due || [] }))
      .then((res) => {
        const list = Array.isArray(res?.pending) ? [...res.pending].sort(byPriority) : [];
        setPending(list);
      })
      .catch(() => { /* best-effort: sem momento, nada parte */ });
    // `result` muda com as mesmas listas; a chave decide quando sincronizar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, dueCount, today, dadosParciais]);

  const first = pending[0] || null;
  const medalhao = first ? (result?.medalhoes || []).find((m) => m.key === first.medalhao) || null : null;
  const award = first && medalhao && !formOpen ? first : null;

  const close = useCallback(() => {
    const ids = session.pending.map((p) => p.id).filter(Boolean);
    setPending([]);
    if (ids.length) Promise.resolve(markMedalAwardsSeen(ids)).catch(() => {});
  }, [setPending]);

  return { award, medalhao: award ? medalhao : null, extraCount: award ? pending.length - 1 : 0, close };
}
