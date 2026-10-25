import React, { useEffect, useId, useState } from 'react';
import { prefersReducedMotion } from '../../utils/coachBubbles';
import { publicUrl } from '../../lib/utils';

/* A cena da Carol na espera de uma análise (pedido do Rui, 2026-10-25): o
   avatar da área — corrida, ginásio, corporal, alimentação. O traço SVG
   (public/carol-cenas/<área>-traco.svg) desenha-se em ~1,7 s e, depois, a
   imagem final (<área>.webp) aparece por cima, com um crossfade. Movimento
   reduzido: a imagem final logo. Se o traço ou a imagem não carregarem, não se
   mostra nada daqui: `fallback` (o logótipo de sempre) fica no lugar.

   Dois modos (a escolher depois de o Rui ver a pré-visualização):
   - 'traco' (o padrão): as linhas do -traco.svg desenham-se e a imagem final
     cruza-se por cima;
   - 'mascara': o -mascara.svg são traços LARGOS que revelam o webp por baixo (SVG
     mask + stroke-dashoffset); no fim, crossfade para a imagem inteira. Formato
     do ficheiro: só formas com traço, no viewBox do webp; a ordem dos elementos é a
     ordem do desenho; o fill é ignorado e a cor também (tudo branco na máscara).
   O modo vem da prop `modo`, ou de ?cena=mascara|traco no URL (pré-visualização),
   ou do padrão. Sem o -mascara.svg de uma área, a máscara cai no -traco.svg dela.

   Os ficheiros são da Carol; os que lá estão podem ser placeholders com o mesmo
   nome. O SVG é nosso (public/), vai inline para se poder animar o traço: tira-se
   o que executa código (só passam formas e gradientes) e normaliza-se o comprimento dos traços (pathLength=1). */

export const CENA_AREAS = { run: 'corrida', gym: 'ginasio', body: 'corporal', meal: 'alimentacao' };
export const cenaAreaOf = (kind) => CENA_AREAS[kind] || null;
// O contrato da Carol: cada traço demora 0,6 s e o conjunto ~2 s (o atraso de cada um é
// i × (2 s − 0,6 s) / max(i), com o i do style="--i:N" do ficheiro — caminhos com o mesmo
// i desenham-se juntos). O crossfade para a imagem começa quando o desenho acaba.
export const CENA_TRACO_MS = 600;
export const CENA_TOTAL_MS = 2000;
export const CENA_DESENHO_MS = CENA_TOTAL_MS + 100;
const GEOMETRIAS = 'path,line,polyline,polygon,circle,ellipse,rect';
// Só estes elementos passam (lista de permitidos): nada que execute código, carregue recursos ou anime atributos.
const PERMITIDOS = new Set(['svg', 'g', 'defs', 'path', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'rect', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask']);

export const CENA_MODOS = ['traco', 'mascara'];
export const CENA_MODO_PADRAO = 'traco';
/** O modo: a prop, senão ?cena= no URL (pré-visualização), senão o padrão. */
export function resolverModo(prop) {
  if (CENA_MODOS.includes(prop)) return prop;
  try {
    const v = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('cena');
    if (CENA_MODOS.includes(v)) return v;
  } catch { /* sem URL: o padrão */ }
  return CENA_MODO_PADRAO;
}

/** Põe o pathLength=1 e o atraso (--atraso, em ms) de cada forma. A ordem é o --i do
 *  style do ficheiro (agrupa as que se desenham juntas); sem ele, o índice. */
function animarFormas(formas) {
  const ordem = formas.map((el, idx) => {
    const m = /--i\s*:\s*(\d+(?:\.\d+)?)/.exec(el.getAttribute('style') || '');
    return m ? Number(m[1]) : idx;
  });
  const max = Math.max(0, ...ordem);
  const passo = max > 0 ? (CENA_TOTAL_MS - CENA_TRACO_MS) / max : 0;
  formas.forEach((el, k) => {
    el.setAttribute('pathLength', '1');
    el.setAttribute('style', `--atraso:${Math.round(ordem[k] * passo)}ms`);
  });
}

/** Parse + limpeza: só formas (lista de permitidos), sem handlers nem ligações; a
 *  raiz também. Devolve o elemento <svg> limpo, ou null. */
function limparSvg(texto) {
  const doc = new DOMParser().parseFromString(String(texto), 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;
  // A raiz também: os atributos dela (onload…) contam como os dos filhos.
  [svg, ...svg.querySelectorAll('*')].forEach((el) => {
    if (!PERMITIDOS.has(el.nodeName.toLowerCase())) { el.remove(); return; }
    [...el.attributes].forEach((a) => { if (/^on/i.test(a.name) || /href/i.test(a.name) || /javascript:/i.test(a.value)) el.removeAttribute(a.name); });
  });
  return svg;
}

/** A máscara: o viewBox e as formas (já com pathLength=1 e o atraso de cada uma, pela
 *  ordem do ficheiro), ou null se não serve ou não tem nenhuma forma. */
export function prepararMascara(texto) {
  try {
    const svg = limparSvg(texto);
    if (!svg) return null;
    const formas = [...svg.querySelectorAll(GEOMETRIAS)];
    if (!formas.length) return null;
    animarFormas(formas);
    const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const viewBox = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0 ? vb : [0, 0, 256, 256];
    const ser = new XMLSerializer();
    return { viewBox, inner: [...svg.children].map((c) => ser.serializeToString(c)).join('') };
  } catch {
    return null;
  }
}

/** O SVG como marcação inline segura e animável, ou null se não serve. */
export function prepararTraco(texto) {
  try {
    const svg = limparSvg(texto);
    if (!svg) return null;
    animarFormas([...svg.querySelectorAll(GEOMETRIAS)]);
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
    img.onload = () => resolve({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 });
    img.onerror = () => reject(new Error('imagem'));
    img.src = src;
  });
}

const buscarTexto = (url) => (typeof fetch === 'function'
  ? fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error('svg'))))
  : Promise.reject(new Error('sem fetch')));

