import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';

/* O que fazem os três botões de um insight da Carol, num sítio só
   (2026-10-05): a janela dos avisos (CoachInsightModal) e o banner da
   Evolução · Geral (SmartInsightsBanner) chamam as mesmas funções, para um
   insight tratado num nunca ficar à vista no outro.

   - talk: abre o chat com esse insight (a origem vai no coachIntent). Só o
     dá por percebido se o separador mudar de facto — setActiveTab devolve
     false quando um ecrã com alterações por gravar trava a saída (Perfil), e
     aí a conversa ainda não aconteceu — nem fica o pedido pendurado.
     Devolve se mudou.
   - understand ("Percebi"): tira-o de vez, em todos os ecrãs. Não é
     dispensar, por isso não grava dispensa nenhuma.
   - snooze ("Agora não"): tira-o só até amanhã — volta se ainda se aplicar.
     Fica registado como dispensa (coach_impressions, ação 5.1), para a Carol
     e o outro telemóvel saberem que foi posto de lado. */
export default function useInsightActions() {
  const { setInsightState, snoozeInsight, setActiveTab, setCoachIntent, logImpressionDismissed } = useAppStore();

  const talk = (insight) => {
    setCoachIntent({ kind: 'proactive_intervention', reason: `O atleta abriu o chat a partir do insight "${insight.title}". Aborda-o proativamente: ${insight.message}` });
    const moved = setActiveTab('coach') !== false;
    if (moved) setInsightState(insight.id, 'understood');
    // Travada a saída, o pedido desfaz-se: ficava à espera e disparava
    // sozinho na próxima ida ao chat (como no BadgeDetailSheet).
    else setCoachIntent(null);
    return moved;
  };

  const understand = (insight) => {
    setInsightState(insight.id, 'understood');
  };

  const snooze = (insight) => {
    setInsightState(insight.id, 'ignored');
    snoozeInsight?.(insight.id, todayISO());
    logImpressionDismissed?.({ kind: 'insights', key: insight.id, title: insight.title });
  };

  return { talk, understand, snooze };
}
