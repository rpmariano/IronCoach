import React, { useEffect, useRef, useState } from 'react';
import { normalizeMood } from '@formulas/carolMood.ts';
import { prefersReducedMotion } from '../../utils/coachBubbles';

/* O rosto da Carol (CAROL.md §4) — ponto único para todos os sítios onde ela
   aparece.

   O retrato é o busto 3D em croché (versão cabelo castanho, olhos avelã — a
   oficial). Cópias leves de 256 px em public/carol-avatar/; os originais
   (760 px) e a versão de cabelo preto, guardada como reserva, ficam fora do
   repositório.

   Seis emoções (`mood`, vocabulário em @formulas/carolMood.ts): neutral (por
   defeito), happy, proud, worried, caring e thinking — um busto cada. Só se
   monta o busto da emoção atual; quando muda, o anterior fica por baixo,
   inteiro, enquanto o novo entra por cima em --dur-carol-mood, e depois sai.
   A cabeça dá um aceno curto — nunca troca de cara de repente, nunca muda
   sem motivo.

   Camadas de vida, todas desligadas com prefers-reduced-motion:
   - `draw`: a chegada. O busto entra a crescer e a acender, uma vez. Por
     defeito só nos tamanhos de palco (≥ 56 px).
   - `alive`: pisca os olhos (o busto neutro de olhos fechados, ~150 ms), com
     um compasso diferente em cada instância. Só na neutra — as outras
     expressões têm os olhos desenhados por elas. Por defeito a partir de
     26 px. Pára com a página escondida.
   - `talking`: a falar. Fica o busto neutro e por cima a boca abre e fecha
     (a boca recortada que encaixa nesse busto). Para o "a escrever…" do
     chat.
   - `breathing`: o halo de --dur-breathe, três ciclos e para, só quando há
     assunto por resolver. Ela chama, não alarma.

   Abaixo de 32 px o enquadramento aproxima-se da cara (`data-close`): o
   busto inteiro, a esse tamanho, deixava as emoções indistinguíveis.

   `mood` fica também em data-mood. */

const SRC = `${import.meta.env.BASE_URL || '/'}carol-avatar/`;
const MORPH_MS = 350;

/** As emoções que têm busto — uma por estado de @formulas/carolMood.ts. */
export const AVATAR_MOODS = ['neutral', 'happy', 'proud', 'worried', 'caring', 'thinking'];

/* A boca recortada senta-se no busto neutro nesta caixa (em % do busto). */
const MOUTH_BOX = { left: '34.21%', top: '65.78%', width: '31.57%', height: '17.10%' };

/* Os bustos pré-carregam-se uma vez, quando a primeira Carol aparece: assim a
   primeira mudança de emoção já encontra a imagem em cache e o fade não
   entra sobre um busto ainda por chegar (~110 KB, uma vez por sessão). */
let preloaded = false;
function preloadBusts() {
  if (preloaded || typeof Image !== 'function') return;
  preloaded = true;
  for (const f of [...AVATAR_MOODS.map((m) => `busto_${m}.webp`), 'busto_neutral_blink.webp', 'boca_happy.webp']) {
    const im = new Image();
    im.decoding = 'async';
    im.src = `${SRC}${f}`;
  }
}

/** A emoção anterior, enquanto a nova entra por cima. */
function usePreviousDuringFade(mood) {
  const [prev, setPrev] = useState(null);
  const last = useRef(mood);
  useEffect(() => {
    if (last.current === mood) return undefined;
    const from = last.current;
    last.current = mood;
    if (prefersReducedMotion()) { setPrev(null); return undefined; }
    setPrev(from);
    const t = setTimeout(() => setPrev(null), MORPH_MS);
    return () => clearTimeout(t);
  }, [mood]);
  return prev;
}

export default function CoachAvatar({
  mood: moodProp = 'neutral',
  size = 30,
  radius,
  className = '',
  style,
  breathing = false,
  draw,
  alive,
  talking = false,
}) {
  const normalized = normalizeMood(moodProp) || 'neutral';
  const mood = talking ? 'neutral' : normalized;
  const prev = usePreviousDuringFade(mood);
  useEffect(preloadBusts, []);

  // O compasso do piscar de cada instância, escolhido uma vez.
  const [blinkRhythm] = useState(() => ({
    '--carol-blink-dur': `${(4.6 + Math.random() * 2.4).toFixed(2)}s`,
    '--carol-blink-delay': `-${(Math.random() * 4).toFixed(2)}s`,
  }));

  // O aceno quando a emoção muda (não à entrada).
  const faceRef = useRef(null);
  const lastMood = useRef(mood);
  useEffect(() => {
    if (lastMood.current === mood) return;
    lastMood.current = mood;
    const el = faceRef.current;
    if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return;
    el.animate(
      [{ transform: 'translateY(0)' }, { transform: 'translateY(1.6px)' }, { transform: 'translateY(-0.6px)' }, { transform: 'translateY(0)' }],
      { duration: 420, easing: 'cubic-bezier(.16, 1, .3, 1)' },
    );
  }, [mood]);

  const drawing = (draw ?? size >= 56) && !prefersReducedMotion();
  const blinking = (alive ?? size >= 26) && mood === 'neutral' && !talking && !prev;

  const img = (src, part, cls, extra, key) => (
    <img key={key} src={`${SRC}${src}`} alt="" draggable="false" decoding="async" data-part={part} className={cls} {...extra} />
  );

  return (
    <span
      aria-hidden="true"
      data-mood={normalized}
      data-talking={talking ? 'true' : undefined}
      data-breathing={breathing ? 'true' : undefined}
      data-close={size < 32 ? 'true' : undefined}
      className={`carol-face inline-flex items-center justify-center shrink-0 ${breathing ? 'coach-breathing ' : ''}${drawing ? 'carol-draw ' : ''}${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? '50%',
        ...blinkRhythm,
        ...style,
      }}
    >
      <span ref={faceRef} className="carol-bust">
        <span className="carol-frame">
          {prev && img(`busto_${prev}.webp`, `bust-${prev}`, 'carol-layer', undefined, `prev-${prev}`)}
          {img(`busto_${mood}.webp`, `bust-${mood}`, `carol-layer${prev ? ' carol-layer-in' : ''}`, undefined, mood)}
          {blinking && img('busto_neutral_blink.webp', 'blink', 'carol-layer carol-blink')}
          {talking && img('boca_happy.webp', 'mouth', 'carol-mouth carol-talk', { style: MOUTH_BOX })}
        </span>
      </span>
    </span>
  );
}
