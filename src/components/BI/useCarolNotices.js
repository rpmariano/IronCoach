import { useMemo, useState } from 'react';
import { useAppStore, selectCoachPendingTopics } from '../../store';
import { useToast } from '../shared/ToastProvider';
import { detectCoachInsights } from '../../utils/biEngine';
import { pendingRaceBalanceCandidate, pendingBlockEndAlert, dismissProactiveAlert } from '../../utils/coachProactive';
import { detectPlanDivergence, detectRaceConflict, raceLabel, wasDivergenceHandled } from '../../utils/planDivergence';
import { todayISO } from '../../lib/utils';
import { isInsightHidden } from '../../utils/insightState';
import { goalsDeclinedMarker, isGoalsIntervention } from '@formulas/goalsIntervention.ts';
import { interventionKey, raceConflictKey } from '@formulas/proactiveTriggers.ts';
import { INTERVENTION_OUTCOME } from '@formulas/interventionOutcomes.ts';
import { pendingTopicLines } from '../../utils/carolTopics';
import { useCupForHome } from '../../utils/useCup';
import { cupMapCandidate, markCupMapHandled, CUP_MAP_TITLE } from '../../utils/cupMap';

/* Os avisos da Carol, iguais em todos os ecrãs (pedido 2026-09-27).

   Até aqui cada ecrã escolhia os seus: o Início mostrava os avisos em que
   ela pede para falar e só os insights do plano; a Evolução os insights
   todos menos esse; as Provas, o Calendário e o Perfil os insights todos, e
   nenhum dos avisos dela. O mesmo botão dizia coisas diferentes consoante o
   separador — e "preciso de falar contigo" só se via no Início.

   Agora há uma só lista, calculada aqui e mostrada pelo mesmo botão e pela
   mesma janela em todo o lado menos no Chat (CoachInsightsDock):

   - `alerts`: os avisos em que ela pede para falar — um de cada vez, pela
     prioridade de sempre: assuntos por resolver, o conflito de principais,
     o ajuste do plano, o mapa da época (só inscritos numa competição), o
     balanço da prova e, por fim, o fim do bloco;
   - `insights`: os do motor de regras (biEngine) ainda por ver — sem os que
     o atleta já percebeu nem os que pôs de lado hoje ("Agora não").

   `openCoach` é o toque genérico no cartão da Carol no Início: leva ao
   assunto mais importante. `logOpened` regista o que a janela mostrou (ação
   2.4), agora a partir de qualquer ecrã. `dismissDialog` é a confirmação de
   dispensar uma intervenção, com a frase do assunto que sai (`topic`) e se
   fica mais alguma coisa no aviso (`othersWaiting`). */
