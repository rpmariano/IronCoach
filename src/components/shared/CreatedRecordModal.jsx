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
  const [interventionNeeded, setInterventionNeeded] = useState(false);

  useEffect(() => {
    setInterventionNeeded(false);
    if (!newlyCreatedRecord?.record || !profile?.id) return;

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('coach_intervention_status')
          .eq('id', profile.id)
          .single();
        if (!cancelled && data && !error) {
          if (data.coach_intervention_status !== profile.coach_intervention_status) {
            setProfile({ ...profile, coach_intervention_status: data.coach_intervention_status });
          }
          setInterventionNeeded(data.coach_intervention_status === 'needed');
        }
      } catch (err) {
        console.warn('Erro ao verificar coach_intervention_status', err);
      }
    })();

    return () => { cancelled = true; };
  }, [newlyCreatedRecord, profile?.id]);

  if (!newlyCreatedRecord) return null;

  const { type, record } = newlyCreatedRecord;
  const isDismissed = record?.id && (dismissedInterventions[record.id] === record?.coach_notes || dismissedInterventions[record.id] === 'dismissed');
  const hasInterventionInRecord = Boolean(
    record?.intervention_needed ||
    record?.coach_intervention_status === 'needed' ||
    (record?.coach_notes && /adaptar o plano|falar com a coach|ajustarmos o teu plano|botão vermelho/i.test(record.coach_notes))
  );
  const showCoachButton = !isDismissed && (interventionNeeded || profile?.coach_intervention_status === 'needed' || hasInterventionInRecord);

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
    if (record?.id) {
      dismissIntervention(record.id, record?.coach_notes);
    }
    useAppStore.setState({
      coachIntent: {
        kind: 'proactive_intervention',
        recordType: type,
        recordId: record?.id,
        recordName: record?.name,
        date: record?.date,
        reason: record?.coach_intervention_reason || profile?.coach_intervention_reason || record?.coach_notes,
      }
    });
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
              variant="module"
              moduleColor="linear-gradient(135deg, var(--mod-coach-from), var(--mod-coach-to))"
              className="w-full text-white shadow-lg shadow-[var(--mod-coach-to)]/20 border-transparent font-semibold"
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
