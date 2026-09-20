import React from 'react';
import './Medalhao.css';

/* O medalhão do Palmarés (specs/palmares-medalhoes.md §"O artwork"). O disco
   é CSS por camadas (Medalhao.css); as estrelas e os encaixes são SVG que
   referenciam a biblioteca de formas do <MedalhaoDefs />, montada UMA vez no
   App — os ids de um <svg> são globais ao documento, por isso levam o
   prefixo ic-medal- (o RaceTrail e os gráficos têm os seus).

   Um encaixe ganho é a estrela de prata com o esmalte (âmbar a prova, ciano
   a corrida, verde o objetivo batido — a mesma lei de "uma cor, um
   significado" do resto da app) e o valor gravado; "silver" é a estrela sem
   esmalte, para os medalhões que só contam ocorrências (O Terreno, A
   Sequência). Um encaixe por ganhar é o buraco cunhado — sempre à vista, é
   o objetivo. */

export const MEDAL_ID = (name) => `ic-medal-${name}`;
const ref = (name) => `#${MEDAL_ID(name)}`;
const url = (name) => `url(#${MEDAL_ID(name)})`;

const STAR_POINTS = '0,-30 6.7,-9.3 28.5,-9.3 10.9,3.5 17.6,24.3 0,11.5 -17.6,24.3 -10.9,3.5 -28.5,-9.3 -6.7,-9.3';

/* Estrelas nas diagonais, como no medalhão de circuito: a faixa central fica
   para a gravação. No pequeno, .33/.34 — com a estrela a 1.4× a escala .42
   original sobrepunha-as (verificado no browser, ver a spec). */
export const LG_POSITIONS = [[97, 93], [203, 93], [97, 207], [203, 207]];
export const SM_POSITIONS = [[32, 32], [64, 32], [32, 64], [64, 64]];

/* Um medalhão com mais de 4 encaixes: passam a um anel à volta da gravação
   (spec §"O artwork"), todos à mesma distância, o primeiro em cima e a
   seguir no sentido dos ponteiros. Acima de 8 não cabem com leitura —
   desenham-se 8 e o aria-label conta todos. (Hoje os seis medalhões têm 4
   encaixes; o anel ficou de quando A Época tinha um por prova do ano.) */
export const MAX_SLOTS = 8;
/* O raio põe a estrela inteira dentro da face (lg: face 138, estrela 42 →
   92; sm: face 43, estrela 14 → 27). Com 104/31 as pontas pisavam o aro. */
const RING = {
  lg: { cx: 150, cy: 150, r: 92 },
  sm: { cx: 48, cy: 48, r: 27 },
};
/* O diâmetro da maior estrela desenhada à escala das 4 diagonais: no grande
   a medalha 1.4× (raio 30·1.4 = 42); no pequeno a de esmalte a .33 dessa
   (≈ 13,9 de raio — a de prata a .42 e o encaixe a .34 são um pouco menores). */
export const STAR_DIAMETER = { lg: 84, sm: 28 };
// Folga entre vizinhas: a corda tem de levar a estrela e ainda ~10% de ar.
const RING_GAP = 0.9;

const sizeKey = (size) => (size === 'sm' ? 'sm' : 'lg');

/** Posição e escala (relativa à das 4 diagonais) do encaixe `index` de
    `count`. Até 4: as diagonais, escala 1. De 5 a 8: o anel, com a estrela a
    encolher só quando a corda entre vizinhas já não a leva (nunca cresce). */
export function slotPosition(index, count, size = 'lg') {
  const k = sizeKey(size);
  const n = Math.min(Math.max(count || 0, 0), MAX_SLOTS);
  if (n <= 4) {
    const list = k === 'sm' ? SM_POSITIONS : LG_POSITIONS;
    const [x, y] = list[Math.min(Math.max(index, 0), 3)];
    return { x, y, scale: 1 };
  }
  const { cx, cy, r } = RING[k];
  const a = (2 * Math.PI * Math.min(Math.max(index, 0), n - 1)) / n;
  const chord = 2 * r * Math.sin(Math.PI / n);
  const scale = Math.min(1, (chord * RING_GAP) / STAR_DIAMETER[k]);
  return {
    x: Math.round((cx + r * Math.sin(a)) * 10) / 10,
    y: Math.round((cy - r * Math.cos(a)) * 10) / 10,
    scale: Math.round(scale * 1000) / 1000,
  };
}

/* Os esmaltes com joia: a chave é o id da medalha em <MedalhaoDefs /> e o
   valor a tinta do número gravado. Quem não estiver aqui (silver, ou um
   nome novo por engano) cai na prata sem esmalte. O verde é --ok-ink de
   tokens/colors.css, a mesma tinta do "objetivo batido". */
