import React, { useEffect, useMemo, useState } from 'react';
import CarolQuestions, { openCarolQuestions } from '../Nutrition/CarolQuestions';
import CoachAvatar from '../Coach/CoachAvatar';
import PremiumModal from './PremiumModal';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import Button from './Button';
import CarolInterventionActions from './CarolInterventionActions';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { useToast } from './ToastProvider';
import { CheckCircle2, Trash2 } from 'lucide-react';

import RunCard from '../Run/RunCard';
import GymSessionCard from '../Gym/GymSessionCard';
import MealCard from '../Nutrition/MealCard';
import BodyAssessmentCard from '../Body/BodyAssessmentCard';

// Tabela e mensagens por tipo de registo — usado só pelo "Eliminar" deste
// modal (ver handleDelete). O cartão embutido (RunCard/GymSessionCard/...)
// tem o seu próprio botão de eliminar, mas aqui é só pré-visualização
// (pointer-events-none) e agora está escondido (hideActions) a favor deste,
// para não haver dois "Eliminar" — um deles sempre inerte.
const DELETE_CONFIG = {
  run: { table: 'runs', message: 'Tem a certeza que deseja eliminar esta corrida? Esta ação não pode ser desfeita.', toast: 'Corrida eliminada' },
  gym: { table: 'workout_sessions', message: 'Tem a certeza que deseja eliminar este treino? Esta ação não pode ser desfeita.', toast: 'Treino eliminado' },
  meal: { table: 'meals', message: 'Tem a certeza que deseja eliminar esta refeição? Esta ação não pode ser desfeita.', toast: 'Refeição eliminada' },
  body: { table: 'body_assessments', message: 'Tem a certeza que deseja eliminar esta avaliação corporal? Esta ação não pode ser desfeita.', toast: 'Avaliação eliminada' },
};

