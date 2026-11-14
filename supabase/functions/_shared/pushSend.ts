// Envio de Web Push com prazo (auditoria de segurança, 2026-11-14, item M2).
//
// Até aqui o send-water-reminders e o coach-proactive-tick enviavam uma
// subscrição de cada vez com `await` e sem prazo: um serviço de push que não
// respondesse (ou um endpoint que aceita a ligação e nunca fecha) prendia o
// ciclo inteiro até a Edge Function morrer por tempo — e ninguém a seguir
// recebia nada. Agora:
//   - cada envio tem PUSH_SEND_TIMEOUT_MS; passado isso conta como falhado
//     (o web-push também recebe o `timeout`, que fecha o socket; o
//     Promise.race é a rede para o caso de o socket não respeitar);
//   - as subscrições do mesmo atleta vão em paralelo (allSettled): uma lenta
//     ou falhada não atrasa nem impede as outras.

export const PUSH_SEND_TIMEOUT_MS = 10_000;

export class PushTimeoutError extends Error {
  constructor(ms: number) {
    super(`Envio de push sem resposta em ${ms} ms`);
    this.name = "PushTimeoutError";
  }
}

/** `work`, ou PushTimeoutError se não acabar em `ms`. Limpa sempre o timer. */
export async function withTimeout<T>(work: Promise<T>, ms = PUSH_SEND_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PushTimeoutError(ms)), ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export type PushSendResult<S> = { sub: S; ok: true } | { sub: S; ok: false; error: unknown };

/**
 * Envia a todas as subscrições em paralelo, cada uma com o seu prazo, e
 * devolve o resultado de cada uma pela mesma ordem. Nunca rejeita: quem
 * chama trata as falhas (404/410 → apagar a subscrição, resto → log).
 */
export async function sendToAllWithTimeout<S>(
  subs: readonly S[],
  send: (sub: S) => Promise<unknown>,
  ms = PUSH_SEND_TIMEOUT_MS,
): Promise<PushSendResult<S>[]> {
  const settled = await Promise.allSettled(
    // `Promise.resolve().then` apanha também um `send` que lança antes de
    // devolver a promessa.
    subs.map((sub) => withTimeout(Promise.resolve().then(() => send(sub)), ms)),
  );
  return settled.map((r, i) =>
    r.status === "fulfilled" ? { sub: subs[i], ok: true } : { sub: subs[i], ok: false, error: r.reason }
  );
}

/** O código HTTP de um erro do web-push (WebPushError.statusCode), se houver. */
export function pushErrorStatus(error: unknown): number | undefined {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" ? status : undefined;
}

/** 404/410: o serviço de push diz que a subscrição já não existe — apaga-se. */
export function isGonePushError(error: unknown): boolean {
  const status = pushErrorStatus(error);
  return status === 404 || status === 410;
}
