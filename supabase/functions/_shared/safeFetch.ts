// IronHealth · fetch para endereços escolhidos pelo utilizador, sem SSRF
// (auditoria de segurança, 2026-11-14 — item M3).
//
// Antes, o enrich-race-event fazia fetch a qualquer URL que o atleta
// escrevesse, com redirect: "follow" — dava para apontar a 127.0.0.1, à rede
// interna ou ao serviço de metadados (169.254.169.254). Agora:
//  - só https, só na porta por omissão, sem credenciais no endereço;
//  - nomes como localhost / *.internal / *.local, e nomes sem ponto, recusados;
//  - o nome é resolvido (A e AAAA) antes do pedido, e qualquer endereço privado
//    ou reservado recusa o pedido todo; se o DNS falhar, recusa (fail closed);
//  - os redirecionamentos são seguidos à mão (no máximo MAX_REDIRECTS), e cada
//    Location passa pelas mesmas regras antes de ser seguida.
//
// Limite conhecido: o fetch volta a resolver o nome depois desta verificação
// (DNS rebinding). Não há forma de fixar o IP no fetch das Edge Functions; a
// janela é curta e o TTL baixo de um atacante só a abre por acaso.

export const MAX_REDIRECTS = 5;

export type SafeFetchReason = "invalid_url" | "blocked" | "dns" | "too_many_redirects";

/** Recusa do guarda — a mensagem é interna; ao cliente vai uma frase genérica. */
export class SafeFetchError extends Error {
  readonly reason: SafeFetchReason;
  constructor(reason: SafeFetchReason, message: string) {
    super(message);
    this.name = "SafeFetchError";
    this.reason = reason;
  }
}

export type DnsResolver = (hostname: string, type: "A" | "AAAA", signal?: AbortSignal) => Promise<string[]>;

export const defaultResolver: DnsResolver = (hostname, type, signal) =>
  Deno.resolveDns(hostname, type, signal ? { signal } : undefined);

// ---------------------------------------------------------------------------
// Endereços IP (funções puras)
// ---------------------------------------------------------------------------

/** "a.b.c.d" estrito (só decimal, 0-255) → 4 octetos; o resto → null. */
export function parseIpv4(s: string): number[] | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/** IPv6 (com ou sem [ ], com "::" e com IPv4 no fim) → 8 grupos de 16 bits. */
export function parseIpv6(raw: string): number[] | null {
  let s = raw;
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  // Zona (fe80::1%eth0) — fica só o endereço.
  const pct = s.indexOf("%");
  if (pct >= 0) s = s.slice(0, pct);
  if (!s.includes(":")) return null;

  // IPv4 no fim (::ffff:127.0.0.1) → dois grupos hexadecimais.
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    s = s.slice(0, lastColon + 1) +
      ((v4[0] << 8) | v4[1]).toString(16) + ":" + ((v4[2] << 8) | v4[3]).toString(16);
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parseGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const groups: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      groups.push(parseInt(g, 16));
    }
    return groups;
  };
  const head = parseGroups(halves[0]);
  if (!head) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const rest = parseGroups(halves[1]);
  if (!rest) return null;
  const missing = 8 - head.length - rest.length;
  if (missing < 1) return null;
  return [...head, ...new Array(missing).fill(0), ...rest];
}

function v4InCidr(ip: number[], base: number[], bits: number): boolean {
  const toInt = (o: number[]) => ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (toInt(ip) & mask) === (toInt(base) & mask);
}

// Redes IPv4 que nunca são um site público.
const BLOCKED_V4: Array<[number[], number]> = [
  [[0, 0, 0, 0], 8], // "esta" rede
  [[10, 0, 0, 0], 8], // privada
  [[100, 64, 0, 0], 10], // CGNAT
  [[127, 0, 0, 0], 8], // loopback
  [[169, 254, 0, 0], 16], // link-local, incl. metadados 169.254.169.254
  [[172, 16, 0, 0], 12], // privada
  [[192, 0, 0, 0], 24], // atribuições IETF
  [[192, 0, 2, 0], 24], // documentação
  [[192, 88, 99, 0], 24], // 6to4 relay
  [[192, 168, 0, 0], 16], // privada
  [[198, 18, 0, 0], 15], // benchmarking
  [[198, 51, 100, 0], 24], // documentação
  [[203, 0, 113, 0], 24], // documentação
  [[224, 0, 0, 0], 4], // multicast
  [[240, 0, 0, 0], 4], // reservada, incl. 255.255.255.255
];

function isBlockedV4(o: number[]): boolean {
  return BLOCKED_V4.some(([base, bits]) => v4InCidr(o, base, bits));
}

function isBlockedV6(g: number[]): boolean {
  // IPv4 mapeado (::ffff:a.b.c.d) e NAT64 (64:ff9b::a.b.c.d): decide o IPv4.
  const embedded = [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff];
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    return isBlockedV4(embedded);
  }
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return isBlockedV4(embedded);
  }
  // Só o unicast global (2000::/3) é público — fica de fora ::, ::1, ::a.b.c.d,
  // fc00::/7, fe80::/10, fec0::/10, ff00::/8, 100::/64, etc.
  if ((g[0] & 0xe000) !== 0x2000) return true;
  if (g[0] === 0x2001 && g[1] < 0x200) return true; // 2001::/23 (Teredo, ORCHID…)
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentação
  if (g[0] === 0x2002) return true; // 6to4 — embrulha um IPv4 qualquer
  if (g[0] === 0x3fff && g[1] < 0x1000) return true; // 3fff::/20 documentação
  return false;
}

