import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';

// Botão/gesto de "voltar" do telemóvel (Android, sobretudo) — sem isto
// fecha a app inteira em vez de voltar ao ecrã anterior, porque nunca
// empilhávamos entrada nenhuma no histórico do browser: o gesto não tinha
// nada nosso para desfazer primeiro (bug relatado 2026-08-30). Ecrã de
// registo/edição aberto → empilha UMA entrada; "voltar" com essa entrada
// no topo desfaz-a e fecha o ecrã em vez de sair da app.
//
// Reutiliza o mesmo `navGuard` que o próprio X/Cancelar do formulário já
// usa (RunAgenda, Perfil) — alterações por gravar mostram o mesmo aviso de
// confirmação em vez de se perderem por trás de um "voltar" sem aviso.
//
// `isOpen`: se o ecrã de topo (registo/edição) está aberto agora.
// `onClose`: fecha-o — chamado só quando o gesto de voltar NÃO é travado
// por um navGuard ativo. Deve ser estável entre renders (useCallback), ou
// o listener de popstate é removido/recolocado a cada render.
export function useScreenBackButton(isOpen, onClose) {
  const wasOpenRef = useRef(false);
  const closedByBackRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      window.history.pushState({ ironcoachScreen: true }, '');
    } else if (!isOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      if (!closedByBackRef.current) {
        // Fechado pela própria app (Guardar/Cancelar/X), não pelo gesto de
        // voltar — consome a entrada que empilhámos, senão o PRÓXIMO
        // "voltar" fica preso a desfazer uma entrada fantasma em vez de
        // navegar de facto.
        window.history.back();
      }
      closedByBackRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    const handlePopState = () => {
      if (!wasOpenRef.current) return; // nada nosso para fechar
      const guard = useAppStore.getState().navGuard;
      if (guard && !guard(null)) {
        // O guard já mostrou o aviso de alterações por gravar (mesmo
        // comportamento do X/Cancelar quando o formulário está sujo) —
        // repõe a entrada que o "voltar" acabou de consumir, para o ecrã
        // continuar aberto até o atleta decidir no próprio aviso.
        window.history.pushState({ ironcoachScreen: true }, '');
        return;
      }
      closedByBackRef.current = true;
      onClose();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onClose]);
}
