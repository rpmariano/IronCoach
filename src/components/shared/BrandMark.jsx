import React, { useEffect, useRef, useState } from 'react';
import { publicUrl } from '../../lib/utils';
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
   - lockup animado: login e loader de arranque, os únicos momentos em que a
     app não tem mais nada para mostrar e o movimento diz "estou a arrancar";
   - os PNGs da PWA (icon-*.png, apple-touch-icon, favicon) são o ícone
     parado rasterizado — iOS e o manifesto ignoram SVG.

   `prefers-reduced-motion` troca a variante animada pela parada aqui (os
   SVGs também o fazem por dentro, mas o <img> não vê os tokens da app). A
   Carol tem a sua própria identidade (CoachAvatar, ciano) — a marca não a
   substitui nem se mistura com ela. */

const FILES = {
  icon: 'brand/ironcoach-icon.svg',
  'icon-animated': 'brand/ironcoach-icon-animated.svg',
  lockup: 'brand/ironcoach-lockup.svg',
  'lockup-animated': 'brand/ironcoach-lockup-animated.svg',
};

/** Um ciclo completo da cadência dos chevrons (2,2 s) — o tempo que o ícone
 *  do cabeçalho anima ao toque antes de voltar a parar. */
export const BRAND_PLAY_ONCE_MS = 2200;

export function brandSrc(variant, animated) {
  const key = animated && !prefersReducedMotion() ? `${variant}-animated` : variant;
  return publicUrl(FILES[key] || FILES.icon);
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
  const ratio = variant === 'lockup' ? 600 / 800 : 1;
  const dims = size ? { width: size, height: Math.round(size * ratio) } : {};

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      data-brand={variant}
      data-animated={animated || playing ? 'true' : 'false'}
      className={className}
      style={{ display: 'block', ...dims, ...style }}
      {...rest}
    />
  );
}
