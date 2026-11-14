// Testes do guarda anti-SSRF (auditoria de segurança, 2026-11-14 — item M3).
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  assertPublicUrl,
  checkUrlSyntax,
  type DnsResolver,
  isBlockedHostname,
  isBlockedIp,
  parseIpv6,
  safeFetch,
  SafeFetchError,
} from "./safeFetch.ts";

/** Resolver falso: nome → { A, AAAA }; nome desconhecido → erro (como o NotFound do Deno). */
function fakeResolver(table: Record<string, { A?: string[]; AAAA?: string[] }>) {
  const calls: string[] = [];
  const impl: DnsResolver = (hostname, type) => {
    calls.push(`${type} ${hostname}`);
    const rec = table[hostname]?.[type];
    if (!rec || rec.length === 0) return Promise.reject(new Error("NotFound"));
    return Promise.resolve(rec);
  };
  return { impl, calls };
}

/** fetch falso: URL → resposta; regista os pedidos e o modo de redirect. */
function fakeFetch(routes: Record<string, { status: number; location?: string; body?: string }>) {
  const calls: Array<{ url: string; redirect?: RequestRedirect }> = [];
  const impl = ((input: string | URL | Request, init?: RequestInit) => {
    const url = input.toString();
    calls.push({ url, redirect: init?.redirect });
    const r = routes[url];
    if (!r) return Promise.reject(new TypeError(`sem rota para ${url}`));
    const headers = new Headers({ "content-type": "text/html" });
    if (r.location) headers.set("location", r.location);
    return Promise.resolve(new Response(r.body ?? "", { status: r.status, headers }));
  }) as typeof fetch;
  return { impl, calls };
}

const PUBLIC_DNS = { "prova.pt": { A: ["93.184.216.34"], AAAA: ["2606:2800:220:1:248:1893:25c8:1946"] } };

async function rejectsWith(p: Promise<unknown>, reason: string) {
  const err = await assertRejects(() => p, SafeFetchError);
  assertEquals(err.reason, reason);
}

// ---------------------------------------------------------------------------
// isBlockedIp
// ---------------------------------------------------------------------------

Deno.test("isBlockedIp: IPv4 privados e reservados são recusados", () => {
  for (
    const ip of [
      "10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255", "192.168.1.1",
      "127.0.0.1", "127.255.255.254", "0.0.0.0", "0.1.2.3", "169.254.169.254", "169.254.0.1",
      "100.64.0.1", "100.127.255.255", "224.0.0.1", "239.255.255.250", "240.0.0.1",
      "255.255.255.255", "192.0.2.1", "198.18.0.1", "198.51.100.7", "203.0.113.9", "192.0.0.8",
    ]
  ) {
    assertEquals(isBlockedIp(ip), true, ip);
  }
});

Deno.test("isBlockedIp: IPv4 públicos passam, incluindo os vizinhos das redes privadas", () => {
  for (
    const ip of [
      "8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.255.255", "172.32.0.1",
      "100.63.255.255", "100.128.0.1", "169.253.255.255", "192.167.1.1", "223.255.255.255", "11.0.0.1",
    ]
  ) {
    assertEquals(isBlockedIp(ip), false, ip);
  }
});

Deno.test("isBlockedIp: IPv6 privados, loopback, link-local e multicast são recusados", () => {
  for (
    const ip of [
      "::1", "::", "[::1]", "fc00::1", "fd12:3456:789a::1", "fe80::1", "fe80::1%eth0", "febf::1",
      "fec0::1", "ff02::1", "100::1", "2001:db8::1", "2001::1", "2002:7f00:1::1", "3fff::1",
      "0:0:0:0:0:0:0:1",
    ]
  ) {
    assertEquals(isBlockedIp(ip), true, ip);
  }
});

Deno.test("isBlockedIp: IPv4 mapeado em IPv6 decide pelo IPv4", () => {
  assertEquals(isBlockedIp("::ffff:127.0.0.1"), true);
  assertEquals(isBlockedIp("::ffff:7f00:1"), true);
  assertEquals(isBlockedIp("::ffff:10.0.0.1"), true);
  assertEquals(isBlockedIp("::ffff:169.254.169.254"), true);
  assertEquals(isBlockedIp("::ffff:a9fe:a9fe"), true);
  assertEquals(isBlockedIp("0:0:0:0:0:ffff:c0a8:0101"), true);
  assertEquals(isBlockedIp("64:ff9b::10.0.0.1"), true);
  assertEquals(isBlockedIp("::127.0.0.1"), true); // compatível com IPv4 (obsoleto)
  assertEquals(isBlockedIp("::ffff:8.8.8.8"), false);
  assertEquals(isBlockedIp("64:ff9b::8.8.8.8"), false);
});

