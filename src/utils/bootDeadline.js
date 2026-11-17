/* Os prazos do arranque (bug de 2026-11-17: a app presa no logo ao voltar a ela).

   · BOOT_SESSION_TIMEOUT_MS — quanto o arranque espera pela sessão (getSession) antes de sair do
     logo para o ecrã «a ligação está lenta». A resposta que chegar depois continua a valer.
   · BOOT_DEADLINE_MS — o prazo duro do logo, aconteça o que acontecer.
   · LAZY_IMPORT_TIMEOUT_MS — um import() de um ecrã que nunca responde conta como falhado. */

export const BOOT_SESSION_TIMEOUT_MS = 8000;
export const BOOT_DEADLINE_MS = 15000;
export const LAZY_IMPORT_TIMEOUT_MS = 30000;

/** A promessa, ou uma rejeição (TimeoutError) se não acabar em `ms`. */
export function withDeadline(promise, ms, label = 'pedido') {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label}: sem resposta em ${ms} ms`);
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}
