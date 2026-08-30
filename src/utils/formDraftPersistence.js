import { useEffect, useRef } from 'react';

// Faz um rascunho de formulário sobreviver a um recarregamento da página —
// comum em Android quando a app volta a primeiro plano depois de ter
// estado em segundo plano: o sistema operativo descarta a página para
// libertar memória e recarrega-a do zero ao voltar a mostrar-se, apagando
// TODO o estado em memória (React/Zustand). Sem persistência nenhuma, um
// formulário a meio de preenchimento perdia-se por completo ao trocar de
// app e voltar — bug relatado 2026-08-30.
//
// localStorage (não sessionStorage): sobrevive mesmo que o Android mate o
// processo por completo, não só quando descarta a página — o cenário mais
// agressivo é exatamente o que mais precisa da rede de segurança.

const DEBOUNCE_MS = 600;

/**
 * Persiste `draft` em localStorage (com debounce) enquanto houver
 * alterações por gravar. Chamar em conjunto com `restorePersistedFormDraft`
 * (uma vez, na inicialização do formulário) e `clearPersistedFormDraft`
 * (ao gravar com sucesso ou ao descartar explicitamente).
 *
 * `key`: identifica este rascunho de forma única — tem de incluir o id do
 * registo em edição quando aplicável, para nunca vazar entre registos
 * diferentes nem para uma criação nova a seguir.
 * `isDirty`: só persiste havendo alterações por gravar — um rascunho
 * intocado (igual ao valor "canónico" já gravado ou vazio) não vale a
 * pena guardar.
 * `isEnabled`: liga/desliga — false enquanto a inicialização do formulário
 * ainda não restaurou um rascunho anterior, para não gravar por cima dele
 * o valor vazio/de partida momentâneo do primeiro render.
 */
export function usePersistedFormDraft(key, draft, { isDirty = true, isEnabled = true } = {}) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!isEnabled || !isDirty || !key) return undefined;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(draft));
      } catch (_) {
        // Quota excedida ou localStorage indisponível (modo privado, por
        // exemplo) — o pior caso é o mesmo de antes desta correção, não
        // piora nada.
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, JSON.stringify(draft), isDirty, isEnabled]);
}

/** Lê o rascunho guardado para `key`, ou null se não existir/for inválido. */
export function restorePersistedFormDraft(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/** Remove o rascunho guardado — chamar ao gravar com sucesso ou ao descartar. */
export function clearPersistedFormDraft(key) {
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch (_) {
    // Indisponível — nada a limpar.
  }
}
