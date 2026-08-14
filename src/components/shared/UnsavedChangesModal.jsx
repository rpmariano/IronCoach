import React from 'react';
import { Loader2 } from 'lucide-react';

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
          <button
            type="button"
            onClick={onSaveAndLeave}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs bg-[var(--accent)] shadow-lg active:scale-95 transition disabled:opacity-60 text-white"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
            {isSaving ? 'A guardar...' : 'Gravar e sair'}
          </button>

          <button
            type="button"
            onClick={onDiscardAndLeave}
            disabled={isSaving}
            className="w-full py-3 rounded-xl font-semibold text-xs border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 transition disabled:opacity-60"
          >
            Sair sem gravar
          </button>

          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="w-full py-2.5 rounded-xl font-semibold text-xs text-slate-400 hover:text-slate-200 transition disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export default UnsavedChangesModal;
