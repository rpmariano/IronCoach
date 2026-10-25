import React, { useEffect, useId, useState } from 'react';
import { prefersReducedMotion } from '../../utils/coachBubbles';
import { publicUrl } from '../../lib/utils';

/* A cena da Carol na espera de uma análise (pedido do Rui, 2026-10-25): o
   avatar da área — corrida, ginásio, corporal, alimentação. O traço SVG
   (public/carol-cenas/<área>-traco.svg) desenha-se em ~1,7 s e, depois, a
   imagem final (<área>.webp) aparece por cima, com um crossfade. Movimento
   reduzido: a imagem final logo. Se o traço ou a imagem não carregarem, não se
   mostra nada daqui: `fallback` (o logótipo de sempre) fica no lugar.

   Quatro animações (decisão do Rui: à sorte, sem repetir a da vez anterior):
   - 'traco': as linhas do -traco.svg desenham-se e a imagem final cruza-se por cima;
   - 'mascara': o -mascara.svg são traços LARGOS que revelam o webp por baixo (SVG
     mask + stroke-dashoffset); no fim, crossfade para a imagem inteira. Formato
     do ficheiro: só formas com traço, no viewBox do webp; a ordem dos elementos é a
     ordem do desenho; o fill é ignorado e a cor também (tudo branco na máscara);
   - 'carreiras': a imagem revela-se em carreiras horizontais, de cima para baixo,
     cada uma da esquerda para a direita (como tricô) — gerada por código;
   - 'pontos': pontos redondos numa grelha crescem até cobrir a imagem, do centro
     para fora — gerada por código.
   Os dois últimos não precisam de ficheiros (servem as quatro áreas); os dois primeiros
   só entram no sorteio se a área tiver o SVG. Todos acabam em ~2 s.
   Sorteio: em cada análise, um modo à sorte entre os disponíveis, que não o da vez
   anterior (localStorage). ?cena=<modo> no URL (ou a prop `modo`) força um — para
   testes e pré-visualização; forçada, a máscara sem -mascara.svg cai no -traco.svg da
   área. Movimento reduzido: só a imagem, sem sorteio.

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

export const CENA_MODOS = ['mascara', 'traco', 'carreiras', 'pontos'];
export const CENA_MODOS_GERADOS = ['carreiras', 'pontos'];
export const CENA_ULTIMO_MODO_KEY = 'ironcoach:cena-ultimo-modo';
export const CENA_CARREIRAS = 12;
export const CENA_PONTOS_COLUNAS = 10;

/** O modo forçado: a prop, senão ?cena= no URL (pré-visualização); null = sorteio. */
export function resolverModo(prop) {
  if (CENA_MODOS.includes(prop)) return prop;
  try {
    const v = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('cena');
    if (CENA_MODOS.includes(v)) return v;
  } catch { /* sem URL: sorteio */ }
  return null;
}

export function lerUltimoModo() {
  try {
    const v = window.localStorage.getItem(CENA_ULTIMO_MODO_KEY);
    return CENA_MODOS.includes(v) ? v : null;
  } catch { return null; }
}
export function guardarUltimoModo(modo) {
  try { window.localStorage.setItem(CENA_ULTIMO_MODO_KEY, modo); } catch { /* sem storage: pode repetir */ }
}

/** Um dos `disponiveis` à sorte, que não o `ultimo` (se for o único, esse). */
export function sortearModo(disponiveis, ultimo = null, rand = Math.random) {
  const lista = (disponiveis || []).filter((m) => m !== ultimo);
  const base = lista.length ? lista : (disponiveis || []);
  if (!base.length) return null;
  return base[Math.min(base.length - 1, Math.floor(rand() * base.length))];
}

/** As carreiras (retângulos, de cima para baixo), cada uma com o seu atraso: a
 *  primeira a 0 e a última a (2 s − 0,6 s). Sobrepõem-se 1 px para não deixar fios. */
export function formasCarreiras(w, h, n = CENA_CARREIRAS) {
  const alt = h / n;
  const passo = n > 1 ? (CENA_TOTAL_MS - CENA_TRACO_MS) / (n - 1) : 0;
  return Array.from({ length: n }, (_, i) => ({ x: 0, y: i * alt, w, h: alt + 1, atraso: Math.round(i * passo) }));
}