export default function CreatedRecordModal() {
  const {
    newlyCreatedRecord,
    clearNewlyCreatedRecord,
    setNewlyCreatedRecord,
    profile,
    setProfile,
    loadInitialData,
  } = useAppStore();
  const { showToast } = useToast();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // "Agora não" nas perguntas da Carol: fecha o bloco aqui; as perguntas
  // ficam no cartão da refeição (2026-10-05).
  const [questionsLater, setQuestionsLater] = useState(false);

  // A Edge Function pode ter acabado de mudar o coach_intervention_status no
  // perfil e o store ainda não o refletir (race condition): relê-o da BD
  // para o botão flutuante da Carol ficar certo. Já NÃO decide o "Falar com
  // a Carol" deste modal (2026-10-05): uma intervenção no perfil pode ser de
  // outro registo ou da carga semanal, e aqui só aparece a que é deste
  // registo — a outra vive no aviso da Carol, com a sua confirmação.
  useEffect(() => {
    setQuestionsLater(false);
    if (!newlyCreatedRecord?.record || !profile?.id) return;

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('coach_intervention_status')
          .eq('id', profile.id)
          .single();
        if (!cancelled && data && !error && data.coach_intervention_status !== profile.coach_intervention_status) {
          setProfile({ ...profile, coach_intervention_status: data.coach_intervention_status });
        }
      } catch (err) {
        console.warn('Erro ao verificar coach_intervention_status', err);
      }
    })();

    return () => { cancelled = true; };
  }, [newlyCreatedRecord, profile?.id]);

  // Presas ao registo, não ao estado das perguntas: depois de responder, a
  // resposta da Carol fica à vista em vez de o bloco desaparecer.
  const recordId = newlyCreatedRecord?.record?.id;
  const hadQuestions = useMemo(
    () => newlyCreatedRecord?.type === 'meal' && openCarolQuestions(newlyCreatedRecord.record).length > 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recordId],
  );

  if (!newlyCreatedRecord) return null;

  const { type, record } = newlyCreatedRecord;
  // O motivo do pedido ao chat: o da análise deste registo; o do perfil só
  // quando foi esta análise a marcá-lo (as marcas intervention_needed /
  // 'needed' que a Edge Function devolve no próprio registo).
  const flaggedHere = Boolean(record?.intervention_needed || record?.coach_intervention_status === 'needed');
  const talkReason = record?.coach_intervention_reason || (flaggedHere ? profile?.coach_intervention_reason : null) || null;

  const handleClose = () => {
    clearNewlyCreatedRecord();
  };

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    const config = DELETE_CONFIG[type];
    if (!config || !record?.id) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from(config.table).delete().eq('id', record.id);
      if (error) throw error;
      if (profile?.id) {
        await loadInitialData(profile.id);
      }
      showToast(config.toast);
      clearNewlyCreatedRecord();
    } catch (err) {
      console.error('Error deleting record:', err);
      showToast('Erro ao eliminar registo.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <PremiumModal isOpen={true} onClose={handleClose} title="Registo Guardado">
      <div className="space-y-5 px-1 pb-6 pt-2">
        
        <div className="flex items-center gap-3 text-[var(--green)] bg-[var(--green)]/10 px-4 py-3 rounded-2xl">
          <CheckCircle2 size={24} className="shrink-0" />
          <p className="text-sm font-bold">O teu registo foi analisado e guardado com sucesso.</p>
        </div>

        {/* Bug #48 (fase C): um rótulo lido nas fotos entrou já na despensa —
            não espera pela segunda vez (mockup, ecrã 5). */}
        {newlyCreatedRecord.pantryAdded?.length > 0 && (
          <div data-testid="pantry-added" className="flex gap-2.5 items-start rounded-2xl p-3.5" style={{ background: 'var(--tint-nutrition-bg)', border: '1px solid var(--tint-nutrition-bd)' }}>
            <CoachAvatar size={32} mood="happy" />
            <p className="text-[13px] leading-[1.5]" style={{ color: 'var(--text-2)' }}>
              Li o rótulo e guardei já na tua despensa: <b style={{ color: 'var(--text-1)' }}>{newlyCreatedRecord.pantryAdded.join(', ')}</b>.
              Da próxima, escreve o nome e já não preciso de analisar. Podes ajustá-lo no Perfil → Armário.
            </p>
          </div>
        )}

        {/* Bug #52 (fase B): as perguntas da Carol, logo a seguir à análise.
            "Agora não" (ou o X) é o "respondo depois" — ficam no cartão da
            refeição. */}
        {hadQuestions && !questionsLater && (
          <CarolQuestions
            meal={record}
            onAnswered={(updated) => setNewlyCreatedRecord({ ...newlyCreatedRecord, record: updated })}
            onLater={() => setQuestionsLater(true)}
          />
        )}

        <div className="pointer-events-none origin-top">
          {type === 'run' && <RunCard run={record} defaultExpanded={true} hideActions />}
          {type === 'gym' && <GymSessionCard session={record} defaultExpanded={true} hideActions />}
          {type === 'meal' && <MealCard meal={record} defaultExpanded={true} hideActions />}
          {type === 'body' && <BodyAssessmentCard assessment={record} defaultExpanded={true} hideActions />}
        </div>

        {/* A intervenção da Carol, só quando é DESTE registo (2026-10-05):
            o componente comum do cartão e do formulário. "Falar com a Carol"
            não dispensa (antes gravava logo a dispensa) e fecha este ecrã só
            se o separador mudar; "Dispensar" usa a chave única do tipo. */}
        <CarolInterventionActions record={record} type={type} reason={talkReason} onTalked={clearNewlyCreatedRecord} />

        {/* Sair é o X do cabeçalho (aria-label "Fechar"), como em todas as
            superfícies da Carol — o botão "Fechar" do rodapé saiu
            (2026-10-05, convenção única dos botões). Fica o "Eliminar", a
            única ação deste ecrã que não é sair.

            Havia também "Atualizar registo", que abria o registo em edição
            na hora — mas é sempre o registo que se acabou de submeter: não
            há nada por atualizar ainda (relatado 2026-09-21). Editar continua
            possível a partir do cartão do dia no Calendário. */}
        <div className="pt-2">
          <Button
            onClick={() => setShowDeleteConfirm(true)}
            variant="danger-outline"
            className="w-full"
          >
            <div className="flex items-center justify-center gap-2 w-full">
              <Trash2 size={18} />
              <span>Eliminar</span>
            </div>
          </Button>
        </div>
      </div>

      <ConfirmDeleteModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
        message={DELETE_CONFIG[type]?.message}
      />
    </PremiumModal>
  );
}
