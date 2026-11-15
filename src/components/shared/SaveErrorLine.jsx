import React from 'react';
import { RefreshCw } from 'lucide-react';

/* #116 (2026-11-07): a linha de erro dos registos (errorMsg), agora com «Tentar de novo» quando o
   erro é de uma gravação que falhou. Repetir não duplica: a gravação nova leva sempre o mesmo
   client_request_id, e uma edição volta a escrever o mesmo registo. Sem `onRetry`, é a linha de
   sempre (as validações do formulário). */
export default function SaveErrorLine({ message, onRetry = null, retrying = false, center = true }) {
  if (!message) return null;
  return (
    <div className={`mt-3 ${center ? 'text-center' : ''}`} data-testid="save-error-line">
      <p role="alert" className="text-[13px] font-medium" style={{ color: 'var(--danger)' }}>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold"
          style={{ minHeight: 'var(--tap)', padding: '0 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--text-1)', background: 'transparent', cursor: retrying ? 'default' : 'pointer' }}
        >
          <RefreshCw size={14} /> Tentar de novo
        </button>
      )}
    </div>
  );
}
