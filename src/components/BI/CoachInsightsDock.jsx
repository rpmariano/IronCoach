import React, { useMemo, useState } from 'react';
import { useAppStore } from '../../store';
import { detectCoachInsights } from '../../utils/biEngine';
import CoachInsightButton from './CoachInsightButton';
import CoachInsightModal from './CoachInsightModal';

/* O botão flutuante dos insights e o seu popup, prontos a montar em
   qualquer ecrã.

   Os avisos da Carol viviam só no Início e nos Dashboards, e o atleta que
   estivesse no Calendário, nas Provas ou no Perfil não tinha como saber que
   havia alguma coisa a dizer — foi o que o utilizador relatou ("só estão a
   aparecer no dashboard"). Passam a acompanhá-lo em todo o lado menos no
   Chat, que é onde ele já está a falar com ela: ali um botão a chamá-lo
   para a conversa que já está aberta não faz sentido nenhum.

   O Início e os Dashboards NÃO usam este componente: têm a sua própria
   seleção (o Início mostra os do módulo 'coach' mais os avisos dela; os
   Dashboards mostram os dos outros módulos). Aqui, sem canal próprio, o
   atleta vê tudo o que está por ver.

   `bottom` sobe o botão nos ecrãs com barra de ação fixa. */
export default function CoachInsightsDock({ bottom }) {
  const { runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes, profile, insightStates } = useAppStore();
  const [open, setOpen] = useState(false);

  const insights = useMemo(() => (
    detectCoachInsights({ runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes }, profile)
      .filter((i) => insightStates[i.id] !== 'understood')
  ), [runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes, profile, insightStates]);

  return (
    <>
      <CoachInsightButton insights={insights} onClick={() => setOpen(true)} bottom={bottom} />
      {open && <CoachInsightModal insights={insights} onClose={() => setOpen(false)} />}
    </>
  );
}