export default function useCarolNotices() {
  const { showToast } = useToast();
  const {
    profile, raceEvents, coachPlans, coachPlanItems, runs, meals, gymSessions, bodyAssessments, shoes,
    insightStates, insightSnoozes,
    setActiveTab, setProfile, setCoachIntent, logImpression, logImpressionDismissed, impressionDismissed,
  } = useAppStore();
  const pendingTopics = useAppStore(selectCoachPendingTopics);
  const coachGoalProposals = useAppStore((s) => s.coachGoalProposals);
  const impressionShown = useAppStore((s) => s.impressionShown);
  const dailyCheckins = useAppStore((s) => s.dailyCheckins);
  const coachNotes = useAppStore((s) => s.coachNotes);
  // A competição por jornadas, só de quem está inscrito (Fase 2). Sem
  // inscrição é null e não lê nada.
  const cupView = useCupForHome();

  const [showDismiss, setShowDismiss] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  // Dispensar o aviso do balanço (ou do fim de bloco, ou do mapa) grava a
  // marca em localStorage, que não é estado do React — este contador faz os
  // useMemo voltarem a ler.
  const [alertDismissals, setAlertDismissals] = useState(0);

  const today = todayISO();

  // A régua é a mesma do banner da Evolução · Geral (utils/insightState.js).
  const insights = useMemo(() => (
    detectCoachInsights({ runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes }, profile)
      .filter((i) => !isInsightHidden(i.id, { states: insightStates, snoozes: insightSnoozes, today }))
  ), [runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes, profile, insightStates, insightSnoozes, today]);

  const interventionPending = profile?.coach_intervention_status === 'needed' || profile?.coach_intervention_status === 'in_progress';

  /* Duas provas principais no mesmo bloco (specs/plano-vinculado-a-prova.md
     §2.4): o taper de cada uma são 10-21 dias de polimento, e treinar para
     uma é sabotar a outra. Não há plano correto enquanto as duas forem
     principais — por isso isto sai pelo canal da intervenção e não pelo das
     divergências: pesa como um assunto por resolver, não tem botão de
     dispensar, e só se cala quando o atleta decidir (a decisão grava-se na
     prova, conflict_acknowledged_at, e vale em qualquer dispositivo). */
  const raceConflict = useMemo(
    () => detectRaceConflict({ coachPlans, raceEvents, today }),
    [coachPlans, raceEvents, today],
  );

  /* O balanço da prova (specs/gamificacao-provas.md §3): no dia a seguir, a
     Carol chama por ele a partir do botão flutuante enquanto o chat não for
     aberto. Só quando não há assuntos por resolver — uma intervenção pesa
     mais do que um balanço. Guarda-se o candidato completo (não só a prova)
     porque "Falar com a Carol" precisa dele para pedir o balanço a sério —
     ver o coachIntent 'race_balance' mais abaixo. */
  const raceBalance = useMemo(() => {
    if (pendingTopics > 0 || raceConflict) return null;
    // impressionDismissed: o que foi dispensado noutro dispositivo (ação 5.1).
    const candidate = pendingRaceBalanceCandidate({ runs, meals, gymSessions, bodyAssessments, raceEvents, profile, impressionDismissed });
    if (!candidate) return null;
    const race = (raceEvents || []).find((r) => r?.id === candidate.raceId) || null;
    return race ? { race, candidate } : null;
  }, [pendingTopics, raceConflict, runs, meals, gymSessions, bodyAssessments, raceEvents, profile, impressionDismissed, alertDismissals]);

  /* O bloco está a acabar (ação P.11): o bloco de treino sem prova acaba e
     não há outro a seguir. O candidato é o do chat e da notificação
     (block_end:<plano>), para o toque e o botão não pedirem conversas
     diferentes; conta como uma boa notícia a preparar, abaixo do balanço. */
  const blockEnd = useMemo(() => {
    if (pendingTopics > 0 || raceConflict) return null;
    return pendingBlockEndAlert({ coachPlans, coachPlanItems, profile, impressionDismissed });
  }, [pendingTopics, raceConflict, coachPlans, coachPlanItems, profile, impressionDismissed, alertDismissals]);

  /* O plano precisa de um ajuste (specs/plano-de-prova.md, "O plano tem de
     saber da prova"): a app deteta sozinha quando a realidade se afastou do
     plano — prova sem item de prova, treino no dia da prova, trabalho forte
     na véspera, sessões falhadas — e a Carol chama por isso. A assinatura
     impede que ela chame pela mesma coisa outra vez enquanto o plano não
     mudar. Prioridade: uma intervenção pesa mais, e o ajuste pesa mais do
     que o balanço da prova (que é uma boa notícia, não uma urgência). */
  const divergence = useMemo(() => {
    if (pendingTopics > 0 || raceConflict) return null;
    const found = detectPlanDivergence({ coachPlans, coachPlanItems, raceEvents, runs, gymSessions, today });
    if (!found.reasons.length || wasDivergenceHandled(profile?.id, found.signature)) return null;
    return found;
  }, [pendingTopics, raceConflict, coachPlans, coachPlanItems, raceEvents, runs, gymSessions, today, profile?.id]);

  /* O mapa da época (specs/trofeu.md §5, Fase 2; utils/cupMap.js): ao
     inscrever, e quando sai o calendário com jornadas por decidir, a Carol
     quer ver com ele o papel de cada jornada ao lado das provas principais.
     Só para inscritos (cupView é null para os outros). Com plano aceite, o
     ajuste às jornadas propõe-se nessa mesma conversa, numa só — por isso o
     `prova_sem_item` das jornadas já não é divergência (planDivergence.js).
     O que sobra na divergência (um treino no dia de uma prova ou trabalho
     forte na véspera — também de uma principal —, o plano sem a prova ou
     encurtado, sessões falhadas) fica à FRENTE do mapa: o turno do mapa não
     leva esses motivos, e com o mapa à frente ficavam escondidos enquanto
     ele estivesse por tratar (revisão da Fase 2). */
  const cupMap = useMemo(() => {
    if (pendingTopics > 0 || raceConflict) return null;
    return cupMapCandidate({ view: cupView, userId: profile?.id, impressionShown, impressionDismissed, today });
  }, [pendingTopics, raceConflict, cupView, profile?.id, impressionShown, impressionDismissed, today, alertDismissals]);

  const openCoach = () => {
    if (interventionPending) {
      setCoachIntent({ kind: 'proactive_intervention', reason: profile?.coach_intervention_reason || null });
    } else if (raceConflict) {
      setCoachIntent({
        kind: 'race_conflict',
        races: raceConflict.races.map((r) => ({ id: r.id, name: r.name, date: r.date })),
        target: raceConflict.target ? { id: raceConflict.target.id, name: raceConflict.target.name, date: raceConflict.target.date } : null,
      });
    } else if (divergence) {
      setCoachIntent({ kind: 'adapt_plan', divergence: divergence.reasons.map((r) => r.text), signature: divergence.signature });
    } else if (cupMap) {
      setCoachIntent({ kind: 'cup_map', signature: cupMap.signature, first: cupMap.first });
    }
    setActiveTab('coach');
  };

  /* As frases dos assuntos por resolver (utils/carolTopics.js). Com uma
     intervenção, a primeira é a dela — a única que "Dispensar" fecha; as
     outras (planos ou objetivos propostos) só saem quando o atleta os aceita
     ou recusa, e o aviso fica com elas. A confirmação diz qual é o assunto
     e o que fica (revisão pré-deploy 2026-09-27). */
  const topicLines = pendingTopics > 0
    ? pendingTopicLines({ profile, coachPlans, coachGoalProposals, coachPlanItems, raceEvents, dailyCheckins, coachNotes })
    : [];
  const interventionLine = interventionPending ? topicLines[0] || null : null;
  const othersWaiting = interventionPending && pendingTopics > 1;

  /* Um de cada vez, pela mesma prioridade de sempre. `key` é a chave do
     momento no servidor (P.10), quando o aviso tem um: abrir a janela
     regista-a como vista, e o coach-proactive-tick não notifica hoje o que o
     atleta acabou de ler aqui. */
  const alerts = [];
  if (pendingTopics > 0) {
    alerts.push({
      id: 'assuntos',
      // Só o assunto "needed" tem momento no servidor; um já em conversa não.
      key: profile?.coach_intervention_status === 'needed' ? interventionKey(profile?.coach_intervention_reason) : null,
      severity: 'warning',
      // Na voz dela e a dizer o assunto (pedido 2026-09-23): "Tens 1 assunto
      // a resolver com ela" não dizia qual, e o popup repetia "Carol" 4 vezes.
      title: 'Preciso de falar contigo',
      message: topicLines.join(' ')
        || (pendingTopics === 1 ? 'Tenho um assunto para ver contigo.' : `Tenho ${pendingTopics} assuntos para ver contigo.`),
      onTalk: openCoach,
      // Só a intervenção se dispensa, e é um assunto, não o aviso todo.
      onDismiss: interventionPending ? () => setShowDismiss(true) : null,
      dismissLabel: 'Dispensar este assunto',
    });
  } else if (raceConflict) {
    const racesConflito = raceConflict.races.map((r) => raceLabel(r));
    const nomes = racesConflito.join(', ');
    // "marcada" tinha género — e nem sempre concordava com o nome da prova
    // (masculino, "o Trail...") nem com o número (duas provas A no mesmo
    // bloco) (revisão de 2026-09-26). "principal" não tem género, só número.
    const plural = racesConflito.length > 1;
    alerts.push({
      id: 'conflito-provas',
      key: raceConflict.plan?.id ? raceConflictKey(raceConflict.plan.id, raceConflict.races.map((r) => r.id)) : null,
      severity: 'warning',
      title: 'Preciso de falar contigo',
      // Sem onDismiss, de propósito: enquanto houver duas principais no mesmo
      // bloco não há plano certo, e a decisão é do atleta — mas tem de ser
      // tomada. A Carol grava-a e não volta a perguntar.
      message: raceConflict.target
        ? `${nomes} ${plural ? 'estão como principais' : 'está como principal'} a meio do plano para ${raceLabel(raceConflict.target)}.`
        : `${nomes} ${plural ? 'estão como principais' : 'está como principal'} a meio do plano atual.`,
      onTalk: openCoach,
    });
  } else if (divergence) {
    alerts.push({
      id: 'plano',
      severity: 'warning',
      title: 'O plano precisa de um ajuste',
      message: divergence.reasons.map((r) => r.text).join(' '),
      onTalk: openCoach,
    });
  } else if (cupMap) {
    alerts.push({
      id: 'mapa-epoca',
      key: cupMap.signature,
      severity: 'info',
      title: CUP_MAP_TITLE,
      message: cupMap.message,
      // O Coach pede o turno do mapa (is_plan_checkin + cup_map) e, quando o
      // servidor confirma que foi esse o turno (cup_map_shown), marca a
      // assinatura como tratada.
      onTalk: () => {
        setCoachIntent({ kind: 'cup_map', signature: cupMap.signature, first: cupMap.first });
        setActiveTab('coach');
      },
      // Dispensar cala esta assinatura aqui e, pela impressão, nos outros
      // dispositivos; volta só se o calendário mudar com jornadas por decidir.
      onDismiss: () => {
        markCupMapHandled(profile?.id, cupMap.signature);
        setAlertDismissals((n) => n + 1);
        logImpressionDismissed({ kind: 'alert', key: cupMap.signature, title: CUP_MAP_TITLE });
      },
    });
  } else if (raceBalance) {
    alerts.push({
      id: 'balanco',
      key: raceBalance.candidate.key,
      severity: 'info',
      title: 'O balanço da prova',
      // "Correste a ${nome}" tinha preposição de género — uma prova
      // masculina ("o Trail...") pedia "correste o" (revisão de 2026-09-26).
      message: `${raceBalance.race.name || 'A prova'}: quero fazer o balanço contigo.`,
      // Bug 2026-09-14: só mudar de separador e esperar que o Coach apanhe o
      // momento sozinho falhava em silêncio sempre que a Carol tivesse
      // falado há menos de 6h por qualquer outro motivo (regra normal contra
      // empilhar mensagens proativas) — o atleta carregava no botão e "não
      // acontecia nada". Um pedido explícito dele tem de furar essa regra,
      // por isso vai com o candidato e o Coach pede-o com `proactive_force`.
      onTalk: () => {
        setCoachIntent({ kind: 'race_balance', candidate: raceBalance.candidate });
        setActiveTab('coach');
      },
      // Uma saída se a conversa já aconteceu e o aviso não soube (outro
      // dispositivo, resposta que não chegou ao ecrã): uma marca PRÓPRIA de
      // "dispensado" — não a mesma do balanço dito, que faria o hub e o chat
      // pensarem que a conversa já tinha acontecido e deixarem de a propor.
      onDismiss: () => {
        dismissProactiveAlert(profile?.id, raceBalance.candidate);
        setAlertDismissals((n) => n + 1);
        // Duas chaves na dispensa (ação 5.1): 'balanco', que o chat já lê,
        // e a do candidato (race_after:<raceId>:<runId>), que é a que serve
        // para o outro dispositivo saber que este balanço foi dispensado.
        logImpressionDismissed({ kind: 'alert', key: 'balanco', title: 'O balanço da prova' });
        logImpressionDismissed({ kind: 'alert', key: raceBalance.candidate.key, title: 'O balanço da prova' });
      },
    });
  } else if (blockEnd) {
    alerts.push({
      id: 'fim-bloco',
      key: blockEnd.candidate.key,
      severity: 'info',
      title: 'O bloco está a acabar',
      message: `O teu bloco de treino acaba ${blockEnd.when} e não há outro a seguir. Quero preparar o próximo contigo.`,
      // O mesmo contrato do balanço: um pedido explícito fura as quiet hours
      // (`proactive_force`), senão o botão ficava sem resposta sempre que ela
      // tivesse falado há menos de 6 h.
      onTalk: () => {
        setCoachIntent({ kind: 'proactive_moment', candidate: blockEnd.candidate });
        setActiveTab('coach');
      },
      onDismiss: () => {
        dismissProactiveAlert(profile?.id, blockEnd.candidate);
        setAlertDismissals((n) => n + 1);
        logImpressionDismissed({ kind: 'alert', key: blockEnd.candidate.key, title: 'O bloco está a acabar' });
      },
    });
  }

  /* Abrir a janela do botão flutuante é ver os avisos e os insights — em
     qualquer ecrã (antes só o Início o registava). */
  const logOpened = () => {
    for (const a of alerts) {
      logImpression?.({ kind: 'alert', key: a.id, title: a.title });
      // A chave do momento, para o tick não o notificar hoje (P.10).
      if (a.key) logImpression?.({ kind: 'alert', key: a.key, title: a.title });
    }
    for (const i of insights) logImpression?.({ kind: 'insights', key: i.id, title: i.title });
  };

  // Saída manual do aviso da Carol (bug-016): se a conversa já resolveu o
  // assunto mas o aviso ficou preso, o atleta não fica refém disso.
  const dismissIntervention = async () => {
    if (!profile?.id) return;
    setDismissing(true);
    try {
      const { supabase } = await import('../../lib/supabase');
      // Dispensar é um desfecho (5.5): fica em coach_interventions, e a Carol
      // calibra por ele. Só no update — o trigger consome-o.
      const { error } = await supabase.from('profiles').update({ coach_intervention_status: 'resolved', coach_intervention_reason: null, coach_intervention_outcome: INTERVENTION_OUTCOME.DISPENSADO }).eq('id', profile.id);
      if (error) throw error;
      // Dispensar um convite para objetivos é dizer "agora não": fica
      // registado para a Carol não voltar a chamar na próxima pesagem
      // (espera de 14 dias, ver goalsDeclinedMarker).
      if (isGoalsIntervention(profile.coach_intervention_reason)) {
        const { error: markErr } = await supabase.from('coach_goal_proposals').insert(goalsDeclinedMarker(profile.id));
        if (markErr) console.warn('Falha a registar a recusa de objetivos:', markErr);
      }
      setProfile({ ...profile, coach_intervention_status: 'resolved', coach_intervention_reason: null });
      logImpressionDismissed({ kind: 'alert', key: 'assuntos', title: 'A Carol precisa de falar contigo' });
      setShowDismiss(false);
      showToast('Assunto dispensado.', 'success');
    } catch (err) {
      console.error('Erro ao dispensar intervenção:', err);
      showToast('Não foi possível dispensar o assunto. Tenta outra vez.', 'error');
    } finally {
      setDismissing(false);
    }
  };

  return {
    alerts,
    insights,
    openCoach,
    logOpened,
    dismissDialog: {
      open: showDismiss,
      busy: dismissing,
      confirm: dismissIntervention,
      cancel: () => setShowDismiss(false),
      // O que se dispensa (a frase da intervenção) e se fica mais alguma
      // coisa no aviso (planos ou objetivos à espera).
      topic: interventionLine,
      othersWaiting,
    },
  };
}
