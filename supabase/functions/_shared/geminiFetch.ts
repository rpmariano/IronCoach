/* O pedido ao Gemini, com as repetições e o prazo partilhados por todas as
   funções de registo (corrida, refeição, ginásio, corpo, diploma).

   Porquê (incidente 2026-09-24): num pico de 503 ("This model is currently
   experiencing high demand") de vários minutos, cada função repetia uma vez,
   1,5 s depois, e desistia em ~5 s. E, sem prazo, o pior caso passava o que a
   app espera pela resposta: a app desistia, o servidor acabava por gravar o
   registo, e o "Tentar de novo" gravava-o outra vez.

   Dois tipos de repetição:
   - "ocupado" (GEMINI_RETRYABLE_STATUSES): até GEMINI_BUSY_BACKOFF_MS.length
     vezes, com esperas crescentes. O 429 (limite de pedidos) fica de fora de
     propósito: repetir logo a seguir só volta a bater no mesmo limite.
   - sem resposta por tempo (o nosso limite): até `retries` vezes, logo a
     seguir. O chat passa 0 — recomeçar do zero uma resposta lenta só a
     volta a cortar;
   - falha de rede rápida (ligação cortada, TLS): uma vez, logo a seguir,
     mesmo com `retries` a 0 — não é lentidão, é azar, e costuma passar à
     segunda (revisão pré-deploy de bdc93cf).
   Nenhuma repetição começa se já não couber uma tentativa útil antes de
   `deadline` (epoch ms), e o limite de cada tentativa encolhe para lá caber.
   Ao fim, devolve a resposta como veio (o chamador decide a mensagem) ou
   lança um erro claro se nem chegou a haver resposta.

   Pedido em paralelo (`hedgeAfterMs`, incidente 2026-10-12): o Gemini às
   vezes deixa um pedido pendurado — não responde, mas um pedido igual,
   feito logo a seguir, responde em 5–15 s. Esperava-se 40 s pela primeira
   tentativa e a segunda só tinha os 20 s que sobravam dos 60 da leitura:
   três análises falharam ao minuto num dia, e todas passaram quando o
   atleta tentou outra vez. Agora, sem resposta ao fim de `hedgeAfterMs`,
   sai um segundo pedido igual sem cancelar o primeiro; fica o primeiro que
   responder bem, e o outro é cancelado. Só os pedidos lentos pagam a dobrar
   (o Gemini pode cobrar o cancelado, que o ai_usage não vê). Desligado por
   omissão: o coach-chat tem respostas legitimamente longas e pagava quase
   sempre duas; as funções de registo ligam-no (GEMINI_HEDGE_AFTER_MS). */

export const GEMINI_RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
export const GEMINI_BUSY_BACKOFF_MS: readonly number[] = [2000, 4000, 7000];
/** Repetições de uma falha de rede rápida (não de tempo), sempre. */
export const GEMINI_NETWORK_RETRIES = 1;
/** Uma tentativa útil (uma leitura de prints demora ~5–10 s). */
export const GEMINI_MIN_ATTEMPT_MS = 8000;
/** Sem resposta ao fim disto, as funções de registo pedem outra vez em
 *  paralelo. Uma análise inteira (leitura + comentário) costuma levar 4–18 s. */
export const GEMINI_HEDGE_AFTER_MS = 15000;

/* Prazos de um pedido de registo, contados desde que ele chega. Têm de
   caber, com folga para o arranque a frio e o envio das imagens, no que a
   app espera (ANALYZE_TIMEOUT_MS em src/lib/edgeTimeouts.js, 130 s). A
   leitura tem prazo mais curto porque a gravação e o comentário da Carol
   ainda vêm depois; o comentário é best-effort e, sem tempo para uma
   tentativa útil, nem começa (hasTimeFor). */
export const EXTRACTION_BUDGET_MS = 60000;
export const COACH_BUDGET_MS = 88000;

export function requestDeadlines(startedAt = Date.now()) {
  return { extraction: startedAt + EXTRACTION_BUDGET_MS, coach: startedAt + COACH_BUDGET_MS };
}

/** Ainda cabe uma tentativa útil antes do prazo? */
export function hasTimeFor(deadline: number, now = Date.now()): boolean {
  return now + GEMINI_MIN_ATTEMPT_MS <= deadline;
}

/** O que dizer quando o Gemini continuou ocupado depois das repetições. */
export function geminiBusyMessage(what: string): string {
  return `Estou com muita procura neste momento e não consegui ${what}, mesmo depois de tentar de novo. Tenta outra vez daqui a um minuto.`;
}

/** Um pedido, e — sem resposta ao fim de `hedgeAfterMs` — um segundo igual
 *  em paralelo. Ganha o primeiro que responda com sucesso; uma resposta de
 *  erro (ou falha de rede) só se devolve quando não há outro pedido em curso
 *  que ainda possa responder bem. `signal` (o limite da tentativa) cancela
 *  os dois. */
