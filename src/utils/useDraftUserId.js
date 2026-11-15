import { useAppStore } from '../store';

/** O id da conta para a chave do rascunho (draftScope.js); null sem sessão. */
export function useDraftUserId() {
  return useAppStore((s) => s.session?.user?.id || null);
}
