import React from 'react';
import { Loader2 } from 'lucide-react';
import Button from './Button';

export function UnsavedChangesModal({
  isOpen,
  isSaving = false,
  onSaveAndLeave,
  onDiscardAndLeave,
  onCancel,
  title = "Tens alterações por gravar",
  message = "Se saíres agora, as alterações que fizeste não ficam guardadas.",
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm fade-in" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl p-5 bg-neutral-900 border border-neutral-800 shadow-2xl space-y-4">
        <div>
          <h3 className="text-sm font-bold text-white leading-snug">{title}</h3>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="space-y-2 pt-1">
          <Button
            type="button"
            onClick={onSaveAndLeave}
            disabled={isSaving}
            isLoading={isSaving}
            className="w-full text-xs"
          >
            {isSaving ? 'A guardar...' : 'Gravar e sair'}
          </Button>

          <Button
            type="button"
            variant="danger-outline"
            onClick={onDiscardAndLeave}
            disabled={isSaving}
            className="w-full text-xs"
          >
            Sair sem gravar
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isSaving}
            className="w-full text-xs"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

export default UnsavedChangesModal;
