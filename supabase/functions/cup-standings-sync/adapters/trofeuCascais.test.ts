import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  checkRobots,
  decodeEntities,
  fetchTrofeuPage,
  parseRoundPage,
  parseStandingsPage,
  TROFEU_CATEGORY_CODES,
  TROFEU_POINTS_TABLE,
  TROFEU_ROBOTS_URL,
  TROFEU_USER_AGENT,
  trofeuCanonicalUrl,
  trofeuHttp,
  trofeuUrlKind,
} from "./trofeuCascais.ts";
import { iisErrorHtml, renderRoundHtml, renderStandingsHtml } from "./trofeuCascais.testhtml.ts";
import { checkRoundPage, checkStandingsPage } from "../../_shared/formulas/cupResults.ts";
import {
  comLinhaDaPropria,
  paginaErro,
  semColuna,
  SINT_GERAL_PAGE,
  SINT_J1_PAGE,
  sintRoundCtx,
  sintStandingsCtx,
} from "../../_shared/formulas/cupResults.fixtures.ts";
import { CASCAIS_REG_CATEGORIES, CASCAIS_REG_POINTS_TABLE } from "../../_shared/formulas/cup.fixtures.ts";

/* O adaptador do site do Troféu (specs/trofeu.md §7; fase 4, A). As páginas
   são SINTÉTICAS: renderizadas à mão (trofeuCascais.testhtml.ts) a partir
   das fixtures do pacote 1, com a estrutura do site. */

// ── Parse ───────────────────────────────────────────────────────────────

Deno.test("parseRoundPage: ida e volta — parse(render(J1 sintética)) = J1, com e sem entidades", () => {
  assertEquals(parseRoundPage(renderRoundHtml(SINT_J1_PAGE)), SINT_J1_PAGE);
  assertEquals(parseRoundPage(renderRoundHtml(SINT_J1_PAGE, { entities: false })), SINT_J1_PAGE);
  // E a validação passa sobre o que o parse leu.
  assertEquals(checkRoundPage(parseRoundPage(renderRoundHtml(SINT_J1_PAGE)), sintRoundCtx()).ok, true);
});

Deno.test("parseStandingsPage: ida e volta — parse(render(geral sintética)) = geral", () => {
  assertEquals(parseStandingsPage(renderStandingsHtml(SINT_GERAL_PAGE)), SINT_GERAL_PAGE);
  assertEquals(parseStandingsPage(renderStandingsHtml(SINT_GERAL_PAGE, { entities: false })), SINT_GERAL_PAGE);
  assertEquals(checkStandingsPage(parseStandingsPage(renderStandingsHtml(SINT_GERAL_PAGE)), sintStandingsCtx()).ok, true);
});

Deno.test("parseRoundPage: colunas por nome — outra ordem e uma coluna a mais dão o mesmo", () => {
  const trocada = renderRoundHtml(SINT_J1_PAGE, { columns: ["time", "category", "nac", "club", "name", "bib", "pos"], extraColumn: true });
  assertEquals(parseRoundPage(trocada), SINT_J1_PAGE);
});

Deno.test("parseRoundPage: uma coluna em falta vai para missingColumns (e a validação pára)", () => {
  const p = parseRoundPage(renderRoundHtml(semColuna(SINT_J1_PAGE, "marca")));
  assertEquals(p.tables[0].missingColumns, ["marca"]);
  assertEquals(p.tables[1].missingColumns, []);
  assertEquals(checkRoundPage(p, sintRoundCtx()).failures.includes("colunas"), true);
});

Deno.test("parseRoundPage: a distância do <h5> vale para as tabelas seguintes; o género sai de '(Masculino)'", () => {
  const p = parseRoundPage(renderRoundHtml(SINT_J1_PAGE));
  assertEquals(p.tables.map((t) => `${t.distanceM}${t.gender}`), [
    "6300M", "3300F", "3300M", "1900F", "1900M", "1100F", "1100M", "400F", "400M",
  ]);
  assertEquals([p.date, p.raceName, p.errorPage], ["2026-12-06", "PADROEIRA SINTÉTICA", false]);
});

