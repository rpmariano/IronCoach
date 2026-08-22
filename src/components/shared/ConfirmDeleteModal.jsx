import React from 'react';
import { Trash2 } from 'lucide-react';
import Button from './Button';
import PremiumModal from './PremiumModal';

export default function ConfirmDeleteModal({ isOpen, onClose, onConfirm, title, message, isDeleting }) {
  return (
    <PremiumModal
      isOpen={isOpen}
      onClose={onClose}
      title={title || 'Confirmar eliminação'}
      icon={Trash2}
      theme="danger"
      variant="dialog"
      maxWidth="max-w-sm"
    >
      <div className="p-6">
        <p className="text-[13px] text-slate-300 mb-6 leading-relaxed">
          {message || 'Tem a certeza que deseja eliminar este registo? Esta ação não pode ser desfeita.'}
        </p>
        <div className="space-y-3">
          <Button 
            onClick={onConfirm} 
            disabled={isDeleting} 
            isLoading={isDeleting}
            type="button"
            variant="danger"
            className="w-full"
          >
            {isDeleting ? 'A eliminar...' : 'Eliminar'}
          </Button>
          <Button 
            onClick={onClose} 
            disabled={isDeleting} 
            type="button"
            variant="ghost"
            className="w-full"
          >
            Cancelar
          </Button>
        </div>
      </div>
    </PremiumModal>
  );
}
