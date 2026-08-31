import { useEffect, useRef } from 'react';
import { useAppStore } from '../store';

function sameScreen(a, b) {
  return a.tab === b.tab && a.editing === b.editing;
}

// Botão/gesto de "voltar" do telemóvel (Android, sobretudo) — sem isto
// fecha a app inteira em vez de voltar ao ecrã/separador anterior, porque
// nunca empilhávamos entrada nenhuma no histórico do browser: o gesto não
// tinha nada nosso para desfazer primeiro (bug relatado 2026-08-30 —
// primeira correção só cobria os ecrãs de registo/edição de topo,
// insuficiente: o mesmo acontecia a navegar entre separadores).
//
// Mantém uma pilha própria dos ecrãs visitados nesta sessão — cada um é
// `{ tab, editing }` (separador ativo + se há um ecrã de registo/edição
// por cima dele). Mudar de separador OU abrir um ecrã de registo/edição
// empilha uma entrada no histórico do browser; "voltar" desempilha a
// última e restaura o ecrã que ficou a seguir. Reutiliza o mesmo
// `navGuard` que o próprio X/Cancelar do formulário já usa (RunAgenda,
// Perfil) — alterações por gravar mostram o mesmo aviso de confirmação em
// vez de se perderem por trás de um "voltar" sem aviso.
//
// `activeTab`/`setActiveTab`: separador ativo — `setActiveTab` já trava
// sozinho por navGuard ao mudar de separador (ver store/index.js), por
// isso só o gesto de voltar SOBRE UM ECRÃ DE REGISTO precisa da
// verificação explícita aqui em baixo.
// `isCreatingOrEditing`/`closeTopScreen`: idem para o ecrã de topo
// (registo/edição de Prova, refeição, avaliação, corrida, treino).
// `ready`: só começa a empilhar depois da app terminar a inicialização
// (sessão, `?tab=` da URL) — sem isto, o separador inicial vindo da URL
// contava como uma "navegação" e empilhava uma entrada logo ao arrancar.
export function useAppNavigationHistory({ activeTab, setActiveTab, isCreatingOrEditing, closeTopScreen, ready = true }) {
  const stackRef = useRef([{ tab: activeTab, editing: isCreatingOrEditing }]);
  const wasReadyRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    const current = { tab: activeTab, editing: isCreatingOrEditing };

    if (!wasReadyRef.current) {
      // Primeira vez "pronta" — reancora a pilha no ecrã atual em vez de
      // arrastar mudanças de estado que aconteceram antes disto ser
      // relevante (ex.: ?tab= da URL a mudar o separador por omissão).
      wasReadyRef.current = true;
      stackRef.current = [current];
      return;
    }

    const stack = stackRef.current;
    const top = stack[stack.length - 1];
    // Já bate certo com o topo da pilha — ou é navegação normal já
    // sincronizada, ou é o resultado de um "voltar" que a própria pilha
    // já refletia (ver handlePopState, que desempilha de imediato,
    // síncrono, antes de o estado do React sequer se propagar).
    if (sameScreen(top, current)) return;

    stack.push(current);
    window.history.pushState({ ironcoachNav: true }, '');
  }, [activeTab, isCreatingOrEditing, ready]);

  useEffect(() => {
    const handlePopState = () => {
      const stack = stackRef.current;
      if (!wasReadyRef.current || stack.length <= 1) return; // nada nosso para desfazer — deixa sair

      const leaving = stack[stack.length - 1];
      if (leaving.editing) {
        const guard = useAppStore.getState().navGuard;
        if (guard && !guard(null)) {
          // O guard já mostrou o aviso de alterações por gravar (mesmo
          // comportamento do X/Cancelar quando o formulário está sujo) —
          // repõe a entrada que o "voltar" acabou de consumir, para o
          // ecrã continuar aberto até o atleta decidir no próprio aviso.
          window.history.pushState({ ironcoachNav: true }, '');
          return;
        }
        stack.pop();
        closeTopScreen();
        return;
      }

      stack.pop();
      const target = stack[stack.length - 1];
      setActiveTab(target.tab);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setActiveTab, closeTopScreen]);
}