Deno.test("parse: <script>, comentários e atributos não são texto; entidades e &nbsp; descodificam", () => {
  // O invólucro tem uma "tabela" dentro de um <script> e de um comentário: não contam.
  assertEquals(parseRoundPage(renderRoundHtml(SINT_J1_PAGE)).tables.length, 9);
  assertEquals(decodeEntities("Escal&#227;o &#xE7; &amp; A&nbsp;B &Aacute;gua &naoexiste; &#0;"), "Escalão ç & A B Água &naoexiste; �");
  const html = `<html><head><title>X&#160;-&#160;Resultados</title></head><body><p>01-02-2027</p>
    <h5>1.900&nbsp;metros - Series</h5><span>1&#170; S&#233;rie F (Feminino)</span>
    <table><tr><th>Pos</th><th>Dorsal</th><th>Nome</th><th>Clube</th><th>Escal&#227;o</th><th>Marca</th></tr>
    <tr><td>1</td><td>&nbsp;9001&nbsp;</td><td>Terceiro&nbsp;Sint&#233;tico<br/>01</td><td><img alt="Nome no atributo"/>ABC</td><td>F40</td><td>10:00</td></tr></table></body></html>`;
  const p = parseRoundPage(html);
  assertEquals(p.title, "X - Resultados");
  assertEquals(p.tables[0].distanceM, 1900);
  assertEquals(p.tables[0].rows[0], { pos: "1", bib: "9001", name: "Terceiro Sintético 01", club: "ABC", category: "F40", time: "10:00" });
});

Deno.test("parse: a página de erro do IIS (servida com 200) é errorPage, nas duas", () => {
  assertEquals(parseRoundPage(iisErrorHtml()).errorPage, true);
  assertEquals(parseStandingsPage(iisErrorHtml()).errorPage, true);
  assertEquals(parseRoundPage(renderRoundHtml(paginaErro(SINT_J1_PAGE))).errorPage, true);
  // Uma prova inexistente no site: título " - Resultados", sem tabelas nem data → a validação pára.
  const vazia = parseRoundPage("<html><head><title> - Resultados</title></head><body><p>RESULTADOS</p></body></html>");
  assertEquals([vazia.raceName, vazia.date, vazia.tables.length], [null, null, 0]);
  const c = checkRoundPage(vazia, sintRoundCtx());
  assert(c.failures.includes("sem_tabelas") && c.failures.includes("data_da_pagina"));
});

Deno.test("parse: nunca lança, nem com lixo", () => {
  for (const s of ["", "<", "<<table", "<table><tr><td>1", "<td>solta</td>", "<a href=\"x", "\u0000<table>&#99999999;</table>", "<!-- sem fim"]) {
    parseRoundPage(s);
    parseStandingsPage(s);
  }
});

Deno.test("parseStandingsPage: o escalão sai do <h5> antes da tabela; P1..PN pela ordem; legenda", () => {
  const g = parseStandingsPage(renderStandingsHtml(SINT_GERAL_PAGE));
  assertEquals(g.seasonLabel, "2026/2027");
  assertEquals(g.legend, [
    { k: 1, name: "PADROEIRA SINTÉTICA", dayMonth: "06-12" },
    { k: 2, name: "CORTA-MATO SINTÉTICO", dayMonth: "10-01" },
  ]);
  assertEquals(g.tables.slice(0, 3).map((t) => `${t.category}|${t.gender}|${t.pCount}`), ["Sub-12|M|11", "Sub-12|F|11", "Sub-14|M|11"]);
});

// ── Links ───────────────────────────────────────────────────────────────

Deno.test("trofeuUrlKind / trofeuCanonicalUrl: só os formatos de CUP_ADAPTER_URLS; sem www, sem barra", () => {
  assertEquals(trofeuUrlKind("https://trofeuatletismocascais.pt/Resultados/727"), "jornada");
  assertEquals(trofeuUrlKind("https://www.trofeuatletismocascais.pt/Trofeu/17/"), "geral");
  assertEquals(trofeuUrlKind("http://trofeuatletismocascais.pt/Resultados/727"), null);
  assertEquals(trofeuUrlKind("https://outro.pt/Resultados/727"), null);
  assertEquals(trofeuUrlKind(null), null);
  assertEquals(trofeuCanonicalUrl(" https://WWW.trofeuatletismocascais.pt/resultados/0727/ "), "https://trofeuatletismocascais.pt/Resultados/727");
  assertEquals(trofeuCanonicalUrl("https://trofeuatletismocascais.pt/Trofeu/17"), "https://trofeuatletismocascais.pt/Trofeu/17");
});

