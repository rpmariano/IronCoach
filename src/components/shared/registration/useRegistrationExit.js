import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../../store';
import { clearPersistedFormDraft } from '../../../utils/formDraftPersistence';

/* Sair de um registo — a parte do RegistrationShell que tem estado
   (registo unificado, specs/plano-registo-plano-coach.md §1, decisão 12).
   Era igual, copiada, em cada formulário (Corpo, Ginásio, Refeição,
   Corrida):

   · com alterações por gravar, trocar de separador não navega: o navGuard
     guarda o destino e abre o aviso "Sair sem gravar?";
   · fechar ou recarregar o browser também avisa (beforeunload);
   · sem alterações, se o separador mudar por fora, o registo fecha-se;
   · `close()` apaga o rascunho, fecha e, se a saída veio de uma troca de
     separador, completa essa navegação — limpando primeiro o guard, que
     ainda está registado neste render e voltaria a bloqueá-la. */
export default function useRegistrationExit({ isDirty, onClose, draftKey }) {
  const setNavGuard = useAppStore(s => s.setNavGuard);
  const activeTab = useAppStore(s => s.activeTab);
  const [initialTab] = useState(activeTab);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const autoCloseRef = useRef(false);
  // O destino pendente quando o navGuard interceta uma troca de separador;
  // null quando a saída foi pedida pelo X do próprio ecrã.
  const pendingNavTarget = useRef(null);

  useEffect(() => {
    if (activeTab !== initialTab && !autoCloseRef.current && !isDirty) {
      autoCloseRef.current = true;
      onClose?.();
    }
  }, [activeTab, initialTab, onClose, isDirty]);

  useEffect(() => {
    if (!isDirty) { setNavGuard(null); return undefined; }
    setNavGuard((intendedTab) => {
      pendingNavTarget.current = intendedTab;
      setShowUnsaved(true);
      return false;
    });
    return () => setNavGuard(null);
  }, [isDirty, setNavGuard]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const close = () => {
    autoCloseRef.current = true;
    const target = pendingNavTarget.current;
    pendingNavTarget.current = null;
    if (draftKey) clearPersistedFormDraft(draftKey);
    onClose?.();
    if (target) {
      setNavGuard(null);
      useAppStore.getState().setActiveTab(target);
    }
  };

  return {
    close,
    /** O X do ecrã: com alterações pergunta, sem elas fecha. */
    requestClose: () => { if (isDirty) setShowUnsaved(true); else close(); },
    /** Esconde o aviso mas MANTÉM o destino pendente (o Ginásio abre outro diálogo e, gravado, ainda navega). */
    hideUnsaved: () => setShowUnsaved(false),
    /** "Cancelar" no aviso: fica no formulário e esquece o destino. */
    cancelLeave: () => { pendingNavTarget.current = null; setShowUnsaved(false); },
    showUnsaved,
    /** A saída veio de uma troca de separador? (lido ANTES de close(), que o consome) */
    hasPendingNav: () => !!pendingNavTarget.current,
  };
}
