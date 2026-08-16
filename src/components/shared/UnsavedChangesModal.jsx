import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from './Button';
import PremiumModal from './PremiumModal';

export function UnsavedChangesModal({
  isOpen,
  isSaving = false,
  onSaveAndLeave,
  onDiscardAndLeave,
  onCancel,
  title = "Tens alterações por gravar",
  message = "Se saíres agora, as alterações que fizeste não ficam guardadas.",
}) {
  return (
    <PremiumModal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      icon={AlertTriangle}
      theme="warning"
      variant="dialog"
      maxWidth="max-w-[320px]"
    >
      <div className="p-6">
        <p className="text-[13px] text-slate-600 mb-6 leading-relaxed">
          {message}
        </p>

        <div className="space-y-3">
          <Button
            type="button"
            variant="primary"
            onClick={onSaveAndLeave}
            disabled={isSaving}
            isLoading={isSaving}
            className="w-full text-[13px] py-2.5 rounded-xl font-bold"
          >
            {isSaving ? 'A guardar...' : 'Gravar e sair'}
          </Button>

          <Button
            type="button"
            variant="danger-ghost"
            onClick={onDiscardAndLeave}
            disabled={isSaving}
            className="w-full text-[13px] py-2.5 rounded-xl font-bold"
          >
            Sair sem gravar
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isSaving}
            className="w-full text-[13px] py-2.5 rounded-xl font-bold text-slate-500 hover:text-slate-700"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </PremiumModal>
  );
}

export default UnsavedChangesModal;
