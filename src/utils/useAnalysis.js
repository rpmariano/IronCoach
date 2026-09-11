import { useCallback, useRef, useState } from 'react';

/**
 * useAnalysis — a máquina de estados das três operações que dependem da IA e
 * demoram (ponto 7 do redesenho 6c; handoff, "Interactions & Behavior":
 * «Espera: esqueleto + spinner no botão ("A analisar…"). Erro: Warning coral
 * com "Tentar de novo" e alternativa manual; dados do utilizador nunca se
 * perdem.»).
 *
 * Os quatro ecrãs de registo faziam isto cada um à sua maneira: um booleano
 * `isAnalyzing`/`analyzingRun` por fluxo, e o erro a cair num `errorMsg`
 * partilhado com as validações do formulário — o que fazia uma falha de rede
 * ler-se como um campo mal preenchido, e não deixava nenhuma forma de voltar
 * a tentar sem refazer o gesto todo. Aqui o estado é um só:
 *
 *   status  'idle' | 'analyzing' | 'error'
 *   error   a mensagem técnica da falha (para o detalhe do aviso)
 *   run     corre a tarefa e guarda-a, para o "Tentar de novo"
 *   retry   repete a ÚLTIMA tarefa com os MESMOS dados
 *   reset   volta a 'idle' (ex.: ao mudar para o modo manual)
 *
 * Nada aqui toca no formulário: a tarefa que se passa a `run` é que decide o
 * que grava e o que limpa. É por isso que o rascunho do atleta nunca se
 * perde numa falha — o `catch` vive aqui e não chega a mexer no estado do
 * ecrã.
 */
export default function useAnalysis() {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  // A última tarefa corrida, para o "Tentar de novo" a repetir tal e qual.
  const lastTaskRef = useRef(null);

  const run = useCallback(async (task) => {
    if (typeof task !== 'function') return undefined;
    lastTaskRef.current = task;
    setStatus('analyzing');
    setError(null);
    try {
      const result = await task();
      setStatus('idle');
      return result;
    } catch (err) {
      // console.error mantém-se: o relatório de bug (ReportIssueButton)
      // apanha a consola, e a mensagem técnica é o que permite perceber
      // depois se foi timeout, 401 ou resposta inválida.
      console.error(err);
      setError(err?.message || '');
      setStatus('error');
      return undefined;
    }
  }, []);

  const retry = useCallback(() => {
    if (lastTaskRef.current) return run(lastTaskRef.current);
    return undefined;
  }, [run]);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return {
    status,
    error,
    run,
    retry,
    reset,
    isAnalyzing: status === 'analyzing',
    hasFailed: status === 'error',
  };
}
