import React, { useEffect, useState } from 'react';
import PremiumModal from './PremiumModal';
import Button from './Button';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { MessageSquare, Edit2, CheckCircle2 } from 'lucide-react';

import RunCard from '../Run/RunCard';
import GymSessionCard from '../Gym/GymSessionCard';
import MealCard from '../Nutrition/MealCard';
import BodyAssessmentCard from '../Body/BodyAssessmentCard';

export default function CreatedRecordModal() {
  const { 
    newlyCreatedRecord, 
    clearNewlyCreatedRecord, 
    profile,
    setProfile,
    setActiveTab,
    setSelectedDate
  } = useAppStore();

  // Busca o coach_intervention_status diretamente do perfil na BD, porque a
  // Edge Function pode tê-lo acabado de atualizar e o store local ainda não
  // refletiu essa mudança (race condition). Usa um state local para garantir
  // que o botão aparece assim que o perfil é relido.
  const [interventionNeeded, setInterventionNeeded] = useState(false);

  useEffect(() => {
    setInterventionNeeded(false);
    async function checkProfile() {
      if (newlyCreatedRecord && profile?.id) {
        // Pequeno delay para dar tempo à Edge Function de gravar o status no
        // perfil (attachCoachNotes corre em background após a resposta).
        await new Promise(r => setTimeout(r, 1500));
        const { data } = await supabase
          .from('profiles')
          .select('coach_intervention_status')
          .eq('id', profile.id)
          .maybeSingle();
        if (data) {
          if (data.coach_intervention_status !== profile.coach_intervention_status) {
            setProfile({ ...profile, coach_intervention_status: data.coach_intervention_status });
          }
          setInterventionNeeded(data.coach_intervention_status === 'needed');
        }
      }
    }
    checkProfile();
  }, [newlyCreatedRecord, profile?.id]);

  if (!newlyCreatedRecord) return null;

  const { type, record } = newlyCreatedRecord;
  const hasInterventionInRecord = Boolean(
    record?.intervention_needed ||
    record?.coach_intervention_status === 'needed' ||
    (record?.coach_notes && /adaptar o plano|falar com a coach|ajustarmos o teu plano|botão vermelho/i.test(record.coach_notes))
  );
  const showCoachButton = interventionNeeded || profile?.coach_intervention_status === 'needed' || hasInterventionInRecord;

  const handleClose = () => {
    clearNewlyCreatedRecord();
  };

  const handleUpdate = () => {
    if (record.date) {
      setSelectedDate(new Date(record.date));
    }
    if (type === 'run') {
      useAppStore.setState({ editingRunId: record.id });
    } else if (type === 'gym') {
      useAppStore.setState({ editingGymId: record.id });
    } else if (type === 'meal') {
      useAppStore.setState({ editingMealId: record.id });
    } else if (type === 'body') {
      useAppStore.setState({ editingBodyId: record.id });
    }
    clearNewlyCreatedRecord();
  };

  const handleGoToChat = () => {
    useAppStore.setState({ coachIntent: 'adapt_plan' });
    setActiveTab('coach');
    clearNewlyCreatedRecord();
  };

  return (
    <PremiumModal isOpen={true} onClose={handleClose} title="Registo Guardado">
      <div className="space-y-5 px-1 pb-6 pt-2">
        
        <div className="flex items-center gap-3 text-[var(--green)] bg-[var(--green)]/10 px-4 py-3 rounded-2xl">
          <CheckCircle2 size={24} className="shrink-0" />
          <p className="text-sm font-bold">O teu registo foi analisado e guardado com sucesso.</p>
        </div>

        <div className="pointer-events-none origin-top">
          {type === 'run' && <RunCard run={record} defaultExpanded={true} />}
          {type === 'gym' && <GymSessionCard session={record} defaultExpanded={true} />}
          {type === 'meal' && <MealCard meal={record} defaultExpanded={true} />}
          {type === 'body' && <BodyAssessmentCard assessment={record} defaultExpanded={true} />}
        </div>

        <div className="space-y-3 pt-2">
          {showCoachButton && (
            <Button
              onClick={handleGoToChat}
              variant="primary"
              className="w-full bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20 border-transparent"
            >
              <div className="flex items-center justify-center gap-2 w-full">
                <MessageSquare size={18} />
                <span>Falar com a Coach</span>
              </div>
            </Button>
          )}

          <Button
            onClick={handleUpdate}
            variant={showCoachButton ? "outline" : "primary"}
            className="w-full"
          >
            <div className="flex items-center justify-center gap-2 w-full">
              <Edit2 size={18} />
              <span>Atualizar Registo</span>
            </div>
          </Button>

          <Button
            onClick={handleClose}
            variant="ghost"
            className="w-full"
          >
            Fechar
          </Button>
        </div>
      </div>
    </PremiumModal>
  );
}