export function hedgedFetch(
  url: string,
  options: RequestInit,
  signal: AbortSignal,
  hedgeAfterMs: number,
): Promise<Response> {
  if (!Number.isFinite(hedgeAfterMs)) return fetch(url, { ...options, signal });
  return new Promise<Response>((resolve, reject) => {
    const controllers: AbortController[] = [];
    let pending = 0;
    let settled = false;
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
    // A resposta de erro guardada enquanto o outro pedido ainda corre.
    let errorRes: { res: Response; c: AbortController } | null = null;
    const abortAll = () => controllers.forEach((c) => c.abort());
    signal.addEventListener("abort", abortAll, { once: true });
    const settle = (winner: AbortController | null, outcome: () => void) => {
      settled = true;
      clearTimeout(hedgeTimer);
      signal.removeEventListener("abort", abortAll);
      for (const c of controllers) if (c !== winner) c.abort();
      outcome();
    };
    const launch = (hedge: boolean) => {
      const c = new AbortController();
      controllers.push(c);
      if (signal.aborted) c.abort();
      pending++;
      fetch(url, { ...options, signal: c.signal }).then(
        (res) => {
          pending--;
          if (settled) {
            res.body?.cancel().catch(() => {});
            return;
          }
          if (res.ok || pending === 0) {
            if (hedge && res.ok) console.warn(`[gemini] o pedido em paralelo respondeu primeiro (o original passou de ${hedgeAfterMs} ms)`);
            if (errorRes) errorRes.res.body?.cancel().catch(() => {});
            settle(c, () => resolve(res));
            return;
          }
          // Erro com o outro ainda em curso: guarda-o e espera pelo outro.
          errorRes = { res, c };
        },
        (err) => {
          pending--;
          if (settled || pending > 0) return;
          // Os dois acabaram: um erro HTTP diz mais do que uma falha de rede.
          const kept = errorRes;
          if (kept) settle(kept.c, () => resolve(kept.res));
          else settle(null, () => reject(err));
        },
      );
    };
    launch(false);
    hedgeTimer = setTimeout(() => {
      if (settled || signal.aborted) return;
      console.warn(`[gemini] sem resposta em ${hedgeAfterMs} ms; segundo pedido em paralelo`);
      launch(true);
    }, hedgeAfterMs);
  });
}

export async function fetchGeminiWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  retries: number,
  deadline = Number.POSITIVE_INFINITY,
  // Injetável para os testes não esperarem segundos a sério.
  backoffMs: readonly number[] = GEMINI_BUSY_BACKOFF_MS,
  // Ver "Pedido em paralelo" acima; infinito = desligado.
  hedgeAfterMs = Number.POSITIVE_INFINITY,
): Promise<Response> {
  let busyRetries = 0;
  let timeoutRetries = 0;
  let networkRetries = 0;
  const fits = (waitMs: number) => Date.now() + waitMs + GEMINI_MIN_ATTEMPT_MS <= deadline;
  for (;;) {
    const attemptStartedAt = Date.now();
    const controller = new AbortController();
    const limit = Math.max(GEMINI_MIN_ATTEMPT_MS, Math.min(timeoutMs, deadline - Date.now()));
    const timer = setTimeout(() => controller.abort(), limit);
    try {
      const res = await hedgedFetch(url, options, controller.signal, hedgeAfterMs);
      clearTimeout(timer);
      if (!res.ok && GEMINI_RETRYABLE_STATUSES.has(res.status) && busyRetries < backoffMs.length) {
        const wait = backoffMs[busyRetries];
        if (fits(wait)) {
          busyRetries++;
          console.warn(`Gemini ocupado (${res.status}); nova tentativa daqui a ${wait} ms (${busyRetries}/${backoffMs.length})`);
          try { await res.body?.cancel(); } catch (_) { /* nada a libertar */ }
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
      }
      return res;
    } catch (_e) {
      clearTimeout(timer);
      const timedOut = controller.signal.aborted;
      // Só a falha de rede RÁPIDA se repete sempre: uma ligação que cai ao
      // fim de 90 s é lentidão com outro nome, e repeti-la gastava o resto
      // do prazo (revisão pré-deploy de fe3df94).
      const fastNetworkFailure = !timedOut && Date.now() - attemptStartedAt < GEMINI_MIN_ATTEMPT_MS;
      if (timedOut ? timeoutRetries < retries : (fastNetworkFailure && networkRetries < GEMINI_NETWORK_RETRIES)) {
        if (fits(0)) {
          if (timedOut) timeoutRetries++;
          else networkRetries++;
          continue;
        }
      }
      const tried = timeoutRetries + networkRetries > 0 ? " (mesmo depois de tentar de novo)" : "";
      throw new Error(timedOut
        ? `Não consegui responder a tempo${tried}. Tenta outra vez daqui a pouco.`
        : `Não consegui ligar-me ao serviço de análise${tried}. Tenta outra vez daqui a pouco.`);
    }
  }
}