export default function CarolCena({ kind, size = 200, fallback = null, modo: modoProp }) {
  const area = cenaAreaOf(kind);
  const reduced = prefersReducedMotion();
  const pedido = resolverModo(modoProp);
  const maskId = `carol-cena-m-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [estado, setEstado] = useState('a-carregar'); // a-carregar | pronta | falhou
  const [cena, setCena] = useState(null); // { modo, traco } | { modo, mascara }
  const [final, setFinal] = useState(false);
  // A proporção da imagem (a da Carol é 600×804): `size` é a ALTURA e a largura segue-a.
  const [proporcao, setProporcao] = useState(1);

  useEffect(() => {
    if (!area) { setEstado('falhou'); return undefined; }
    let cancelado = false;
    const webp = publicUrl(`carol-cenas/${area}.webp`);
    const falhar = () => { if (!cancelado) setEstado('falhou'); };
    const trazTraco = () => buscarTexto(publicUrl(`carol-cenas/${area}-traco.svg`))
      .then((t) => prepararTraco(t) || Promise.reject(new Error('svg')))
      .then((traco) => ({ modo: 'traco', traco }));
    const trazMascara = () => buscarTexto(publicUrl(`carol-cenas/${area}-mascara.svg`))
      .then((t) => prepararMascara(t) || Promise.reject(new Error('mascara')))
      .then((mascara) => ({ modo: 'mascara', mascara }));
    // Movimento reduzido: só a imagem final interessa. A máscara que falte
    // (a área ainda não a tem) cai no traço dessa área.
    const trazCena = reduced
      ? Promise.resolve(null)
      : (pedido === 'mascara' ? trazMascara().catch(() => trazTraco()) : trazTraco());
    Promise.all([carregarImagem(webp), trazCena]).then(([dim, c]) => {
      if (cancelado) return;
      if (dim.w > 0 && dim.h > 0) setProporcao(dim.w / dim.h);
      setCena(c);
      setEstado('pronta');
    }).catch(falhar);
    return () => { cancelado = true; };
  }, [area, reduced, pedido]);

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
  const m = cena?.modo === 'mascara' ? cena.mascara : null;
  const [vx, vy, vw, vh] = m ? m.viewBox : [0, 0, 0, 0];
  const camada = { position: 'absolute', inset: 0, opacity: final ? 0 : 1, transition: 'opacity 500ms ease' };
  return (
    <div
      data-testid="carol-cena"
      data-area={area}
      data-modo={cena?.modo || 'imagem'}
      data-fase={final ? 'final' : 'desenho'}
      aria-hidden="true"
      style={{ position: 'relative', width: Math.round(size * proporcao), height: size }}
    >
      {cena?.modo === 'traco' && (
        <div
          data-testid="carol-cena-traco"
          className="carol-cena-traco"
          style={camada}
          dangerouslySetInnerHTML={{ __html: cena.traco }}
        />
      )}
      {m && (
        <svg
          data-testid="carol-cena-mascara"
          className="carol-cena-mascara"
          viewBox={m.viewBox.join(' ')}
          width="100%"
          height="100%"
          focusable="false"
          style={{ ...camada, width: '100%', height: '100%' }}
        >
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x={vx} y={vy} width={vw} height={vh}>
              <g dangerouslySetInnerHTML={{ __html: m.inner }} />
            </mask>
          </defs>
          <image href={imagem} x={vx} y={vy} width={vw} height={vh} preserveAspectRatio="xMidYMid meet" mask={`url(#${maskId})`} />
        </svg>
      )}
      <img
        data-testid="carol-cena-final"
        src={imagem}
        alt=""
        width={Math.round(size * proporcao)}
        height={size}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: final ? 1 : 0, transition: 'opacity 500ms ease' }}
      />
    </div>
  );
}
