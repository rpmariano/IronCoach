import React, { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../../utils/coachBubbles';
import { publicUrl } from '../../lib/utils';

/* A cena da Carol na espera de uma análise (pedido do Rui, 2026-10-25): o
   avatar da área — corrida, ginásio, corporal, alimentação. O traço SVG
   (public/carol-cenas/<área>-traco.svg) desenha-se em ~1,7 s e, depois, a
   imagem final (<área>.webp) aparece por cima, com um crossfade. Movimento
   reduzido: a imagem final logo. Se o traço ou a imagem não carregarem, não se
   mostra nada daqui: `fallback` (o logótipo de sempre) fica no lugar.

   Os ficheiros são da Carol; os que lá estão podem ser placeholders com o mesmo
   nome. O SVG é nosso (public/), vai inline para se poder animar o traço: tira-se
   o que executa código (só passam formas e gradientes) e normaliza-se o comprimento dos traços (pathLength=1). */

export const CENA_AREAS = { run: 'corrida', gym: 'ginasio', body: 'corporal', meal: 'alimentacao' };
export const cenaAreaOf = (kind) => CENA_AREAS[kind] || null;
export const CENA_DESENHO_MS = 1800;
const GEOMETRIAS = 'path,line,polyline,polygon,circle,ellipse,rect';
// Só estes elementos passam (lista de permitidos): nada que execute código, carregue recursos ou anime atributos.
const PERMITIDOS = new Set(['svg', 'g', 'defs', 'path', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'rect', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask']);

/** O SVG como marcação inline segura e animável, ou null se não serve. */
export function prepararTraco(texto) {
  try {
    const doc = new DOMParser().parseFromString(String(texto), 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;
    // A raiz também: os atributos dela (onload…) contam como os dos filhos.
    [svg, ...svg.querySelectorAll('*')].forEach((el) => {
      if (!PERMITIDOS.has(el.nodeName.toLowerCase())) { el.remove(); return; }
      [...el.attributes].forEach((a) => { if (/^on/i.test(a.name) || /href/i.test(a.name) || /javascript:/i.test(a.value)) el.removeAttribute(a.name); });
    });
    svg.querySelectorAll(GEOMETRIAS).forEach((el) => el.setAttribute('pathLength', '1'));
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    return new XMLSerializer().serializeToString(svg);
  } catch {
    return null;
  }
}

function carregarImagem(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = () => reject(new Error('imagem'));
    img.src = src;
  });
}

export default function CarolCena({ kind, size = 160, fallback = null }) {
  const area = cenaAreaOf(kind);
  const reduced = prefersReducedMotion();
  const [estado, setEstado] = useState('a-carregar'); // a-carregar | pronta | falhou
  const [traco, setTraco] = useState(null);
  const [final, setFinal] = useState(false);

  useEffect(() => {
    if (!area) { setEstado('falhou'); return undefined; }
    let cancelado = false;
    const webp = publicUrl(`carol-cenas/${area}.webp`);
    const svgUrl = publicUrl(`carol-cenas/${area}-traco.svg`);
    const falhar = () => { if (!cancelado) setEstado('falhou'); };
    // Movimento reduzido: só a imagem final interessa.
    const trazTraco = reduced
      ? Promise.resolve(null)
      : (typeof fetch === 'function'
        ? fetch(svgUrl).then((r) => (r.ok ? r.text() : Promise.reject(new Error('svg')))).then((t) => prepararTraco(t) || Promise.reject(new Error('svg')))
        : Promise.reject(new Error('sem fetch')));
    Promise.all([carregarImagem(webp), trazTraco]).then(([, markup]) => {
      if (cancelado) return;
      setTraco(markup);
      setEstado('pronta');
    }).catch(falhar);
    return () => { cancelado = true; };
  }, [area, reduced]);

  useEffect(() => {
    if (estado !== 'pronta') return undefined;
    if (reduced) { setFinal(true); return undefined; }
    const t = setTimeout(() => setFinal(true), CENA_DESENHO_MS);
    return () => clearTimeout(t);
  }, [estado, reduced]);

  if (!area || estado === 'falhou') return fallback;
  // A carregar: o logótipo de sempre (já está a desenhar-se), até a cena estar pronta.
  if (estado === 'a-carregar') return fallback;

  const imagem = publicUrl(`carol-cenas/${area}.webp`);
  return (
    <div
      data-testid="carol-cena"
      data-area={area}
      data-fase={final ? 'final' : 'traco'}
      aria-hidden="true"
      style={{ position: 'relative', width: size, height: size }}
    >
      {traco && (
        <div
          data-testid="carol-cena-traco"
          className="carol-cena-traco"
          style={{ position: 'absolute', inset: 0, opacity: final ? 0 : 1, transition: 'opacity 500ms ease' }}
          dangerouslySetInnerHTML={{ __html: traco }}
        />
      )}
      <img
        data-testid="carol-cena-final"
        src={imagem}
        alt=""
        width={size}
        height={size}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: final ? 1 : 0, transition: 'opacity 500ms ease' }}
      />
    </div>
  );
}