Deno.test("isBlockedIp: IPv6 globais passam; lixo é recusado (fail closed)", () => {
  assertEquals(isBlockedIp("2606:4700:4700::1111"), false);
  assertEquals(isBlockedIp("2a00:1450:4003:80e::200e"), false);
  assertEquals(isBlockedIp("2001:4860:4860::8888"), false);
  for (const junk of ["", "abc", "1.2.3", "1.2.3.256", "01.2.3.4x", ":::1", "1::2::3", "12345::1", "localhost"]) {
    assertEquals(isBlockedIp(junk), true, junk);
  }
});

Deno.test("parseIpv6: expande :: e IPv4 no fim", () => {
  assertEquals(parseIpv6("::1"), [0, 0, 0, 0, 0, 0, 0, 1]);
  assertEquals(parseIpv6("::ffff:1.2.3.4"), [0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
  assertEquals(parseIpv6("1:2:3:4:5:6:7:8"), [1, 2, 3, 4, 5, 6, 7, 8]);
  assertEquals(parseIpv6("1:2:3:4:5:6:7"), null);
  assertEquals(parseIpv6("1:2:3:4::5:6:7:8"), null);
});

// ---------------------------------------------------------------------------
// isBlockedHostname / checkUrlSyntax
// ---------------------------------------------------------------------------

Deno.test("isBlockedHostname: nomes internos recusados, públicos passam", () => {
  for (
    const h of [
      "localhost", "LOCALHOST", "localhost.", "api.localhost", "metadata.google.internal",
      "foo.internal", "printer.local", "router.lan", "nas.home.arpa", "intranet", "metadata", "",
    ]
  ) {
    assertEquals(isBlockedHostname(h), true, h);
  }
  for (const h of ["prova.pt", "www.maratonadelisboa.com", "sub.dominio.org."]) {
    assertEquals(isBlockedHostname(h), false, h);
  }
});

Deno.test("checkUrlSyntax: só https, porta por omissão, sem credenciais", () => {
  assertEquals(checkUrlSyntax("https://prova.pt/percurso").hostname, "prova.pt");
  assertEquals(checkUrlSyntax("https://prova.pt:443/").port, ""); // 443 explícito = omissão
  const bad: Array<[string, string]> = [
    ["http://prova.pt/", "invalid_url"],
    ["ftp://prova.pt/", "invalid_url"],
    ["file:///etc/passwd", "invalid_url"],
    ["https://prova.pt:8443/", "invalid_url"],
    ["https://prova.pt:80/", "invalid_url"],
    ["https://user:pw@prova.pt/", "invalid_url"],
    ["não é um url", "invalid_url"],
    ["https://localhost/", "blocked"],
    ["https://metadata.google.internal/computeMetadata/v1/", "blocked"],
    ["https://127.0.0.1/", "blocked"],
    ["https://127.1/", "blocked"], // o URL normaliza para 127.0.0.1
    ["https://2130706433/", "blocked"], // idem, decimal
    ["https://0x7f.0.0.1/", "blocked"], // idem, hexadecimal
    ["https://169.254.169.254/latest/meta-data/", "blocked"],
    ["https://10.1.2.3/", "blocked"],
    ["https://[::1]/", "blocked"],
    ["https://[::ffff:127.0.0.1]/", "blocked"],
    ["https://[fd00::1]/", "blocked"],
    ["https://[fe80::1]/", "blocked"],
  ];
  for (const [u, reason] of bad) {
    let got: string | null = null;
    try {
      checkUrlSyntax(u);
    } catch (e) {
      got = e instanceof SafeFetchError ? e.reason : "outro";
    }
    assertEquals(got, reason, u);
  }
});

// ---------------------------------------------------------------------------
// assertPublicUrl (DNS)
// ---------------------------------------------------------------------------

Deno.test("assertPublicUrl: nome que resolve só para IPs públicos passa", async () => {
  const { impl, calls } = fakeResolver(PUBLIC_DNS);
  const url = await assertPublicUrl("https://prova.pt/", impl);
  assertEquals(url.hostname, "prova.pt");
  assertEquals(calls.sort(), ["A prova.pt", "AAAA prova.pt"]);
});

Deno.test("assertPublicUrl: basta um dos registos (só A) desde que seja público", async () => {
  const { impl } = fakeResolver({ "prova.pt": { A: ["93.184.216.34"] } });
  assertEquals((await assertPublicUrl("https://prova.pt/", impl)).hostname, "prova.pt");
});

Deno.test("assertPublicUrl: nome que resolve para IP privado é recusado", async () => {
  const cases: Record<string, { A?: string[]; AAAA?: string[] }> = {
    "a.evil.pt": { A: ["127.0.0.1"] },
    "b.evil.pt": { A: ["169.254.169.254"] },
    "c.evil.pt": { A: ["93.184.216.34", "10.0.0.5"] }, // um privado chega
    "d.evil.pt": { A: ["93.184.216.34"], AAAA: ["::1"] },
    "e.evil.pt": { AAAA: ["::ffff:192.168.0.1"] },
    "f.evil.pt": { AAAA: ["fd00::7"] },
    "g.evil.pt": { A: ["100.100.100.200"] }, // CGNAT
  };
  const { impl } = fakeResolver(cases);
  for (const host of Object.keys(cases)) {
    await rejectsWith(assertPublicUrl(`https://${host}/`, impl), "blocked");
  }
});

Deno.test("assertPublicUrl: DNS a falhar ou sem registos recusa (fail closed)", async () => {
  const { impl } = fakeResolver({ "vazio.pt": { A: [], AAAA: [] } });
  await rejectsWith(assertPublicUrl("https://naoexiste.pt/", impl), "dns");
  await rejectsWith(assertPublicUrl("https://vazio.pt/", impl), "dns");
  const throwing: DnsResolver = () => {
    throw new Error("rede em baixo");
  };
  await rejectsWith(assertPublicUrl("https://prova.pt/", (h, t) => Promise.resolve().then(() => throwing(h, t))), "dns");
});

Deno.test("assertPublicUrl: IP literal público não pergunta ao DNS", async () => {
  const { impl, calls } = fakeResolver({});
  assertEquals((await assertPublicUrl("https://93.184.216.34/", impl)).hostname, "93.184.216.34");
  assertEquals(calls.length, 0);
});

// ---------------------------------------------------------------------------
// safeFetch
// ---------------------------------------------------------------------------

Deno.test("safeFetch: pedido simples usa redirect manual e devolve a resposta", async () => {
  const { impl: resolver } = fakeResolver(PUBLIC_DNS);
  const { impl: fetchFn, calls } = fakeFetch({ "https://prova.pt/": { status: 200, body: "<p>ok</p>" } });
  const res = await safeFetch("https://prova.pt/", { headers: { "User-Agent": "x" } }, { resolver, fetchFn });
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "<p>ok</p>");
  assertEquals(calls, [{ url: "https://prova.pt/", redirect: "manual" }]);
});

Deno.test("safeFetch: segue redirecionamentos públicos (relativos e absolutos)", async () => {
  const { impl: resolver } = fakeResolver({ ...PUBLIC_DNS, "www.prova.pt": { A: ["93.184.216.35"] } });
  const { impl: fetchFn, calls } = fakeFetch({
    "https://prova.pt/": { status: 301, location: "https://www.prova.pt/" },
    "https://www.prova.pt/": { status: 302, location: "/pt/inicio" },
    "https://www.prova.pt/pt/inicio": { status: 200, body: "fim" },
  });
  const res = await safeFetch("https://prova.pt/", {}, { resolver, fetchFn });
  assertEquals(await res.text(), "fim");
  assertEquals(calls.map((c) => c.url), ["https://prova.pt/", "https://www.prova.pt/", "https://www.prova.pt/pt/inicio"]);
  assert(calls.every((c) => c.redirect === "manual"));
});

Deno.test("safeFetch: redirecionamento para host privado é recusado antes do pedido", async () => {
  const { impl: resolver } = fakeResolver({ ...PUBLIC_DNS, "interno.evil.pt": { A: ["10.0.0.1"] } });
  const targets = [
    "https://169.254.169.254/latest/meta-data/",
    "https://127.0.0.1/",
    "https://[::1]/",
    "https://localhost/",
    "https://metadata.google.internal/",
    "https://interno.evil.pt/",
  ];
  for (const target of targets) {
    const { impl: fetchFn, calls } = fakeFetch({ "https://prova.pt/": { status: 302, location: target } });
    await rejectsWith(safeFetch("https://prova.pt/", {}, { resolver, fetchFn }), "blocked");
    assertEquals(calls.length, 1, target); // nunca chegou a pedir o destino
  }
});

Deno.test("safeFetch: redirecionamento para http ou outra porta é recusado (blocked: o endereço do atleta estava certo)", async () => {
  const { impl: resolver } = fakeResolver(PUBLIC_DNS);
  for (const target of ["http://prova.pt/", "https://prova.pt:8080/", "gopher://prova.pt/"]) {
    const { impl: fetchFn, calls } = fakeFetch({ "https://prova.pt/": { status: 307, location: target } });
    await rejectsWith(safeFetch("https://prova.pt/", {}, { resolver, fetchFn }), "blocked");
    assertEquals(calls.length, 1, target);
  }
});

Deno.test("safeFetch: ciclo de redirecionamentos para ao fim de MAX_REDIRECTS", async () => {
  const { impl: resolver } = fakeResolver(PUBLIC_DNS);
  const { impl: fetchFn, calls } = fakeFetch({
    "https://prova.pt/a": { status: 302, location: "/b" },
    "https://prova.pt/b": { status: 302, location: "/a" },
  });
  await rejectsWith(safeFetch("https://prova.pt/a", {}, { resolver, fetchFn }), "too_many_redirects");
  assertEquals(calls.length, 6); // o pedido inicial + 5 redirecionamentos seguidos
});

Deno.test("safeFetch: exatamente MAX_REDIRECTS redirecionamentos ainda chegam ao fim", async () => {
  const { impl: resolver } = fakeResolver(PUBLIC_DNS);
  const routes: Record<string, { status: number; location?: string; body?: string }> = {};
  for (let i = 0; i < 5; i++) routes[`https://prova.pt/${i}`] = { status: 308, location: `/${i + 1}` };
  routes["https://prova.pt/5"] = { status: 200, body: "chegou" };
  const { impl: fetchFn } = fakeFetch(routes);
  const res = await safeFetch("https://prova.pt/0", {}, { resolver, fetchFn });
  assertEquals(await res.text(), "chegou");
});

Deno.test("safeFetch: nome que resolve para IP privado não chega a ser pedido", async () => {
  const { impl: resolver } = fakeResolver({ "rebind.evil.pt": { A: ["127.0.0.1"] } });
  const { impl: fetchFn, calls } = fakeFetch({});
  await rejectsWith(safeFetch("https://rebind.evil.pt/", {}, { resolver, fetchFn }), "blocked");
  assertEquals(calls.length, 0);
});

Deno.test("safeFetch: http, porta e DNS em falta recusam sem pedir nada", async () => {
  const { impl: resolver } = fakeResolver({});
  const { impl: fetchFn, calls } = fakeFetch({});
  await rejectsWith(safeFetch("http://prova.pt/", {}, { resolver, fetchFn }), "invalid_url");
  await rejectsWith(safeFetch("https://prova.pt:8443/", {}, { resolver, fetchFn }), "invalid_url");
  await rejectsWith(safeFetch("https://prova.pt/", {}, { resolver, fetchFn }), "dns");
  assertEquals(calls.length, 0);
});

Deno.test("safeFetch: 3xx sem Location e erros HTTP são devolvidos tal como vêm", async () => {
  const { impl: resolver } = fakeResolver(PUBLIC_DNS);
  const { impl: fetchFn } = fakeFetch({
    "https://prova.pt/": { status: 302 },
    "https://prova.pt/x": { status: 404 },
  });
  assertEquals((await safeFetch("https://prova.pt/", {}, { resolver, fetchFn })).status, 302);
  assertEquals((await safeFetch("https://prova.pt/x", {}, { resolver, fetchFn })).status, 404);
});

Deno.test("safeFetch: o sinal de timeout chega a cada pedido da cadeia", async () => {
  const { impl: resolver } = fakeResolver(PUBLIC_DNS);
  const seen: Array<AbortSignal | null | undefined> = [];
  const fetchFn = ((input: string | URL | Request, init?: RequestInit) => {
    seen.push(init?.signal);
    const url = input.toString();
    if (url === "https://prova.pt/") {
      return Promise.resolve(new Response(null, { status: 301, headers: { location: "/fim" } }));
    }
    return Promise.resolve(new Response("ok", { status: 200 }));
  }) as typeof fetch;
  const controller = new AbortController();
  await safeFetch("https://prova.pt/", { signal: controller.signal }, { resolver, fetchFn });
  assertEquals(seen.length, 2);
  assert(seen.every((s) => s === controller.signal));
});