// ── Pedidos ─────────────────────────────────────────────────────────────

interface Call { url: string; method: string; ua: string | null; accept: string | null; redirect: string | undefined }

function fakeHttp(handler: (url: string, init: RequestInit) => Response | Promise<Response>, over: Parameters<typeof trofeuHttp>[0] = {}) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  let clock = 1_000_000;
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    calls.push({ url: String(input), method: init?.method ?? "GET", ua: h.get("user-agent"), accept: h.get("accept"), redirect: init?.redirect });
    return Promise.resolve().then(() => handler(String(input), init ?? {}));
  }) as typeof fetch;
  const deps = trofeuHttp({
    fetchImpl,
    now: () => clock,
    sleep: (ms) => {
      sleeps.push(ms);
      clock += ms;
      return Promise.resolve();
    },
    ...over,
  });
  return { deps, calls, sleeps, advance: (ms: number) => (clock += ms) };
}

const html = (body: string, status = 200, type = "text/html; charset=utf-8") =>
  new Response(body, { status, headers: { "content-type": type } });

const J = "https://trofeuatletismocascais.pt/Resultados/901";

Deno.test("fetchTrofeuPage: 200 text/html → ok; só GET, sem seguir redirecionamentos, com o User-Agent", async () => {
  const f = fakeHttp(() => html(renderRoundHtml(SINT_J1_PAGE)));
  const r = await fetchTrofeuPage(J, f.deps);
  assert(r.ok);
  assertEquals(parseRoundPage(r.html), SINT_J1_PAGE);
  assertEquals(f.calls, [{ url: J, method: "GET", ua: TROFEU_USER_AGENT, accept: "text/html", redirect: "manual" }]);
});

Deno.test("fetchTrofeuPage: 3xx e 5xx → http; application/json → tipo; > 3 MB → tamanho; timeout → rede", async () => {
  const cases: [Response | (() => Promise<Response>), string, number | null][] = [
    [new Response(null, { status: 302, headers: { location: "https://trofeuatletismocascais.pt/Erro" } }), "http", 302],
    [html("erro", 500), "http", 500],
    [html("{}", 200, "application/json"), "tipo", 200],
    [html("x".repeat(10), 200), "ok", null],
  ];
  for (const [res, code, status] of cases) {
    const f = fakeHttp(() => (typeof res === "function" ? res() : res));
    const r = await fetchTrofeuPage(J, f.deps);
    if (code === "ok") assert(r.ok);
    else assertEquals(r.ok ? null : [r.code as string, r.status], [code, status]);
  }
  // 3,1 MB em stream (sem content-length): pára de ler acima dos 3 MB.
  let sent = 0;
  const big = fakeHttp(() =>
    new Response(
      new ReadableStream<Uint8Array>({
        pull(c) {
          if (sent >= 3.1 * 1024 * 1024) c.close();
          else {
            c.enqueue(new Uint8Array(64 * 1024).fill(60));
            sent += 64 * 1024;
          }
        },
      }),
      { headers: { "content-type": "text/html" } },
    )
  );
  const rb = await fetchTrofeuPage(J, big.deps);
  assertEquals(!rb.ok && rb.code, "tamanho");
  assert(sent <= 3.1 * 1024 * 1024 + 64 * 1024);
  // content-length acima do limite: nem se lê.
  const declared = fakeHttp(() => new Response("x", { headers: { "content-type": "text/html", "content-length": String(4 * 1024 * 1024) } }));
  assertEquals((await fetchTrofeuPage(J, declared.deps) as { code?: string }).code, "tamanho");
  // Sem resposta: o timeout aborta o pedido → rede.
  const hang = fakeHttp((_u, init) =>
    new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("abortado", "AbortError"))))
  , { timeoutMs: 15 });
  const rh = await fetchTrofeuPage(J, hang.deps);
  assertEquals(!rh.ok && rh.code, "rede");
  const rejects = fakeHttp(() => Promise.reject(new TypeError("dns")));
  assertEquals((await fetchTrofeuPage(J, rejects.deps) as { code?: string }).code, "rede");
});

