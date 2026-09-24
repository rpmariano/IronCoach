import React, { useId } from 'react';

/* O carregamento com a marca — o brasão desenhado a traço.

   O ícone da IronCoach (public/brand/ironcoach-icon.svg: hexágono com dois
   chevrons, ouro da prova e ciano da Carol) redesenhado como linhas: primeiro
   o hexágono, depois os chevrons, um a um — e quando o traço fecha, os
   chevrons enchem-se e o brasão brilha. Se o carregamento continuar, o
   brilho respira devagar até a página chegar; não volta a desenhar (um
   desenho em loop lê-se como "isto está preso").

   As geometrias são as do SVG da marca, tal e qual (viewBox 512, centro em
   256). `pathLength="1"` normaliza os traços para a animação não depender do
   comprimento real de cada um (regras .logo-loader-* em globals.css).
   Movimento reduzido: o brasão aparece já desenhado e parado.

   `size` em px; `label` é o que o leitor de ecrã ouve — `null` quando quem o
   mostra já anuncia o carregamento (fica decorativo). `still` mostra-o já
   desenhado e parado — para quando vem logo a seguir a um desenho
   completo, onde recomeçar seria repetição.

   Quem mostra este logo não o interrompe a meio: o App segura o ecrã até
   o desenho acabar (utils/logoIntro.js). */

const HEX = '0,-170 148,-85 148,85 0,170 -148,85 -148,-85';
const HEX_IN = '0,-154 130,-73 130,73 0,154 -130,73 -130,-73';
const CHEVRON_OURO = 'M -84,-78 L -18,0 L -84,78 L -48,78 L 18,0 L -48,-78 Z';
const CHEVRON_CIANO = 'M -18,-78 L 48,0 L -18,78 L 18,78 L 84,0 L 18,-78 Z';

export default function LogoLoader({ size = 96, label = 'A carregar', className = '', style, still = false }) {
  // Ids próprios por instância: dois carregadores ao mesmo tempo não partilham gradientes.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (n) => `${n}-${uid}`;
  return (
    <div
      role={label ? 'status' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
      data-testid="logo-loader"
      data-still={still ? 'true' : undefined}
      className={`logo-loader ${still ? 'logo-loader--still ' : ''}${className}`}
      style={{ width: size, height: size, ...style }}
    >
      <svg viewBox="0 0 512 512" width={size} height={size} aria-hidden="true" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={id('ll-ouro')} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id={id('ll-ciano')} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a5f3fc" />
            <stop offset="45%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#0891b2" />
          </linearGradient>
          <filter id={id('ll-brilho')} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="14" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g transform="translate(256 256)">
          {/* O brilho que acende no fim, por trás de tudo. */}
          <polygon className="logo-loader-aura" points={HEX} fill="none" stroke="#22d3ee" strokeWidth="22" strokeLinejoin="round" filter={`url(#${id('ll-brilho')})`} />

          {/* 1. O hexágono, a traço. */}
          <polygon className="logo-loader-hex" pathLength="1" points={HEX} fill="none" stroke="#94a3b8" strokeWidth="8" strokeLinejoin="round" />
          <polygon className="logo-loader-hex-in" pathLength="1" points={HEX_IN} fill="none" stroke="#fbbf24" strokeOpacity=".65" strokeWidth="3" strokeLinejoin="round" />

          {/* 2. Os chevrons: primeiro o traço, depois o preenchimento. */}
          <path className="logo-loader-fill logo-loader-fill-ouro" d={CHEVRON_OURO} fill={`url(#${id('ll-ouro')})`} />
          <path className="logo-loader-fill logo-loader-fill-ciano" d={CHEVRON_CIANO} fill={`url(#${id('ll-ciano')})`} />
          <path className="logo-loader-chev logo-loader-chev-ouro" pathLength="1" d={CHEVRON_OURO} fill="none" stroke="#fbbf24" strokeWidth="6" strokeLinejoin="round" />
          <path className="logo-loader-chev logo-loader-chev-ciano" pathLength="1" d={CHEVRON_CIANO} fill="none" stroke="#22d3ee" strokeWidth="6" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
}
