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
   lança um erro claro se nem chegou a haver resposta. */

export const GEMINI_RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
export const GEMINI_BUSY_BACKOFF_MS: readonly number[] = [2000, 4000, 7000];
/** Repetições de uma falha de rede rápida (não de tempo), sempre. */
export const GEMINI_NETWORK_RETRIES = 1;
/** Uma tentativa útil (uma leitura de prints demora ~5–10 s). */
export const GEMINI_MIN_ATTEMPT_MS = 8000;

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

export async function fetchGeminiWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  retries: number,
  deadline = Number.POSITIVE_INFINITY,
  // Injetável para os testes não esperarem segundos a sério.
  backoffMs: readonly number[] = GEMINI_BUSY_BACKOFF_MS,
): Promise<Response> {
  let busyRetries = 0;
  let timeoutRetries = 0;
  let networkRetries = 0;
  const fits = (waitMs: number) => Date.now() + waitMs + GEMINI_MIN_ATTEMPT_MS <= deadline;
  for (;;) {
    const controller = new AbortController();
    const limit = Math.max(GEMINI_MIN_ATTEMPT_MS, Math.min(timeoutMs, deadline - Date.now()));
    const timer = setTimeout(() => controller.abort(), limit);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
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
      if (timedOut ? timeoutRetries < retries : networkRetries < GEMINI_NETWORK_RETRIES) {
        if (fits(0)) {
          if (timedOut) timeoutRetries++;
          else networkRetries++;
          continue;
        }
      }
      const tried = timeoutRetries + networkRetries > 0 ? " (mesmo depois de tentar de novo)" : "";
      throw new Error(timedOut
        ? `O Gemini demorou demasiado tempo a responder${tried}. Tenta outra vez daqui a pouco.`
        : `Não consegui contactar o Gemini${tried}. Tenta outra vez daqui a pouco.`);
    }
  }
}