/* Os três da escala d'Os Recordes (utils/medalhoes.js, NIVEIS) juntaram-se
   aos de sempre. São metais, não cores de módulo: a lei da app continua a
   valer para os outros medalhões (ciano é a corrida, âmbar é a prova, verde
   é o objetivo batido), e aqui a cor diz o NÍVEL, que é o que este medalhão
   passou a medir. */
const TEXT_FILL = {
  amber: '#3c1d02', cyan: '#04252b', ok: '#052e22',
  bronze: '#33180a', prata: '#1e2733', ouro: '#3d2a02',
};
const ENAMELS = Object.keys(TEXT_FILL);

function StarFacets({ id, light = false }) {
  // As duas estrelas facetadas: a cromada do disco e a mais clara, com
  // contorno, dos ícones da persiana (MedalhaoDetalhe).
  const f = light
    ? ['#f0f4f8', '#a4b0bf', '#e6ebf1', '#98a5b5', '#dde3ea', '#8e9cad', '#e6ebf1', '#98a5b5', '#f0f4f8', '#a4b0bf']
    : ['#ffffff', '#94a3b8', '#f8fafc', '#64748b', '#cbd5e1', '#475569', '#e2e8f0', '#64748b', '#ffffff', '#94a3b8'];
  const tris = [
    '0,0 -6.7,-9.3 0,-30', '0,0 0,-30 6.7,-9.3', '0,0 6.7,-9.3 28.5,-9.3', '0,0 28.5,-9.3 10.9,3.5',
    '0,0 10.9,3.5 17.6,24.3', '0,0 17.6,24.3 0,11.5', '0,0 0,11.5 -17.6,24.3', '0,0 -17.6,24.3 -10.9,3.5',
    '0,0 -10.9,3.5 -28.5,-9.3', '0,0 -28.5,-9.3 -6.7,-9.3',
  ];
  return (
    <g id={id}>
      {tris.map((p, i) => <polygon key={p} points={p} fill={f[i]} />)}
      {light && <polygon points={STAR_POINTS} fill="none" stroke="#66707d" strokeWidth=".9" />}
    </g>
  );
}

