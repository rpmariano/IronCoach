import React from 'react';

/* A Carol como ícone, no traço da lucide-react (a biblioteca de ícones da
   app): grelha 24×24, traço 2, pontas redondas, `currentColor`. Substitui o
   `Bot` onde o ícone diz "a Carol" — o separador dela na barra de baixo, a
   secção dela no Perfil, o fecho do onboarding. O robô dizia "funcionalidade";
   isto diz "pessoa".

   O mesmo rosto do retrato (CoachAvatar), reduzido ao essencial: a cabeça, a
   franja varrida, o rabo-de-cavalo alto, dois olhos e um sorriso. A cabeça
   está à esquerda do centro para dar lugar ao rabo-de-cavalo, e o conjunto
   ocupa a caixa como a casa e o troféu ao lado.

   Aceita as mesmas props que um ícone lucide (size, strokeWidth, className,
   style, aria-*); sem aria-label fica decorativo. */
export default function CarolIcon({ size = 24, strokeWidth = 2, color = 'currentColor', className = '', ...rest }) {
  const labelled = rest['aria-label'] != null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={labelled ? undefined : 'true'}
      role={labelled ? 'img' : undefined}
      className={`lucide lucide-carol ${className}`.trim()}
      {...rest}
    >
      <circle cx="10.5" cy="13" r="8" />
      <path d="M2.9 10.8c3.8.5 7.2-1 9.2-4.4 1 1.9 3 3.2 5.9 3.6" />
      <path d="M15.4 6.2c1.8-2.5 5.4-2.3 6.2.2.7 2.4-.3 5.2-2.4 7.1" />
      <path d="M7.5 13.5h.01" />
      <path d="M13.5 13.5h.01" />
      <path d="M8 16.8s1 1.2 2.5 1.2 2.5-1.2 2.5-1.2" />
    </svg>
  );
}