/**
 * true se `ip` não for um endereço público: privado, loopback, link-local,
 * CGNAT, multicast, reservado, ou nem sequer um IP válido (fail closed).
 */
export function isBlockedIp(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4) return isBlockedV4(v4);
  const v6 = parseIpv6(ip);
  if (v6) return isBlockedV6(v6);
  return true;
}

/** Nomes que só existem dentro de uma rede (localhost, *.internal, …). */
export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.+$/, "");
  if (!h) return true;
  if (!h.includes(".")) return true; // nome de uma só parte = nome de intranet
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  const blockedSuffixes = [".internal", ".local", ".localdomain", ".home.arpa", ".intranet", ".corp", ".lan"];
  if (blockedSuffixes.some((s) => h.endsWith(s))) return true;
  return false;
}

const isIpLiteral = (hostname: string) => parseIpv4(hostname) !== null || hostname.startsWith("[");

// ---------------------------------------------------------------------------
// Validação de um endereço (sintaxe + DNS)
// ---------------------------------------------------------------------------

/** Regras de sintaxe: https, porta por omissão, sem credenciais, nome/IP permitido. */
export function checkUrlSyntax(raw: string | URL): URL {
  let url: URL;
  try {
    url = new URL(raw.toString());
  } catch {
    throw new SafeFetchError("invalid_url", "URL inválida");
  }
  if (url.protocol !== "https:") throw new SafeFetchError("invalid_url", "só https");
  // O WHATWG URL normaliza ":443" para "", por isso qualquer porta aqui é outra.
  if (url.port !== "") throw new SafeFetchError("invalid_url", "porta não permitida");
  if (url.username || url.password) throw new SafeFetchError("invalid_url", "credenciais no endereço");
  const host = url.hostname;
  if (isIpLiteral(host)) {
    if (isBlockedIp(host)) throw new SafeFetchError("blocked", "IP privado ou reservado");
  } else if (isBlockedHostname(host)) {
    throw new SafeFetchError("blocked", "nome interno");
  }
  return url;
}

/** Sintaxe + DNS: todos os endereços A/AAAA do nome têm de ser públicos. */
export async function assertPublicUrl(
  raw: string | URL,
  resolver: DnsResolver = defaultResolver,
  signal?: AbortSignal,
): Promise<URL> {
  const url = checkUrlSyntax(raw);
  const host = url.hostname;
  if (isIpLiteral(host)) return url;

  const settled = await Promise.allSettled([
    resolver(host, "A", signal),
    resolver(host, "AAAA", signal),
  ]);
  if (signal?.aborted) throw new DOMException("O pedido foi cancelado.", "AbortError");
  const addresses = settled.flatMap((r) => (r.status === "fulfilled" && Array.isArray(r.value) ? r.value : []));
  // Sem nenhum endereço (nome inexistente, DNS em baixo): recusa.
  if (addresses.length === 0) throw new SafeFetchError("dns", "o nome não resolveu");
  if (addresses.some((a) => isBlockedIp(a))) throw new SafeFetchError("blocked", "o nome resolve para um IP privado");
  return url;
}

// ---------------------------------------------------------------------------
// fetch com redirecionamentos seguidos à mão
// ---------------------------------------------------------------------------

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type SafeFetchOptions = {
  resolver?: DnsResolver;
  fetchFn?: typeof fetch;
  maxRedirects?: number;
};

/**
 * GET a um endereço do utilizador com as regras acima. Devolve a resposta
 * final (não redirecionamento). Recusas lançam SafeFetchError; um timeout
 * (via init.signal) continua a lançar o AbortError do fetch.
 */
export async function safeFetch(
  rawUrl: string | URL,
  init: Omit<RequestInit, "redirect"> = {},
  opts: SafeFetchOptions = {},
): Promise<Response> {
  const resolver = opts.resolver ?? defaultResolver;
  const fetchFn = opts.fetchFn ?? fetch;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const signal = init.signal ?? undefined;

  let current = await assertPublicUrl(rawUrl, resolver, signal);
  for (let hops = 0; ; hops++) {
    const res = await fetchFn(current.toString(), { ...init, redirect: "manual" });
    if (!REDIRECT_STATUSES.has(res.status)) return res;

    const location = res.headers.get("location");
    // O corpo do redirecionamento não interessa — liberta a ligação.
    await res.body?.cancel().catch(() => {});
    if (!location) return res;
    if (hops >= maxRedirects) throw new SafeFetchError("too_many_redirects", "demasiados redirecionamentos");

    // Um salto recusado é do site, não do endereço que o atleta escreveu:
    // "blocked", nunca "invalid_url" (que lhe pede para corrigir o endereço).
    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw new SafeFetchError("blocked", "Location inválida");
    }
    try {
      current = await assertPublicUrl(next, resolver, signal);
    } catch (e) {
      if (e instanceof SafeFetchError && e.reason === "invalid_url") {
        throw new SafeFetchError("blocked", `redirecionamento recusado: ${e.message}`);
      }
      throw e;
    }
  }
}
