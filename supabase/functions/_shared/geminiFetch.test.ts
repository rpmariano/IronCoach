import { assertEquals } from "jsr:@std/assert@1";
import { assertCarolVoice } from "./carolTone.ts";
import { COACH_BUDGET_MS, EXTRACTION_BUDGET_MS, fetchGeminiWithTimeout, hasTimeFor, requestDeadlines } from "./geminiFetch.ts";

// ── fetchGeminiWithTimeout: o Gemini "ocupado" (incidente 2026-09-24) ──────
// Três análises seguidas falharam com 503 em ~5 s: só havia uma repetição,
// 1,5 s depois, em todas as funções de registo. Estes testes simulam o
// fetch e usam esperas de 1 ms.
async function withFetch(statuses: number[], run: (calls: () => number) => Promise<void>) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    const status = statuses[Math.min(calls, statuses.length - 1)];
    calls++;
    return Promise.resolve(new Response(status === 200 ? "{}" : "ocupado", { status }));
  }) as typeof fetch;
  try {
    await run(() => calls);
  } finally {
    globalThis.fetch = original;
  }
}

Deno.test("fetchGeminiWithTimeout: 503 repete com espera e acaba por passar", async () => {
  await withFetch([503, 503, 200], async (calls) => {
    const res = await fetchGeminiWithTimeout("https://gemini.test", {}, 1000, 1, Number.POSITIVE_INFINITY, [1, 1, 1]);
    assertEquals(res.status, 200);
    assertEquals(calls(), 3);
  });
});

Deno.test("fetchGeminiWithTimeout: sempre ocupado, desiste ao fim das esperas e devolve o 503", async () => {
  await withFetch([503], async (calls) => {
    const res = await fetchGeminiWithTimeout("https://gemini.test", {}, 1000, 1, Number.POSITIVE_INFINITY, [1, 1, 1]);
    assertEquals(res.status, 503);
    assertEquals(calls(), 4);
  });
});

Deno.test("fetchGeminiWithTimeout: sem tempo antes do prazo, não repete", async () => {
  await withFetch([503, 200], async (calls) => {
    const res = await fetchGeminiWithTimeout("https://gemini.test", {}, 1000, 1, Date.now() + 2000, [1, 1, 1]);
    assertEquals(res.status, 503);
    assertEquals(calls(), 1);
  });
});

Deno.test("fetchGeminiWithTimeout: 429 e 400 não se repetem", async () => {
  for (const status of [429, 400]) {
    await withFetch([status, 200], async (calls) => {
      const res = await fetchGeminiWithTimeout("https://gemini.test", {}, 1000, 1, Number.POSITIVE_INFINITY, [1, 1, 1]);
      assertEquals(res.status, status);
      assertEquals(calls(), 1);
    });
  }
});

Deno.test("prazos: a leitura acaba antes do comentário, e os dois cabem nos 130 s da app", () => {
  const d = requestDeadlines(0);
  assertEquals(d.extraction, EXTRACTION_BUDGET_MS);
  assertEquals(d.coach, COACH_BUDGET_MS);
  assertEquals(EXTRACTION_BUDGET_MS < COACH_BUDGET_MS, true);
  // Folga para o arranque a frio, o envio das imagens e as gravações.
  assertEquals(COACH_BUDGET_MS + 30000 <= 130000, true);
});

Deno.test("hasTimeFor: só com tempo para uma tentativa útil", () => {
  assertEquals(hasTimeFor(10000, 0), true);
  assertEquals(hasTimeFor(7999, 0), false);
});

// ── Falha de rede vs tempo (revisão pré-deploy de bdc93cf) ─────────────────
Deno.test("fetchGeminiWithTimeout: uma falha de rede rápida repete uma vez, mesmo com retries a 0", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    calls++;
    return calls === 1 ? Promise.reject(new TypeError("connection reset")) : Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;
  try {
    const res = await fetchGeminiWithTimeout("https://gemini.test", {}, 1000, 0, Number.POSITIVE_INFINITY, [1, 1, 1]);
    assertEquals(res.status, 200);
    assertEquals(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("fetchGeminiWithTimeout: por tempo, com retries a 0, não repete e diz que demorou", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    calls++;
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  }) as typeof fetch;
  try {
    let message = "";
    // O limite de cada tentativa tem um mínimo de 8 s (GEMINI_MIN_ATTEMPT_MS):
    // um prazo curto não o encurta abaixo disso — espera-se por ele.
    try { await fetchGeminiWithTimeout("https://gemini.test", {}, 10, 0, Number.POSITIVE_INFINITY, [1, 1, 1]); } catch (e) { message = (e as Error).message; }
    assertEquals(calls, 1);
    assertEquals(message.startsWith("Não consegui responder a tempo."), true);
    assertCarolVoice(message);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("fetchGeminiWithTimeout: rede sempre em baixo — duas tentativas e a mensagem certa", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => { calls++; return Promise.reject(new TypeError("dns")); }) as typeof fetch;
  try {
    let message = "";
    try { await fetchGeminiWithTimeout("https://gemini.test", {}, 1000, 0, Number.POSITIVE_INFINITY, [1, 1, 1]); } catch (e) { message = (e as Error).message; }
    assertEquals(calls, 2);
    assertEquals(message, "Não consegui ligar-me ao serviço de análise (mesmo depois de tentar de novo). Tenta outra vez daqui a pouco.");
    assertCarolVoice(message);
  } finally {
    globalThis.fetch = original;
  }
});
