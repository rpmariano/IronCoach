import React from 'react';
import { Loader2 } from 'lucide-react';
import Button from './Button';

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
          <Button 
            onClick={onConfirm} 
            disabled={isDeleting} 
            isLoading={isDeleting}
            type="button"
            variant="danger-outline"
            className="w-full text-xs"
          >
            {isDeleting ? 'A eliminar...' : 'Eliminar'}
          </Button>
          <Button 
            onClick={onClose} 
            disabled={isDeleting} 
            type="button"
            variant="ghost"
            className="w-full text-xs"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