function EnamelMedal({ id, enamel }) {
  return (
    <g id={id}>
      <g filter={url('star-drop')}><use href={ref('star-ag')} transform="scale(1.4)" /></g>
      <circle r="17" fill={url(`enam-${enamel}`)} />
      <circle r="17" fill="none" stroke={url('silver-ring')} strokeWidth="2.5" />
      <path d="M -10 -7.5 A 12 12 0 0 1 7.5 -11" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

/** A biblioteca de formas. Montar uma vez, perto da raiz da app autenticada. */
export function MedalhaoDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} data-testid="medalhao-defs">
      <defs>
        <radialGradient id={MEDAL_ID('enam-amber')} cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fff2c2" />
          <stop offset="30%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#5a1f0a" />
        </radialGradient>
        <radialGradient id={MEDAL_ID('enam-cyan')} cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#e0faff" />
          <stop offset="30%" stopColor="#14b8d6" />
          <stop offset="100%" stopColor="#053342" />
        </radialGradient>
        {/* Verde: --ok-soft, --ok e --ok-ink de tokens/colors.css, sem cor
            inventada — é o mesmo verde do "objetivo batido" em toda a app. */}
        <radialGradient id={MEDAL_ID('enam-ok')} cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#a7f3d0" />
          <stop offset="30%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#052e22" />
        </radialGradient>
        {/* Bronze, prata e ouro — os três níveis d'Os Recordes. Mesma forma
            radial dos outros esmaltes (luz a 30% do topo), com os metais
            reais: o bronze puxa ao cobre, a prata ao aço frio, o ouro ao
            âmbar mas mais claro e mais amarelo, para não se confundir com o
            âmbar da prova. */}
        <radialGradient id={MEDAL_ID('enam-bronze')} cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#f6d5b8" />
          <stop offset="30%" stopColor="#c87f43" />
          <stop offset="100%" stopColor="#4a2410" />
        </radialGradient>
        <radialGradient id={MEDAL_ID('enam-prata')} cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#c3ced9" />
          <stop offset="100%" stopColor="#3a4654" />
        </radialGradient>
        <radialGradient id={MEDAL_ID('enam-ouro')} cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fff6cc" />
          <stop offset="30%" stopColor="#f0c33c" />
          <stop offset="100%" stopColor="#6b4a06" />
        </radialGradient>
        <linearGradient id={MEDAL_ID('silver-ring')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#94a3b8" />
          <stop offset="60%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
        <linearGradient id={MEDAL_ID('rib-a')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#4a1a0c" />
        </linearGradient>
        <linearGradient id={MEDAL_ID('rib-b')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e86a6" />
          <stop offset="100%" stopColor="#041a24" />
        </linearGradient>

        {/* As cores do símbolo da app (public/brand/ironcoach-icon.svg). */}
        <linearGradient id={MEDAL_ID('brand-c1')} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="50%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id={MEDAL_ID('brand-c2')} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a5f3fc" />
          <stop offset="45%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
        <linearGradient id={MEDAL_ID('brand-ti')} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="50%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>

        {/* Os esmaltes planos dos ícones da persiana (MedalhaoDetalhe). */}
        <radialGradient id={MEDAL_ID('dt-amber')} cx="35%" cy="28%" r="85%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="55%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#92400e" />
        </radialGradient>
        <radialGradient id={MEDAL_ID('dt-cyan')} cx="35%" cy="28%" r="85%">
          <stop offset="0%" stopColor="#cffafe" />
          <stop offset="55%" stopColor="#14b8d6" />
          <stop offset="100%" stopColor="#0e4a5c" />
        </radialGradient>
        <radialGradient id={MEDAL_ID('dt-ok')} cx="35%" cy="28%" r="85%">
          <stop offset="0%" stopColor="#a7f3d0" />
          <stop offset="55%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#052e22" />
        </radialGradient>

        {/* Sombra das estrelas */}
        <filter id={MEDAL_ID('star-drop')} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="7" stdDeviation="5.5" floodColor="rgba(0,0,0,.8)" />
        </filter>
        {/* Sombra interior: o encaixe cunhado */}
        <filter id={MEDAL_ID('inset-deep')} x="-40%" y="-40%" width="180%" height="180%">
          <feOffset in="SourceAlpha" dx="0" dy="4" result="o" />
          <feGaussianBlur in="o" stdDeviation="3" result="b" />
          <feComposite in="SourceAlpha" in2="b" operator="out" result="mask" />
          <feFlood floodColor="rgba(0,0,0,.95)" />
          <feComposite in2="mask" operator="in" result="shadow" />
          <feComposite in="shadow" in2="SourceGraphic" operator="over" />
        </filter>

        <StarFacets id={MEDAL_ID('star-ag')} />
        <StarFacets id={MEDAL_ID('dt-star-ag')} light />

        {/* O encaixe: a estrela em negativo (maior, para a estrela 1.4×) */}
        <g id={MEDAL_ID('star-socket')}>
          <g transform="scale(1.23)">
            <polygon transform="translate(0,2) scale(1.05)" points={STAR_POINTS} fill="none" stroke="rgba(255,240,205,.4)" strokeWidth="1.5" />
            <polygon points={STAR_POINTS} fill="#3d2509" filter={url('inset-deep')} />
            <circle r="3.5" fill="#0f0701" />
            <circle r="3.5" cy="1" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="1" />
          </g>
        </g>
        {/* O encaixe tracejado dos ícones da persiana */}
        <g id={MEDAL_ID('dt-star-socket')}>
          <polygon points={STAR_POINTS} fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.30)" strokeWidth="1.6" strokeDasharray="4 3" />
          <circle r="3.2" fill="rgba(255,255,255,.14)" />
        </g>

        {/* Medalha completa: estrela + esmalte (o número entra por fora) */}
        {ENAMELS.map((e) => <EnamelMedal key={e} id={MEDAL_ID(e)} enamel={e} />)}
      </defs>
    </svg>
  );
}

/* O símbolo da app (public/brand/ironcoach-icon.svg): o hexágono de titânio
   com o fio dourado e os dois chevrons, âmbar e ciano, nas cores da marca —
   não um desenho à parte a traço. Sem o fundo quadrado nem o brilho da
   versão de ícone: aqui está incrustado no metal. */
export function BrandEmblem({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="-176 -176 352 352">
      <polygon points="0,-170 148,-85 148,85 0,170 -148,85 -148,-85" fill="#080e1a" stroke={url('brand-ti')} strokeWidth="12" strokeLinejoin="round" />
      <polygon points="0,-154 130,-73 130,73 0,154 -130,73 -130,-73" fill="none" stroke="#fbbf24" strokeWidth="5" strokeLinejoin="round" opacity="0.6" />
      <path d="M -84,-78 L -18,0 L -84,78 L -48,78 L 18,0 L -48,-78 Z" fill={url('brand-c1')} stroke="#f59e0b" strokeWidth="3" strokeLinejoin="round" />
      <path d="M -18,-78 L 48,0 L -18,78 L 18,78 L 84,0 L 18,-78 Z" fill={url('brand-c2')} stroke="#38bdf8" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

/** A fita em V: duas bandas cruzadas, com costuras e brilho de cetim. */
export function MedalhaoRibbon() {
  return (
    <svg className="ic-medal-ribbon" width="200" height="110" viewBox="0 0 200 110" aria-hidden="true">
      <path d="M168,0 L110,100 L64,100 L122,0 Z" fill={url('rib-b')} stroke="rgba(0,0,0,.5)" strokeWidth="1" />
      <path d="M146,0 L92,94 L104,94 L158,0 Z" fill="rgba(255,255,255,.12)" />
      <path d="M162,4 L106,96" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="1.2" strokeDasharray="2.5 4" />
      <path d="M128,4 L72,96" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="1.2" strokeDasharray="2.5 4" />
      <path d="M78,0 L136,100 L148,100 L90,0 Z" fill="rgba(0,0,0,.45)" />
      <path d="M32,0 L90,100 L136,100 L78,0 Z" fill={url('rib-a')} stroke="rgba(0,0,0,.5)" strokeWidth="1" />
      <path d="M44,0 L100,94 L112,94 L56,0 Z" fill="rgba(255,255,255,.18)" />
      <path d="M38,4 L94,96" fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="1.2" strokeDasharray="2.5 4" />
      <path d="M72,4 L128,96" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.2" strokeDasharray="2.5 4" />
      <path d="M32,0 L78,0 L74,7 L36,7 Z" fill="rgba(255,255,255,.25)" />
      <path d="M122,0 L168,0 L164,7 L126,7 Z" fill="rgba(255,255,255,.15)" />
    </svg>
  );
}

/** A medalha ganha no tamanho grande (coordenadas locais em 0,0). Também é
    a estrela que voa no momento da medalha. */
export function WonStar({ enamel = 'amber', valueLabel, withText = true }) {
  // A joia só existe para levar um número gravado (pedido 2026-09-15): sem
  // número à vista — medalhões pequenos, As Distâncias, O Terreno, A
  // Sequência — a estrela é só a prata facetada.
  const showsNumber = withText && valueLabel != null && valueLabel !== '';
  // E um esmalte sem joia em <MedalhaoDefs /> também não pode cair em
  // silêncio no âmbar (era assim que o verde d'A Superação saía cor de
  // laranja): sem medalha para ele, é a mesma prata do 'silver'.
  if (!showsNumber || !ENAMELS.includes(enamel)) {
    return <g filter={url('star-drop')} data-medal-star="silver"><use href={ref('star-ag')} transform="scale(1.4)" /></g>;
  }
  return (
    <g data-medal-star={enamel}>
      <use href={ref(enamel)} />
      {showsNumber && (
        <text y="4.5" textAnchor="middle" fontSize="13" fontWeight="900" fill={TEXT_FILL[enamel]} fontFamily="inherit">{shortValue(valueLabel)}</text>
      )}
    </g>
  );
}

/* Na estrela só cabe o número: "182 km" grava-se "182" (o mock e a
   referência gravam só o número — a unidade está na legenda). */
function shortValue(label) {
  const s = String(label).trim();
  const m = s.match(/^([\d\s.,:]+)\s*(km|kms|semanas?|s)?$/i);
  return m ? m[1].trim() : s;
}

/* O valor de um encaixe como se lê fora da estrela (legenda, persiana). O
   Ano em Km dá o número sem unidade em `valueLabel` (utils/medalhoes.js,
   fmtKm) — a estrela grava só o número, mas a legenda do mock diz "182 km". */
export function slotValueText(medalhaoKey, slot) {
  const v = slot?.valueLabel ?? slot?.value;
  if (v == null || v === '') return null;
  const s = String(v);
  if (medalhaoKey === 'ano_km' && !/km$/i.test(s)) return `${s} km`;
  return s;
}

/* Os encaixes que se desenham: todos até 8 (de 5 a 8 em anel, ver
   slotPosition); acima disso os 8 primeiros. */
export function visibleSlots(slots = []) {
  return (slots || []).slice(0, MAX_SLOTS);
}

function defaultAriaLabel(engraving, slots) {
  const list = slots || [];
  const won = list.filter((s) => s?.state === 'won');
  const parts = won
    .map((s) => [s.label, s.valueLabel].filter(Boolean).join(' '))
    .filter(Boolean);
  const head = `${engraving || 'Medalhão'}: ${won.length} de ${list.length} medalhas`;
  return parts.length ? `${head}, ${parts.join(', ')}` : head;
}

export default function Medalhao({ size = 'lg', ribbon = false, engraving, year, footer, slots = [], ariaLabel, className = '', style, children }) {
  const lg = size !== 'sm';
  const shown = visibleSlots(slots);
  const ring = shown.length > 4;
  const box = lg ? 300 : 96;
  const at = (x, y, s) => (s === 1 ? `translate(${x},${y})` : `translate(${x},${y}) scale(${s})`);

  return (
    <div
      role="img"
      aria-label={ariaLabel || defaultAriaLabel(engraving, slots)}
      className={`ic-medal ${lg ? 'ic-medal--lg' : 'ic-medal--sm'} ${className}`}
      style={style}
      data-testid={`medalhao-${lg ? 'lg' : 'sm'}`}
    >
      {lg && ribbon && <MedalhaoRibbon />}
      <div className="ic-medal-rim" />
      <div className="ic-medal-face" />
      <div className="ic-medal-grain" />
      <div className="ic-medal-sheen" />
      {lg && <div className="ic-medal-ring" />}

      {lg && (
        <>
          {/* Em anel a estrela de cima desce até y≈100 — em cima do brasão. */}
          {!ring && (
            <div className="ic-medal-emblem" aria-hidden="true">
              <BrandEmblem />
            </div>
          )}
          {/* data-text: a cópia por baixo que desenha as arestas do sulco (ver
              .ic-medal-engrave::before) — a letra da frente leva o fundo. */}
          {engraving && <div className="ic-medal-engrave ic-medal-engrave--name" data-text={engraving} aria-hidden="true">{engraving}</div>}
          {year != null && year !== '' && <div className="ic-medal-engrave ic-medal-engrave--year" data-text={year} aria-hidden="true">{year}</div>}
          {/* Em anel, as estrelas de baixo passam onde a linha de rodapé está
              gravada (y≈252) — sai, e o que dizia continua no aria-label e na
              persiana. */}
          {footer && !ring && <div className="ic-medal-engrave ic-medal-engrave--footer" data-text={`· ${footer} ·`} aria-hidden="true">· {footer} ·</div>}
        </>
      )}

      <svg className="ic-medal-stars" width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden="true">
        {shown.map((slot, i) => {
          const { x, y, scale: s } = slotPosition(i, shown.length, lg ? 'lg' : 'sm');
          const r3 = (v) => Math.round(v * 1000) / 1000;
          const key = slot?.key || i;
          if (slot?.state !== 'won') {
            return (
              <use
                key={key}
                href={ref('star-socket')}
                transform={at(x, y, lg ? s : r3(0.34 * s))}
                data-medal-socket=""
              />
            );
          }
          if (!lg) {
            // No pequeno nunca se grava número, por isso nunca há joia: a
            // prata facetada a .42 da forma base, como no mock da coleção.
            return (
              <g key={key} transform={at(x, y, r3(0.42 * s))} data-medal-star="silver">
                <g filter={url('star-drop')}><use href={ref('star-ag')} /></g>
              </g>
            );
          }
          return (
            <g key={key} transform={at(x, y, s)}>
              <WonStar enamel={slot.enamel} valueLabel={slot.valueLabel} />
            </g>
          );
        })}
      </svg>
      {children}
    </div>
  );
}

/** O ícone de 44px dos cartões da persiana: estrela clara com esmalte, ou o
    encaixe tracejado. */
export function MedalSlotIcon({ state, enamel = 'amber' }) {
  if (state !== 'won') {
    return (
      <svg width="44" height="44" viewBox="0 0 44 44" style={{ flex: 'none' }} aria-hidden="true" data-medal-icon="empty">
        <use href={ref('dt-star-socket')} transform="translate(22,23) scale(.68)" />
      </svg>
    );
  }
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" style={{ flex: 'none', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.45))' }} aria-hidden="true" data-medal-icon="won">
      <use href={ref('dt-star-ag')} transform="translate(22,23) scale(.68)" />
      {ENAMELS.includes(enamel) && (
        <>
          <circle cx="22" cy="22" r="9" fill={url(`dt-${enamel}`)} stroke="#e6ebf1" strokeWidth="1.2" />
          <ellipse cx="19" cy="18.5" rx="4.5" ry="2.5" fill="rgba(255,255,255,.45)" transform="rotate(-24 19 18.5)" />
        </>
      )}
    </svg>
  );
}
