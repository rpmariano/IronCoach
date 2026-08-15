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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm fade-in" role="dialog" aria-modal="true">
      <div className="w-full max-w-[320px] rounded-3xl p-6 bg-white border border-slate-200/60 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] space-y-5">
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 mb-4 shadow-sm border border-rose-100/50">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          </div>
          <h3 className="text-[15px] font-bold text-slate-800 leading-snug">{title}</h3>
          <p className="text-[12px] text-slate-500 mt-2 leading-relaxed px-2">
            {message}
          </p>
        </div>

        <div className="space-y-2 pt-2">
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
    </div>
  );
}

export default UnsavedChangesModal;
