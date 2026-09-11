import React from 'react';

/* Fundo da app — vive aqui, uma vez, por baixo de tudo.
   Três camadas, todas fixas e sem interação: o gradiente ambiente
   (âmbar em cima à esquerda, azul à direita, ardósia em baixo), as curvas
   de nível em SVG (ardósia à esquerda, âmbar à direita) e um fade vertical
   que escurece topo e fundo. É o que dá ao vidro dos cartões algo para
   desfocar — sem isto o escuro fica "chapado" e cada cartão vira uma ilha
   (auditoria UX/UI 2026-09-09, achado 8). Cores e gradientes vêm dos tokens
   em src/styles/tokens/colors.css; as regras .app-bg* estão em globals.css.
   A moldura é a mesma dos mocks (viewBox 390×844, esticado ao ecrã). */
export default function AppBackground() {
  return (
    <div aria-hidden="true" className="app-bg">
      <div className="app-bg__ambient" />
      <svg viewBox="0 0 390 844" preserveAspectRatio="none" className="app-bg__contours">
        <g fill="none" stroke="var(--gym)" strokeOpacity=".14" strokeWidth="1.1">
          <path d="M20 205 C60 190 110 215 118 255 C126 295 95 325 55 322 C15 319 -8 285 -2 250 C4 222 -8 216 20 205 Z" />
          <path d="M5 180 C60 158 140 195 148 255 C156 315 105 355 50 350 C-5 345 -35 300 -28 250 C-22 208 -30 195 5 180 Z" />
          <path d="M-12 155 C55 125 170 175 178 255 C186 335 115 385 45 378 C-25 371 -62 315 -55 250 C-49 195 -50 172 -12 155 Z" />
          <path d="M-30 128 C50 92 200 155 208 255 C216 355 125 415 40 406 C-45 397 -90 330 -82 250 C-75 182 -72 148 -30 128 Z" />
        </g>
        <g fill="none" stroke="var(--race)" strokeOpacity=".13" strokeWidth="1.1">
          <path d="M320 560 C355 548 392 570 396 600 C400 630 375 652 345 650 C315 648 298 622 302 598 C306 578 296 570 320 560 Z" />
          <path d="M305 535 C355 515 415 550 420 600 C425 650 385 682 340 678 C295 674 268 636 274 595 C279 560 275 550 305 535 Z" />
          <path d="M288 508 C352 482 438 528 444 600 C450 672 392 712 335 706 C278 700 240 650 247 592 C253 542 250 528 288 508 Z" />
          <path d="M270 480 C350 448 462 505 468 600 C474 695 400 745 330 737 C260 729 212 665 220 588 C227 522 224 506 270 480 Z" />
        </g>
      </svg>
      <div className="app-bg__fade" />
    </div>
  );
}
