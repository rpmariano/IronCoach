import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import './Toast.css';

const ToastContext = createContext({
  showToast: (message, type = 'success') => {}
});

export const useToast = () => useContext(ToastContext);

/* Quantos avisos ficam à vista ao mesmo tempo. Cada um ocupa ~52 px (44 de
   altura mínima + 8 de intervalo): num telemóvel de 667 px, uma dúzia enchia
   o ecrã de cima a baixo e empurrava o próprio "Limpar tudo" para fora — a
   saída desaparecia justamente quando passava a ser precisa (2.ª revisão
   pré-deploy). Com a pilha a não sair sozinha, isto acontecia num dia normal:
   são 8 copos de água até à meta, cada um com o seu aviso.

   O que passa deste número não se perde em silêncio — conta-se na linha de
   baixo, e o mais antigo sai quando um dos visíveis for dispensado. */
export const TOASTS_VISIVEIS = 4;

/* Quanto tempo cada aviso fica à vista. O erro fica o dobro: era o caso que
   mais doía quando saía antes de ser lido. */
export const TOAST_MS = { success: 3000, error: 6000 };

/* Os avisos curtos da app — "+250 ml de água", "Guardado", "Não consegui
   registar". São 84 sítios a chamar `showToast`.

   Saem sozinhos (TOAST_MS). Entre 2026-09-21 e 2026-09-22 esperaram pelo
   toque do atleta, junto com as confirmações e os parabéns; o bug #44 pediu
   os avisos curtos de volta ao desenho original — os diálogos (parabéns,
   confirmação de registo) continuam a esperar. Tocar num aviso continua a
   fechá-lo antes do tempo, e "Limpar tudo" aparece se se empilharem. */
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'success') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    timers.current.set(id, setTimeout(() => dismiss(id), TOAST_MS[type] ?? TOAST_MS.success));
  }, [dismiss]);

  const clearAll = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    setToasts([]);
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const visiveis = toasts.slice(-TOASTS_VISIVEIS);
  const escondidos = toasts.length - visiveis.length;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {/* Antes de {children} de propósito: o contentor é `position: fixed`,
          por isso a ordem no DOM não mexe com o sítio onde aparece, mas mexe
          com a ordem de tabulação. Depois da app, quem navega por teclado
          tinha de percorrer o ecrã inteiro para chegar a um aviso que já não
          sai sozinho (2.ª revisão pré-deploy). */}
      <div className="toast-container">
        {toasts.length > 2 && (
          /* Acima da pilha, não abaixo: em baixo era o primeiro a sair do
             ecrã quando os avisos se acumulavam. */
          <button
            type="button"
            className="toast-clear-all"
            data-testid="toast-clear-all"
            onClick={clearAll}
          >
            Limpar tudo ({toasts.length})
          </button>
        )}
        {/* A região viva existe desde o primeiro render e é sempre a mesma,
            para os avisos continuarem a ser anunciados. `aria-atomic=false`
            porque `role="status"` o assume verdadeiro: sem isto, cada aviso
            novo — e cada aviso DISPENSADO — mandava o leitor de ecrã reler a
            pilha inteira, o que com os 3 s era invisível e agora não é. */}
        <div className="toast-live" role="status" aria-live="polite" aria-atomic="false">
          {escondidos > 0 && (
            <span className="toast-more" data-testid="toast-more">
              +{escondidos} {escondidos === 1 ? 'aviso mais antigo' : 'avisos mais antigos'}
            </span>
          )}
          {visiveis.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`toast toast-${t.type}`}
              data-testid="toast"
              onClick={() => dismiss(t.id)}
            >
              <span className="toast-text">{t.message}</span>
              {/* O rótulo vai no ×, não no botão: um aria-label no botão
                  substituía a mensagem no anúncio, e o atleta ouvia
                  "Dispensar aviso:" antes de saber do que se tratava. */}
              <span className="toast-x" aria-label="Dispensar">×</span>
            </button>
          ))}
        </div>
      </div>
      {children}
    </ToastContext.Provider>
  );
};
