import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { LOGO_INTRO_MS } from './logoIntro';

/* O logo de arranque vive em três sítios: o index.html (o primeiro desenho,
   antes do JavaScript), o shared/LogoLoader.jsx e as regras .logo-loader-*
   do globals.css (os desenhos seguintes). Têm de ser o mesmo desenho com os
   mesmos tempos — senão a passagem do HTML para a app nota-se. */

const ler = (p) => readFileSync(resolve(__dirname, p), 'utf-8');
const html = ler('../../index.html');
const loader = ler('../components/shared/LogoLoader.jsx');
const css = ler('../styles/globals.css');

/** [duração, atraso] em ms de uma regra de animação. */
function timing(source, selector) {
  const rule = new RegExp(`\\${selector}\\s*\\{[^}]*animation:\\s*\\w+\\s+(\\d+)ms[^;]*?\\s(\\d+)ms`).exec(source);
  expect(rule, `${selector} sem animação`).not.toBeNull();
  return [Number(rule[1]), Number(rule[2])];
}

describe('logo de arranque — o do HTML e o da app são o mesmo', () => {
  it('as mesmas formas: hexágonos e chevrons', () => {
    const shapes = (src) => [...src.matchAll(/(?:points|d)=["{]'?"?([-\d, .MLZ]+)"?'?["}]/g)].map((m) => m[1].trim());
    const constants = [...loader.matchAll(/const \w+ = '([-\d, .MLZ]+)';/g)].map((m) => m[1]);
    expect(constants).toHaveLength(4); // os dois hexágonos e os dois chevrons
    for (const shape of constants) expect(shapes(html), shape).toContain(shape);
  });

  it('os mesmos tempos: traços, preenchimentos, brilho, nome e AI-POWERED', () => {
    const pairs = [
      ['.bs-hex', '.logo-loader-hex'],
      ['.bs-hex-in', '.logo-loader-hex-in'],
      ['.bs-chev-ouro', '.logo-loader-chev-ouro'],
      ['.bs-chev-ciano', '.logo-loader-chev-ciano'],
      ['.bs-fill-ouro', '.logo-loader-fill-ouro'],
      ['.bs-fill-ciano', '.logo-loader-fill-ciano'],
      ['.bs-name', '.logo-loader-word'],
      ['.bs-tag', '.logo-loader-tagline'],
    ];
    for (const [h, c] of pairs) expect(timing(html, h), `${h} vs ${c}`).toEqual(timing(css, c));
  });

  it('o arranque só acaba depois do AI-POWERED entrar', () => {
    const [dur, delay] = timing(html, '.bs-tag');
    expect(LOGO_INTRO_MS).toBeGreaterThanOrEqual(dur + delay);
  });

  it('o HTML trata o movimento reduzido e tem a rede de segurança', () => {
    expect(html).toContain('@media (prefers-reduced-motion: reduce)');
    expect(html).toContain('window.__bootSplashAt');
    expect(html).toContain('__bootSplashAdopted');
  });
});
