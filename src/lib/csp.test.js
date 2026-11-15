import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { cspFor, injectCsp, inlineHashes, SUPABASE_ORIGIN } from './csp';

/* Auditoria de segurança M5: a CSP do build (vite.config.mjs, plugin ironcoach-csp). */
const directive = (csp, name) => csp.split('; ').find((d) => d.startsWith(`${name} `)) || '';

describe('CSP do build', () => {
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

  it('script-src sem unsafe-inline nem unsafe-eval: o script inline do index.html entra pelo hash', () => {
    const csp = cspFor(html);
    const script = directive(csp, 'script-src');
    expect(script).not.toMatch(/unsafe-inline|unsafe-eval/);
    const { scripts } = inlineHashes(html);
    expect(scripts).toHaveLength(1);
    expect(script).toContain(scripts[0]);
  });

  it('o hash é o que o browser calcula: com as quebras de linha normalizadas (CRLF → LF)', () => {
    const body = '\n    window.__bootSplashAt = 1;\n  ';
    const lf = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
    expect(inlineHashes(`<script>${body}</script>`).scripts).toEqual([lf]);
    expect(inlineHashes(`<script>${body.replace(/\n/g, '\r\n')}</script>`).scripts).toEqual([lf]);
  });

  it('só as origens que a app usa: o Supabase do projeto (https e wss) e o open-meteo; data:/blob: só nas imagens', () => {
    const csp = cspFor(html);
    expect(directive(csp, 'default-src')).toBe("default-src 'self'");
    expect(directive(csp, 'connect-src')).toBe(`connect-src 'self' ${SUPABASE_ORIGIN} wss://roxfzsiciizkevopgpnl.supabase.co https://geocoding-api.open-meteo.com https://api.open-meteo.com`);
    expect(directive(csp, 'img-src')).toBe(`img-src 'self' data: blob: ${SUPABASE_ORIGIN}`);
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
    expect(directive(csp, 'frame-src')).toBe("frame-src 'none'");
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'");
  });

  it('injectCsp põe a <meta> logo a seguir ao charset, uma só vez', () => {
    const out = injectCsp(html);
    expect(out).toMatch(/<meta charset="utf-8">\s*<meta http-equiv="Content-Security-Policy" content="default-src 'self';/);
    expect(injectCsp(out)).toBe(out);
    expect(out.match(/Content-Security-Policy/g)).toHaveLength(1);
  });
});
