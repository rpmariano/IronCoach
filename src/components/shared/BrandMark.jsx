import React, { useEffect, useRef, useState } from 'react';
import iconSvg from '../../assets/brand/ironcoach-icon.svg?raw';
import iconAnimatedSvg from '../../assets/brand/ironcoach-icon-animated.svg?raw';
import lockupSvg from '../../assets/brand/ironcoach-lockup.svg?raw';
import lockupAnimatedSvg from '../../assets/brand/ironcoach-lockup-animated.svg?raw';
import { prefersReducedMotion } from '../../utils/coachBubbles';

/* A marca IronCoach (2026-09-13): brasão hexagonal com dois chevrons — ouro
   de prova e ciano da Carol — em `public/brand/`. Quatro ficheiros, dois
   desenhos: o ícone (512², sem texto) e o lockup (800×600, "IRONCOACH ·
   AI-POWERED"), cada um numa variante parada e numa animada (cadência dos
   chevrons a 2,2 s, aura a pulsar).

   Onde vive cada um, e porquê:
   - ícone parado: cabeçalho da app (sempre visível — os seis filtros de brilho
     em loop gastariam GPU e bateria o dia inteiro, e a 36px o movimento é
     ruído); anima só um ciclo ao toque, via `playOnce`;
   - lockup animado: o login, o único momento em que a app não tem mais nada
     para mostrar e o movimento diz "estou a arrancar". O ecrã de arranque
     já não usa estes ficheiros: é o brasão desenhado a traço
     (shared/LogoLoader), com o nome e o "AI-POWERED" por baixo, e deixa-se
     desenhar até ao fim (utils/logoIntro.js);
   - os PNGs da PWA (icon-*.png, apple-touch-icon, favicon) são o ícone
     parado rasterizado — iOS e o manifesto ignoram SVG.

   `prefers-reduced-motion` troca a variante animada pela parada aqui (os
   SVGs também o fazem por dentro, mas o <img> não vê os tokens da app). A
   Carol tem a sua própria identidade (CoachAvatar, ciano) — a marca não a
   substitui nem se mistura com ela. */

/* No bundle, não na rede (2026-11-09): sem rede o ecrã de login mostrava o logótipo partido — o
   <img> ia buscar public/brand/*.svg, que nem o service worker guarda (só /assets/ com hash). Os
   SVGs (uns KB cada) vão dentro do JS como data URL: onde o login abre, o logótipo está. As cópias
   de src/assets/brand/ são as de public/brand/ (o teste BrandMark.test.jsx compara-as); public/
   fica para quem as pede por URL (raceMural, ícones). */
const FILES = {
  icon: 'ironcoach-icon.svg',
  'icon-animated': 'ironcoach-icon-animated.svg',
  lockup: 'ironcoach-lockup.svg',
  'lockup-animated': 'ironcoach-lockup-animated.svg',
};
const SVGS = {
  icon: iconSvg,
  'icon-animated': iconAnimatedSvg,
  lockup: lockupSvg,
  'lockup-animated': lockupAnimatedSvg,
};
const dataUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const DATA_URLS = Object.fromEntries(Object.entries(SVGS).map(([k, svg]) => [k, dataUrl(svg)]));

function brandKey(variant, animated) {
  const key = animated && !prefersReducedMotion() ? `${variant}-animated` : variant;
  return FILES[key] ? key : 'icon';
}

/** O nome do ficheiro da marca (o de public/brand/) para a variante e o movimento. */
export function brandFile(variant, animated) {
  return FILES[brandKey(variant, animated)];
}

/** Um ciclo completo da cadência dos chevrons (2,2 s) — o tempo que o ícone
 *  do cabeçalho anima ao toque antes de voltar a parar. */
export const BRAND_PLAY_ONCE_MS = 2200;

/** O src do <img>: o SVG como data URL, sem ir à rede. */
export function brandSrc(variant, animated) {
  return DATA_URLS[brandKey(variant, animated)];
}

/**
 * @param variant 'icon' | 'lockup'
 * @param animated  variante em movimento contínuo (login, loader)
 * @param playOnce  contador: cada incremento toca a animação um ciclo e para
 *                  (cabeçalho — o toque no logótipo)
 * @param size      largura em px (a altura segue a proporção do ficheiro)
 */
export default function BrandMark({ variant = 'icon', animated = false, playOnce = 0, size, alt = '', className = '', style, ...rest }) {
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!playOnce) return undefined;
    setPlaying(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { setPlaying(false); timerRef.current = null; }, BRAND_PLAY_ONCE_MS);
    return undefined;
  }, [playOnce]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const src = brandSrc(variant, animated || playing);
  const file = brandFile(variant, animated || playing);
  const ratio = variant === 'lockup' ? 600 / 800 : 1;
  const dims = size ? { width: size, height: Math.round(size * ratio) } : {};

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      data-brand={variant}
      data-file={file}
      data-animated={animated || playing ? 'true' : 'false'}
      className={className}
      style={{ display: 'block', ...dims, ...style }}
      {...rest}
    />
  );
}