/** Os pontos de uma grelha que cobre a imagem; o atraso cresce com a distância ao centro
 *  (o do centro a 0, o mais afastado a 2 s − 0,6 s). O raio chega à diagonal da célula. */
export function formasPontos(w, h, colunas = CENA_PONTOS_COLUNAS) {
  const cel = w / colunas;
  const linhas = Math.ceil(h / cel);
  const r = cel * 0.75;
  const pontos = [];
  for (let l = 0; l < linhas; l += 1) {
    for (let c = 0; c < colunas; c += 1) {
      const cx = (c + 0.5) * cel;
      const cy = (l + 0.5) * cel;
      pontos.push({ cx, cy, r, dist: Math.hypot(cx - w / 2, cy - h / 2) });
    }
  }
  const maxDist = Math.max(1, ...pontos.map((p) => p.dist));
  return pontos.map(({ dist, ...p }) => ({ ...p, atraso: Math.round((dist / maxDist) * (CENA_TOTAL_MS - CENA_TRACO_MS)) }));
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
  const forcado = resolverModo(modoProp);
  const maskId = `carol-cena-m-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [estado, setEstado] = useState('a-carregar'); // a-carregar | pronta | falhou
  const [cena, setCena] = useState(null); // { modo, traco } | { modo, mascara } | { modo: 'carreiras' | 'pontos' }
  const [final, setFinal] = useState(false);
  // A proporção da imagem (a da Carol é 600×804): `size` é a ALTURA e a largura segue-a.
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const proporcao = dim.w > 0 && dim.h > 0 ? dim.w / dim.h : 1;

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
    const trazModo = (m) => (CENA_MODOS_GERADOS.includes(m) ? Promise.resolve({ modo: m }) : (m === 'mascara' ? trazMascara() : trazTraco()));
    // Forçado (?cena= ou a prop): esse modo — a máscara que falte cai no traço dessa área.
    // Senão, o sorteio: um modo à sorte que não o da vez anterior; os que precisam de
    // SVG saem da lista se a área não o tiver (os gerados nunca saem, por isso acaba).
    const escolher = async () => {
      if (forcado) return forcado === 'mascara' ? trazMascara().catch(() => trazTraco()) : trazModo(forcado);
      let lista = [...CENA_MODOS];
      const ultimo = lerUltimoModo();
      for (;;) {
        const m = sortearModo(lista, ultimo);
        try { return await trazModo(m); } catch { lista = lista.filter((x) => x !== m); }
      }
    };
    carregarImagem(webp).then(async (d) => {
      if (cancelado) return;
      // Movimento reduzido: só a imagem final, sem sorteio.
      const c = reduced ? null : await escolher();
      if (cancelado) return;
      if (c) guardarUltimoModo(c.modo);
      setDim(d);
      setCena(c);
      setEstado('pronta');
    }).catch(falhar);
    return () => { cancelado = true; };
  }, [area, reduced, forcado]);

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
  const gerada = CENA_MODOS_GERADOS.includes(cena?.modo) ? cena.modo : null;
  // A grelha dos gerados vive nas dimensões da imagem (sem elas, um quadrado de 100).
  const gw = dim.w > 0 ? dim.w : 100;
  const gh = dim.h > 0 ? dim.h : 100;
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
      {gerada && (
        <svg
          data-testid="carol-cena-gerada"
          className={`carol-cena-gerada carol-cena-${gerada}`}
          viewBox={`0 0 ${gw} ${gh}`}
          width="100%"
          height="100%"
          focusable="false"
          style={{ ...camada, width: '100%', height: '100%' }}
        >
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={gw} height={gh}>
              {gerada === 'carreiras'
                ? formasCarreiras(gw, gh).map((f) => <rect key={f.y} x={f.x} y={f.y} width={f.w} height={f.h} style={{ '--atraso': `${f.atraso}ms` }} />)
                : formasPontos(gw, gh).map((p) => <circle key={`${p.cx}-${p.cy}`} cx={p.cx} cy={p.cy} r={p.r} style={{ '--atraso': `${p.atraso}ms` }} />)}
            </mask>
          </defs>
          <image href={imagem} x="0" y="0" width={gw} height={gh} preserveAspectRatio="xMidYMid meet" mask={`url(#${maskId})`} />
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