Deno.test("fetchTrofeuPage: link de outro sítio → 'url' SEM pedido; www fica sem www", async () => {
  const f = fakeHttp(() => html("<html></html>"));
  for (const u of ["https://outro.pt/Resultados/1", "http://trofeuatletismocascais.pt/Resultados/1", "https://trofeuatletismocascais.pt/Default.aspx"]) {
    const r = await fetchTrofeuPage(u, f.deps);
    assertEquals(!r.ok && r.code, "url");
  }
  assertEquals(f.calls.length, 0);
  await fetchTrofeuPage("https://www.trofeuatletismocascais.pt/Resultados/901/", f.deps);
  assertEquals(f.calls.map((c) => c.url), [J]);
});

Deno.test("fetchTrofeuPage: ≥ 1,5 s entre pedidos; máximo de páginas e orçamento de tempo → 'orcamento' sem pedido", async () => {
  const f = fakeHttp(() => html("<html></html>"), { maxPages: 2, budgetMs: 60_000 });
  await fetchTrofeuPage(J, f.deps);
  await fetchTrofeuPage(J, f.deps);
  assertEquals(f.sleeps, [1500]);
  const r = await fetchTrofeuPage(J, f.deps);
  assertEquals([!r.ok && r.code, f.calls.length], ["orcamento", 2]);
  const t = fakeHttp(() => html("<html></html>"), { budgetMs: 1000 });
  t.advance(1000);
  assertEquals((await fetchTrofeuPage(J, t.deps) as { code?: string }).code, "orcamento");
  assertEquals(t.calls.length, 0);
});

Deno.test("checkRobots: 404 livre; Disallow que cobre /Resultados ou /Trofeu → proibido; 500 → erro; uma vez por volta", async () => {
  const verdict = async (res: () => Response | Promise<Response>) => {
    const f = fakeHttp(res);
    const v = await checkRobots(f.deps);
    await checkRobots(f.deps);
    assertEquals(f.calls.length, 1);
    assertEquals([f.calls[0].url, f.calls[0].ua, f.calls[0].method], [TROFEU_ROBOTS_URL, TROFEU_USER_AGENT, "GET"]);
    return v;
  };
  const txt = (s: string) => () => new Response(s, { headers: { "content-type": "text/plain" } });
  assertEquals(await verdict(() => html("não há", 404)), "livre");
  assertEquals(await verdict(txt("User-agent: *\nDisallow: /Resultados")), "proibido");
  assertEquals(await verdict(txt("User-agent: *\nDisallow: /")), "proibido");
  assertEquals(await verdict(txt("User-agent: *\nDisallow: /Admin\nDisallow:\n")), "livre");
  assertEquals(await verdict(txt("User-agent: GoogleBot\nDisallow: /\n\nUser-agent: *\nAllow: /")), "livre");
  assertEquals(await verdict(txt("User-agent: IronCoach-classificacao\nDisallow: /Trofeu/\n")), "proibido");
  assertEquals(await verdict(txt("User-agent: *\nDisallow: /\nAllow: /Resultados/\nAllow: /Trofeu/")), "livre");
  assertEquals(await verdict(txt("User-agent: *\nDisallow: /*/1$")), "proibido");
  assertEquals(await verdict(() => html("erro", 500)), "erro");
  assertEquals(await verdict(() => new Response(null, { status: 301, headers: { location: "/x" } })), "erro");
  assertEquals(await verdict(() => Promise.reject(new TypeError("rede"))), "erro");
});

// ── Constantes e higiene ────────────────────────────────────────────────

Deno.test("os 32 códigos e a tabela de pontos do adaptador são os do seed da M2 e do regulamento", () => {
  assertEquals([...TROFEU_CATEGORY_CODES].sort(), CASCAIS_REG_CATEGORIES.map((c) => c.code).sort());
  assertEquals([...TROFEU_POINTS_TABLE], CASCAIS_REG_POINTS_TABLE);
});

Deno.test("o adaptador não escreve na consola (nem com dados, nem sem)", async () => {
  const src = await Deno.readTextFile(new URL("./trofeuCascais.ts", import.meta.url));
  assertEquals(/console\s*\./.test(src), false);
});

Deno.test("a linha da própria com o clube só no atributo da imagem: o parse lê o texto, não o atributo", () => {
  const p = parseRoundPage(renderRoundHtml(comLinhaDaPropria(SINT_J1_PAGE, { club: "" })));
  const row = p.tables.flatMap((t) => t.rows).find((r) => r.bib === "0412");
  assertEquals(row?.club, "");
});
