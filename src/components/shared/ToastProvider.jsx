import React, { createContext, useCallback, useContext, useState } from 'react';
import './Toast.css';

const ToastContext = createContext({
  showToast: (message, type = 'success') => {}
});

export const useToast = () => useContext(ToastContext);

/* Os avisos curtos da app — "+250 ml de água", "Guardado", "Não consegui
   registar". São 84 sítios a chamar `showToast`.

   Desapareciam sozinhos ao fim de 3 s. Desde 2026-09-21 esperam pelo atleta:
   «todas as mensagens que têm este caráter temporário devem deixar de o ter;
   quero que só desapareçam mediante ação do utilizador». Um aviso de erro que
   se apagava em 3 s era o caso que mais doía — quem não estivesse a olhar
   para o ecrã no instante certo nunca soube que o registo tinha falhado.

   Tirar o temporizador obrigou a dar-lhes uma saída: não tinham nenhuma.
   Cada aviso passa a ser um botão — toca-se nele e sai —, com o × à direita
   a dizer que é isso que acontece. A partir do terceiro empilhado aparece
   "Limpar tudo", porque tocar num de cada vez começa a ser trabalho. */
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'success') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container">
        {/* O anúncio ao leitor de ecrã continua a ser do contentor: o que
            muda é quem fecha, não como se lê. */}
        <div className="toast-live" role="status" aria-live="polite">
          {toasts.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`toast toast-${t.type}`}
              onClick={() => dismiss(t.id)}
              aria-label={`Dispensar aviso: ${t.message}`}
            >
              <span className="toast-text">{t.message}</span>
              <span className="toast-x" aria-hidden="true">×</span>
            </button>
          ))}
        </div>
        {toasts.length > 2 && (
          <button
            type="button"
            className="toast-clear-all"
            onClick={() => setToasts([])}
          >
            Limpar tudo
          </button>
        )}
      </div>
    </ToastContext.Provider>
  );
};
