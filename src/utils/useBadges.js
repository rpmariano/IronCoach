import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { computeBadges } from './badges';
import { syncBadgeAwards, markBadgeAwardsSeen } from './badgeAwards';
import { todayISO } from '../lib/utils';

/* Os badges de treino para quem os mostra (Perfil/BadgesCard.jsx), e a
   gravação do que já está ganho.

   Calcula-se sempre tudo dos dados (utils/badges.js) — a tabela só guarda o
   que não se recalcula. A sincronização corre UMA vez por sessão e de novo
   quando o número de badges devidos muda (gravou-se uma corrida, fechou-se
   uma semana) ou quando o dia muda (a PWA fica aberta dias, e há badges que
   se ganham no fecho da semana). A chave é a que o momento da medalha usava,
   pela mesma razão: contar corridas falhava os dois casos.

   ── O QUE FALTA VER É DE TODA A APP, NÃO DE UM ECRÃ ─────────────────────
   Desde a fase 4 o `pending` tem leitores: o momento do badge no Início
   (utils/useBadgeMoment.js) e a Vitrina no Perfil (Perfil/BadgesCard.jsx).
   Os dois têm de ver a MESMA lista, senão o mesmo badge tocava duas vezes —
   por isso o que falta ver vive ao nível do módulo, com quem o está a ler
   inscrito para ser avisado quando muda — é o padrão que os medalhões já
   usavam, com a diferença de haver aqui mais do que um leitor.

   Quem vê primeiro CONSOME: `marcarVistos` tira os prémios da lista e grava
   `seen_at`. É de propósito — se o atleta abriu a Vitrina e viu o anel
   fechar-se na célula, a novidade já lhe foi dada; abrir-lhe um ecrã inteiro
   a seguir seria contar-lhe a mesma coisa outra vez. */

const session = { syncedKeys: new Set(), pending: [], listeners: new Set() };

const publicar = (lista) => {
  session.pending = lista;
  session.listeners.forEach((fn) => fn(lista));
};

/** Só para testes: esquece o que esta sessão já sincronizou e o que tinha
 *  por ver. */
export function resetBadgeSyncSession() {
  session.syncedKeys = new Set();
  session.pending = [];
  session.listeners = new Set();
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

  const [pending, setPendingState] = useState(session.pending);
  useEffect(() => {
    session.listeners.add(setPendingState);
    // Outro leitor pode ter sincronizado (ou consumido) entre o primeiro
    // render e este efeito.
    setPendingState(session.pending);
    return () => { session.listeners.delete(setPendingState); };
  }, []);

  const userId = profile?.id || null;
  const dueCount = (result?.due || []).length;
  /* Dados parciais (a query das corridas falhou e veio []) com provas
     concluídas: gravar agora marcava meia dúzia de badges como histórico e a
     sincronização seguinte, já com tudo, tinha o momento a animar meses de
     uma vez. Espera-se pelos dados completos. */
  const dadosParciais = (runs || []).length === 0 && (raceEvents || []).some((r) => r?.status === 'concluida');

  useEffect(() => {
    if (!userId || dadosParciais) return;
    const key = `${userId}|${dueCount}|${today}`;
    if (session.syncedKeys.has(key)) return;
    session.syncedKeys.add(key);
    Promise.resolve(syncBadgeAwards({ userId, due: result?.due || [] }))
      .then((res) => {
        // Sem a migração aplicada isto vem `available: false` e `pending: []`
        // — e é assim que tem de ser: sem `pending` não há cerimónia nenhuma,
        // e a Vitrina continua certa porque tudo se recalcula.
        if (Array.isArray(res?.pending) && res.pending.length) publicar(res.pending);
      })
      .catch(() => { /* best-effort: sem gravação, a grelha continua certa */ });
    // `result` muda com as mesmas listas; a chave decide quando sincronizar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, dueCount, today, dadosParciais]);

  /** Dar por vistos: tira-os da lista já (para ninguém os voltar a mostrar
   *  neste instante) e grava `seen_at` em segundo plano. Se a gravação
   *  falhar, o pior caso é o badge tocar outra vez da próxima sessão — o que
   *  é melhor do que perdê-lo em silêncio. */
  const marcarVistos = useCallback((ids) => {
    const lista = (Array.isArray(ids) ? ids : []).filter(Boolean);
    if (lista.length === 0) return;
    const fora = new Set(lista);
    publicar(session.pending.filter((p) => !fora.has(p.id)));
    // Os do modo de demonstração não existem na tabela — dispensam-se do
    // ecrã e mais nada.
    const reais = lista.filter((id) => !String(id).startsWith('demo-'));
    if (reais.length) Promise.resolve(markBadgeAwardsSeen(reais)).catch(() => {});
  }, []);

  /** Só para o modo de demonstração (?demo=true&badge=1): põe uma lista de
   *  prémios por ver sem tocar em `user_badges`. */
  const demonstrar = useCallback((lista) => publicar(lista || []), []);

  return { ...result, pending, marcarVistos, demonstrar };
}
