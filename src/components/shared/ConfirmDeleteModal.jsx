import React from 'react';
import { Loader2 } from 'lucide-react';

export default function ConfirmDeleteModal({ isOpen, onClose, onConfirm, title, message, isDeleting }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/70 fade-in" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl p-5 bg-neutral-900 border border-neutral-800 shadow-2xl">
        <h2 className="text-sm font-semibold text-white">{title || 'Confirmar eliminação'}</h2>
        <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
          {message || 'Tem a certeza que deseja eliminar este registo? Esta ação não pode ser desfeita.'}
        </p>
        <div className="mt-5 space-y-2">
          <button 
            onClick={onConfirm} 
            disabled={isDeleting} 
            type="button"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-xs border border-red-500/40 text-red-400 hover:bg-red-500/10 transition disabled:opacity-60"
          >
            {isDeleting ? <Loader2 size={16} className="animate-spin" /> : null}
            {isDeleting ? 'A eliminar...' : 'Eliminar'}
          </button>
          <button 
            onClick={onClose} 
            disabled={isDeleting} 
            type="button"
            className="w-full py-3 rounded-xl font-semibold text-xs text-slate-400 hover:text-slate-200 transition disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
