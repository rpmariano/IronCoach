import React, { useState } from 'react';
import { Bug, Send } from 'lucide-react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { currentPageLabel } from '../../lib/utils';
import { useToast } from './ToastProvider';
import PremiumModal from './PremiumModal';
import { Button } from './Button';

/**
 * Botão discreto (presente em todos os ecrãs via Layout) que permite ao
 * atleta reportar um problema — descrição + data/hora/utilizador/página são
 * gravados automaticamente em bug_reports.
 */
export default function ReportIssueButton() {
  const { session, profile, activeTab, openCreationMode, editingRaceId } = useAppStore();
  const { showToast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleOpen = () => setIsOpen(true);

  const handleClose = () => {
    if (submitting) return;
    setIsOpen(false);
    setDescription('');
  };

  const handleSubmit = async () => {
    const trimmed = description.trim();
    if (!trimmed) {
      showToast('Descreve o problema antes de enviar.', 'error');
      return;
    }
    const userId = session?.user?.id;
    if (!userId) {
      showToast('Sessão inválida — inicia sessão novamente para reportar.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('bug_reports').insert({
        user_id: userId,
        user_email: session?.user?.email || null,
        user_name: profile?.full_name || null,
        description: trimmed,
        page: currentPageLabel({ activeTab, openCreationMode, editingRaceId }),
        user_agent: navigator.userAgent,
      });
      if (error) throw error;

      showToast('Obrigado! O teu report foi enviado à equipa.', 'success');
      setIsOpen(false);
      setDescription('');
    } catch (err) {
      console.error('[ReportIssueButton] Falha ao submeter report:', err);
      showToast('Não foi possível enviar o report. Tenta novamente.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        aria-label="Reportar um problema"
        title="Reportar um problema"
        className="tap-44 fixed bottom-24 right-3 z-30 w-9 h-9 rounded-full flex items-center justify-center bg-white/10 backdrop-blur-xl border border-white/10 text-slate-400 hover:text-slate-100 hover:bg-white/20 active:scale-95 transition shadow-[0_2px_10px_rgba(0,0,0,0.25)]"
      >
        <Bug size={15} />
      </button>

      <PremiumModal
        isOpen={isOpen}
        onClose={handleClose}
        title="Reportar um problema"
        subtitle={currentPageLabel({ activeTab, openCreationMode, editingRaceId })}
        icon={Bug}
        theme="warning"
        variant="dialog"
        maxWidth="max-w-lg"
      >
        <div className="p-6 space-y-4 bg-neutral-900 text-slate-200">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">O que aconteceu?</label>
            <textarea
              rows={4}
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreve o problema — o que fizeste e o que esperavas que acontecesse..."
              className="w-full bg-neutral-950 border border-neutral-700 rounded-xl py-2.5 px-3 text-xs text-slate-200 outline-none resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="light" onClick={handleClose} disabled={submitting} className="flex-1">
              Cancelar
            </Button>
            <Button
              variant="module"
              moduleColor="var(--mod-coach-to)"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1"
              icon={submitting ? <div className="w-4 h-4 border-2 border-slate-700 border-t-white rounded-full animate-spin" /> : <Send size={15} />}
            >
              {submitting ? 'A enviar...' : 'Enviar report'}
            </Button>
          </div>
        </div>
      </PremiumModal>
    </>
  );
}
